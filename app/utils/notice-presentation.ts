export interface NoticeReadState {
  confirmed: boolean
}

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit'
})

function parseNoticeTime(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function noticeUnreadCount(notices: NoticeReadState[]): number {
  return notices.filter(notice => !notice.confirmed).length
}

export function noticePublishedTime(value: string | null | undefined): string {
  const timestamp = parseNoticeTime(value)
  return timestamp === null ? '发布时间待确认' : FULL_DATE_FORMATTER.format(timestamp)
}

export function noticeRelativeTime(
  value: string | null | undefined,
  now = Date.now()
): string {
  const timestamp = parseNoticeTime(value)
  if (timestamp === null) return '时间待确认'

  const elapsed = Math.max(0, now - timestamp)
  const minute = 60_000
  const hour = minute * 60
  const day = hour * 24

  if (elapsed < minute) return '刚刚'
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} 分钟前`
  if (elapsed < day) return `${Math.floor(elapsed / hour)} 小时前`
  if (elapsed < day * 7) return `${Math.floor(elapsed / day)} 天前`
  return SHORT_DATE_FORMATTER.format(timestamp)
}
