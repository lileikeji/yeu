import { normalizeWechatQuestion, wechatRoomAllowed } from '../../../modules/bots/events'
import { botAssistantConfig, botIntegrationDisabled, botRateLimited } from '../../../modules/bots/runtime'
import { verifyBotWebhookSignature } from '../../../modules/bots/security'
import { answerAndSendBotQuestion, releaseBotMessage, reserveBotMessage } from '../../../modules/bots/service'
import { sendWechatRelayMessage } from '../../../modules/bots/transports'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  const runtime = useRuntimeConfig(event)
  const secret = String(runtime.wechatBotWebhookSecret || '')
  const sendUrl = String(runtime.wechatBotSendUrl || '')
  if (Buffer.byteLength(secret) < 32 || !sendUrl) botIntegrationDisabled()

  const rawBody = await readRawBody(event) || ''
  if (!verifyBotWebhookSignature({
    secret,
    timestamp: getHeader(event, 'x-yeu-timestamp'),
    signature: getHeader(event, 'x-yeu-signature'),
    rawBody
  })) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
  }
  if (!wechatRoomAllowed(payload, String(runtime.wechatBotAllowedRoomIds || ''))) {
    return { status: 'ignored', reason: 'room_not_allowed' }
  }
  const question = normalizeWechatQuestion(
    payload,
    String(runtime.wechatBotId || ''),
    String(runtime.wechatBotName || '')
  )
  if (!question) return { status: 'ignored', reason: 'mention_required' }
  if (!reserveBotMessage(question.platform, question.messageId)) return { status: 'ignored', reason: 'duplicate' }

  const client = useAppDatabase(event)
  try {
    assertRateLimit(event, `bot:wechat:room:${question.conversationId}`, 12, 60_000, client)
    assertRateLimit(event, 'bot:wechat:global', 120, 60_000, client)
  } catch (error) {
    releaseBotMessage(question.platform, question.messageId)
    if (botRateLimited(error)) return { status: 'ignored', reason: 'rate_limited' }
    throw error
  }

  void answerAndSendBotQuestion({
    client,
    question,
    config: botAssistantConfig(runtime as unknown as Record<string, unknown>),
    send: message => sendWechatRelayMessage({
      sendUrl,
      secret,
      roomId: question.conversationId,
      replyToMessageId: question.messageId,
      message
    })
  }).catch(() => releaseBotMessage(question.platform, question.messageId))

  setResponseStatus(event, 202)
  return { status: 'accepted' }
})
