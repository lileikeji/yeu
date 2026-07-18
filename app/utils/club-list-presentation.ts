export const clubListRecentActivityUrlMarker = '/2026/'

export const clubListMessages = {
  serviceUnavailable: '暂时没能打开社团列表，请检查网络后再试。',
  emptyMatch: '没有匹配的社团',
  defaultCategory: '校园社团',
  allGroups: '全部',
  recentActivity: '近期有活动',
  recruitmentPending: '等待本学期招新消息'
} as const

export interface ClubListFilterableItem {
  name: string
  summary: string
  body: string
  category?: string | null
  sources: ReadonlyArray<{ url: string }>
}

export function countRecentClubs<T extends { sources: ReadonlyArray<{ url: string }> }>(
  clubs: ReadonlyArray<T>,
  marker: string = clubListRecentActivityUrlMarker
): number {
  return clubs.filter(club => hasRecentClubActivity(club, marker)).length
}

export function countLeadClubs(total: number, recent: number): number {
  return Math.max(0, total - recent)
}

export function joinClubNames(clubs: ReadonlyArray<{ name: string }>, separator = '、'): string {
  return clubs.map(club => club.name).join(separator)
}

export function hasRecentClubActivity(
  club: { category?: string | null, sources: ReadonlyArray<{ url: string }> },
  marker: string = clubListRecentActivityUrlMarker
): boolean {
  return club.category?.includes('近期活动') === true
    || club.sources.some(source => source.url.includes(marker))
}

export function resolveClubGroup(category: string | null | undefined): string {
  const group = category?.split('·')[0]?.trim()
  if (!group || ['近期活动可确认', '名称线索待确认', '招新待发布'].includes(group)) {
    return clubListMessages.defaultCategory
  }
  return group
}

export function listClubGroups<T extends { category?: string | null }>(clubs: ReadonlyArray<T>): string[] {
  return [...new Set(clubs.map(club => resolveClubGroup(club.category)))]
}

export function resolveClubDirection(summary: string, preferredDirection?: string | null): string {
  if (preferredDirection?.trim()) return preferredDirection.trim()

  const quotedDirection = summary.match(/适合想了解[“"](.+?)[”"]的新生/)
  if (quotedDirection?.[1]) return quotedDirection[1]

  const plainDirection = summary.match(/适合想了解(.+?)的新生/)
  if (plainDirection?.[1]) return plainDirection[1]

  const firstSentence = summary.split(/[。；]/)[0]?.trim() ?? ''
  return firstSentence.length > 72 ? `${firstSentence.slice(0, 69)}…` : firstSentence
}

export function filterClubListItems<T extends ClubListFilterableItem>(
  clubs: ReadonlyArray<T>,
  query: string,
  group: string = clubListMessages.allGroups
): T[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return clubs.filter((club) => {
    if (group !== clubListMessages.allGroups && resolveClubGroup(club.category) !== group) {
      return false
    }
    if (!normalized) return true
    const text = [club.name, club.summary, club.body, club.category]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN')
    return text.includes(normalized)
  })
}
