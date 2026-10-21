import {
  ALL_JUDGE_CSRF_COOKIE_NAMES,
  HOST_JUDGE_CSRF_COOKIE_NAME,
  JUDGE_CSRF_COOKIE_NAME,
  JUDGE_CSRF_HEADER_NAME
} from '~~/shared/constants/security'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type JudgeFetchOptions = {
  method?: string
  body?: BodyInit | Record<string, unknown> | null
  headers?: HeadersInit
  credentials?: RequestCredentials
}

function readCookieByName(name: string): string {
  try {
    return useCookie<string | null>(name).value || ''
  } catch {
    if (!import.meta.client || typeof document === 'undefined') return ''
    const prefix = `${name}=`
    const match = document.cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(prefix))
    if (!match) return ''
    return decodeURIComponent(match.slice(prefix.length))
  }
}

function readJudgeCsrfToken(): string {
  return readCookieByName(HOST_JUDGE_CSRF_COOKIE_NAME)
    || readCookieByName(JUDGE_CSRF_COOKIE_NAME)
    || ALL_JUDGE_CSRF_COOKIE_NAMES.map(readCookieByName).find(Boolean)
    || ''
}

export function withJudgeRequestOptions<T extends JudgeFetchOptions>(options: T = {} as T): T {
  const method = String(options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers as HeadersInit | undefined)

  if (!SAFE_METHODS.has(method)) {
    const token = readJudgeCsrfToken()
    if (token) headers.set(JUDGE_CSRF_HEADER_NAME, token)
  }

  return {
    ...options,
    credentials: 'include',
    headers
  }
}

export function judgeFetch<T = unknown>(url: string, options: JudgeFetchOptions = {}): Promise<T> {
  return $fetch(url, withJudgeRequestOptions(options) as never) as Promise<T>
}
