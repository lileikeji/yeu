import type { MiniAppApiError, MiniAppTelemetryAction, MiniAppTelemetryMeta } from '../types/app'

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || 'https://yx.huiliyill.cn').replace(/\/$/, '')
const CACHE_TTL_MS = 30_000
const MAX_RETRIES = 2
const cache = new Map<string, { expiresAt: number, value: unknown }>()

function runtimeTelemetryMeta(): MiniAppTelemetryMeta {
  try {
    const accountInfo = typeof uni.getAccountInfoSync === 'function'
      ? uni.getAccountInfoSync()
      : null
    const envVersion = accountInfo?.miniProgram?.envVersion
    const appVersion = accountInfo?.miniProgram?.version
    return {
      platform: 'mp-weixin',
      source: envVersion || 'unknown',
      appVersion: appVersion || 'unknown'
    }
  } catch {
    return { platform: 'mp-weixin', source: 'unknown', appVersion: 'unknown' }
  }
}

export class MiniAppRequestError extends Error {
  readonly details: MiniAppApiError

  constructor(details: MiniAppApiError) {
    super(details.message)
    this.name = 'MiniAppRequestError'
    this.details = details
  }
}

function readErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const data = record.data
  if (typeof record.code === 'string') return record.code
  if (data && typeof data === 'object' && typeof (data as Record<string, unknown>).code === 'string') {
    return (data as Record<string, unknown>).code as string
  }
  return null
}

function readMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  if (typeof record.statusMessage === 'string') return record.statusMessage
  if (typeof record.message === 'string') return record.message
  const data = record.data
  if (data && typeof data === 'object' && typeof (data as Record<string, unknown>).message === 'string') {
    return (data as Record<string, unknown>).message as string
  }
  return fallback
}

function queryString(query?: Record<string, string | number | undefined>): string {
  if (!query) return ''
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  return params.length ? `?${params.join('&')}` : ''
}

function safePath(path: string): string {
  const [pathname] = path.split('?')
  const segments = pathname.replace(/[^a-zA-Z0-9_./-]/g, '').split('/')
  const scrubbed = segments.map((segment, index) => index >= 5 && segment ? ':id' : segment)
  return scrubbed.join('/').slice(0, 160) || '/'
}

function safeQuery(query?: Record<string, string | number | undefined>): Record<string, string | number> {
  if (!query) return {}
  return Object.fromEntries(Object.entries(query)
    .filter(([key, value]) => value !== undefined && value !== '' && /^(q|type|page|pageSize|scope|category|audience|featured)$/.test(key))
    .map(([key, value]) => [key, key === 'q'
      ? Array.from(String(value).slice(0, 32)).filter(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127).join('')
      : value as string | number]))
}

function parseRetryAfter(value: string | undefined): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, (timestamp - Date.now()) / 1000) : null
}

function report(action: MiniAppTelemetryAction, path: string, meta: MiniAppTelemetryMeta = {}): void {
  try {
    uni.request({
      url: `${API_BASE_URL}/api/miniapp/v1/track`,
      method: 'POST',
      timeout: 3_000,
      header: { 'content-type': 'application/json', 'Accept': 'application/json' },
      data: {
        action,
        pathname: safePath(path),
        meta: { ...meta, ...runtimeTelemetryMeta() }
      },
      complete: () => undefined
    })
  } catch {
    // Telemetry is best-effort and must never block a user action.
  }
}

export function trackMiniApp(action: MiniAppTelemetryAction, path: string, meta: MiniAppTelemetryMeta = {}): void {
  report(action, path, meta)
}

export interface MiniAppRequestOptions {
  path: string
  query?: Record<string, string | number | undefined>
  timeout?: number
  cacheTtl?: number
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function requestOnce<T>(options: MiniAppRequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const url = `${API_BASE_URL}${options.path}${queryString(options.query)}`
    uni.request({
      url,
      method: 'GET',
      timeout: options.timeout ?? 12_000,
      header: { Accept: 'application/json' },
      success: (response) => {
        const payload = response.data
        if (response.statusCode >= 200 && response.statusCode < 300) {
          report('api_request', options.path, {
            api: safePath(options.path),
            route: safePath(options.path),
            method: 'GET',
            status: response.statusCode,
            latency: Date.now() - startedAt,
            requestId: response.header?.['X-Request-Id'] || response.header?.['x-request-id'] || undefined
          })
          resolve(payload as T)
          return
        }
        const retryAfterHeader = response.header?.['Retry-After'] || response.header?.['retry-after']
        const retryAfter = parseRetryAfter(retryAfterHeader)
        reject(new MiniAppRequestError({
          status: response.statusCode,
          code: readErrorCode(payload),
          message: readMessage(payload, '服务暂时不可用，请稍后重试'),
          requestId: response.header?.['X-Request-Id'] || response.header?.['x-request-id'] || null,
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : null
        }))
      },
      fail: error => reject(new MiniAppRequestError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: error.errMsg || '网络连接失败，请检查网络后重试',
        requestId: null,
        retryAfter: null
      }))
    })
  })
}

