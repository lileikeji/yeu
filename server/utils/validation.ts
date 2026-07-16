import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

/** Reject oversized JSON bodies before full parse (DoS / memory). */
const MAX_JSON_BODY_BYTES = 1_048_576

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
  if (length > MAX_JSON_BODY_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Request body too large',
      data: { code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_JSON_BODY_BYTES }
    })
  }
}

export async function parseBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  assertJsonBodySize(event)
  const result = schema.safeParse(await readBody(event))

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
