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
  serviceUnavailable: '暂时没能打开办事信息，请检查网络后再试。',
  emptyMatch: '没有找到相关事项，换个关键词试试。'
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
      label: '等待学校通知',
      color: 'warning',
      icon: 'i-lucide-clock-3'
    }
  }
  return {
    label: '先看已知部分',
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

export function filterProcedureListItems<T extends ProcedureListFilterableItem>(
  items: ReadonlyArray<T>,
  options: { query: string, audience: ProcedureListAudienceFilter | string }
): T[] {
  const keyword = options.query.trim().toLocaleLowerCase('zh-CN')

  return items.filter((item) => {
    const matchesAudience = options.audience === 'all' || item.audience.includes(options.audience)
    const text = [item.title, item.summary, item.statusText].join(' ').toLocaleLowerCase('zh-CN')
    return matchesAudience && (!keyword || text.includes(keyword))
  })
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
