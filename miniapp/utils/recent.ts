export type RecentKind = 'place' | 'guide' | 'procedure' | 'notice'

export interface RecentItem {
  kind: RecentKind
  slug: string
  title: string
  at: number
}

const STORAGE_KEY = 'miniapp-recent'
const MAX_ITEMS = 6

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentItem>
  return typeof item.slug === 'string'
    && typeof item.title === 'string'
    && typeof item.at === 'number'
    && (item.kind === 'place' || item.kind === 'guide' || item.kind === 'procedure' || item.kind === 'notice')
}

export function readRecent(): RecentItem[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!Array.isArray(raw)) return []
    return raw.filter(isRecentItem).slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

export function rememberRecent(item: Omit<RecentItem, 'at'>): void {
  if (!item.slug || !item.title) return
  try {
    const next: RecentItem[] = [
      { ...item, at: Date.now() },
      ...readRecent().filter(existing => !(existing.kind === item.kind && existing.slug === item.slug))
    ].slice(0, MAX_ITEMS)
    uni.setStorageSync(STORAGE_KEY, next)
  } catch {
    // 本地记录失败不影响浏览。
  }
}

export function clearRecent(): void {
  try {
    uni.removeStorageSync(STORAGE_KEY)
  } catch {
    // 忽略。
  }
}

export function recentKindLabel(kind: RecentKind): string {
  if (kind === 'place') return '地点'
  if (kind === 'guide') return '指南'
  if (kind === 'procedure') return '流程'
  return '公告'
}
