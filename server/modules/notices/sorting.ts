export interface NoticeSortable {
  pinned: boolean
  sortOrder?: number | null
  publishedAt?: string | null
  updatedAt?: string | null
  title?: string | null
}

function noticeTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizedSortOrder(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : Number.MAX_SAFE_INTEGER
}

/**
 * Keep one ordering contract for the notice center and content catalog.
 * An unset manual order falls through to publication time, so new notices
 * remain newest-first without requiring an editor to fill another field.
 */
export function sortPublicNoticeItems<T extends NoticeSortable>(items: T[]): T[] {
  return [...items].sort((left, right) => (
    Number(right.pinned) - Number(left.pinned)
    || normalizedSortOrder(left.sortOrder) - normalizedSortOrder(right.sortOrder)
    || (noticeTimestamp(right.publishedAt ?? right.updatedAt)
      - noticeTimestamp(left.publishedAt ?? left.updatedAt))
    || noticeTimestamp(right.updatedAt) - noticeTimestamp(left.updatedAt)
    || (left.title ?? '').localeCompare(right.title ?? '', 'zh-CN')
  ))
}
