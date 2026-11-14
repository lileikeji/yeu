const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

function shanghaiDayKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = SHANGHAI_DAY_FORMATTER.formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value ?? ''
  const month = parts.find(part => part.type === 'month')?.value ?? ''
  const day = parts.find(part => part.type === 'day')?.value ?? ''
  return year && month && day ? `${year}-${month}-${day}` : ''
}

/**
 * 活动是否在“今天”开始。以 Asia/Shanghai 为准，避免访客时区不同时
 * 把同一场活动判成昨天或明天。只判断开始日，跨天活动不会第二天继续高亮。
 */
export function isActivityStartingToday(
  startsAt: string | number | Date,
  now: Date = new Date()
): boolean {
  const startDay = shanghaiDayKey(startsAt)
  return Boolean(startDay) && startDay === shanghaiDayKey(now)
}
