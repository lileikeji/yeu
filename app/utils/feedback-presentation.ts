import type { FeedbackTargetType } from '~~/shared/constants/server'

export const feedbackUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const feedbackReasonOptions = [
  { label: '地点名称或位置错误', value: 'place_error' },
  { label: '内容已经过期', value: 'content_outdated' },
  { label: '流程步骤或材料有误', value: 'procedure_error' },
  { label: '缺少重要信息', value: 'missing_information' },
  { label: '补充可靠来源', value: 'source_suggestion' },
  { label: '其他问题', value: 'other' }
] as const

export type FeedbackReasonValue = (typeof feedbackReasonOptions)[number]['value']

export const feedbackTargetLabels = {
  place: '地点',
  content: '内容',
  procedure: '办事流程'
} as const satisfies Record<Exclude<FeedbackTargetType, 'general'>, string>

export const feedbackTargetIcons = {
  place: 'i-lucide-map-pin',
  content: 'i-lucide-file-text',
  procedure: 'i-lucide-list-checks'
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
    : 'place_error'
}

export function canSubmitFeedback(message: string, submitting: boolean): boolean {
  return message.trim().length >= 5 && !submitting
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

export function createEmptyFeedbackFormState(): {
  reasonType: FeedbackReasonValue
  message: string
  evidenceUrl: string
  contact: string
  website: string
  submitted: boolean
} {
  return {
    reasonType: 'place_error',
    message: '',
    evidenceUrl: '',
    contact: '',
    website: '',
    submitted: false
  }
}
