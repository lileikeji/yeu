import { randomUUID } from 'node:crypto'
import { assistantQuestionSchema } from '../../../shared/schemas/server'
import { containsPromptInjection, isAssistantAnswerableQuery } from '../../../shared/utils/assistant-query'
import { recordAssistantFailure, recordAssistantSuccess } from '../../modules/assistant/analytics'
import { hashSessionKey } from '../../modules/assistant/memory'
import {
  answerCampusQuestion,
  blockedAssistantResponse
} from '../../modules/assistant/service'
import { getClientIpAddress } from '../../utils/client-ip'
import { useAppDatabase } from '../../utils/database'
import { assertAssistantRateLimit } from '../../utils/abuse-alert'
import { assistantConfigFromRuntime } from '../../utils/assistant-config'
import { createRequestAbortSignal } from '../../utils/request-abort'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertAssistantRateLimit(event, client, ipAddress)

  const body = await parseBody(event, assistantQuestionSchema)
  const sessionKey = body.sessionId ? hashSessionKey(body.sessionId) : undefined
  const requestId = typeof event.context.requestId === 'string' ? event.context.requestId : randomUUID()
  const startedAt = Date.now()
  if (containsPromptInjection(body.q)) {
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'web' }, 'UNSAFE_QUERY', Date.now() - startedAt)
    } catch {
      // Analytics remains optional during migrations.
    }
    return blockedAssistantResponse(body.q)
  }
  // 意图识别交给模型：入口只拦「没有内容可问」的输入。旧的关键词门禁会把
  // “上课时间表/竞赛奖金/财务处电话”这类正常提问判成关键词搜索并回 422，
  // 用户侧看到的是 AI 完全不出结果。
  if (!isAssistantAnswerableQuery(body.q)) {
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'web' }, 'QUERY_EMPTY', Date.now() - startedAt)
    } catch {
      // Analytics remains optional during migrations.
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
      recordAssistantSuccess(client, { requestId, query: body.q, ipAddress, channel: 'web' }, response)
    } catch {
      // Analytics must not affect the public answer during a delayed migration.
    }
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE'
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'web' }, code, Date.now() - startedAt)
    } catch {
      // Analytics must not affect the public answer during a delayed migration.
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
