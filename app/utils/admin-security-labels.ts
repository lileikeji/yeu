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
  visitor: '访客'
}

export const adminAuditEntityTypeOptions: AdminLabelOption[] = [
  { label: '全部对象', value: '' },
  { label: '访客封禁', value: 'visitor_ban' },
  { label: '聊天消息', value: 'chat_message' },
  { label: '聊天禁言', value: 'chat_mute' },
  { label: '聊天房间', value: 'chat_room' },
  { label: '账号', value: 'user' },
  { label: '地点', value: 'place' },
  { label: '内容', value: 'content' },
  { label: '办事流程', value: 'procedure' },
  { label: '来源', value: 'source' },
  { label: '反馈', value: 'feedback' }
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
  { key: 'users', label: '账号相关', entityType: 'user' }
]

export function adminLabel(map: Record<string, string>, value: string | null | undefined, fallback?: string): string {
  if (!value) return fallback || '—'
  return map[value] || value
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
