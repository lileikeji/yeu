/**
 * Official 2026 arrival calendar helpers + "today focus" from the local checklist.
 * Dates are school-calendar confirmed windows; personal times still "以通知为准".
 */

import {
  buildChecklistOverview,
  type ChecklistAudience,
  type ChecklistItem,
  type ChecklistStageId
} from './checklist-presentation'

/** Confirmed by 2026-2027 academic calendar seed content. */
export const ARRIVAL_REPORT_START = '2026-09-05'
export const ARRIVAL_REPORT_END = '2026-09-06'
export const ORIENTATION_START = '2026-09-07'
export const ORIENTATION_END = '2026-09-09'
export const CLASS_START = '2026-09-10'

export type ArrivalPhase =
  | 'before-report'
  | 'report-window'
  | 'orientation'
  | 'class-started'

export interface ArrivalMilestone {
  id: string
  label: string
  dateLabel: string
  active: boolean
  done: boolean
}

export interface ArrivalCountdownView {
  phase: ArrivalPhase
  phaseLabel: string
  headline: string
  detail: string
  /** Large number for UI; null when not counting down */
  daysNumber: number | null
  daysUnit: string
  primaryCtaLabel: string
  primaryCtaTo: string
  secondaryCtaLabel: string
  secondaryCtaTo: string
  reportWindowLabel: string
  milestones: ArrivalMilestone[]
  focusStageIds: ChecklistStageId[]
  honestyNote: string
}

export interface TodayFocusView {
  title: string
  description: string
  items: ChecklistItem[]
  emptyLabel: string
  checklistTo: string
}

const SHANGHAI_OFFSET = '+08:00'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Calendar date in Asia/Shanghai as YYYY-MM-DD. */
export function toShanghaiDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value
  if (!year || !month || !day) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  }
  return `${year}-${month}-${day}`
}

