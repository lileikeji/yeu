export const clubListRecentActivityUrlMarker = '/2026/0606/'

export const clubListMessages = {
  serviceUnavailable: '社团资料暂时不可用，请稍后重试。',
  emptyMatch: '没有匹配的社团',
  defaultCategory: '招新待发布'
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
  return clubs.filter(club => club.sources.some(source => source.url.includes(marker))).length
}

export function countLeadClubs(total: number, recent: number): number {
  return Math.max(0, total - recent)
}

export function joinClubNames(clubs: ReadonlyArray<{ name: string }>, separator = '、'): string {
  return clubs.map(club => club.name).join(separator)
}

export function filterClubListItems<T extends ClubListFilterableItem>(
  clubs: ReadonlyArray<T>,
  query: string
): T[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) {
    return [...clubs]
  }

  return clubs.filter((club) => {
    const text = [club.name, club.summary, club.body, club.category]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN')
    return text.includes(normalized)
  })
}
