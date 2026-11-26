/**
 * 金数据表单数据 API 客户端。
 *
 * 文档：https://open.jinshuju.net/api_v1/endpoints/get_form_entries
 * 认证：Authorization: Bearer <个人中心创建的 Access Token>
 * 分页：响应里的 next 原样回传，不要自己算偏移。
 */

import type { H3Event } from 'h3'

const API_BASE = 'https://jinshuju.net/api/v1'
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000
const REQUEST_TIMEOUT_MS = 15_000

export interface JinshujuConfig {
  apiToken: string
  formToken: string
  /** 存放投票选项的字段 api_code，例如 field_3 */
  optionField: string
}

export interface JinshujuEntriesPage {
  total: number
  count: number
  next: string | null
  data: unknown[]
}

export class JinshujuApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'JinshujuApiError'
    this.status = status
  }
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function readJinshujuConfig(event?: H3Event): JinshujuConfig | null {
  const config = useRuntimeConfig(event) as Record<string, unknown>
  const apiToken = readString(config, 'jinshujuApiToken')
  const formToken = readString(config, 'jinshujuFormToken')
  const optionField = readString(config, 'jinshujuOptionField')
  if (!apiToken || !formToken || !optionField) return null
  return { apiToken, formToken, optionField }
}

/**
 * 拉一页表单条目。
 * created 传北京时间字符串（`2026-11-26` 或 `2026-11-26 09:00:00`），只在增量同步时用。
 */
export async function fetchJinshujuEntries(
  config: JinshujuConfig,
  options: { created?: string, next?: string | null, limit?: number } = {}
): Promise<JinshujuEntriesPage> {
  const url = new URL(`${API_BASE}/forms/${encodeURIComponent(config.formToken)}/entries`)
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? DEFAULT_LIMIT))
  url.searchParams.set('limit', String(limit))
  if (options.created) url.searchParams.set('created_at', options.created)
  if (options.next) url.searchParams.set('next', options.next)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new JinshujuApiError(`金数据请求失败：${reason}`, 0)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const hint = response.status === 401
      ? '令牌无效'
      : response.status === 402
        ? '当前套餐不支持 API'
        : response.status === 404
          ? '表单不存在或无权访问'
          : response.status === 429
            ? '触发限流'
            : '未知错误'
    throw new JinshujuApiError(
      `金数据返回 ${response.status}（${hint}）${detail ? `：${detail.slice(0, 200)}` : ''}`,
      response.status
    )
  }

  const payload = await response.json() as Record<string, unknown>
  const data = Array.isArray(payload.data) ? payload.data : []
  const next = typeof payload.next === 'string' && payload.next.length > 0 ? payload.next : null
  return {
    total: typeof payload.total === 'number' ? payload.total : data.length,
    count: typeof payload.count === 'number' ? payload.count : data.length,
    next,
    data
  }
}

/** 金数据的 created_at 参数要北京时间、无时区后缀。 */
export function toJinshujuTimestamp(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
    + ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
}
