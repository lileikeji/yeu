import { procedureSeeds } from '../../data/seeds/procedures'

export interface ProcedureWindow {
  opensAt: string
  closesAt: string
  label: string
  sourceUrl: string
}

export type ProcedureWindowState = 'open' | 'closing-soon' | 'closed' | 'upcoming' | 'unknown'

export type ProcedureWindowTone = 'neutral' | 'warning' | 'danger'

export interface ProcedureWindowDescription {
  state: ProcedureWindowState
  days: number | null
  text: string
  tone: ProcedureWindowTone
}

export type ProcedureWindowBadgeColor = 'success' | 'warning' | 'neutral' | 'error'

export const procedureWindowStateLabels: Record<ProcedureWindowState, string> = {
  'open': '现在可以办',
  'closing-soon': '快截止了',
  'closed': '已经截止',
  'upcoming': '还没开放',
  'unknown': ''
}

// 只把 warning/danger 落到站内已有的 UBadge 色值上，不新造颜色
export function procedureWindowBadgeColor(tone: ProcedureWindowTone): ProcedureWindowBadgeColor {
  if (tone === 'danger') return 'error'
  if (tone === 'warning') return 'warning'
  return 'neutral'
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// 'YYYY-MM-DD' 直接换算成 UTC 零点的日期序号。不用 new Date('YYYY-MM-DD')：那会把字符串按 UTC 解析，
// 和按北京时间理解的日期差一天，还会跟着运行机器的时区漂。
function parseCalendarDay(value: string | null | undefined): number | null {
  if (!value) return null
  const matched = CALENDAR_DAY_PATTERN.exec(value.trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null
  }
  return utc.getTime()
}

// now 是一个时刻，先挪到北京时间再取日历日，这样同一个时刻在不同时区的机器上算出同一结果
function beijingCalendarDay(now: Date | number): number | null {
  const instant = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(instant)) return null
  const shifted = new Date(instant + BEIJING_OFFSET_MS)
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
}

function formatCalendarDay(day: number): string {
  const date = new Date(day)
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}

function unknownProcedureWindow(): ProcedureWindowDescription {
  return { state: 'unknown', days: null, text: '', tone: 'neutral' }
}

/**
 * 把办理窗口换算成学生一眼能看懂的状态。
 * days 的含义：upcoming 距开放还有几天，open / closing-soon 距截止还有几天，closed / unknown 为 null。
 * 截止当天算 closing-soon（今天截止）；还剩 1 到 3 天算 closing-soon；还有 4 天以上算 open。
 */
export function describeProcedureWindow(
  window: ProcedureWindow | null | undefined,
  now: Date | number
): ProcedureWindowDescription {
  if (!window) return unknownProcedureWindow()
  const opensDay = parseCalendarDay(window.opensAt)
  const closesDay = parseCalendarDay(window.closesAt)
  const today = beijingCalendarDay(now)
  if (opensDay === null || closesDay === null || today === null) {
    return unknownProcedureWindow()
  }
  if (today < opensDay) {
    return {
      state: 'upcoming',
      days: Math.round((opensDay - today) / DAY_MS),
      text: `${formatCalendarDay(opensDay)}开放`,
      tone: 'neutral'
    }
  }
  if (today > closesDay) {
    return {
      state: 'closed',
      days: null,
      text: `已于${formatCalendarDay(closesDay)}截止`,
      tone: 'danger'
    }
  }
  const days = Math.round((closesDay - today) / DAY_MS)
  if (days === 0) {
    return { state: 'closing-soon', days, text: '今天截止', tone: 'warning' }
  }
  if (days <= 3) {
    return { state: 'closing-soon', days, text: `还剩 ${days} 天`, tone: 'warning' }
  }
  return { state: 'open', days, text: `还剩 ${days} 天`, tone: 'neutral' }
}

/**
 * 办理窗口只存在于 seed 里：公开接口的流程数据不带这个字段，页面按 slug 从 seed 取。
 * 没有核实到日期的流程返回 null，前端不显示任何徽标。
 */
export function resolveProcedureWindowBySlug(slug: string): ProcedureWindow | null {
  const seed = procedureSeeds.find(item => item.slug === slug)
  return seed?.window ?? null
}
