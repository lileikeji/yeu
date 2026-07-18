export type AdminLabelOption = {
  label: string
  value: string
}

export const adminBanScopeLabels: Record<string, string> = {
  ip: 'IP',
  visitor: '访客',
  user: '账号'
}

export const adminUserStatusLabels: Record<string, string> = {
  active: '正常',
  disabled: '停用',
  banned: '封禁'
}

export const adminAuditActionLabels: Record<string, string> = {
  'visitor.ban': '访客封禁',
  'visitor.ban_deactivate': '解除封禁',
  'visitor.ban.create': '创建封禁',
  'visitor.ban.deactivate': '解除封禁',
  'chat.mute': '个人禁言',
  'chat.unmute': '解除禁言',
  'chat.mute_all': '全员禁言',
  'chat.unmute_all': '取消全员禁言',
  'chat.message.soft_delete': '删除聊天消息',
  'chat.message.delete': '删除聊天消息',
  soft_delete: '软删除',
  'user.create': '创建账号',
  'user.update': '更新账号',
  'user.status': '调整账号状态',
  'admin.login': '管理员登录',
  'auth.login': '管理员登录',
  'admin.login_failed': '管理员登录失败',
  'auth.login_failed': '管理员登录失败',
  user_login: '用户登录',
  'admin.logout': '管理员登出',
  'auth.logout': '管理员登出',
  'place.create': '新增地点',
  'place.update': '编辑地点',
  'place.archive': '下架地点',
  'place.publish': '发布地点',
  'place.delete': '删除地点',
  'content.create': '新增内容',
  'content.update': '编辑内容',
  'content.archive': '下架内容',
  'content.publish': '发布内容',
  'content.delete': '删除内容',
  'procedure.create': '新增办事流程',
  'procedure.update': '编辑办事流程',
  'procedure.archive': '下架办事流程',
  'procedure.publish': '发布办事流程',
  'procedure.delete': '删除办事流程',
  'source.create': '登记来源',
  'source.update': '编辑来源',
  'source.archive': '停用来源',
  'source.delete': '删除来源',
  'feedback.update': '处理反馈',
  'feedback.delete': '删除反馈',
  publish: '发布',
  unpublish: '取消发布',
  create: '创建',
  update: '更新',
  delete: '删除'
}

export const adminAuditEntityLabels: Record<string, string> = {
  visitor_ban: '访客封禁',
  chat_message: '聊天消息',
  chat_mute: '聊天禁言',
  chat_room: '聊天房间',
  user: '账号',
  place: '地点',
  content: '内容',
  procedure: '办事流程',
  source: '来源',
  feedback: '反馈',
  visitor: '访客',
  admin: '管理员'
}

export const adminAuditEntityTypeOptions: AdminLabelOption[] = [
  { label: '全部记录类型', value: 'all' },
  { label: '访客封禁', value: 'visitor_ban' },
  { label: '聊天消息', value: 'chat_message' },
  { label: '聊天禁言', value: 'chat_mute' },
  { label: '聊天房间', value: 'chat_room' },
  { label: '账号', value: 'user' },
  { label: '地点', value: 'place' },
  { label: '内容', value: 'content' },
  { label: '办事流程', value: 'procedure' },
  { label: '来源', value: 'source' },
  { label: '反馈', value: 'feedback' },
  { label: '访客', value: 'visitor' }
]

export const adminAuditPresets: Array<{
  key: string
  label: string
  action?: string
  entityType?: string
}> = [
  { key: 'all', label: '全部' },
  { key: 'bans', label: '封禁相关', entityType: 'visitor_ban' },
  { key: 'chat', label: '群聊相关', entityType: 'chat_message' },
  { key: 'mute', label: '禁言相关', entityType: 'chat_mute' },
  { key: 'users', label: '账号相关', entityType: 'user' },
  { key: 'login', label: '登录相关', action: 'auth.login' }
]

export const adminAuditActionOptions: AdminLabelOption[] = [
  { label: '全部操作', value: 'all' },
  { label: '管理员登录', value: 'auth.login' },
  { label: '管理员登录失败', value: 'auth.login_failed' },
  { label: '创建封禁', value: 'visitor.ban.create' },
  { label: '解除封禁', value: 'visitor.ban.deactivate' },
  { label: '个人禁言', value: 'chat.mute' },
  { label: '解除禁言', value: 'chat.unmute' },
  { label: '全员禁言', value: 'chat.mute_all' },
  { label: '取消全员禁言', value: 'chat.unmute_all' },
  { label: '删除聊天消息', value: 'chat.message.soft_delete' },
  { label: '创建账号', value: 'user.create' },
  { label: '更新账号', value: 'user.update' },
  { label: '调整账号状态', value: 'user.status' },
  { label: '发布内容', value: 'publish' },
  { label: '取消发布', value: 'unpublish' }
]

