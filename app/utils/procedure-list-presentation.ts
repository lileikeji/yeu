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

export interface ProcedureListQuickEntry {
  label: string
  to: string
  icon: string
}

export const procedureListQuickEntries: ProcedureListQuickEntry[] = [
  { label: '新生报到', to: '/procedures/arrival', icon: 'i-lucide-clipboard-check' },
  { label: '学费与资助', to: '/guides/fees-aid', icon: 'i-lucide-wallet-cards' },
  { label: '校园网', to: '/procedures/campus-network', icon: 'i-lucide-wifi' },
  { label: '宿舍报修', to: '/procedures/dorm-repair', icon: 'i-lucide-wrench' },
  { label: '图书馆', to: '/procedures/library-card-wechat', icon: 'i-lucide-library' },
  { label: '专升本档案', to: '/procedures/transfer-archive-mailing', icon: 'i-lucide-folder-input' }
]

export const procedureListMessages = {
  serviceUnavailable: '可以稍后再试，也可以先查看入学指南。',
  emptyMatch: '没有找到你要办的事',
  emptyList: '这里暂时没有可查看的办事流程'
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

export function procedureListCardActionLabel(informationState: string): string {
  if (informationState === 'confirmed') return '开始办理'
  if (informationState === 'awaiting-notice') return '看看要等什么'
  return '先看能准备什么'
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

export interface ProcedureListCardProgressInput {
  slug: string
  steps: ReadonlyArray<{ id: string }>
  materials: ReadonlyArray<{ id: string }>
}

export interface ProcedureListCardProgress {
  stepTotal: number
  stepDone: number
  materialTotal: number
  materialDone: number
  stepLabel: string
  materialLabel: string
  progressHint: string | null
}

export function resolveProcedureListCardCounts(
  item: ProcedureListCardProgressInput
): Pick<ProcedureListCardProgress, 'stepTotal' | 'materialTotal' | 'stepLabel' | 'materialLabel'> {
  const stepTotal = item.steps.length
  const materialTotal = item.materials.length
  return {
    stepTotal,
    materialTotal,
    stepLabel: stepTotal > 0 ? `${stepTotal} 个步骤` : '步骤待补充',
    materialLabel: materialTotal > 0 ? `${materialTotal} 项材料` : '材料暂未公布'
  }
}

export function resolveProcedureListCardProgress(
  item: ProcedureListCardProgressInput,
  checklist: { stepIds?: readonly string[], materialIds?: readonly string[] } | null | undefined
): ProcedureListCardProgress {
  const counts = resolveProcedureListCardCounts(item)
  const validStepIds = new Set(item.steps.map(step => step.id))
  const validMaterialIds = new Set(item.materials.map(material => material.id))
  const stepDone = Array.isArray(checklist?.stepIds)
    ? checklist.stepIds.filter(id => validStepIds.has(id)).length
    : 0
  const materialDone = Array.isArray(checklist?.materialIds)
    ? checklist.materialIds.filter(id => validMaterialIds.has(id)).length
    : 0

  let progressHint: string | null = null
  if (counts.materialTotal > 0 && materialDone > 0) {
    progressHint = materialDone >= counts.materialTotal
      ? '材料已备齐'
      : `材料已备 ${materialDone}/${counts.materialTotal}`
  } else if (counts.stepTotal > 0 && stepDone > 0) {
    progressHint = stepDone >= counts.stepTotal
      ? '步骤已全部勾完'
      : `步骤已勾 ${stepDone}/${counts.stepTotal}`
  }

  return {
    ...counts,
    stepDone,
    materialDone,
    progressHint
  }
}

/** List page only needs completed ids; accept any checklist version and filter by known ids. */
export function readLooseProcedureChecklistFromStorageText(
  raw: string | null | undefined,
  validStepIds: Iterable<string>,
  validMaterialIds: Iterable<string> = []
): { stepIds: string[], materialIds: string[] } {
  if (raw == null || raw === '') {
    return { stepIds: [], materialIds: [] }
  }
  try {
    const saved = JSON.parse(raw) as unknown
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      return { stepIds: [], materialIds: [] }
    }
    const record = saved as Record<string, unknown>
    const stepAllowed = new Set(validStepIds)
    const materialAllowed = new Set(validMaterialIds)
    const stepIds = Array.isArray(record.stepIds)
      ? record.stepIds.filter((value): value is string => typeof value === 'string' && stepAllowed.has(value))
      : []
    const materialIds = Array.isArray(record.materialIds)
      ? record.materialIds.filter((value): value is string => typeof value === 'string' && materialAllowed.has(value))
      : []
    return { stepIds, materialIds }
  } catch {
    return { stepIds: [], materialIds: [] }
  }
}
