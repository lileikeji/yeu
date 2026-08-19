import type {
  ProcedureAudience,
  ProcedureInformationState,
  ProcedureMethod
} from '~~/shared/constants/server'
import type { ProcedureAudienceSelection } from '~~/app/utils/procedure-audience'

export const procedureAudienceLabels = {
  undergraduate: '普通本科新生',
  transfer: '专升本新生'
} as const satisfies Record<ProcedureAudience, string>

export const procedureMethodLabels = {
  online: '线上办理',
  offline: '到校办理',
  mixed: '网上确认 + 到校办理'
} as const satisfies Record<ProcedureMethod, string>

export const procedureStateLabels = {
  'confirmed': '信息明确',
  'partial': '部分内容待确认',
  'awaiting-notice': '等学校通知'
} as const satisfies Record<ProcedureInformationState, string>

export function studentFacingProcedureTitle(value: string): string {
  return value
    .replace(/校园网与统一认证排查/g, '校园网与账号登录问题')
}

export function studentFacingProcedureText(value: string): string {
  return value
    .replace(/公开来源能确认/g, '学校官网已经公布')
    .replace(/公开来源是/g, '学校官网已经公布')
    .replace(/2026公开来源尚未列明/g, '学校目前还没有列明')
    .replace(/尚未从2026公开来源确认/g, '目前还没有从学校通知中确认')
    .replace(/公开来源尚未/g, '学校目前还没有')
    .replace(/公开来源确认/g, '学校通知确认')
    .replace(/报到日期已确认/g, '报到日期已经确定')
    .replace(/已发布/g, '已经公布')
    .replace(/官方来源/g, '学校说明')
    .replace(/官方信息入口/g, '官网')
    .replace(/官方入口/g, '官网')
    .replace(/工单状态/g, '处理进度')
    .replace(/待通知/g, '还要等学校通知')
    .replace(/统一认证/g, '账号登录')
    .replace(/认证入口/g, '登录入口')
    .replace(/认证不了/g, '登录不了')
    .replace(/按(.+?)入口咨询/g, '通过$1官网咨询')
    .replace(/账号、认证、网络故障/g, '账号登录、网络故障')
    .replace(/系统不公开或猜测个人账号初始密码/g, '这里不会提供或猜测个人账号初始密码')
    .replace(/设备系统/g, '手机或电脑的系统版本')
    .replace(/点位/g, '报到地点')
    .replace(/核验/g, '确认')
}

export const procedureAudienceOptions: Array<{ value: ProcedureAudienceSelection, label: string }> = [
  { value: 'all', label: '全部新生' },
  { value: 'undergraduate', label: '普通本科' },
  { value: 'transfer', label: '专升本' }
]

export interface ProcedureDetailSourceLike {
  id: string
  title: string
  url: string | null
  claimScope?: string | null
}

export interface ProcedureDetailSourceView {
  key: string
  title: string
  url: string | null
  note: string | null
}

export interface ProcedureChecklistRecord {
  version: string
  stepIds: string[]
  materialIds: string[]
}

export interface ProcedureChecklistProgress {
  completedCount: number
  totalCount: number
  remainingCount: number
  percent: number
  nextStepId: string | null
  isComplete: boolean
}

export function getProcedureNoticeText(
  category: string | null | undefined,
  informationState: ProcedureInformationState | string | null | undefined
): string {
  if (category === 'arrival') {
    return '个人报到时段、材料、报到点和接站安排还要看录取通知书及学校后续通知。'
  }
  if (informationState === 'confirmed') {
    return '这里整理了学校目前已经说明的办理入口、步骤和注意事项；如果部门之后调整要求，请以最新通知为准。'
  }
  return '有些办理入口、材料或时间还没公布，可以先按已经明确的部分准备，其余等学校通知，不必照搬往年经验或群聊截图。'
}

export function getProcedureMaterialTitle(category: string | null | undefined): string {
  return category === 'arrival'
    ? '到校前需要准备'
    : '办理前先看是否需要材料'
}

