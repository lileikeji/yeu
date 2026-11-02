import type { ApiSignalEventSummary, ApiSignalTier, ApiSignalTrend } from '~~/shared/types/server'

export const SIGNAL_TREND_LABEL: Record<ApiSignalTrend, string> = {
  new: '刚出现',
  up: '在涨',
  down: '在退',
  flat: '持平'
}

export const SIGNAL_TREND_CLASS: Record<ApiSignalTrend, string> = {
  new: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  up: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  down: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  flat: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
}

export const SIGNAL_TIER_CLASS: Record<ApiSignalTier, string> = {
  A: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  B: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  C: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
}

export function signalHeatText(heat: number): string {
  return heat > 0 ? heat.toFixed(2) : '—'
}

/** 相对时间：刚刚 / N 小时前 / N 天前 / 日期。传毫秒数或 ISO 字符串都行。 */
export function signalRelativeTime(value: string | number | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const hours = Math.round((Date.now() - date.getTime()) / 3_600_000)
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

/** 首页一条热点最多显示两行标题，这里只做展示用的类型再导出。 */
export type HomeSignalEvent = ApiSignalEventSummary
