import type { AdminCapability } from '~~/shared/types/server'

export type AdminDashboardGroupKey = 'content' | 'ops' | 'security'

export interface AdminDashboardGroupMeta {
  key: AdminDashboardGroupKey
  label: string
  description: string
}

export interface AdminDashboardModule {
  key: string
  label: string
  icon: string
  endpoint: string
  to: string
  query?: Record<string, string | number>
  color: string
  group: AdminDashboardGroupKey
}

export interface AdminDashboardQuickAction {
  label: string
  icon: string
  to: string
  group?: AdminDashboardGroupKey
}

export interface AdminNavigationItem {
  label: string
  icon: string
  to: string
  capability?: AdminCapability
}

export interface AdminNavigationGroup {
  key: string
  label: string
  items: AdminNavigationItem[]
}

export type AdminDashboardRecord = Record<string, unknown>

export const adminDashboardGroupMeta: AdminDashboardGroupMeta[] = [
  {
    key: 'content',
    label: '内容管理',
    description: '集中管理面向新生的地点、办事流程、指南和信息来源。'
  },
  {
    key: 'ops',
    label: '用户与互动',
    description: '账号、反馈与楼群群聊运营。'
  },
  {
    key: 'security',
    label: '安全与操作记录',
    description: '查看访客轨迹、处理访问封禁，并核对管理员操作记录。'
  }
]

export const adminDashboardModules: AdminDashboardModule[] = [
  {
    key: 'places',
    label: '地点',
    icon: 'i-lucide-map-pin',
    endpoint: '/api/admin/places',
    to: '/admin/places',
    color: 'text-blue-700 bg-blue-50',
    group: 'content'
  },
  {
    key: 'content',
    label: '内容',
    icon: 'i-lucide-files',
    endpoint: '/api/admin/content',
    to: '/admin/content',
    color: 'text-green-700 bg-green-50',
    group: 'content'
  },
  {
    key: 'procedures',
    label: '办事流程',
    icon: 'i-lucide-list-checks',
    endpoint: '/api/admin/procedures',
    to: '/admin/procedures',
    color: 'text-cyan-700 bg-cyan-50',
    group: 'content'
  },
  {
    key: 'sources',
    label: '来源',
    icon: 'i-lucide-book-marked',
    endpoint: '/api/admin/sources',
    to: '/admin/sources',
    color: 'text-violet-700 bg-violet-50',
    group: 'content'
  },
  {
    key: 'knowledge',
    label: '知识库',
    icon: 'i-lucide-brain-circuit',
    endpoint: '/api/admin/knowledge',
    to: '/admin/knowledge',
    color: 'text-teal-700 bg-teal-50',
    group: 'content'
  },
  {
    key: 'feedback',
    label: '待处理反馈',
    icon: 'i-lucide-message-square-warning',
    endpoint: '/api/admin/feedback',
    to: '/admin/feedback',
    query: { status: 'new' },
    color: 'text-orange-700 bg-orange-50',
    group: 'ops'
  },
  {
    key: 'users',
    label: '账号',
    icon: 'i-lucide-users',
    endpoint: '/api/admin/users',
    to: '/admin/users',
    color: 'text-sky-700 bg-sky-50',
    group: 'ops'
  },
  {
    key: 'chat-rooms',
    label: '群聊',
    icon: 'i-lucide-messages-square',
    endpoint: '/api/admin/chat/rooms',
    to: '/admin/chat',
    color: 'text-indigo-700 bg-indigo-50',
    group: 'ops'
  },
  {
    key: 'place-reviews',
    label: '评价审核',
    icon: 'i-lucide-star',
    endpoint: '/api/admin/place-reviews',
    to: '/admin/place-reviews',
    color: 'text-amber-700 bg-amber-50',
    group: 'ops'
  },
  {
    key: 'assistant-runs',
    label: '问答',
    icon: 'i-lucide-bot',
    endpoint: '/api/admin/assistant',
    to: '/admin/assistant',
    color: 'text-emerald-700 bg-emerald-50',
    group: 'ops'
  },
  {
    key: 'visitors',
    label: '访客',
    icon: 'i-lucide-radar',
    endpoint: '/api/admin/visitors',
    to: '/admin/visitors',
    color: 'text-rose-700 bg-rose-50',
    group: 'security'
  },
  {
    key: 'bans',
    label: '封禁',
    icon: 'i-lucide-shield-ban',
    endpoint: '/api/admin/visitors/bans',
    to: '/admin/bans',
    color: 'text-red-700 bg-red-50',
    group: 'security'
  }
]

