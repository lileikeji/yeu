export const guideFallbackMessages = {
  staticGuide: '这里先显示已经整理好的指南；时间、地点、材料和费用请以学校最新通知为准。'
} as const

export interface GuideStatePresentation {
  label: string
  color: 'success' | 'warning' | 'neutral'
  icon: string
}

export function guideStatePresentation(status: string): GuideStatePresentation {
  if (status === 'verified') {
    return {
      label: '主要内容明确',
      color: 'success',
      icon: 'i-lucide-circle-check-big'
    }
  }
  if (status === 'awaiting-notice') {
    return {
      label: '等待学校通知',
      color: 'warning',
      icon: 'i-lucide-clock-3'
    }
  }
  return {
    label: '先看已知部分',
    color: 'neutral',
    icon: 'i-lucide-info'
  }
}

export function studentFacingGuideStatusText(value: string): string {
  return value
    .replace(/已确认/g, '已经明确')
    .replace(/待通知/g, '还要等学校通知')
    .replace(/待确认/g, '还要确认')
    .replace(/待发布/g, '还没公布')
    .replace(/已发布/g, '已经公布')
    .replace(/官方求助入口/g, '学校求助入口')
}

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
    return { label: '去完成报到步骤', to: '/procedures/arrival', icon: 'i-lucide-list-checks' }
  }
  if (slug === 'find-campus') {
    return { label: '打开校园地图', to: '/map', icon: 'i-lucide-map' }
  }
  if (slug === 'clubs') {
    return { label: '查看校园与社团', to: '/campus#clubs', icon: 'i-lucide-users-round' }
  }
  return { label: '查看全部指南', to: '/guides', icon: 'i-lucide-layout-grid' }
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
