export interface AdminDashboardModule {
  key: string
  label: string
  icon: string
  endpoint: string
  to: string
  query?: Record<string, string | number>
  color: string
}

export interface AdminDashboardQuickAction {
  label: string
  icon: string
  to: string
}

export type AdminDashboardRecord = Record<string, unknown>

export const adminDashboardModules: AdminDashboardModule[] = [
  {
    key: 'places',
    label: '地点',
    icon: 'i-lucide-map-pin',
    endpoint: '/api/admin/places',
    to: '/admin/places',
    color: 'text-blue-700 bg-blue-50'
  },
  {
    key: 'content',
    label: '内容',
    icon: 'i-lucide-files',
    endpoint: '/api/admin/content',
    to: '/admin/content',
    color: 'text-green-700 bg-green-50'
  },
  {
    key: 'procedures',
    label: '办事流程',
    icon: 'i-lucide-list-checks',
    endpoint: '/api/admin/procedures',
    to: '/admin/procedures',
    color: 'text-cyan-700 bg-cyan-50'
  },
  {
    key: 'sources',
    label: '来源',
    icon: 'i-lucide-book-marked',
    endpoint: '/api/admin/sources',
    to: '/admin/sources',
    color: 'text-violet-700 bg-violet-50'
  },
  {
    key: 'feedback',
    label: '待处理反馈',
    icon: 'i-lucide-message-square-warning',
    endpoint: '/api/admin/feedback',
    to: '/admin/feedback',
    query: { status: 'new' },
    color: 'text-orange-700 bg-orange-50'
  }
]

export const adminDashboardQuickActions: AdminDashboardQuickAction[] = [
  { label: '新增地点', icon: 'i-lucide-map-pin-plus', to: '/admin/places?action=create' },
  { label: '新增内容', icon: 'i-lucide-file-plus-2', to: '/admin/content?action=create' },
  { label: '新增流程', icon: 'i-lucide-list-plus', to: '/admin/procedures?action=create' },
  { label: '登记来源', icon: 'i-lucide-book-plus', to: '/admin/sources?action=create' },
  { label: '现场采点', icon: 'i-lucide-crosshair', to: '/admin/field-observations' },
  { label: '处理反馈', icon: 'i-lucide-message-square-reply', to: '/admin/feedback' },
  { label: '审计日志', icon: 'i-lucide-history', to: '/admin/audit-logs' }
]

export function isAdminDashboardRecord(value: unknown): value is AdminDashboardRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeAdminDashboardResponse(response: unknown): {
  items: AdminDashboardRecord[]
  total: number
} {
  if (Array.isArray(response)) {
    const items = response.filter(isAdminDashboardRecord)
    return { items, total: items.length }
  }

  if (!isAdminDashboardRecord(response)) return { items: [], total: 0 }
  const nestedData = isAdminDashboardRecord(response.data) ? response.data : null
  const sourceItems = Array.isArray(response.items)
    ? response.items
    : Array.isArray(response.data)
      ? response.data
      : Array.isArray(nestedData?.items)
        ? nestedData.items
        : []
  const items = sourceItems.filter(isAdminDashboardRecord)
  const rawTotal = response.total ?? nestedData?.total
  const total = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal)
  return { items, total: Number.isFinite(total) ? total : items.length }
}

export function adminDashboardStatusCode(error: unknown): number | null {
  if (!isAdminDashboardRecord(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  if (isAdminDashboardRecord(error.response) && typeof error.response.status === 'number') {
    return error.response.status
  }
  return null
}

export function adminDashboardRecordValue(record: AdminDashboardRecord, ...keys: string[]): string {
  for (const key of keys) {
    const item = record[key]
    if (typeof item === 'string' || typeof item === 'number') return String(item)
  }
  return '—'
}

export function formatAdminDashboardDate(record: AdminDashboardRecord): string {
  const raw = record.createdAt ?? record.created_at ?? record.updatedAt ?? record.updated_at
  if (typeof raw !== 'string' && typeof raw !== 'number') return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
