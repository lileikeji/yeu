export const guideListCategories = [
  { id: 'all', label: '全部', icon: 'i-lucide-layout-grid' },
  { id: 'arrival', label: '入学', icon: 'i-lucide-clipboard-check' },
  { id: 'campus', label: '校园', icon: 'i-lucide-school' },
  { id: 'life', label: '生活', icon: 'i-lucide-coffee' },
  { id: 'community', label: '社团', icon: 'i-lucide-users-round' }
] as const

export type GuideListCategoryId = (typeof guideListCategories)[number]['id']

export const guideCategoryIconTones: Record<string, string> = {
  arrival: 'bg-green-50 text-green-700',
  campus: 'bg-blue-50 text-blue-700',
  life: 'bg-orange-50 text-orange-700',
  community: 'bg-violet-50 text-violet-700'
}

export const guideListFallbackMessages = {
  serviceUnavailable: '暂时没能打开指南，请检查网络后再试。',
  staticGuide: '这里先显示已经整理好的指南；时间、地点、材料和费用请以学校最新通知为准。',
  emptyPublished: '指南还在整理，过一会再来看看。'
} as const

export interface GuideListFilterableItem {
  category: string
  title: string
  shortTitle: string
  summary: string
  audience: readonly string[]
}

export interface GuideListFallbackInput {
  hasError: boolean
  response: { items: ReadonlyArray<unknown> } | null | undefined
  allowStaticFallback: boolean
}

export function resolveGuideListFallbackMessage(input: GuideListFallbackInput): string | null {
  if (input.hasError) return guideListFallbackMessages.serviceUnavailable
  if (!input.response) return null
  if (input.allowStaticFallback) return guideListFallbackMessages.staticGuide
  if (!input.response.items.length) return guideListFallbackMessages.emptyPublished
  return null
}

export function filterGuideListItems<T extends GuideListFilterableItem>(
  guides: ReadonlyArray<T>,
  options: { query: string, category: string }
): T[] {
  const query = options.query.trim().toLocaleLowerCase('zh-CN')

  return guides.filter((guide) => {
    const matchesCategory = options.category === 'all' || guide.category === options.category
    const text = [guide.title, guide.shortTitle, guide.summary, ...guide.audience]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
    return matchesCategory && (!query || text.includes(query))
  })
}

export function previewGuideListItems<T>(
  guides: ReadonlyArray<T>,
  options: { expanded: boolean, query: string, category: string },
  limit = 6
): T[] {
  const shouldLimit = !options.expanded
    && !options.query.trim()
    && options.category === 'all'
  return shouldLimit ? guides.slice(0, Math.max(0, limit)) : [...guides]
}
