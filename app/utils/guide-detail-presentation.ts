export const guideFallbackMessages = {
  staticGuide: '当前显示已整理的新生指南；涉及时间、地点、材料和费用的事项仍以学校最新通知为准。'
} as const

export interface GuideRelatedAction {
  label: string
  to: string
  icon: string
}

export interface GuideDetailSourceLike {
  title: string
  url: string
  publisher: string
  accessedAt: string
  context?: string | null
  status?: string | null
}

export interface GuideDetailSourceView {
  key: string
  title: string
  url: string
  meta: string
  note: string | undefined
  unavailable: boolean
}

export interface GuideSectionsWithSources {
  sources?: ReadonlyArray<GuideDetailSourceLike> | null
}

export function resolveGuideFallbackMessage(isApiPublished: boolean): string | null {
  if (isApiPublished) return null
  return guideFallbackMessages.staticGuide
}

export function resolveGuideRelatedAction(slug: string): GuideRelatedAction {
  if (slug === 'arrival') {
    return { label: '打开可勾选报到流程', to: '/procedures/arrival', icon: 'i-lucide-list-checks' }
  }
  if (slug === 'find-campus') {
    return { label: '打开校园地图', to: '/map', icon: 'i-lucide-map' }
  }
  if (slug === 'clubs') {
    return { label: '查看校园与社团', to: '/campus#clubs', icon: 'i-lucide-users-round' }
  }
  return { label: '返回全部指南', to: '/guides', icon: 'i-lucide-layout-grid' }
}

export function buildGuideDetailSources(
  guideSources: ReadonlyArray<GuideDetailSourceLike> | null | undefined,
  sections: ReadonlyArray<GuideSectionsWithSources> | null | undefined = []
): GuideDetailSourceView[] {
  const seen = new Set<string>()
  return [
    ...(guideSources ?? []),
    ...(sections ?? []).flatMap(section => section.sources ?? [])
  ].filter((source) => {
    if (seen.has(source.url)) return false
    seen.add(source.url)
    return true
  }).map(source => ({
    key: source.url,
    title: source.title,
    url: source.url,
    meta: source.publisher + ' · 访问于 ' + source.accessedAt,
    note: source.context ?? undefined,
    unavailable: source.status === 'unavailable' || source.status === 'disputed'
  }))
}
