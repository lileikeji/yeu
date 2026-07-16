import { procedureMethodLabels } from './procedure-detail-presentation'

export const procedureListAudienceOptions = [
  { value: 'all', label: '全部新生' },
  { value: 'undergraduate', label: '普通本科' },
  { value: 'transfer', label: '专升本' }
] as const

export type ProcedureListAudienceFilter = (typeof procedureListAudienceOptions)[number]['value']

export type ProcedureMethodKey = keyof typeof procedureMethodLabels

export const procedureListMessages = {
  serviceUnavailable: '办事流程暂时不可用，请稍后重试。',
  emptyMatch: '当前没有匹配的已发布流程'
} as const

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