export function getProcedureEmptyMaterialText(category: string | null | undefined): string {
  return category === 'arrival'
    ? '学校目前还没有公布个人材料清单。收到录取通知书或当年报到通知后，再逐项准备。'
    : '学校目前没有列出需要提前准备的个人材料。办理时请留意对应部门页面或现场窗口的要求。'
}

export function sourceClaimForStudents(claimScope: string): string {
  const officialPage = claimScope.match(/^(.+?)官方(?:信息)?入口$/)
  if (officialPage?.[1]) {
    return `可以从${officialPage[1]}官网查看最新信息。`
  }
  const text = claimScope
    .replace(/官方信息入口/g, '官网')
    .replace(/官方入口/g, '官网')
    .replace(/招生咨询边界/g, '招生咨询方式和适用范围')
    .replace(/咨询边界/g, '咨询方式和适用范围')
    .replace(/使用提醒/g, '使用注意事项')
    .replace(/流程/g, '办理流程')
    .replace(/规定/g, '相关规定')
  return `这份说明可以确认：${text}`
}

export function buildProcedureDetailSources(
  sources: ProcedureDetailSourceLike[] | null | undefined
): ProcedureDetailSourceView[] {
  return (sources ?? []).map(source => ({
    key: source.id,
    title: source.title,
    url: source.url,
    note: source.claimScope ? sourceClaimForStudents(source.claimScope) : null
  }))
}

export function resolveProcedureOfficialSource(
  sources: ReadonlyArray<ProcedureDetailSourceView> | null | undefined
): ProcedureDetailSourceView | null {
  return (sources ?? []).find((source) => {
    if (!source.url) return false

    try {
      const hostname = new URL(source.url).hostname.toLowerCase()
      return hostname === 'yeu.edu.cn' || hostname.endsWith('.yeu.edu.cn')
    } catch {
      return false
    }
  }) ?? null
}

export function buildProcedureChecklistStorageKey(slug: string): string {
  return `yeu:procedure-checklist:${slug}`
}

function filterChecklistIds(
  values: unknown,
  validIds: Iterable<string>
): string[] {
  if (!Array.isArray(values)) {
    return []
  }
  const allowed = new Set(validIds)
  return values.filter((value): value is string => (
    typeof value === 'string' && allowed.has(value)
  ))
}

export function parseProcedureChecklist(
  saved: unknown,
  version: string | null | undefined,
  validStepIds: Iterable<string>,
  validMaterialIds: Iterable<string> = []
): { stepIds: string[], materialIds: string[] } {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return { stepIds: [], materialIds: [] }
  }
  const record = saved as Record<string, unknown>
  if (record.version !== version) {
    return { stepIds: [], materialIds: [] }
  }
  return {
    stepIds: filterChecklistIds(record.stepIds, validStepIds),
    materialIds: filterChecklistIds(record.materialIds, validMaterialIds)
  }
}

export function serializeProcedureChecklist(
  version: string | null | undefined,
  stepIds: string[],
  materialIds: string[] = []
): ProcedureChecklistRecord {
  return {
    version: version ?? '',
    stepIds,
    materialIds
  }
}

export function toggleProcedureStep(stepIds: string[], stepId: string): string[] {
  return stepIds.includes(stepId)
    ? stepIds.filter(value => value !== stepId)
    : [...stepIds, stepId]
}

export function resolveProcedureChecklistProgress(
  visibleStepIds: Iterable<string>,
  completedStepIds: Iterable<string>
): ProcedureChecklistProgress {
  const stepIds = [...visibleStepIds]
  const completed = new Set(completedStepIds)
  const completedCount = stepIds.filter(stepId => completed.has(stepId)).length
  const totalCount = stepIds.length
  const remainingCount = totalCount - completedCount

  return {
    completedCount,
    totalCount,
    remainingCount,
    percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    nextStepId: stepIds.find(stepId => !completed.has(stepId)) ?? null,
    isComplete: totalCount > 0 && remainingCount === 0
  }
}

