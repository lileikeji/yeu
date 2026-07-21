import {
  procedureMethodLabels,
  studentFacingProcedureText
} from './procedure-detail-presentation'

export const procedureListAudienceOptions = [
  { value: 'all', label: '全部新生' },
  { value: 'undergraduate', label: '普通本科' },
  { value: 'transfer', label: '专升本' }
] as const

export type ProcedureListAudienceFilter = (typeof procedureListAudienceOptions)[number]['value']

export type ProcedureMethodKey = keyof typeof procedureMethodLabels

export const procedureListMessages = {
  serviceUnavailable: '可以稍后再试，也可以先查看入学指南。',
  emptyMatch: '没有找到符合当前条件的事项',
  emptyList: '目前还没有可以查看的办事事项'
} as const

export type ProcedureListStatePresentation = {
  label: string
  color: 'success' | 'warning' | 'neutral'
  icon: string
}

export function procedureListStatePresentation(informationState: string): ProcedureListStatePresentation {
  if (informationState === 'confirmed') {
    return {
      label: '可以照着办理',
      color: 'success',
      icon: 'i-lucide-circle-check-big'
    }
  }
  if (informationState === 'awaiting-notice') {
    return {
      label: '等学校通知',
      color: 'warning',
      icon: 'i-lucide-clock-3'
    }
  }
  return {
    label: '先看能准备的',
    color: 'neutral',
    icon: 'i-lucide-info'
  }
}

export function procedureListStatusText(value: string): string {
  return studentFacingProcedureText(value)
}

export interface ProcedureListFilterableItem {
  title: string
  summary: string
  statusText: string
  audience: readonly string[]
}

const procedureJourneyTerms = [
  '报到',
  '校园网',
  '图书馆',
  '宿舍'
] as const

function procedureAudiencePriority(
  item: ProcedureListFilterableItem,
  audience: ProcedureListAudienceFilter | string
): number {
  const itemAudience = new Set(item.audience)
  const appliesToAllFreshmen = itemAudience.has('undergraduate') && itemAudience.has('transfer')

  if (audience === 'all') return appliesToAllFreshmen ? 0 : 1
  if (itemAudience.size === 1 && itemAudience.has(audience)) return 0
  return appliesToAllFreshmen ? 1 : 2
}

function procedureJourneyPriority(title: string): number {
  const normalizedTitle = title.trim().toLocaleLowerCase('zh-CN')
  const index = procedureJourneyTerms.findIndex(term => normalizedTitle.includes(term))
  return index === -1 ? procedureJourneyTerms.length : index
}

export function filterProcedureListItems<T extends ProcedureListFilterableItem>(
  items: ReadonlyArray<T>,
  options: { query: string, audience: ProcedureListAudienceFilter | string }
): T[] {
  const keyword = options.query.trim().toLocaleLowerCase('zh-CN')

  const filtered = items.filter((item) => {
    const matchesAudience = options.audience === 'all' || item.audience.includes(options.audience)
    const text = [item.title, item.summary, item.statusText].join(' ').toLocaleLowerCase('zh-CN')
    return matchesAudience && (!keyword || text.includes(keyword))
  })

  if (keyword) return filtered

  return filtered
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      return procedureAudiencePriority(left.item, options.audience)
        - procedureAudiencePriority(right.item, options.audience)
        || procedureJourneyPriority(left.item.title)
        - procedureJourneyPriority(right.item.title)
        || left.index - right.index
    })
    .map(({ item }) => item)
}

export function procedureMethodLabel(method: string): string {
  if (method in procedureMethodLabels) {
    return procedureMethodLabels[method as ProcedureMethodKey]
  }
  return method
}

export function procedureListDetailQuery(audience: ProcedureListAudienceFilter | string): Record<string, string> | undefined {
  return audience === 'all' ? undefined : { audience: String(audience) }
}
