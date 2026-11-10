import {
  ALL_CSRF_COOKIE_NAMES,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  HOST_CSRF_COOKIE_NAME
} from '~~/shared/constants/security'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type AdminFetchOptions = {
  method?: string
  body?: BodyInit | Record<string, unknown> | null
  query?: Record<string, unknown>
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

function readCsrfToken(): string {
  return readCookieByName(HOST_CSRF_COOKIE_NAME)
    || readCookieByName(CSRF_COOKIE_NAME)
    || ALL_CSRF_COOKIE_NAMES.map(readCookieByName).find(Boolean)
    || ''
}

export function withAdminRequestOptions<T extends AdminFetchOptions>(options: T = {} as T): T {
  const method = String(options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers as HeadersInit | undefined)

  if (!SAFE_METHODS.has(method)) {
    const token = readCsrfToken()
    if (token) {
      headers.set(CSRF_HEADER_NAME, token)
    }
  }

  return {
    ...options,
    credentials: 'include',
    headers
  }
}

export function adminFetch<T = unknown>(url: string, options: AdminFetchOptions = {}): Promise<T> {
  return $fetch(url, withAdminRequestOptions(options) as never) as Promise<T>
}