/** Whole calendar days from `fromKey` to `toKey` (can be negative). */
export function calendarDaysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00${SHANGHAI_OFFSET}`)
  const to = Date.parse(`${toKey}T00:00:00${SHANGHAI_OFFSET}`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.round((to - from) / 86_400_000)
}

export function resolveArrivalPhase(now: Date = new Date()): ArrivalPhase {
  const today = toShanghaiDateKey(now)
  if (today < ARRIVAL_REPORT_START) return 'before-report'
  if (today <= ARRIVAL_REPORT_END) return 'report-window'
  if (today <= ORIENTATION_END) return 'orientation'
  return 'class-started'
}

function focusStagesForPhase(phase: ArrivalPhase): ChecklistStageId[] {
  switch (phase) {
    case 'before-report':
      return ['before-arrival', 'packing']
    case 'report-window':
      return ['arrival-day', 'packing']
    case 'orientation':
      return ['first-week', 'arrival-day']
    case 'class-started':
      return ['first-week', 'daily']
  }
}

export function buildArrivalCountdown(now: Date = new Date()): ArrivalCountdownView {
  const phase = resolveArrivalPhase(now)
  const today = toShanghaiDateKey(now)
  const daysToReport = calendarDaysBetween(today, ARRIVAL_REPORT_START)
  const daysToClass = calendarDaysBetween(today, CLASS_START)

  const milestones: ArrivalMilestone[] = [
    {
      id: 'report',
      label: '注册报到',
      dateLabel: '9月5–6日',
      active: phase === 'report-window' || phase === 'before-report',
      done: phase === 'orientation' || phase === 'class-started'
    },
    {
      id: 'orientation',
      label: '入学教育',
      dateLabel: '9月7–9日',
      active: phase === 'orientation',
      done: phase === 'class-started'
    },
    {
      id: 'class',
      label: '开始上课',
      dateLabel: '9月10日',
      active: phase === 'class-started' && daysToClass <= 0,
      done: phase === 'class-started' && daysToClass < 0
    }
  ]

  const honestyNote = '个人时段、窗口与材料以录取通知书和学校当年通知为准，本页只整理校历已确认的公共日期。'

  if (phase === 'before-report') {
    return {
      phase,
      phaseLabel: '到校前',
      headline: daysToReport === 1 ? '明天开始报到' : `距离报到还有 ${daysToReport} 天`,
      detail: '先核对应带材料和个人时段，收藏宿舍与报到点，少靠群聊截图猜。',
      daysNumber: daysToReport,
      daysUnit: '天',
      primaryCtaLabel: '打开入学清单',
      primaryCtaTo: '/checklist',
      secondaryCtaLabel: '报到流程',
      secondaryCtaTo: '/procedures/arrival',
      reportWindowLabel: '2026级注册报到：9月5–6日',
      milestones,
      focusStageIds: focusStagesForPhase(phase),
      honestyNote
    }
  }

  if (phase === 'report-window') {
    const isLastDay = today === ARRIVAL_REPORT_END
    return {
      phase,
      phaseLabel: '报到窗口',
      headline: isLastDay ? '今天是报到窗口最后一天' : '今天处于报到窗口',
      detail: '先在地图定位报到点或宿舍，再按现场指引办理；材料有变以现场通知为准。',
      daysNumber: 0,
      daysUnit: '今天',
      primaryCtaLabel: '打开校园地图',
      primaryCtaTo: '/map',
      secondaryCtaLabel: '报到当天清单',
      secondaryCtaTo: '/checklist',
      reportWindowLabel: '注册报到日：9月5–6日',
      milestones,
      focusStageIds: focusStagesForPhase(phase),
      honestyNote
    }
  }

  if (phase === 'orientation') {
    return {
      phase,
      phaseLabel: '入学教育',
      headline: '入学教育进行中',
      detail: '集合地点与学院安排以辅导员/学院通知为准；同时把校园一卡通、网络和安全电话补齐。',
      daysNumber: Math.max(0, daysToClass),
      daysUnit: daysToClass > 0 ? '天后上课' : '天',
      primaryCtaLabel: '校园一卡通与网络',
      primaryCtaTo: '/guides/campus-card-network',
      secondaryCtaLabel: '安全医疗',
      secondaryCtaTo: '/guides/safety-health',
      reportWindowLabel: '入学教育：9月7–9日 · 上课：9月10日',
      milestones,
      focusStageIds: focusStagesForPhase(phase),
      honestyNote
    }
  }

  return {
    phase,
    phaseLabel: '已开学',
    headline: daysToClass < 0 ? '已进入日常学期' : '今天开始上课',
    detail: '日常事项、快递外卖、社团和周边生活可以按需查看；过期流程仍以学校最新通知为准。',
    daysNumber: null,
    daysUnit: '',
    primaryCtaLabel: '校园生活入口',
    primaryCtaTo: '/discover',
    secondaryCtaLabel: '复查清单',
    secondaryCtaTo: '/checklist',
    reportWindowLabel: '校历公开日期仅供参考',
    milestones,
    focusStageIds: focusStagesForPhase(phase),
    honestyNote
  }
}

export function buildTodayFocus(
  completedIds: Iterable<string>,
  audience: ChecklistAudience = 'all',
  now: Date = new Date(),
  limit = 4
): TodayFocusView {
  const countdown = buildArrivalCountdown(now)
  const done = new Set(completedIds)
  const preferred = new Set(countdown.focusStageIds)
  const overview = buildChecklistOverview(completedIds, audience)

  const remaining = overview.stageProgress
    .flatMap(entry => entry.items)
    .filter(item => !done.has(item.id))

  const stageRank = (stageId: ChecklistStageId): number => {
    const index = countdown.focusStageIds.indexOf(stageId)
    return index === -1 ? 100 : index
  }

  const preferredItems = remaining
    .filter(item => preferred.has(item.stageId))
    .sort((a, b) => stageRank(a.stageId) - stageRank(b.stageId) || a.priority - b.priority)

  const fillItems = remaining
    .filter(item => !preferred.has(item.stageId))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'zh-CN'))

  const items = [...preferredItems, ...fillItems].slice(0, Math.max(1, limit))

  const titles: Record<ArrivalPhase, { title: string, description: string }> = {
    'before-report': {
      title: '到校前优先做',
      description: '先把通知、材料和路线核清楚，再收拾行李。'
    },
    'report-window': {
      title: '报到当天优先做',
      description: '先定位再办理，保存紧急求助入口。'
    },
    orientation: {
      title: '入学教育期间优先做',
      description: '补齐校园一卡通、网络、学习和安全相关事项。'
    },
    'class-started': {
      title: '开学后可以继续做',
      description: '日常入口、社团和周边生活按需补齐。'
    }
  }

  const copy = titles[countdown.phase]

  return {
    title: copy.title,
    description: copy.description,
    items,
    emptyLabel: items.length === 0 ? '当前阶段事项已勾完，可打开完整清单复查。' : '',
    checklistTo: '/checklist'
  }
}

export function buildHomeArrivalSummary(now: Date = new Date()): {
  kicker: string
  title: string
  meta: string
  to: string
} {
  const view = buildArrivalCountdown(now)
  if (view.phase === 'before-report' && view.daysNumber != null) {
    return {
      kicker: '报到倒计时',
      title: `还有 ${view.daysNumber} 天`,
      meta: view.reportWindowLabel,
      to: '/checklist'
    }
  }
  return {
    kicker: view.phaseLabel,
    title: view.headline,
    meta: view.reportWindowLabel,
    to: view.primaryCtaTo
  }
}
