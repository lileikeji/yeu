import { normalizeOneBotQuestion } from '../../../modules/bots/events'
import { botAssistantConfig, botIntegrationDisabled, botRateLimited } from '../../../modules/bots/runtime'
import { answerAndSendBotQuestion, releaseBotMessage, reserveBotMessage } from '../../../modules/bots/service'
import { verifyBearerToken } from '../../../modules/bots/security'
import { sendOneBotGroupMessage } from '../../../modules/bots/transports'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  const runtime = useRuntimeConfig(event)
  const webhookToken = String(runtime.qqBotWebhookToken || '')
  const apiUrl = String(runtime.qqBotApiUrl || '')
  if (Buffer.byteLength(webhookToken) < 32 || !apiUrl) botIntegrationDisabled()
  if (!verifyBearerToken(getHeader(event, 'authorization'), webhookToken)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const rawBody = await readRawBody(event)
  let payload: unknown
  try {
    payload = JSON.parse(rawBody || '')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
  }
  const question = normalizeOneBotQuestion(payload, String(runtime.qqBotSelfId || ''))
  if (!question) return { status: 'ignored', reason: 'mention_required' }
  if (!reserveBotMessage(question.platform, question.messageId)) return { status: 'ignored', reason: 'duplicate' }

  const client = useAppDatabase(event)
  try {
    assertRateLimit(event, `bot:qq:group:${question.conversationId}`, 12, 60_000, client)
    assertRateLimit(event, 'bot:qq:global', 120, 60_000, client)
  } catch (error) {
    releaseBotMessage(question.platform, question.messageId)
    if (botRateLimited(error)) return { status: 'ignored', reason: 'rate_limited' }
    throw error
  }

  void answerAndSendBotQuestion({
    client,
    question,
    config: botAssistantConfig(runtime as unknown as Record<string, unknown>),
    send: message => sendOneBotGroupMessage({
      apiUrl,
      apiToken: String(runtime.qqBotApiToken || ''),
      groupId: question.conversationId,
      message
    })
  }).catch(() => releaseBotMessage(question.platform, question.messageId))

  setResponseStatus(event, 202)
  return { status: 'accepted' }
})
