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
  serviceUnavailable: '可以稍后再试，也可以先查看校园地图和常用部门。',
  staticGuide: '指南为整理稿；时间、地点以学校最新通知为准。',
  emptyPublished: '指南还在整理，过一会再来看看。'
} as const

export const guideListMessages = {
  emptyMatchTitle: '没有找到相关指南',
  emptyMatchHint: '可以换个关键词，或者先从校园地图和办事入口找。',
  openGuide: '打开指南',
  needShortcutsTitle: '按要办的事找',
  clearFilters: '清除筛选'
} as const

export const guideNeedShortcuts = [
  { label: '报到', query: '报到', category: 'arrival' as const },
  { label: '费用资助', query: '学费', category: 'arrival' as const },
  { label: '找宿舍', query: '宿舍', category: 'campus' as const },
  { label: '吃饭', query: '食堂', category: 'campus' as const },
  { label: '校园网', query: '校园网', category: 'campus' as const },
  { label: '图书馆', query: '图书馆', category: 'campus' as const },
  { label: '快递', query: '快递', category: 'life' as const },
  { label: '社团', query: '社团', category: 'community' as const }
] as const

export interface GuideListFilterableItem {
  category: string
  title: string
  shortTitle: string
  summary: string
  audience: readonly string[]
  statusText?: string
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
    const text = [guide.title, guide.shortTitle, guide.summary, guide.statusText, ...guide.audience]
      .filter(Boolean)
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

export function guideListReadMinutesLabel(minutes: number | null | undefined): string {
  const value = Math.max(1, Math.round(Number(minutes) || 1))
  return `约 ${value} 分钟`
}

export function guideListStatusToneClass(status: string): string {
  if (status === 'verified') return 'text-green-800'
  if (status === 'awaiting-notice') return 'text-orange-800'
  return 'text-zinc-600'
}

export function guideListStatusDotClass(status: string): string {
  if (status === 'verified') return 'bg-emerald-500'
  if (status === 'awaiting-notice') return 'bg-amber-400'
  return 'bg-zinc-300'
}

export function isGuideNeedShortcutActive(
  shortcut: { query: string, category: GuideListCategoryId },
  options: { query: string, category: string }
): boolean {
  return options.query.trim() === shortcut.query && options.category === shortcut.category
}
