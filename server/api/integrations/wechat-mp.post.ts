import {
  createWechatEncryptedTextReply,
  createWechatTextReplyXml,
  decryptWechatPayload,
  parseWechatMpEventMessage,
  parseWechatMpTextMessage,
  readWechatXmlField
} from '../../modules/wechat/callback'
import { readWechatMpAccounts, resolveWechatMpAccount } from '../../modules/wechat/accounts'
import { botAssistantConfig, botRateLimited } from '../../modules/bots/runtime'
import {
  answerAndSendBotQuestion,
  formatBotReply,
  releaseBotMessage,
  reserveBotMessage
} from '../../modules/bots/service'
import {
  handleWechatMpPopularityFollow,
  handleWechatMpPopularityMessage
} from '../../modules/competition/popularity-wechat'
import { useAppDatabase } from '../../utils/database'
import { assertRateLimit } from '../../utils/rate-limit'
import { getSecurityConfig } from '../../utils/security'
import { getRequestURL, getHeader } from 'h3'
import { getClientIpAddress } from '../../utils/client-ip'

const MAX_CALLBACK_BYTES = 128 * 1024
const PASSIVE_REPLY_BUDGET_MS = 3_800

function queryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Edge-Control', 'no-store')
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')

  const runtime = useRuntimeConfig(event)
  const accounts = readWechatMpAccounts(runtime as unknown as Record<string, unknown>)
  if (!accounts.length) {
    throw createError({ statusCode: 503, statusMessage: '微信公众号回调尚未完成配置' })
  }

  const rawBody = await readRawBody(event) || ''
  if (!rawBody || Buffer.byteLength(rawBody) > MAX_CALLBACK_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid callback body' })
  }

  const query = getQuery(event)
  const timestamp = queryText(query.timestamp)
  const nonce = queryText(query.nonce)
  const encrypted = readWechatXmlField(rawBody, 'Encrypt')
  const encryptedMode = Boolean(encrypted)
  // 换号过渡期：主号与副号并行，按签名自动识别来源。
  const account = resolveWechatMpAccount(accounts, {
    timestamp,
    nonce,
    signature: encryptedMode ? queryText(query.msg_signature) : queryText(query.signature),
    encrypted: encrypted ?? undefined
  })
  if (!account) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  let messageXml = rawBody
  if (encrypted) {
    try {
      messageXml = decryptWechatPayload({
        encrypted,
        encodingAesKey: account.encodingAesKey,
        appId: account.appId
      })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Invalid encrypted callback' })
    }
  }

  const token = account.token
  const encodingAesKey = account.encodingAesKey
  const appId = account.appId

  const client = useAppDatabase(event)
  const config = botAssistantConfig(runtime as unknown as Record<string, unknown>)
  config.maxReplyChars = Math.min(config.maxReplyChars, 600)
  const siteOrigin = String(runtime.public?.siteUrl || config.siteUrl || '').replace(/\/+$/, '') || getRequestURL(event).origin
  const security = getSecurityConfig(event)

  const incoming = parseWechatMpTextMessage(messageXml)
  const eventMessage = incoming ? null : parseWechatMpEventMessage(messageXml)
  if (!incoming && !eventMessage) return 'success'

  const senderId = incoming?.fromUserName ?? eventMessage!.fromUserName
  const receiverId = incoming?.toUserName ?? eventMessage!.toUserName

  function respond(content: string) {
    setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
    if (encryptedMode) {
      return createWechatEncryptedTextReply({
        token,
        encodingAesKey,
        appId,
        toUserName: senderId,
        fromUserName: receiverId,
        content
      })
    }
    return createWechatTextReplyXml({
      toUserName: senderId,
      fromUserName: receiverId,
      content
    })
  }

  // 关注即领票：扫码关注后立刻回一条带专属链接的消息，观众不用再打字。
  if (eventMessage) {
    const dedupeKey = `evt:${eventMessage.fromUserName}:${eventMessage.createTime}:${eventMessage.event}:${eventMessage.eventKey}`
    if (!reserveBotMessage('wechat', dedupeKey)) return 'success'
    if (eventMessage.event === 'SUBSCRIBE') {
      return respond(handleWechatMpPopularityFollow(client, {
        fromUserName: eventMessage.fromUserName,
        siteOrigin,
        secret: security.secret,
        ip: getClientIpAddress(event),
        userAgent: getHeader(event, 'user-agent') || ''
      }))
    }
    const menuVote = eventMessage.event === 'CLICK' && /^(vote|vote_vote|投票|人气奖投票)$/i.test(eventMessage.eventKey)
    if (eventMessage.event === 'SCAN' || menuVote) {
      const reply = handleWechatMpPopularityMessage(client, {
        fromUserName: eventMessage.fromUserName,
        content: '投票',
        siteOrigin,
        secret: security.secret
      })
      return reply == null ? 'success' : respond(reply)
    }
    return 'success'
  }

  if (!incoming) return 'success'
  if (!reserveBotMessage('wechat', incoming.messageId)) return 'success'

  // 现场口令/投票消息优先直出：几百条/分时不能被 AI 问答的 120 条/分限流吞掉。
  const popularityReply = handleWechatMpPopularityMessage(client, {
    fromUserName: incoming.fromUserName,
    content: incoming.content,
    siteOrigin,
    secret: security.secret
  })
  if (popularityReply != null) {
    try {
      // 现场投票分支只走进程内计数：每条消息少两次 SQLite 写，60 秒窗口丢一次无所谓。
      assertRateLimit(event, `bot:wechat-mp:vote:user:${incoming.fromUserName}`, 30, 60_000)
      assertRateLimit(event, 'bot:wechat-mp:vote:global', 3000, 60_000)
    } catch (error) {
      if (botRateLimited(error)) return 'success'
      throw error
    }
    return respond(popularityReply)
  }

  try {
    assertRateLimit(event, `bot:wechat-mp:user:${incoming.fromUserName}`, 12, 60_000, client)
    assertRateLimit(event, 'bot:wechat-mp:global', 120, 60_000, client)
  } catch (error) {
    releaseBotMessage('wechat', incoming.messageId)
    if (botRateLimited(error)) return 'success'
    throw error
  }

  let replyMessage = ''
  const question = {
    platform: 'wechat' as const,
    messageId: incoming.messageId,
    conversationId: incoming.fromUserName,
    senderId: incoming.fromUserName,
    question: incoming.content
  }
  const assistantTask = answerAndSendBotQuestion({
    client,
    question,
    config,
    send: async (message) => {
      replyMessage = message
    }
  })
  const completedWithinBudget = await Promise.race([
    assistantTask.then(() => true).catch(() => false),
    new Promise<false>(resolve => setTimeout(() => resolve(false), PASSIVE_REPLY_BUDGET_MS))
  ])
  if (!completedWithinBudget || !replyMessage) {
    void assistantTask.catch(() => releaseBotMessage('wechat', incoming.messageId))
    replyMessage = formatBotReply(
      '这个问题需要多查一会儿，请稍后再发送一次。我会优先使用刚整理好的资料。',
      config.siteUrl,
      config.maxReplyChars
    )
  }

  return respond(replyMessage)
})