export async function request<T>(options: MiniAppRequestOptions): Promise<T> {
  const cacheKey = `${options.path}${queryString(options.query)}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value as T
  const startedAt = Date.now()
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const value = await requestOnce<T>(options)
      cache.set(cacheKey, { value, expiresAt: Date.now() + (options.cacheTtl ?? CACHE_TTL_MS) })
      return value
    } catch (cause) {
      lastError = cause
      const details = (cause as { details?: MiniAppApiError })?.details
      if (details?.status === 429 && details.retryAfter !== null) {
        await wait(Math.min(Math.max(details.retryAfter * 1000, 250), 10_000))
      } else if (attempt < MAX_RETRIES && (details?.status === 0 || (details?.status ?? 0) >= 500)) {
        await wait(250 * (attempt + 1))
      } else {
        break
      }
    }
  }
  const details = (lastError as { details?: MiniAppApiError })?.details
  report('api_error', options.path, {
    ...runtimeTelemetryMeta(),
    api: safePath(options.path),
    route: safePath(options.path),
    method: 'GET',
    status: details?.status ?? 0,
    error: details?.code ?? 'UNKNOWN',
    latency: Date.now() - startedAt,
    requestId: details?.requestId ?? undefined
  })
  throw lastError
}

/**
 * JSON POST 请求（AI 问答用）。与 GET 相同的重试/429/遥测策略，
 * 但不会读取或写入 GET 缓存，避免把问答结果缓存成静态数据。
 */
export async function postJson<T>(options: {
  path: string
  body: Record<string, unknown>
  timeout?: number
}): Promise<T> {
  const startedAt = Date.now()
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const value = await new Promise<T>((resolve, reject) => {
        uni.request({
          url: `${API_BASE_URL}${options.path}`,
          method: 'POST',
          timeout: options.timeout ?? 55_000,
          header: { 'content-type': 'application/json', 'Accept': 'application/json' },
          data: options.body,
          success: (response) => {
            const payload = response.data
            if (response.statusCode >= 200 && response.statusCode < 300) {
              report('api_request', options.path, {
                api: safePath(options.path),
                route: safePath(options.path),
                method: 'POST',
                status: response.statusCode,
                latency: Date.now() - startedAt,
                requestId: response.header?.['X-Request-Id'] || response.header?.['x-request-id'] || undefined
              })
              resolve(payload as T)
              return
            }
            const retryAfter = parseRetryAfter(response.header?.['Retry-After'] || response.header?.['retry-after'])
            reject(new MiniAppRequestError({
              status: response.statusCode,
              code: readErrorCode(payload),
              message: readMessage(payload, '服务暂时不可用，请稍后重试'),
              requestId: response.header?.['X-Request-Id'] || response.header?.['x-request-id'] || null,
              retryAfter: Number.isFinite(retryAfter) ? retryAfter : null
            }))
          },
          fail: error => reject(new MiniAppRequestError({
            status: 0,
            code: 'NETWORK_ERROR',
            message: error.errMsg || '网络连接失败，请检查网络后重试',
            requestId: null,
            retryAfter: null
          }))
        })
      })
      return value
    } catch (cause) {
      lastError = cause
      const details = (cause as { details?: MiniAppApiError })?.details
      if (details?.status === 429 && details.retryAfter !== null) {
        await wait(Math.min(Math.max(details.retryAfter * 1000, 250), 10_000))
      } else if (attempt < MAX_RETRIES && (details?.status === 0 || (details?.status ?? 0) >= 500)) {
        await wait(400 * (attempt + 1))
      } else {
        break
      }
    }
  }
  const details = (lastError as { details?: MiniAppApiError })?.details
  report('api_error', options.path, {
    ...runtimeTelemetryMeta(),
    api: safePath(options.path),
    route: safePath(options.path),
    method: 'POST',
    status: details?.status ?? 0,
    error: details?.code ?? 'UNKNOWN',
    latency: Date.now() - startedAt,
    requestId: details?.requestId ?? undefined
  })
  throw lastError
}

export function clearRequestCache(): void {
  cache.clear()
}

export function getApiBaseUrl(): string {
  return API_BASE_URL
}

export function getSafeTelemetryQuery(query?: Record<string, string | number | undefined>): Record<string, string | number> {
  return safeQuery(query)
}