export const adminHttpMethodLabels: Record<string, string> = {
  GET: '读取数据',
  POST: '提交数据',
  PUT: '更新数据',
  PATCH: '更新数据',
  DELETE: '删除数据'
}

export const adminVisitorActionLabels: Record<string, string> = {
  page_view: '浏览页面',
  route_view: '浏览页面',
  search: '搜索',
  map_open: '打开地图',
  map_route: '规划路线',
  place_view: '查看地点',
  chat_open: '打开群聊',
  chat_send: '发送消息',
  login: '登录',
  logout: '退出',
  profile_update: '更新资料',
  procedure_view: '查看办事',
  feedback_submit: '提交反馈',
  api_request: '数据加载',
  click: '点击',
  scroll: '滚动',
  share: '分享',
  download: '下载',
  error: '页面异常',
  unknown: '未知动作'
}

export const adminSecurityWindowLabels = {
  h1: '近 1 小时',
  h24: '近 24 小时',
  d7: '近 7 天'
} as const

export const adminRiskLevelLabels: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
  info: '提示'
}

export const adminRiskLevelTone: Record<string, string> = {
  high: 'error',
  medium: 'warning',
  low: 'primary',
  info: 'neutral'
}

export const adminRiskFactorLabels: Record<string, string> = {
  HIT_BAN: '命中封禁',
  USER_BANNED: '账号封禁',
  USER_DISABLED: '账号停用',
  ACTIVE_MUTES: '生效禁言',
  DELETED_MESSAGES: '删帖偏多',
  MULTI_IP: '使用多个网络地址',
  MULTI_IP_FOOTPRINT: '网络地址变化较多',
  MULTI_VISITOR_LINK: '关联多个访客设备',
  SAME_IP_CLUSTER: '同一网络有多个访客',
  UA_SWITCH: '设备或浏览器变化频繁',
  BURST_1H: '1 小时内访问激增',
  HIGH_VOLUME_24H: '今天访问量较高',
  IP_BANNED: 'IP 已封禁',
  MULTI_VISITOR_IP: '同一网络有多个访客',
  MULTI_ACCOUNT_IP: '同一网络有多个账号',
  UA_DIVERSITY: '设备或浏览器种类较多'
}

export const adminOpsTimelineKindLabels: Record<string, string> = {
  ban: '封禁',
  mute: '禁言',
  audit: '操作记录',
  login: '登录'
}

export const adminSuggestedActionLabels: Record<string, string> = {
  ban_visitor: '封禁访客',
  ban_ip: '封禁 IP',
  ban_user: '限制账号',
  open_chat: '打开群聊',
  open_visitors: '打开访客',
  open_audit: '打开操作记录',
  open_ip: '打开网络地址记录',
  open_user: '打开账号',
  review_visitors: '复核访客'
}

export function adminLabel(map: Record<string, string>, value: string | null | undefined, fallback?: string): string {
  if (!value) return fallback || '—'
  return map[value] || value
}

export function formatAdminRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '未知'
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return iso
  const diff = Date.now() - ts
  if (diff < 0) return formatAdminDateTime(iso)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return formatAdminDateTime(iso)
}

export function shortAdminId(id: string | null | undefined, keep = 8): string {
  if (!id) return '—'
  return id.length <= keep + 2 ? id : `${id.slice(0, keep)}…`
}

const adminPageLabels: Array<[prefix: string, label: string]> = [
  ['/admin/field-observations', '现场采点'],
  ['/admin/procedures', '办事流程管理'],
  ['/admin/visitors', '访客轨迹'],
  ['/admin/sources', '来源管理'],
  ['/admin/content', '内容管理'],
  ['/admin/places', '地点管理'],
  ['/admin/feedback', '反馈管理'],
  ['/admin/users', '账号管理'],
  ['/admin/chat', '群聊管理'],
  ['/admin/bans', '封禁管理'],
  ['/admin/audit', '操作记录'],
  ['/admin/login', '后台登录'],
  ['/procedures', '办事指南'],
  ['/departments', '学校部门'],
  ['/guides', '新生指南'],
  ['/content', '指南内容'],
  ['/clubs', '校园社团'],
  ['/nearby', '校园周边'],
  ['/campus', '校园平面图'],
  ['/profile', '个人中心'],
  ['/chat', '群聊房间'],
  ['/login', '用户登录'],
  ['/map', '校园地图']
]

export function adminPathLabel(value: string | null | undefined): string {
  if (!value) return '未知页面'
  let path = value.trim()
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname
  } catch {
    return '其他页面'
  }
  path = path.split(/[?#]/, 1)[0] || '/'
  if (path === '/') return '首页'
  if (path === '/admin') return '后台概览'
  if (/^\/(?:mech-smoke|gate-|e2e-|smoke)/.test(path)) return '系统检查页面'
  const match = adminPageLabels.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  return match?.[1] || '其他页面'
}

export function adminPathTransitionLabel(from: string | null | undefined, to: string | null | undefined): string {
  return `${adminPathLabel(from)} → ${adminPathLabel(to)}`
}

export function adminRiskScoreText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '风险分数未知'
  const score = Number(value)
  if (!Number.isFinite(score)) return '风险分数未知'
  return `风险分数 ${Math.min(100, Math.max(0, Math.round(score)))}/100`
}

