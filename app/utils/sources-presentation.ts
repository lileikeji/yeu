import type { ApiSource } from '~~/shared/types/server'

export const sourceLevelLabels: Record<ApiSource['sourceLevel'], string> = {
  A: '官方一手',
  B: '权威或实地核验',
  C: '信息当事方',
  D: '公开线索',
  E: '未分级'
}

export const sourcePlatformLabels: Record<string, string> = {
  'official-website': '学校官网',
  'official-document': '学校公开文件',
  'amap-workmap': '授权地图资料',
  'social-platform': '社交平台资料',
  'government-website': '政府公开网站',
  'school-document': '学校公开材料'
}

export function sourcePlatformLabel(value: string | null | undefined): string {
  if (!value) return '公开资料'
  return sourcePlatformLabels[value] ?? value.replace(/[-_]/g, ' ')
}

export interface SourceLevelGuide {
  level: string
  title: string
  description: string
}

export const sourceLevelGuides: SourceLevelGuide[] = [
  {
    level: '最优先',
    title: '学校或主管部门发布',
    description: '学校官网、主管部门官网、正式通知与公开校历。'
  },
  {
    level: '可确认',
    title: '权威平台或现场记录',
    description: '政府、公共服务运营方、现场记录或可复核的部门答复。'
  },
  {
    level: '看时效',
    title: '当事方公开资料',
    description: '社团、商家或服务提供方自己公开，并且能看清发布时间和适用范围的资料。'
  },
  {
    level: '只作线索',
    title: '地图、社交平台和学生经验',
    description: '这类资料用于发现地点和问题，不能单独支撑报到材料、收费、营业状态等高风险事实。'
  }
]

export interface SourceCarrier {
  sources: ReadonlyArray<ApiSource>
}

export function dateOnly(value: string): string {
  return value.slice(0, 10)
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
