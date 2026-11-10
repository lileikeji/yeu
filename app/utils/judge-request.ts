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

/** 类型擦除的 fetch 调用面：judgeFetch 的 url 是动态字符串，命中不了任何字面量路由，
 *  而 Nuxt 4.6 的 $fetch 会尝试把 options 与全量路由联合逐一比对（TS2321 爆栈）。 */
type UntypedFetch = (url: string, options?: JudgeFetchOptions) => Promise<unknown>
const rawFetch = $fetch as unknown as UntypedFetch

export function judgeFetch<T = unknown>(url: string, options: JudgeFetchOptions = {}): Promise<T> {
  return rawFetch(url, withJudgeRequestOptions(options)) as Promise<T>
}
