import type {
  AdminColumnDefinition,
  AdminFieldDefinition,
  AdminRecord
} from '~/components/admin/types'

export interface NormalizedAdminResourceList {
  items: AdminRecord[]
  total: number
  stats: Record<string, number>
}

export function isAdminRecord(value: unknown): value is AdminRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeAdminResourceStats(value: unknown): Record<string, number> {
  if (!isAdminRecord(value)) return {}

  return Object.fromEntries(Object.entries(value).flatMap(([key, rawValue]) => {
    const numberValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    return Number.isFinite(numberValue) ? [[key, numberValue]] : []
  }))
}

export function normalizeAdminResourceList(
  response: unknown,
  statsResponseKey?: string
): NormalizedAdminResourceList {
  if (Array.isArray(response)) {
    const items = response.filter(isAdminRecord)
    return { items, total: items.length, stats: {} }
  }

  if (!isAdminRecord(response)) return { items: [], total: 0, stats: {} }

  const nestedData = isAdminRecord(response.data) ? response.data : null
  const rawItems = Array.isArray(response.items)
    ? response.items
    : Array.isArray(response.data)
      ? response.data
      : Array.isArray(nestedData?.items)
        ? nestedData.items
        : []
  const items = rawItems.filter(isAdminRecord)
  const rawTotal = response.total ?? nestedData?.total
  const normalizedTotal = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal)
  const rawStats = statsResponseKey
    ? response[statsResponseKey] ?? nestedData?.[statsResponseKey]
    : undefined

  return {
    items,
    total: Number.isFinite(normalizedTotal) ? normalizedTotal : items.length,
    stats: normalizeAdminResourceStats(rawStats)
  }
}

export function readAdminRecordPath(record: AdminRecord, key: string): unknown {
  let value: unknown = record

  for (const part of key.split('.')) {
    if (!isAdminRecord(value)) return undefined
    value = value[part]
  }

  return value
}

export function readAdminColumnValue(
  record: AdminRecord,
  column: AdminColumnDefinition
): unknown {
  const keys = [column.key, ...(column.fallbackKeys ?? [])]

  for (const key of keys) {
    const value = readAdminRecordPath(record, key)
    if (value !== undefined && value !== null && value !== '') return value
  }

  return undefined
}

export function humanizeAdminResourceValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '—'

  if (isAdminRecord(value)) {
    for (const key of ['name', 'title', 'label']) {
      if (typeof value[key] === 'string') return value[key]
    }
  }

  return '—'
}

export function formatAdminResourceDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return humanizeAdminResourceValue(value)

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function displayAdminResourceCell(
  record: AdminRecord,
  column: AdminColumnDefinition
): string {
  const value = readAdminColumnValue(record, column)
  if (column.kind === 'date') return formatAdminResourceDate(value)
  if (column.kind === 'boolean') return value === true ? '是' : value === false ? '否' : '—'
  if ((typeof value === 'string' || typeof value === 'number')
    && column.valueLabels?.[String(value)]) {
    return column.valueLabels[String(value)]!
  }
  return humanizeAdminResourceValue(value)
}

export function getAdminResourceRecordId(record: AdminRecord | null): string {
  if (!record) return ''
  const value = record.id ?? record._id
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

export function getAdminResourceRowTitle(
  record: AdminRecord | null,
  rowTitleKey: string
): string {
  if (!record) return '此记录'
  return humanizeAdminResourceValue(readAdminRecordPath(record, rowTitleKey))
}

export function getAdminResourceRecordStatus(
  record: AdminRecord,
  statusKey = 'status'
): string {
  const value = readAdminRecordPath(record, statusKey)
  return typeof value === 'string' ? value : ''
}

export function getAdminResourceFieldSpan(field: AdminFieldDefinition): string {
  if (field.span === 'full'
    || field.type === 'textarea'
    || field.type === 'json'
    || field.type === 'checkbox') {
    return 'sm:col-span-2'
  }
  return ''
}

export function getAdminResourceFieldInputType(
  field: AdminFieldDefinition
): 'text' | 'url' | 'email' | 'tel' | 'number' | 'date' | 'datetime-local' {
  if (field.type === 'url'
    || field.type === 'email'
    || field.type === 'tel'
    || field.type === 'number'
    || field.type === 'date'
    || field.type === 'datetime-local') {
    return field.type
  }
  return 'text'
}
