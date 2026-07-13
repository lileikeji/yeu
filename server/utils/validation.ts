import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

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

export async function parseBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
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
