/**
 * signal 模块的时间口径。
 *
 * 数据库里存毫秒时间戳，但「今天」「本周」必须按北京时间切分，
 * 所以这里全部走纯函数换算，不读运行环境的 TZ。
 */

export const SIGNAL_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000
export const SIGNAL_HOUR_MS = 60 * 60 * 1000
export const SIGNAL_DAY_MS = 24 * SIGNAL_HOUR_MS

export type SignalReportKind = 'daily' | 'weekly' | 'monthly'

interface LocalDateParts {
  year: number
  month: number
  day: number
}

function localDateParts(ms: number): LocalDateParts {
  const date = new Date(ms + SIGNAL_TIMEZONE_OFFSET_MS)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  }
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** 北京时间当日零点的时间戳。 */
function localMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) - SIGNAL_TIMEZONE_OFFSET_MS
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function signalDayKey(ms: number): string {
  const parts = localDateParts(ms)
  return isoDate(parts.year, parts.month, parts.day)
}

/** ISO 周：周一为一周起点，跨年按 ISO 8601 归属。 */
export function signalWeekKey(ms: number): string {
  const { year, month, day } = localDateParts(ms)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const isoYear = date.getUTCFullYear()
  const yearStart = Date.UTC(isoYear, 0, 1)
  const week = Math.ceil(((date.getTime() - yearStart) / SIGNAL_DAY_MS + 1) / 7)
  return `${isoYear}-W${pad(week)}`
}

export function signalMonthKey(ms: number): string {
  const { year, month } = localDateParts(ms)
  return `${year}-${pad(month)}`
}

export function signalPeriodKey(kind: SignalReportKind, ms: number): string {
  if (kind === 'daily') return signalDayKey(ms)
  if (kind === 'weekly') return signalWeekKey(ms)
  return signalMonthKey(ms)
}

function dayRangeOf(dayKey: string): { start: number, end: number } {
  const [year, month, day] = dayKey.split('-').map(Number)
  const start = localMidnight(year!, month!, day!)
  return { start, end: start + SIGNAL_DAY_MS }
}

/** 解析 `YYYY-Www`，返回该周周一零点到下周一零点。 */
function weekRangeOf(weekKey: string): { start: number, end: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey)
  if (!match) throw new Error(`无效的周键：${weekKey}`)
  const year = Number(match[1])
  const week = Number(match[2])
  // 1 月 4 日必定落在 ISO 第 1 周，用它反推周一。
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekday = jan4.getUTCDay() || 7
  const firstMonday = Date.UTC(year, 0, 4) - (weekday - 1) * SIGNAL_DAY_MS
  const start = firstMonday + (week - 1) * 7 * SIGNAL_DAY_MS - SIGNAL_TIMEZONE_OFFSET_MS
  return { start, end: start + 7 * SIGNAL_DAY_MS }
}

function monthRangeOf(monthKey: string): { start: number, end: number } {
  const [year, month] = monthKey.split('-').map(Number)
  const start = localMidnight(year!, month!, 1)
  const nextYear = month === 12 ? year! + 1 : year!
  const nextMonth = month === 12 ? 1 : month! + 1
  return { start, end: localMidnight(nextYear, nextMonth, 1) }
}

export function signalPeriodRange(kind: SignalReportKind, key: string): { start: number, end: number } {
  if (kind === 'daily') return dayRangeOf(key)
  if (kind === 'weekly') return weekRangeOf(key)
  return monthRangeOf(key)
}

/** 周期内的所有日键，供周报/月报把日报拼起来。 */
export function signalDayKeysInPeriod(kind: SignalReportKind, key: string): string[] {
  const { start, end } = signalPeriodRange(kind, key)
  const keys: string[] = []
  for (let cursor = start; cursor < end; cursor += SIGNAL_DAY_MS) {
    keys.push(signalDayKey(cursor))
  }
  return keys
}

export function signalPeriodLabel(kind: SignalReportKind, key: string): string {
  if (kind === 'daily') {
    const { start } = signalPeriodRange(kind, key)
    const parts = localDateParts(start)
    return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日`
  }
  if (kind === 'weekly') {
    const [year, week] = key.split('-W')
    return `${year} 年第 ${Number(week)} 周`
  }
  const [year, month] = key.split('-')
  return `${year} 年 ${Number(month)} 月`
}
