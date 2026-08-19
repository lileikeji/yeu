import { randomUUID } from 'node:crypto'
import { assistantQuestionSchema } from '../../../shared/schemas/server'
import { containsPromptInjection, isQuestionLike } from '../../../shared/utils/assistant-query'
import { recordAssistantFailure, recordAssistantSuccess } from '../../modules/assistant/analytics'
import { hashSessionKey } from '../../modules/assistant/memory'
import {
  answerCampusQuestion,
  blockedAssistantResponse
} from '../../modules/assistant/service'
import { getClientIpAddress } from '../../utils/client-ip'
import { useAppDatabase } from '../../utils/database'
import { assertRateLimit } from '../../utils/rate-limit'
import { createRequestAbortSignal } from '../../utils/request-abort'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `assistant:${ipAddress}`, 20, 60 * 1000, client)
  assertRateLimit(event, 'assistant:global', 200, 60 * 1000, client)

  const body = await parseBody(event, assistantQuestionSchema)
  const sessionKey = body.sessionId ? hashSessionKey(body.sessionId) : undefined
  const requestId = typeof event.context.requestId === 'string' ? event.context.requestId : randomUUID()
  const startedAt = Date.now()
  if (containsPromptInjection(body.q)) {
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress }, 'UNSAFE_QUERY', Date.now() - startedAt)
    } catch {
      // Analytics remains optional during migrations.
    }
    return blockedAssistantResponse(body.q)
  }
  if (!isQuestionLike(body.q)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Use regular search for keywords',
      data: { code: 'REGULAR_SEARCH_PREFERRED' }
    })
  }

  const runtime = useRuntimeConfig(event)
  const requestAbort = createRequestAbortSignal(event)
  try {
    const response = await answerCampusQuestion(client, body.q, {
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
      sessionKey,
      previousQuery: body.previousQ,
      embeddingBaseUrl: String(runtime.aiEmbeddingBaseUrl || ''),
      embeddingApiKey: String(runtime.aiEmbeddingApiKey || ''),
      embeddingModel: String(runtime.aiEmbeddingModel || 'text-embedding-v3'),
      embeddingTimeoutMs: Math.max(5_000, Number(runtime.aiEmbeddingTimeoutMs) || 15_000),
      rerankBaseUrl: String(runtime.aiRerankBaseUrl || ''),
      rerankApiKey: String(runtime.aiRerankApiKey || ''),
      rerankModel: String(runtime.aiRerankModel || 'BAAI/bge-reranker-v2-m3'),
      rerankTimeoutMs: Math.max(5_000, Number(runtime.aiRerankTimeoutMs) || 15_000),
      rewriteEnabled: runtime.aiRewriteEnabled === true || String(runtime.aiRewriteEnabled) === 'true',
      rewriteModel: String(runtime.aiRewriteModel || ''),
      rewriteMaxVariants: Math.max(1, Math.min(3, Number(runtime.aiRewriteMaxVariants) || 2)),
      rewriteTimeoutMs: Math.max(5_000, Number(runtime.aiRewriteTimeoutMs) || 12_000),
      rerankLocalEnabled: runtime.aiRerankLocalEnabled === true || String(runtime.aiRerankLocalEnabled) === 'true',
      rerankLocalModel: String(runtime.aiRerankLocalModel || ''),
      signal: requestAbort.signal
    })
    try {
      recordAssistantSuccess(client, { requestId, query: body.q, ipAddress }, response)
    } catch {
      // Analytics must not affect the public answer during a delayed migration.
    }
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE'
    try {
      recordAssistantFailure(client, { requestId, query: body.q, ipAddress }, code, Date.now() - startedAt)
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
