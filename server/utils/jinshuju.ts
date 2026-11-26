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

export interface JinshujuChoice {
  name: string
  value: string
  hidden: boolean
}

export interface JinshujuField {
  apiCode: string
  label: string
  type: string
  choices: JinshujuChoice[]
}

/** 表单结构归一化结果：读取用的是包装数组，这里统一摊平成 apiCode → 字段。 */
export interface JinshujuForm {
  token: string
  name: string
  description: string
  url: string
  fields: JinshujuField[]
}

export interface JinshujuChoiceUpdate {
  fieldApiCode: string
  add?: string[]
  /** 选项的 value（api_code），不是显示名 */
  remove?: string[]
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

async function requestJinshuju(
  config: JinshujuConfig,
  path: string,
  init: RequestInit = {}
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiToken}`,
    Accept: 'application/json'
  }
  if (init.body) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      body: init.body,
      headers,
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

  return await response.json() as Record<string, unknown>
}

/**
 * 拉一页表单条目。
 * created 传北京时间字符串（`2026-11-26` 或 `2026-11-26 09:00:00`），只在增量同步时用。
 */
export async function fetchJinshujuEntries(
  config: JinshujuConfig,
  options: { created?: string, next?: string | null, limit?: number } = {}
): Promise<JinshujuEntriesPage> {
  const params = new URLSearchParams()
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? DEFAULT_LIMIT))
  params.set('limit', String(limit))
  if (options.created) params.set('created_at', options.created)
  if (options.next) params.set('next', options.next)

  const payload = await requestJinshuju(
    config,
    `/forms/${encodeURIComponent(config.formToken)}/entries?${params.toString()}`
  )
  const data = Array.isArray(payload.data) ? payload.data : []
  const next = typeof payload.next === 'string' && payload.next.length > 0 ? payload.next : null
  return {
    total: typeof payload.total === 'number' ? payload.total : data.length,
    count: typeof payload.count === 'number' ? payload.count : data.length,
    next,
    data
  }
}

/** 读表单结构。读取时 fields 是 `[{ field_1: {...} }]` 的包装数组，这里摊平。 */
export function normalizeJinshujuForm(payload: unknown): JinshujuForm {
  const source = (payload ?? {}) as Record<string, unknown>
  const rawFields = Array.isArray(source.fields) ? source.fields : []
  const fields: JinshujuField[] = []

  for (const wrapper of rawFields) {
    if (!wrapper || typeof wrapper !== 'object') continue
    for (const [apiCode, value] of Object.entries(wrapper as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const field = value as Record<string, unknown>
      const rawChoices = Array.isArray(field.choices) ? field.choices : []
      fields.push({
        apiCode,
        label: typeof field.label === 'string' ? field.label : apiCode,
        type: typeof field.type === 'string' ? field.type : 'unknown',
        choices: rawChoices.flatMap((item): JinshujuChoice[] => {
          if (!item || typeof item !== 'object') return []
          const choice = item as Record<string, unknown>
          const name = typeof choice.name === 'string' ? choice.name : ''
          const value = typeof choice.value === 'string' ? choice.value : ''
          if (!name || !value) return []
          return [{ name, value, hidden: choice.hidden === true }]
        })
      })
    }
  }

  return {
    token: typeof source.token === 'string' ? source.token : '',
    name: typeof source.name === 'string' ? source.name : '',
    description: typeof source.description === 'string' ? source.description : '',
    url: typeof source.url === 'string' ? source.url : '',
    fields
  }
}

export async function fetchJinshujuForm(config: JinshujuConfig): Promise<JinshujuForm> {
  const payload = await requestJinshuju(config, `/forms/${encodeURIComponent(config.formToken)}`)
  return normalizeJinshujuForm(payload)
}

/**
 * 增删选项。
 *
 * 写入侧形态与读取侧不同：`fields` 必须是对象且只认 add/remove/update/update_choices。
 * `add` 只传 `{ name }`，显示名会被保留、value 由服务端生成；
 * 同时传 value 会让显示名被 value 覆盖，所以这里不传。
 */
export async function updateJinshujuChoices(
  config: JinshujuConfig,
  update: JinshujuChoiceUpdate
): Promise<JinshujuForm> {
  const add = (update.add ?? []).map(name => name.trim()).filter(Boolean)
  const remove = (update.remove ?? []).map(value => value.trim()).filter(Boolean)
  if (add.length === 0 && remove.length === 0) {
    throw new JinshujuApiError('没有需要变更的选项', 400)
  }

  const entry: Record<string, unknown> = { field_api_code: update.fieldApiCode }
  if (add.length > 0) entry.add = add.map(name => ({ name }))
  if (remove.length > 0) entry.remove = remove

  const payload = await requestJinshuju(
    config,
    `/forms/${encodeURIComponent(config.formToken)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields: { update_choices: [entry] } })
    }
  )

  return normalizeJinshujuForm(payload)
}

/** 金数据的 created_at 参数要北京时间、无时区后缀。 */
export function toJinshujuTimestamp(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
    + ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
}
