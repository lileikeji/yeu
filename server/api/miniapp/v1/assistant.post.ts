import { randomUUID } from 'node:crypto'
import { assistantQuestionSchema } from '../../../../shared/schemas/server'
import { containsPromptInjection, isAssistantAnswerableQuery } from '../../../../shared/utils/assistant-query'
import { recordAssistantFailure, recordAssistantSuccess } from '../../../modules/assistant/analytics'
import { hashSessionKey } from '../../../modules/assistant/memory'
import { answerCampusQuestion, blockedAssistantResponse } from '../../../modules/assistant/service'
import { assistantConfigFromRuntime } from '../../../utils/assistant-config'
import { getClientIpAddress } from '../../../utils/client-ip'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { createRequestAbortSignal } from '../../../utils/request-abort'
import { parseBody } from '../../../utils/validation'

/**
 * 小程序端 AI 检索：与网页 `/api/public/assistant` 复用同一套 answerCampusQuestion。
 * 差别只有入口限流（小程序按 IP 收得更紧）与响应头策略。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `miniapp-assistant:${ipAddress}`, 12, 60 * 1000, client)
  assertRateLimit(event, 'miniapp-assistant:global', 120, 60 * 1000, client)

  const body = await parseBody(event, assistantQuestionSchema)
  const sessionKey = body.sessionId ? hashSessionKey(body.sessionId) : undefined
  const requestId = typeof event.context.requestId === 'string' ? event.context.requestId : randomUUID()
  const startedAt = Date.now()

  if (containsPromptInjection(body.q)) {
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'miniapp' }, 'UNSAFE_QUERY', Date.now() - startedAt)
    } catch {
      // 统计失败不影响回答。
    }
    return blockedAssistantResponse(body.q)
  }
  // 与网页一致：意图识别交给模型，入口只拦空洞输入。
  if (!isAssistantAnswerableQuery(body.q)) {
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'miniapp' }, 'QUERY_EMPTY', Date.now() - startedAt)
    } catch {
      // 统计失败不影响拒绝结果。
    }
    throw createError({
      statusCode: 422,
      statusMessage: 'Empty assistant question',
      data: { code: 'QUERY_EMPTY' }
    })
  }

  const requestAbort = createRequestAbortSignal(event)
  try {
    const response = await answerCampusQuestion(client, body.q, {
      ...assistantConfigFromRuntime(event),
      sessionKey,
      previousQuery: body.previousQ,
      signal: requestAbort.signal
    })
    try {
      recordAssistantSuccess(client, { requestId, query: body.q, ipAddress, channel: 'miniapp' }, response)
    } catch {
      // 统计失败不影响回答。
    }
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE'
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'miniapp' }, code, Date.now() - startedAt)
    } catch {
      // 统计失败不影响回答。
    }
    if (code === 'CLIENT_ABORTED') return
    const busy = code === 'AI_BUSY' || code === 'AI_CIRCUIT_OPEN'
    throw createError({
      statusCode: busy ? 503 : 502,
      statusMessage: 'Assistant unavailable',
      data: { code: busy ? 'AI_BUSY' : 'AI_UNAVAILABLE' }
    })
  } finally {
    requestAbort.dispose()
  }
})
