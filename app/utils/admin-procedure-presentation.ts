import type {
  ApiContent,
  ApiPlace,
  ApiProcedure,
  ApiSource
} from '~~/shared/types/server'
import type {
  ProcedureAudience,
  ProcedureInformationState,
  ProcedureMethod
} from '~~/shared/constants/server'
import type {
  ProcedureAudienceOption,
  ProcedureInformationStateOption,
  ProcedureMethodOption,
  ProcedureSelectOption
} from '../components/admin/procedure-editor-types'

type PublicationStatus = ApiProcedure['status']

export const adminProcedureAudienceOptions: ProcedureAudienceOption[] = [
  { label: '普通本科', value: 'undergraduate' },
  { label: '专升本', value: 'transfer' }
]

export const adminProcedureMethodOptions: ProcedureMethodOption[] = [
  { label: '线上办理', value: 'online' },
  { label: '到校办理', value: 'offline' },
  { label: '线上 + 到校', value: 'mixed' }
]

export const adminProcedureInformationStateOptions: ProcedureInformationStateOption[] = [
  { label: '已确认', value: 'confirmed' },
  { label: '部分确认', value: 'partial' },
  { label: '等待通知', value: 'awaiting-notice' }
]

export const adminProcedureStatusOptions: ProcedureSelectOption[] = [
  { label: '全部状态', value: 'all' },
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'archived' }
]

export const adminProcedureRequiredOptions: ProcedureSelectOption[] = [
  { label: '尚未确认', value: 'unknown' },
  { label: '必须携带', value: 'required' },
  { label: '按需携带', value: 'optional' }
]

export function getProcedurePublicationLabel(status: PublicationStatus): string {
  return {
    draft: '草稿',
    published: '已发布',
    archived: '已下架'
  }[status]
}

export function getProcedureSourceStatusLabel(status: ApiSource['status']): string {
  return {
    active: '有效',
    unavailable: '不可用',
    disputed: '存在争议'
  }[status]
}

export function getProcedureMethodLabel(method: ProcedureMethod): string {
  return adminProcedureMethodOptions.find(item => item.value === method)?.label ?? method
}

export function getProcedureInformationStateLabel(state: ProcedureInformationState): string {
  return adminProcedureInformationStateOptions.find(item => item.value === state)?.label ?? state
}

export function getProcedureInformationStateColor(
  state: ProcedureInformationState
): 'success' | 'warning' | 'neutral' {
  if (state === 'confirmed') return 'success'
  if (state === 'partial') return 'warning'
  return 'neutral'
}

export function getProcedureAudienceLabel(audience: ProcedureAudience[]): string {
  const uniqueAudience = new Set(audience)
  const hasUndergraduate = uniqueAudience.has('undergraduate')
  const hasTransfer = uniqueAudience.has('transfer')
  if (hasUndergraduate && hasTransfer) return '本科、专升本'
  if (hasUndergraduate) return '普通本科'
  if (hasTransfer) return '专升本'
  return '未设置'
}

export function formatAdminProcedureDate(value: string | null): string {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日期无效'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function buildContentOptions(
  items: ApiContent[],
  emptyLabel: string
): ProcedureSelectOption[] {
  return [
    { label: emptyLabel, value: '' },
    ...items.map(item => ({
      label: item.title,
      value: item.id,
      description: getProcedurePublicationLabel(item.status)
    }))
  ]
}

export function buildProcedureDepartmentOptions(items: ApiContent[]): ProcedureSelectOption[] {
  return buildContentOptions(items, '不关联负责部门')
}

export function buildProcedureGuideOptions(items: ApiContent[]): ProcedureSelectOption[] {
  return buildContentOptions(items, '不关联指南')
}

export function buildProcedurePlaceOptions(
  items: ApiPlace[],
  includeEmpty = false
): ProcedureSelectOption[] {
  const options = items.map(item => ({
    label: item.name,
    value: item.id,
    description: [item.address, getProcedurePublicationLabel(item.status)]
      .filter(Boolean)
      .join(' · ')
  }))
  return includeEmpty ? [{ label: '不关联地点', value: '' }, ...options] : options
}

export function buildProcedureSourceOptions(items: ApiSource[]): ProcedureSelectOption[] {
  return items.map(item => ({
    label: item.title,
    value: item.id,
    description: `${item.sourceLevel} 级 · ${getProcedureSourceStatusLabel(item.status)}`
  }))
}
