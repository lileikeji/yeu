import { randomUUID } from 'node:crypto'
import { assistantQuestionSchema } from '../../../shared/schemas/server'
import { containsPromptInjection, isQuestionLike } from '../../../shared/utils/assistant-query'
import { recordAssistantFailure, recordAssistantSuccess } from '../../modules/assistant/analytics'
import { answerCampusQuestion } from '../../modules/assistant/service'
import { getClientIpAddress } from '../../utils/client-ip'
import { useAppDatabase } from '../../utils/database'
import { assertRateLimit } from '../../utils/rate-limit'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `assistant:${ipAddress}`, 8, 60 * 1000, client)
  assertRateLimit(event, 'assistant:global', 80, 60 * 1000, client)

  const body = await parseBody(event, assistantQuestionSchema)
  if (!isQuestionLike(body.q)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Use regular search for keywords',
      data: { code: 'REGULAR_SEARCH_PREFERRED' }
    })
  }
  if (containsPromptInjection(body.q)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unsupported question',
      data: { code: 'UNSAFE_QUERY' }
    })
  }

  const runtime = useRuntimeConfig(event)
  const requestId = typeof event.context.requestId === 'string' ? event.context.requestId : randomUUID()
  const startedAt = Date.now()
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
      mcpTimeoutMs: Math.max(25_000, Number(runtime.aiMcpTimeoutMs) || 25_000)
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
    const busy = code === 'AI_BUSY' || code === 'AI_CIRCUIT_OPEN'
    throw createError({
      statusCode: busy ? 503 : 502,
      statusMessage: 'Assistant unavailable',
      data: { code: busy ? 'AI_BUSY' : 'AI_UNAVAILABLE' }
    })
  }
})
