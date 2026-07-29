import {
  decryptWechatPayload,
  parseWechatMpTextMessage,
  readWechatXmlField,
  verifyWechatCallbackSignature
} from '../../modules/wechat/callback'
import { sendWechatCustomerServiceText } from '../../modules/wechat/customer-service'
import { botAssistantConfig, botRateLimited } from '../../modules/bots/runtime'
import {
  answerAndSendBotQuestion,
  releaseBotMessage,
  reserveBotMessage
} from '../../modules/bots/service'
import { useAppDatabase } from '../../utils/database'
import { assertRateLimit } from '../../utils/rate-limit'

const MAX_CALLBACK_BYTES = 128 * 1024

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
  const token = String(runtime.wechatMpToken || '').trim()
  const encodingAesKey = String(runtime.wechatMpEncodingAesKey || '').trim()
  const appId = String(runtime.wechatMpAppId || '').trim()
  const appSecret = String(runtime.wechatMpAppSecret || '').trim()
  if (!token || !encodingAesKey || !appId) {
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
  let messageXml = rawBody
  if (encrypted) {
    if (!verifyWechatCallbackSignature({
      token,
      timestamp,
      nonce,
      signature: queryText(query.msg_signature),
      encrypted
    })) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
    }
    try {
      messageXml = decryptWechatPayload({ encrypted, encodingAesKey, appId })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Invalid encrypted callback' })
    }
  } else if (!verifyWechatCallbackSignature({
    token,
    timestamp,
    nonce,
    signature: queryText(query.signature)
  })) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  const incoming = parseWechatMpTextMessage(messageXml)
  if (!incoming) return 'success'
  if (!reserveBotMessage('wechat', incoming.messageId)) return 'success'

  const client = useAppDatabase(event)
  try {
    assertRateLimit(event, `bot:wechat-mp:user:${incoming.fromUserName}`, 12, 60_000, client)
    assertRateLimit(event, 'bot:wechat-mp:global', 120, 60_000, client)
  } catch (error) {
    releaseBotMessage('wechat', incoming.messageId)
    if (botRateLimited(error)) return 'success'
    throw error
  }

  const question = {
    platform: 'wechat' as const,
    messageId: incoming.messageId,
    conversationId: incoming.fromUserName,
    senderId: incoming.fromUserName,
    question: incoming.content
  }
  const config = botAssistantConfig(runtime as unknown as Record<string, unknown>)
  config.maxReplyChars = Math.min(config.maxReplyChars, 600)
  void answerAndSendBotQuestion({
    client,
    question,
    config,
    send: message => sendWechatCustomerServiceText({
      appId,
      appSecret,
      openId: incoming.fromUserName,
      message
    })
  }).catch(() => releaseBotMessage('wechat', incoming.messageId))

  return 'success'
})
