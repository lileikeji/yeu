import type { FeedbackTargetType } from '~~/shared/constants/server'

export const feedbackUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const feedbackReasonOptions = [
  { label: '地点名称或位置不对', value: 'place_error' },
  { label: '内容已经过期', value: 'content_outdated' },
  { label: '办事步骤或材料不对', value: 'procedure_error' },
  { label: '还缺少重要信息', value: 'missing_information' },
  { label: '提供更准确的链接', value: 'source_suggestion' },
  { label: '查询或删除我的信息', value: 'privacy_request' },
  { label: '其他问题', value: 'other' }
] as const

export const feedbackPageContextCopy = {
  title: '已带上你刚才浏览的页面',
  description: '提交时会一起附上，方便我们找到问题。'
} as const

export type FeedbackReasonValue = (typeof feedbackReasonOptions)[number]['value']

export interface FeedbackFormCopy {
  metaTitle: string
  metaDescription: string
  kicker: string
  title: string
  description: string
  reasonLabel: string
  messageLabel: string
  messageHint: string
  messagePlaceholder: string
  contactLabel: string
  contactPlaceholder: string
  submitLabel: string
  successTitle: string
  successDescription: string
  sidebarTitle: string
  sidebarItems: [string, string, string]
}

export const feedbackDefaultFormCopy: FeedbackFormCopy = {
  metaTitle: '反馈信息',
  metaDescription: '告诉我们校园地点、办事步骤或指南内容哪里不对，也可以提供更准确的学校通知。',
  kicker: '一起完善指南',
  title: '发现信息不对？告诉我们',
  description: '地点搬了、时间变了、通知过期了，都写这里。',
  reasonLabel: '哪里需要修改',
  messageLabel: '具体情况',
  messageHint: '写清地点和正确情况，至少 5 字',
  messagePlaceholder: '例如：某地点已经搬迁，现场标牌显示……',
  contactLabel: '怎么联系你（选填）',
  contactPlaceholder: '选填，仅用于追问',
  submitLabel: '提交反馈',
  successTitle: '已经收到你的反馈',
  successDescription: '相同问题不用重复提交。',
  sidebarTitle: '写清楚这三点',
  sidebarItems: [
    '你在哪个地点、页面或办事步骤遇到了问题',
    '页面现在写了什么，具体哪里不对',
    '正确情况是什么；有通知链接可以一并附上'
  ]
}

export const feedbackPrivacyRequestFormCopy: FeedbackFormCopy = {
  metaTitle: '查询或删除自己的信息',
  metaDescription: '申请查询或删除本站记录，以及要提供什么线索核对。',
  kicker: '信息查询与删除',
  title: '查询或删除自己的信息',
  description: '说明想查询或删除哪类信息，不要填写密码、证件号码或完整网络地址。',
  reasonLabel: '这次申请',
  messageLabel: '需要处理的信息',
  messageHint: '写明想查询还是删除，以及大致时间，至少 5 字',
  messagePlaceholder: '例如：我想删除 7 月 18 日在公共群发送的一条消息……',
  contactLabel: '方便回复你的方式（建议填写）',
  contactPlaceholder: '例如邮箱，仅用于回复这次申请',
  submitLabel: '提交申请',
  successTitle: '已经收到你的申请',
  successDescription: '核对后按你填的方式回复。',
  sidebarTitle: '请写清这三点',
  sidebarItems: [
    '你想查询还是删除哪些信息',
    '这些信息来自哪个页面、反馈或聊天',
    '大约是哪天使用或提交的'
  ]
}

export function resolveFeedbackFormCopy(reasonType: FeedbackReasonValue): FeedbackFormCopy {
  return reasonType === 'privacy_request'
    ? feedbackPrivacyRequestFormCopy
    : feedbackDefaultFormCopy
}

export const feedbackTargetLabels = {
  place: '地点',
  content: '内容',
  procedure: '办事流程',
  claim: '事实结论'
} as const satisfies Record<Exclude<FeedbackTargetType, 'general'>, string>

