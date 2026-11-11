export interface HotSearchEvent {
  title: string
  summary?: string | null
  category?: string | null
  tierLabel?: string | null
  places?: Array<{ name: string }> | null
}

export function normalizeHotSearch(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ')
}

export function filterHotEvents<T extends HotSearchEvent>(
  events: readonly T[],
  query: string
): T[] {
  const keyword = normalizeHotSearch(query)
  if (!keyword) return [...events]
  return events.filter((event) => {
    const haystack = [
      event.title,
      event.summary,
      event.category,
      event.tierLabel,
      ...(event.places ?? []).map(place => place.name)
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN')
    return haystack.includes(keyword)
  })
}
