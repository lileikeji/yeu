import { randomUUID } from 'node:crypto'
import { createEventStream } from 'h3'
import { assistantQuestionSchema } from '../../../../shared/schemas/server'
import { containsPromptInjection, isQuestionLike } from '../../../../shared/utils/assistant-query'
import { recordAssistantFailure, recordAssistantSuccess } from '../../../modules/assistant/analytics'
import {
  answerCampusQuestion,
  blockedAssistantResponse,
  resolveAssistantFollowUpQuery
} from '../../../modules/assistant/service'
import { getClientIpAddress } from '../../../utils/client-ip'
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
  const effectiveQuery = resolveAssistantFollowUpQuery(body.q, body.previousQ)
  const blocked = containsPromptInjection(effectiveQuery)
  const requestId = typeof event.context.requestId === 'string' ? event.context.requestId : randomUUID()
  const startedAt = Date.now()
  if (!blocked && !isQuestionLike(body.q)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Use regular search for keywords',
      data: { code: 'REGULAR_SEARCH_PREFERRED' }
    })
  }
  const runtime = useRuntimeConfig(event)
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
          recordAssistantFailure(client, { requestId, query: body.q, ipAddress }, 'UNSAFE_QUERY', Date.now() - startedAt)
        } catch {
          // Analytics remains optional during migrations.
        }
        await stream.push({
          event: 'completed',
          data: JSON.stringify(blockedAssistantResponse(body.q))
        })
        return
      }
      const response = await answerCampusQuestion(client, effectiveQuery, {
        gatewayBaseUrl: String(runtime.aiGatewayBaseUrl || ''),
        gatewayApiKey: String(runtime.aiGatewayApiKey || ''),
        gatewayModel: String(runtime.aiGatewayModel || 'gpt-5.4'),
        gatewayTimeoutMs: Math.max(60_000, Number(runtime.aiGatewayTimeoutMs) || 60_000),
        mcpSearchUrl: String(runtime.aiMcpSearchUrl || ''),
        mcpSearchBearerToken: String(runtime.aiMcpSearchBearerToken || ''),
        mcpAllowedHosts: String(runtime.aiMcpAllowedHosts || 'mcp.firecrawl.dev'),
        mcpToolName: String(runtime.aiMcpToolName || 'firecrawl_search'),
        mcpTimeoutMs: Math.max(25_000, Number(runtime.aiMcpTimeoutMs) || 25_000),
        amapWebServiceKey: String(runtime.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || ''),
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
        }
      })
      try {
        recordAssistantSuccess(client, { requestId, query: body.q, ipAddress }, response)
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
        recordAssistantFailure(client, { requestId, query: body.q, ipAddress }, internalCode, Date.now() - startedAt)
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
