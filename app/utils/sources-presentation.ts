import type { ApiSource } from '~~/shared/types/server'

export const sourceListMessages = {
  serviceUnavailable: '可以稍后再试，各篇指南仍然可以正常查看。',
  emptyMatch: '没有找到匹配的参考页面',
  emptyList: '目前还没有可以查看的参考页面'
} as const

export const sourceLevelLabels: Record<ApiSource['sourceLevel'], string> = {
  A: '学校或主管部门',
  B: '公共服务或现场信息',
  C: '发布方信息',
  D: '地图或同学分享',
  E: '其他公开信息'
}

export const sourcePlatformLabels: Record<string, string> = {
  'official-website': '学校官网',
  'official-document': '学校公开文件',
  'amap-workmap': '高德地图资料',
  'social-platform': '社交平台资料',
  'government-website': '政府公开网站',
  'school-document': '学校公开材料'
}

export function sourcePlatformLabel(value: string | null | undefined): string {
  if (!value) return '公开资料'
  return sourcePlatformLabels[value] ?? value.replace(/[-_]/g, ' ')
}

export function studentFacingSourceTitle(value: string): string {
  const title = value.trim()
  if (/用户授权.*高德.*(?:导入|业主标记)|高德.*(?:工作地图|坐标).*(?:导入|业主标记)/.test(title)) {
    return '高德地图位置参考'
  }
  return title
}

export function studentFacingSourcePublisher(value: string): string {
  const publisher = value.trim()
  if (/业主授权导入|用户授权导入/.test(publisher)) return '地图位置提供者'
  return publisher
}

export interface SourceLevelGuide {
  level: string
  title: string
  description: string
  icon: string
  tone: SourceTone
}

export type SourceTone = 'blue' | 'green' | 'amber' | 'zinc'

export interface SourceLevelAppearance {
  icon: string
  tone: SourceTone
}

export const sourceLevelAppearances: Record<ApiSource['sourceLevel'], SourceLevelAppearance> = {
  A: { icon: 'i-lucide-landmark', tone: 'blue' },
  B: { icon: 'i-lucide-signpost', tone: 'green' },
  C: { icon: 'i-lucide-clock-3', tone: 'amber' },
  D: { icon: 'i-lucide-map-pin-check', tone: 'zinc' },
  E: { icon: 'i-lucide-globe-2', tone: 'zinc' }
}

export const sourceLevelGuides: SourceLevelGuide[] = [
  {
    level: '优先看',
    title: '学校正式通知',
    description: '报到、缴费、学籍和放假安排，优先看学校官网或主管部门的最新通知。',
    icon: 'i-lucide-landmark',
    tone: 'blue'
  },
  {
    level: '可以参考',
    title: '政府服务或现场信息',
    description: '交通、通信和公共服务可以参考运营方说明；到校后的地点信息也可以看现场标识。',
    icon: 'i-lucide-signpost',
    tone: 'green'
  },
  {
    level: '注意时间',
    title: '社团或商家自己发布',
    description: '适合查看招新、营业时间和活动安排，但要先看发布时间，过期二维码不要继续使用。',
    icon: 'i-lucide-clock-3',
    tone: 'amber'
  },
  {
    level: '到现场再看',
    title: '地图和同学分享',
    description: '适合先找地点和了解生活经验；营业情况、收费和办事要求仍以现场或最新通知为准。',
    icon: 'i-lucide-map-pin-check',
    tone: 'zinc'
  }
]

export const sourcePreviewLimit = 8

export function filterSourceList(
  sources: ReadonlyArray<ApiSource>,
  query: string
): ApiSource[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return [...sources]
  return sources.filter(source => [
    source.title,
    studentFacingSourceTitle(source.title),
    source.publisherName,
    studentFacingSourcePublisher(source.publisherName),
    sourcePlatformLabel(source.platform),
    sourceLevelLabels[source.sourceLevel]
  ]
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .includes(normalized))
}

export function buildSourcePreview<T>(
  sources: ReadonlyArray<T>,
  options: { expanded: boolean, filterActive: boolean, limit?: number }
): { items: T[], hiddenCount: number } {
  const limit = Math.max(1, Math.floor(options.limit ?? sourcePreviewLimit))
  if (options.expanded || options.filterActive || sources.length <= limit) {
    return { items: [...sources], hiddenCount: 0 }
  }
  return {
    items: sources.slice(0, limit),
    hiddenCount: sources.length - limit
  }
}

export interface SourceCarrier {
  sources: ReadonlyArray<ApiSource>
}

export function dateOnly(value: string): string {
  return value.slice(0, 10)
}

export function sourceAccessedLabel(value: string): string {
  return `最近查看 ${dateOnly(value)}`
}

export function collectActiveLinkedSources(
  contentItems: ReadonlyArray<SourceCarrier> | null | undefined,
  placeItems: ReadonlyArray<SourceCarrier> | null | undefined
): ApiSource[] {
  const byUrl = new Map<string, ApiSource>()
  const linkedSources = [
    ...(contentItems ?? []).flatMap(content => content.sources),
    ...(placeItems ?? []).flatMap(place => place.sources)
  ]

  for (const source of linkedSources) {
    if (source.status !== 'active') continue
    const existing = byUrl.get(source.url)
    if (!existing || source.accessedAt > existing.accessedAt) byUrl.set(source.url, source)
  }

  return [...byUrl.values()].sort((left, right) => {
    if (left.isOfficial !== right.isOfficial) return left.isOfficial ? -1 : 1
    if (left.sourceLevel !== right.sourceLevel) return left.sourceLevel.localeCompare(right.sourceLevel)
    return left.title.localeCompare(right.title, 'zh-CN')
  })
}