export const feedbackTargetIcons = {
  place: 'i-lucide-map-pin',
  content: 'i-lucide-file-text',
  procedure: 'i-lucide-list-checks',
  claim: 'i-lucide-quote'
} as const satisfies Record<Exclude<FeedbackTargetType, 'general'>, string>

export function feedbackRouteQueryString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

export function resolveFeedbackTargetType(
  requestedTargetType: string,
  requestedTargetId: string
): FeedbackTargetType {
  if (
    (
      requestedTargetType === 'place'
      || requestedTargetType === 'content'
      || requestedTargetType === 'procedure'
    )
    && feedbackUuidPattern.test(requestedTargetId)
  ) {
    return requestedTargetType
  }
  return 'general'
}

export function resolveFeedbackTargetId(
  targetType: FeedbackTargetType,
  requestedTargetId: string
): string | null {
  return targetType === 'general' ? null : requestedTargetId
}

export function resolveFeedbackTargetName(
  targetType: FeedbackTargetType,
  requestedTargetName: string
): string {
  return targetType === 'general' ? '' : requestedTargetName.trim().slice(0, 160)
}

export function resolveFeedbackTargetLabel(targetType: FeedbackTargetType): string {
  return targetType === 'general' ? '反馈对象' : feedbackTargetLabels[targetType]
}

/** 回执状态只讲用户关心的三件事：还在处理、已受理、没被采纳。 */
export const feedbackReceiptStatusCopy: Record<
  import('~~/shared/types/server').FeedbackReceiptStatus,
  { label: string, description: string, color: 'info' | 'success' | 'warning' }
> = {
  pending: {
    label: '处理中',
    description: '我们已经收到，正在核对。',
    color: 'info'
  },
  accepted: {
    label: '已处理',
    description: '已改到对应内容。',
    color: 'success'
  },
  rejected: {
    label: '未采纳',
    description: '核对后没有改动。',
    color: 'warning'
  }
}

export function resolveFeedbackTargetIcon(targetType: FeedbackTargetType): string {
  return targetType === 'general'
    ? 'i-lucide-message-square-warning'
    : feedbackTargetIcons[targetType]
}

export function resolveFeedbackTargetDisplayName(
  targetType: FeedbackTargetType,
  targetName: string
): string {
  if (targetName) return targetName
  return `已选择的${resolveFeedbackTargetLabel(targetType)}`
}

export function resolveFeedbackReasonType(value: unknown): FeedbackReasonValue {
  const candidate = feedbackRouteQueryString(value)
  return feedbackReasonOptions.some(option => option.value === candidate)
    ? candidate as FeedbackReasonValue
    : 'other'
}

export function canSubmitFeedback(message: string, submitting: boolean): boolean {
  return message.trim().length >= 5 && !submitting
}

export function feedbackMessageNeedsMoreDetail(message: string): boolean {
  const length = message.trim().length
  return length > 0 && length < 5
}

export interface FeedbackSubmitBody {
  targetType: FeedbackTargetType
  targetId: string | null
  reasonType: string
  message: string
  evidenceUrl: string | null
  pageUrl: string | null
  contact: string | null
  website: string
}

export function buildFeedbackSubmitBody(input: {
  targetType: FeedbackTargetType
  targetId: string | null
  reasonType: string
  message: string
  evidenceUrl: string
  pageUrl: string | null
  contact: string
  website: string
}): FeedbackSubmitBody {
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    reasonType: input.reasonType,
    message: input.message.trim(),
    evidenceUrl: input.evidenceUrl.trim() || null,
    pageUrl: input.pageUrl,
    contact: input.contact.trim() || null,
    website: input.website
  }
}

export function createEmptyFeedbackFormState(reasonType: FeedbackReasonValue = 'other'): {
  reasonType: FeedbackReasonValue
  message: string
  evidenceUrl: string
  contact: string
  website: string
  submitted: boolean
} {
  return {
    reasonType,
    message: '',
    evidenceUrl: '',
    contact: '',
    website: '',
    submitted: false
  }
}