export function buildProcedureMapLink(
  procedureSlug: string,
  placeSlug: string,
  stepId: string
): { path: string, query: { place: string, from: string } } {
  return {
    path: '/map',
    query: {
      place: placeSlug,
      from: `/procedures/${procedureSlug}#step-${stepId}`
    }
  }
}

export type ProcedureSoftBadgeColor = 'success' | 'warning' | 'neutral' | 'primary'

export function resolveProcedureInformationStateBadgeColor(
  informationState: string | null | undefined
): 'success' | 'warning' {
  return informationState === 'confirmed' ? 'success' : 'warning'
}

export function resolveProcedureMaterialsPackBadge(
  totalCount: number,
  packedCount: number
): {
  color: 'success' | 'neutral' | 'warning'
  label: string
} {
  if (totalCount <= 0) {
    return {
      color: 'warning',
      label: '暂未公布'
    }
  }
  if (packedCount >= totalCount) {
    return {
      color: 'success',
      label: '已备齐'
    }
  }
  return {
    color: 'neutral',
    label: `已备 ${packedCount}/${totalCount}`
  }
}

export function resolveProcedureAudienceOptionPresentation(
  selectedAudience: ProcedureAudienceSelection,
  optionValue: ProcedureAudienceSelection
): {
  color: 'primary' | 'neutral'
  variant: 'solid' | 'ghost'
  ariaPressed: boolean
} {
  const active = selectedAudience === optionValue
  return {
    color: active ? 'primary' : 'neutral',
    variant: active ? 'solid' : 'ghost',
    ariaPressed: active
  }
}

export function shouldShowProcedureStepAudienceBadges(
  selectedAudience: ProcedureAudienceSelection,
  stepAudienceCount: number,
  procedureAudienceCount: number
): boolean {
  return selectedAudience === 'all' && stepAudienceCount < procedureAudienceCount
}

export function resolveProcedureStepCompletionPresentation(
  completed: boolean,
  stepNumber: number
): {
  ariaLabel: string
  ariaPressed: boolean
  icon: string
  titleClass: string
} {
  return {
    ariaLabel: completed
      ? `取消完成第${stepNumber}步`
      : `标记第${stepNumber}步完成`,
    ariaPressed: completed,
    icon: completed ? 'i-lucide-circle-check-big' : 'i-lucide-circle',
    titleClass: completed ? 'line-through opacity-60' : ''
  }
}

export function resolveProcedureMaterialPackPresentation(
  packed: boolean,
  materialName: string
): {
  ariaLabel: string
  ariaPressed: boolean
  icon: string
  titleClass: string
} {
  return {
    ariaLabel: packed
      ? `取消已备齐：${materialName}`
      : `标记已备齐：${materialName}`,
    ariaPressed: packed,
    icon: packed ? 'i-lucide-circle-check-big' : 'i-lucide-circle',
    titleClass: packed ? 'line-through opacity-60' : ''
  }
}

export function resolveProcedureAudienceRouteQuery(
  query: Record<string, unknown>,
  audience: ProcedureAudienceSelection
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...query }
  if (audience === 'all') {
    delete next.audience
  } else {
    next.audience = audience
  }
  return next
}

export function resolveProcedureChecklistFromStorageText(
  raw: string | null | undefined,
  version: string | null | undefined,
  validStepIds: Iterable<string>,
  validMaterialIds: Iterable<string> = []
): { stepIds: string[], materialIds: string[] } {
  if (raw == null || raw === '') {
    return { stepIds: [], materialIds: [] }
  }
  try {
    return parseProcedureChecklist(JSON.parse(raw), version, validStepIds, validMaterialIds)
  } catch {
    return { stepIds: [], materialIds: [] }
  }
}

export function buildProcedureChecklistStorageValue(
  version: string | null | undefined,
  stepIds: string[],
  materialIds: string[] = []
): string {
  return JSON.stringify(serializeProcedureChecklist(version, stepIds, materialIds))
}
