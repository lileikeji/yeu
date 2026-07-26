import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

/** Reject oversized JSON bodies before full parse (DoS / memory). */
export const MAX_JSON_BODY_BYTES = 262_144

function validationError(issues: Array<{ path: PropertyKey[], message: string }>) {
  return createError({
    statusCode: 422,
    statusMessage: 'Validation failed',
    data: {
      code: 'VALIDATION_ERROR',
      issues: issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message
      }))
    }
  })
}

/** True only for application/json (optional charset / parameters allowed). */
export function isAllowedJsonContentType(header: string | undefined | null): boolean {
  if (!header) return false
  const mediaType = header.split(';')[0]?.trim().toLowerCase()
  return mediaType === 'application/json'
}

export function isJsonBodyWithinLimit(
  byteLength: number,
  maxBytes = MAX_JSON_BODY_BYTES
): boolean {
  return Number.isFinite(byteLength) && byteLength >= 0 && byteLength <= maxBytes
}

function assertJsonContentType(event: H3Event): void {
  const contentType = getHeader(event, 'content-type')
  if (!isAllowedJsonContentType(contentType)) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Unsupported Media Type',
      data: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        expected: 'application/json'
      }
    })
  }
}

function assertJsonBodySize(event: H3Event): void {
  const raw = getHeader(event, 'content-length')
  if (!raw) return
  const length = Number(raw)
  if (!Number.isFinite(length) || length < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Content-Length',
      data: { code: 'INVALID_CONTENT_LENGTH' }
    })
  }
  if (!isJsonBodyWithinLimit(length)) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Request body too large',
      data: { code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_JSON_BODY_BYTES }
    })
  }
}

/**
 * Parse and validate a JSON request body.
 *
 * - Requires Content-Type: application/json (blocks form-urlencoded CSRF-shaped posts).
 * - Rejects Content-Length over the cap, and also measures the actual raw body so
 *   chunked requests without Content-Length cannot bypass the limit.
 * - Uses strict JSON.parse (not form/urlencoded parsers).
 */
export async function parseBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  assertJsonContentType(event)
  assertJsonBodySize(event)

  const raw = await readRawBody(event, false)
  const byteLength = raw?.byteLength ?? 0
  if (!isJsonBodyWithinLimit(byteLength)) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Request body too large',
      data: { code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_JSON_BODY_BYTES }
    })
  }

  let parsed: unknown = undefined
  if (byteLength > 0 && raw) {
    try {
      parsed = JSON.parse(raw.toString('utf8')) as unknown
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid JSON body',
        data: { code: 'INVALID_JSON' }
      })
    }
  }

  const result = schema.safeParse(parsed)

  if (!result.success) {
    throw validationError(result.error.issues)
  }

  return result.data
}

export function parseQuery<T>(event: H3Event, schema: ZodType<T>): T {
  const result = schema.safeParse(getQuery(event))

  if (!result.success) {
    throw validationError(result.error.issues)
  }

  return result.data
}

export function requireUuidParam(event: H3Event, name = 'id'): string {
  const value = getRouterParam(event, name)

  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid ${name}`,
      data: { code: 'INVALID_ROUTE_PARAMETER' }
    })
  }

  return value
}

export function requireSlugParam(event: H3Event, name = 'slug'): string {
  const value = getRouterParam(event, name)

  if (!value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid ${name}`,
      data: { code: 'INVALID_ROUTE_PARAMETER' }
    })
  }

  return value
}