export const adminDashboardQuickActions: AdminDashboardQuickAction[] = [
  { label: '前台功能', icon: 'i-lucide-layout-grid', to: '/admin/features', group: 'content' },
  { label: '发布公告', icon: 'i-lucide-megaphone', to: '/admin/content?action=create&kind=notice', group: 'content' },
  { label: '新增地点', icon: 'i-lucide-map-pin-plus', to: '/admin/places?action=create', group: 'content' },
  { label: '新增内容', icon: 'i-lucide-file-plus-2', to: '/admin/content?action=create', group: 'content' },
  { label: '新增流程', icon: 'i-lucide-list-plus', to: '/admin/procedures?action=create', group: 'content' },
  { label: '登记来源', icon: 'i-lucide-book-plus', to: '/admin/sources?action=create', group: 'content' },
  { label: '新增知识', icon: 'i-lucide-file-plus-2', to: '/admin/knowledge?action=create', group: 'content' },
  { label: '现场采点', icon: 'i-lucide-crosshair', to: '/admin/field-observations', group: 'content' },
  { label: '处理反馈', icon: 'i-lucide-message-square-reply', to: '/admin/feedback', group: 'ops' },
  { label: '评价审核', icon: 'i-lucide-star', to: '/admin/place-reviews', group: 'ops' },
  { label: '创建账号', icon: 'i-lucide-user-plus', to: '/admin/users', group: 'ops' },
  { label: '群聊管理', icon: 'i-lucide-messages-square', to: '/admin/chat', group: 'ops' },
  { label: '问答统计', icon: 'i-lucide-bot', to: '/admin/assistant', group: 'ops' },
  { label: '访客轨迹', icon: 'i-lucide-radar', to: '/admin/visitors', group: 'security' },
  { label: '小程序分析', icon: 'i-lucide-smartphone', to: '/admin/miniapp', group: 'security' },
  { label: '封禁管理', icon: 'i-lucide-shield-ban', to: '/admin/bans', group: 'security' },
  { label: '操作记录', icon: 'i-lucide-history', to: '/admin/audit', group: 'security' }
]

export const adminNavigationGroups: AdminNavigationGroup[] = [
  {
    key: 'overview',
    label: '工作台',
    items: [
      { label: '概览', icon: 'i-lucide-layout-dashboard', to: '/admin' }
    ]
  },
  {
    key: 'graph',
    label: '关联',
    items: [
      { label: '关联视图', icon: 'i-lucide-git-fork', to: '/admin/knowledge/graph' }
    ]
  },
  {
    key: 'content',
    label: '内容管理',
    items: [
      { label: '前台功能', icon: 'i-lucide-layout-grid', to: '/admin/features' },
      { label: '地点', icon: 'i-lucide-map-pin', to: '/admin/places' },
      { label: '现场采点', icon: 'i-lucide-crosshair', to: '/admin/field-observations' },
      { label: '办事流程', icon: 'i-lucide-list-checks', to: '/admin/procedures' },
      { label: '内容', icon: 'i-lucide-files', to: '/admin/content' },
      { label: '来源', icon: 'i-lucide-book-marked', to: '/admin/sources' },
      { label: '知识库', icon: 'i-lucide-brain-circuit', to: '/admin/knowledge' },
      { label: '纳新管理', icon: 'i-lucide-clipboard-list', to: '/admin/recruit' },
      { label: '歌手大赛', icon: 'i-lucide-mic-vocal', to: '/admin/competition' }
    ]
  },
  {
    key: 'ops',
    label: '用户与互动',
    items: [
      { label: '反馈', icon: 'i-lucide-message-square-warning', to: '/admin/feedback' },
      { label: '评价审核', icon: 'i-lucide-star', to: '/admin/place-reviews' },
      { label: '留言治理', icon: 'i-lucide-shield-check', to: '/admin/moments' },
      { label: '账号', icon: 'i-lucide-users', to: '/admin/users' },
      { label: '组织管理员', icon: 'i-lucide-shield-user', to: '/admin/organization-accounts' },
      { label: '群聊', icon: 'i-lucide-messages-square', to: '/admin/chat' },
      { label: '问答', icon: 'i-lucide-bot', to: '/admin/assistant' }
    ]
  },
  {
    key: 'security',
    label: '安全与操作记录',
    items: [
      { label: '小程序分析', icon: 'i-lucide-smartphone', to: '/admin/miniapp', capability: 'analytics.view' },
      { label: '访客', icon: 'i-lucide-radar', to: '/admin/visitors', capability: 'visitor.list' },
      { label: '封禁', icon: 'i-lucide-shield-ban', to: '/admin/bans', capability: 'ban.manage' },
      { label: '操作记录', icon: 'i-lucide-scroll-text', to: '/admin/audit', capability: 'audit.view' }
    ]
  }
]

export const adminNavigationItems: AdminNavigationItem[] = adminNavigationGroups.flatMap(group => group.items)

export function adminDashboardModulesByGroup(group: AdminDashboardGroupKey): AdminDashboardModule[] {
  return adminDashboardModules.filter(module => module.group === group)
}

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
