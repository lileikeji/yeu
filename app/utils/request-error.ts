function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getRequestStatusCode(error: unknown): number | null {
  if (!isRecord(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  if (isRecord(error.response) && typeof error.response.status === 'number') {
    return error.response.status
  }
  return null
}

export function getRequestMessage(error: unknown, fallback: string): string {
  if (!isRecord(error)) return fallback
  if (isRecord(error.data)) {
    if (typeof error.data.statusMessage === 'string') return error.data.statusMessage
    if (typeof error.data.message === 'string') return error.data.message
  }
  if (typeof error.statusMessage === 'string') return error.statusMessage
  if (typeof error.message === 'string') return error.message
  return fallback
}

export function isAuthorizationError(error: unknown): boolean {
  const statusCode = getRequestStatusCode(error)
  return statusCode === 401 || statusCode === 403
}
