function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Only surface short, human-facing API messages in the UI.
 * Reject stack traces, filesystem paths, SQL/driver noise, and credential-like text.
 */
export function isSafeUiErrorMessage(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed || trimmed.length > 200) return false
  if (/[\r\n\u0000]/.test(trimmed)) return false
  if (/\bat\s+\S+\s*\(/.test(trimmed)) return false
  if (/[A-Za-z]:\\|\/(?:home|var|tmp|Users|root)\//.test(trimmed)) return false
  if (/SQLITE_|\b(ECONNREFUSED|ENOENT|EACCES|password|passwd|secret|token|stack|Exception|TypeError|ReferenceError)\b/i.test(trimmed)) return false
  if (/\berror\b/i.test(trimmed) && /[{}<>]/.test(trimmed)) return false
  return true
}

function firstSafeMessage(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && isSafeUiErrorMessage(candidate)) {
      return candidate.trim()
    }
  }
  return null
}

const localizedApiMessages: Record<string, string> = {
  'Current verification and at least one active A/B/C source are required before publishing':
    '发布前请填写最新核验时间，并关联至少一个可用的 A/B/C 级来源。',
  'Verified WGS84 coordinates and at least one active A/B/C source are required before publishing':
    '发布前请完成 WGS84 坐标核验，并关联至少一个可用的 A/B/C 级来源。',
  'Current verification, ordered steps, and active evidence are required before publishing':
    '发布前请填写最新核验时间、至少一个有序步骤，并关联可用依据。',
  'Unpublish dependent records or add another active A/B/C source first':
    '该来源仍被已发布内容使用。请先下架相关内容，或为它们补充另一个可用的 A/B/C 级来源。'
}

function localizeApiMessage(message: string): string {
  return localizedApiMessages[message] ?? message
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
  const data = isRecord(error.data) ? error.data : null
  const safe = firstSafeMessage(
    data?.statusMessage,
    data?.message,
    error.statusMessage,
    error.message
  )
  return safe ? localizeApiMessage(safe) : fallback
}

export function isAuthorizationError(error: unknown): boolean {
  const statusCode = getRequestStatusCode(error)
  return statusCode === 401 || statusCode === 403
}
