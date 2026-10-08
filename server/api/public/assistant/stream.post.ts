import { randomUUID } from 'node:crypto'
import { createEventStream } from 'h3'
import { assistantQuestionSchema } from '../../../../shared/schemas/server'
import { containsPromptInjection, isAssistantAnswerableQuery } from '../../../../shared/utils/assistant-query'
import { recordAssistantFailure, recordAssistantSuccess } from '../../../modules/assistant/analytics'
import { hashSessionKey } from '../../../modules/assistant/memory'
import {
  answerCampusQuestion,
  blockedAssistantResponse
} from '../../../modules/assistant/service'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assistantConfigFromRuntime } from '../../../utils/assistant-config'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { createRequestAbortSignal } from '../../../utils/request-abort'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  // Keep the stream unbuffered across Nginx/CDN layers. The client has a
  // normal JSON endpoint fallback, but an early first byte prevents healthy
  // long-running searches from being mistaken for a dead connection.
  setHeader(event, 'Content-Type', 'text/event-stream; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-cache, no-store, no-transform')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Surrogate-Control', 'no-store')
  setHeader(event, 'X-Accel-Buffering', 'no')
  setHeader(event, 'Connection', 'keep-alive')
  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `assistant:${ipAddress}`, 20, 60 * 1000, client)
  assertRateLimit(event, 'assistant:global', 200, 60 * 1000, client)

  const body = await parseBody(event, assistantQuestionSchema)
  const sessionKey = body.sessionId ? hashSessionKey(body.sessionId) : undefined
  const blocked = containsPromptInjection(body.q)
  const requestId = typeof event.context.requestId === 'string' ? event.context.requestId : randomUUID()
  const startedAt = Date.now()
  // 与 /api/public/assistant 一致：意图识别交给模型，入口只拦空洞输入。
  if (!blocked && !isAssistantAnswerableQuery(body.q)) {
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
  const stream = createEventStream(event)
  const requestAbort = createRequestAbortSignal(event)
  const heartbeatTimer = setInterval(() => {
    void stream.push({
      event: 'heartbeat',
      data: JSON.stringify({ at: new Date().toISOString() })
    }).catch(() => {})
  }, 4_000)
  heartbeatTimer.unref()

  void (async () => {
    try {
      await stream.push({
        event: 'heartbeat',
        data: JSON.stringify({ at: new Date().toISOString() })
      })
      if (blocked) {
        try {
          recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'web' }, 'UNSAFE_QUERY', Date.now() - startedAt)
        } catch {
          // Analytics remains optional during migrations.
        }
        await stream.push({
          event: 'completed',
          data: JSON.stringify(blockedAssistantResponse(body.q))
        })
        return
      }
      const response = await answerCampusQuestion(client, body.q, {
        // 与 /api/public/assistant、小程序、机器人共用同一份配置映射。这里以前手抄
        // 了整份字段清单（还漏过 25s 的旧 MCP 下限、缩进也抄乱了），是渠道之间漂移
        // 的同一类隐患来源。
        ...assistantConfigFromRuntime(event),
        sessionKey,
        previousQuery: body.previousQ,
        signal: requestAbort.signal
      }, {
        onStageStarted: async (stage, label, stageStartedAt) => {
          await stream.push({
            event: 'stage_started',
            data: JSON.stringify({ stage, label, startedAt: stageStartedAt })
          })
        },
        onStageCompleted: async step => {
          await stream.push({ event: 'stage_completed', data: JSON.stringify(step) })
        },
        onContentDelta: async delta => {
          // 美食推荐 LLM 正文：content_delta 增量事件打字机式推到前端。
          await stream.push({
            event: 'content_delta',
            data: JSON.stringify({ delta })
          }).catch(() => {})
        }
      })
      try {
        recordAssistantSuccess(client, { requestId, query: body.q, ipAddress, channel: 'web' }, response)
      } catch {
        // Analytics must not affect the public stream during a delayed migration.
      }
      await stream.push({ event: 'completed', data: JSON.stringify(response) })
    } catch (error) {
      const internalCode = error instanceof Error ? error.message : 'AI_UNAVAILABLE'
      if (requestAbort.signal.aborted) return
      const publicCode = internalCode === 'AI_BUSY' || internalCode === 'AI_CIRCUIT_OPEN'
        ? 'AI_BUSY'
        : 'AI_UNAVAILABLE'
      try {
        recordAssistantFailure(client, { requestId, query: body.q, ipAddress, channel: 'web' }, internalCode, Date.now() - startedAt)
      } catch {
        // Analytics must not affect the public stream during a delayed migration.
      }
      await stream.push({
        event: 'error',
        data: JSON.stringify({ code: publicCode, message: '暂时无法继续整理这个问题。' })
      }).catch(() => {})
    } finally {
      clearInterval(heartbeatTimer)
      requestAbort.dispose()
      await stream.close().catch(() => {})
    }
  })()

  return stream.send()
})
