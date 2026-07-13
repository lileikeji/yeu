export function throwNotFound(entity: string): never {
  throw createError({
    statusCode: 404,
    statusMessage: `${entity} not found`,
    data: { code: 'NOT_FOUND', entity }
  })
}

export function rethrowDatabaseError(error: unknown): never {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''

  if (code.startsWith('SQLITE_CONSTRAINT')) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The change conflicts with existing data',
      data: { code: 'DATA_CONFLICT' }
    })
  }

  throw error
}
