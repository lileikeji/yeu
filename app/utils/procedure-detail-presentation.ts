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
  mixed: '线上核对 + 到校办理'
} as const satisfies Record<ProcedureMethod, string>

export const procedureStateLabels = {
  'confirmed': '已确认',
  'partial': '部分确认',
  'awaiting-notice': '待通知'
} as const satisfies Record<ProcedureInformationState, string>

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
}

export function getProcedureNoticeText(
  category: string | null | undefined,
  informationState: ProcedureInformationState | string | null | undefined
): string {
  if (category === 'arrival') {
    return '个人时段、材料、报到点和接站仍需查看录取通知书及学校后续通知；这里仅在官方来源确认后更新。'
  }
  if (informationState === 'confirmed') {
    return '本页只整理公开来源已经能确认的办理入口、步骤和注意事项；如果部门后续改入口或改要求，以部门最新通知为准。'
  }
  return '办理入口、材料要求、时间窗口或负责窗口如果还没有公开来源，本页会标为待通知，不用往年经验或群聊截图替你做决定。'
}

export function getProcedureMaterialTitle(category: string | null | undefined): string {
  return category === 'arrival'
    ? '到校前需要准备'
    : '办理前先看是否需要材料'
}

export function getProcedureEmptyMaterialText(category: string | null | undefined): string {
  return category === 'arrival'
    ? '2026公开来源尚未给出可核验的个人材料清单。本页不会用往年材料填充；收到录取通知书或当年报到通知后再逐项核对。'
    : '当前公开来源没有列出需要提前准备的个人材料。办理时仍要以对应部门入口、页面提示或现场窗口要求为准。'
}

export function sourceClaimForStudents(claimScope: string): string {
  const text = claimScope
    .replace(/官方信息入口/g, '官方信息入口')
    .replace(/官方入口/g, '官方入口')
    .replace(/招生咨询边界/g, '招生咨询方式和适用范围')
    .replace(/咨询边界/g, '咨询方式和适用范围')
    .replace(/使用提醒/g, '使用注意事项')
    .replace(/流程/g, '办理流程')
    .replace(/规定/g, '相关规定')
  return `这条来源主要确认：${text}`
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

export function buildProcedureChecklistStorageKey(slug: string): string {
  return `yeu:procedure-checklist:${slug}`
}

export function parseProcedureChecklist(
  saved: unknown,
  version: string | null | undefined,
  validStepIds: Iterable<string>
): string[] {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return []
  }
  const record = saved as Record<string, unknown>
  if (record.version !== version || !Array.isArray(record.stepIds)) {
    return []
  }
  const allowed = new Set(validStepIds)
  return record.stepIds.filter((value): value is string => (
    typeof value === 'string' && allowed.has(value)
  ))
}

export function serializeProcedureChecklist(
  version: string | null | undefined,
  stepIds: string[]
): ProcedureChecklistRecord {
  return {
    version: version ?? '',
    stepIds
  }
}

export function toggleProcedureStep(stepIds: string[], stepId: string): string[] {
  return stepIds.includes(stepId)
    ? stepIds.filter(value => value !== stepId)
    : [...stepIds, stepId]
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