export function formatAdminDateTime(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: false
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function formatAdminDay(iso: string | null | undefined): string {
  if (!iso) return '未知日期'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export function prettyAdminDetails(details: Record<string, unknown> | null | undefined): Array<{ key: string; value: string }> {
  if (!details || typeof details !== 'object') return []
  return Object.entries(details).map(([key, value]) => {
    let text = ''
    if (value == null) text = '—'
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') text = String(value)
    else {
      try {
        text = JSON.stringify(value, null, 2)
      } catch {
        text = String(value)
      }
    }
    return { key, value: text }
  })
}

export function banStatusMeta(ban: { isActive: boolean; expiresAt: string | null }): {
  label: string
  tone: 'active' | 'expired' | 'inactive'
} {
  if (!ban.isActive) return { label: '已解除', tone: 'inactive' }
  if (ban.expiresAt && Date.parse(ban.expiresAt) <= Date.now()) {
    return { label: '已过期', tone: 'expired' }
  }
  return { label: '生效中', tone: 'active' }
}



export const adminResponseQueueKindLabels: Record<string, string> = {
  ip_cluster: '同一网络来源',
  risk_hint: '风险提示',
  ban_hygiene: '封禁状态检查',
  burst: '访问量激增'
}

export const adminConfidenceLabels: Record<string, string> = {
  high: '把握较高',
  medium: '把握一般',
  low: '线索较少'
}

export const adminBanCoverageLabels = {
  coverageRate: '高频网络地址封禁比例',
  bannedTopIps: '已封禁高频 IP',
  topIpCount: '高频网络地址记录数'
} as const

export const adminAnomalyStatusLabels: Record<string, string> = {
  critical: '显著异常',
  elevated: '偏离基线',
  normal: '基线正常'
}

export const adminEvidenceStrengthLabels: Record<string, string> = {
  strong: '重要依据',
  moderate: '参考依据',
  weak: '辅助线索'
}

export const adminPlaybookStatusLabels: Record<string, string> = {
  completed: '已完成',
  recommended: '建议执行',
  optional: '按需执行'
}

export const adminInvestigationStepLabels: Record<string, string> = {
  VERIFY_EVIDENCE: '确认判断依据',
  REVIEW_CLUSTER: '核对关联来源',
  CONTAIN_RISK: '限制风险',
  AUDIT_AND_CLOSE: '记录处理结果'
}

/** Deep-link from audit entity to related admin page. */
export function adminEntityHref(
  entityType: string | null | undefined,
  entityId?: string | null
): string | null {
  const type = (entityType || '').trim()
  const id = (entityId || '').trim()
  if (type === 'visitor_ban') {
    return id ? `/admin/bans?banId=${encodeURIComponent(id)}` : '/admin/bans'
  }
  if (type === 'visitor') {
    return id ? `/admin/visitors?visitorId=${encodeURIComponent(id)}` : '/admin/visitors'
  }
  if (type === 'user') {
    return id ? `/admin/users?userId=${encodeURIComponent(id)}` : '/admin/users'
  }
  if (type === 'chat_message' || type === 'chat_mute' || type === 'chat_room') {
    if (type === 'chat_room' && id) return `/admin/chat?roomId=${encodeURIComponent(id)}`
    if (type === 'chat_mute' && id) return `/admin/chat?muteId=${encodeURIComponent(id)}`
    return '/admin/chat'
  }
  if (type === 'place') return id ? `/admin/places?id=${encodeURIComponent(id)}` : '/admin/places'
  if (type === 'content') return id ? `/admin/content?id=${encodeURIComponent(id)}` : '/admin/content'
  if (type === 'procedure') return id ? `/admin/procedures?id=${encodeURIComponent(id)}` : '/admin/procedures'
  if (type === 'feedback') return id ? `/admin/feedback?id=${encodeURIComponent(id)}` : '/admin/feedback'
  return null
}

export function adminAuditHref(entityType?: string | null, entityId?: string | null): string {
  const params = new URLSearchParams()
  if (entityType) params.set('entityType', entityType)
  if (entityId) params.set('entityId', entityId)
  const qs = params.toString()
  return qs ? `/admin/audit?${qs}` : '/admin/audit'
}

export function groupByAdminDay<T extends { createdAt: string }>(
  items: T[]
): Array<{ day: string; items: T[] }> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const day = formatAdminDay(item.createdAt)
    const list = map.get(day) || []
    list.push(item)
    map.set(day, list)
  }
  return [...map.entries()].map(([day, dayItems]) => ({ day, items: dayItems }))
}

export function confirmAdminAction(message: string): boolean {
  if (typeof window === 'undefined') return true
  return window.confirm(message)
}
