import { performance } from 'node:perf_hooks'
import { defineEventHandler } from 'h3'
import {
  createRequestLogEntry,
  requestLoggingEnabled,
  resolveRequestId,
  resolveSecurityHeaders,
  shouldDisableCache
} from '../utils/request-context'

export default defineEventHandler((event) => {
  const request = event.node?.req
  const response = event.node?.res
  if (!request || !response) return

  const startedAt = performance.now()
  const method = (request.method ?? 'GET').toUpperCase()
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  const requestIdHeader = request.headers['x-request-id']
  const requestId = resolveRequestId(Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader)

  event.context.requestId = requestId
  response.setHeader('X-Request-Id', requestId)
  for (const [name, value] of Object.entries(resolveSecurityHeaders({ pathname }))) {
    response.setHeader(name, value)
  }
  // Fingerprint: Nuxt may re-add x-powered-by for HTML; plugin strip-powered-by
  // removes it on beforeResponse. Also clear here for early JSON paths.
  if (typeof response.removeHeader === 'function') {
    response.removeHeader('x-powered-by')
  }
  if (shouldDisableCache(method, pathname)) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Pragma', 'no-cache')
  }

  if (!requestLoggingEnabled()) return

  let emitted = false
  const emit = (aborted: boolean) => {
    if (emitted) return
    emitted = true
    const entry = createRequestLogEntry({
      requestId,
      method,
      pathname,
      statusCode: response.statusCode,
      durationMs: performance.now() - startedAt,
      aborted
    })
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  }

  response.once('finish', () => emit(false))
  response.once('close', () => {
    if (!response.writableFinished) emit(true)
  })
})
