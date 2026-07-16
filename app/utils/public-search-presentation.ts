import type { PublicMapPlace } from './public-catalog'
import type { PublicSearchResultType } from '~~/shared/constants/server'
import type { ApiSearchItem, ApiSearchResponse } from '~~/shared/types/server'

/** Keep in sync with shared/constants/server PUBLIC_SEARCH_RESULT_TYPES (value import avoided for SSR/tsx dual use). */
const PUBLIC_SEARCH_RESULT_TYPES = [
  'place',
  'procedure',
  'guide',
  'department',
  'club',
  'notice'
] as const satisfies readonly PublicSearchResultType[]

export interface PublicSearchResult {
  key: string
  resultType: PublicSearchResultType
  title: string
  summary: string
  typeLabel: string
  icon: string
  to: string
  sourceLabel: string
}

export interface PublicSearchGuideSeed {
  slug: string
  title: string
  shortTitle: string
  summary: string
  audience: string[]
  icon: string
}

export interface PublicSearchDepartmentSeed {
  slug: string
  name: string
  summary: string
}

export interface PublicSearchAreaSeed {
  id: string
  name: string
  description?: string | null
  geometrySource?: string | null
}

export const searchTypePresentation = {
  place: { label: '地点', icon: 'i-lucide-map-pin' },
  procedure: { label: '流程', icon: 'i-lucide-list-checks' },
  guide: { label: '指南', icon: 'i-lucide-notebook-tabs' },
  department: { label: '部门', icon: 'i-lucide-landmark' },
  club: { label: '社团', icon: 'i-lucide-users-round' },
  notice: { label: '公告', icon: 'i-lucide-megaphone' }
} satisfies Record<PublicSearchResultType, { label: string, icon: string }>

export const searchTypeOptions = [
  { label: '全部类型', value: 'all' },
  ...PUBLIC_SEARCH_RESULT_TYPES.map(value => ({
    label: searchTypePresentation[value].label,
    value
  }))
]

export function routeQueryString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

export function routeSearchType(value: unknown): PublicSearchResultType | undefined {
  const candidate = routeQueryString(value)
  return PUBLIC_SEARCH_RESULT_TYPES.find(type => type === candidate)
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/[\s（）()\-_/]/g, '')
}

export function queryVariants(value: string): string[] {
  const normalized = normalizeSearchText(value)
  if (!normalized) return []

  const variants = new Set([normalized])
  if (normalized.includes('教学楼')) variants.add(normalized.replace(/教学楼/g, '楼'))
  if (normalized.endsWith('楼') && !normalized.endsWith('教学楼')) {
    variants.add(normalized.replace(/楼$/, '教学楼'))
  }
  if (normalized.includes('仰恩楼')) variants.add(normalized.replace(/仰恩楼/g, '仰恩教学楼'))
  if (normalized.includes('仰恩教学楼')) variants.add(normalized.replace(/仰恩教学楼/g, '仰恩楼'))
  if (normalized.includes('学生街')) {
    variants.add(normalized.replace(/新区学生街/g, '学生街'))
    variants.add(normalized.replace(/学生街/g, '新区学生街'))
  }

  return [...variants]
}

export function matchesSearchQuery(query: string, values: Array<string | null | undefined>): boolean {
  const haystack = normalizeSearchText(values.filter(Boolean).join(' '))
  return queryVariants(query).some(needle => haystack.includes(needle))
}

export function apiSearchTarget(item: ApiSearchItem): string {
  if (item.entityType === 'place') return `/map?place=${encodeURIComponent(item.slug)}`
  if (item.entityType === 'procedure') return `/procedures/${encodeURIComponent(item.slug)}`
  if (item.kind === 'guide') return `/guides/${encodeURIComponent(item.slug)}`
  if (item.kind === 'department') return `/departments/${encodeURIComponent(item.slug)}`
  if (item.kind === 'club') return `/clubs/${encodeURIComponent(item.slug)}`
  return `/campus#notice-${encodeURIComponent(item.slug)}`
}

export function apiSearchPresentation(item: ApiSearchItem): Pick<PublicSearchResult, 'typeLabel' | 'icon'> {
  const presentation = searchTypePresentation[item.resultType]
  return { typeLabel: presentation.label, icon: presentation.icon }
}

export function mapSourceLabel(place: PublicMapPlace): string {
  if (place.coordinateVerification === 'owner-map-only') return '高德地图标点'
  if (place.usesPreviewPoint) return '学校平面图'
  return '地点目录'
}

export function mapTypeLabel(place: PublicMapPlace): string {
  return place.coordinateVerification === 'owner-map-only' ? '地图标点' : '地图索引'
}

export function mapResultSummary(place: PublicMapPlace): string {
  if (place.coordinateVerification === 'owner-map-only') {
    return place.summary || '已按你提供的高德坐标放到地图上，点开会直接定位；具体入口和开放情况请以现场标识为准。'
  }
  return place.summary || '点开后会进入校园地图；没有精确坐标的平面图地点，会显示文字方位帮助对照。'
}

export function mapAreaSummary(name: string): string {
  return `${name} 是校园绘图区域。点进地图后可以查看边界、面积和周长，图框只做方位参考，不会挡住店铺。`
}

export function searchRouteQuery(
  query: string,
  type?: PublicSearchResultType
): Record<string, string> | undefined {
  if (!query && !type) return undefined
  return {
    ...(query ? { q: query } : {}),
    ...(type ? { type } : {})
  }
}

export function buildSearchErrorMessage(
  hasError: boolean,
  activeType?: PublicSearchResultType
): string {
  if (!hasError) return ''
  return activeType && activeType !== 'place'
    ? '搜索服务暂时不稳定，请稍后再试。'
    : '搜索服务暂时不稳定；如果关键词命中地图目录，下面仍会先显示可用地点。'
}

export function buildPublicSearchResults(input: {
  query: string
  activeType?: PublicSearchResultType
  apiResponse: ApiSearchResponse | null
  hasSearchError: boolean
  mapPlaces: PublicMapPlace[]
  mapAreas: PublicSearchAreaSeed[]
  guides: PublicSearchGuideSeed[]
  departments: PublicSearchDepartmentSeed[]
}): PublicSearchResult[] {
  const query = input.query.trim()
  if (!query) return []

  const activeType = input.activeType
  const apiItems = (input.apiResponse?.items ?? [])
    .filter(item => !activeType || item.resultType === activeType)
  const canUseStaticFallback = !input.hasSearchError && Boolean(input.apiResponse)
  const managedKinds = input.apiResponse?.managedKinds
  const allowStaticGuides = canUseStaticFallback
    && (managedKinds ? !managedKinds.includes('guide') : input.apiResponse?.hasManagedContent === false)
  const allowStaticDepartments = canUseStaticFallback
    && (managedKinds ? !managedKinds.includes('department') : input.apiResponse?.hasManagedContent === false)
  const apiKeys = new Set(apiItems.map(item => `${item.entityType}:${item.kind ?? 'place'}:${item.slug}`))
  const apiDepartmentNames = new Set(apiItems
    .filter(item => item.entityType === 'content' && item.kind === 'department')
    .map(item => normalizeSearchText(item.title)))
  const apiPlaceNames = new Set(apiItems
    .filter(item => item.entityType === 'place')
    .map(item => normalizeSearchText(item.title)))

  const dynamic = apiItems.map((item): PublicSearchResult => ({
    key: `api-${item.entityType}-${item.id}`,
    resultType: item.resultType,
    title: item.title,
    summary: item.summary,
    ...apiSearchPresentation(item),
    to: apiSearchTarget(item),
    sourceLabel: '已发布内容'
  }))

  const mapReferences = (activeType && activeType !== 'place'
    ? []
    : input.mapPlaces)
    .filter(place => (
      place.coordinateVerification === 'owner-map-only'
      || !apiPlaceNames.has(normalizeSearchText(place.name))
    ))
    .filter(place => matchesSearchQuery(query, [
      place.officialPlanNumber,
      place.name,
      place.summary,
      place.address,
      place.referenceLabel,
      place.searchText
    ]))
    .map((place): PublicSearchResult => ({
      key: `map-reference-${place.id}`,
      resultType: 'place',
      title: place.name,
      summary: mapResultSummary(place),
      typeLabel: mapTypeLabel(place),
      icon: 'i-lucide-map-pinned',
      to: `/map?q=${encodeURIComponent(query)}&place=${encodeURIComponent(place.id)}`,
      sourceLabel: mapSourceLabel(place)
    }))

  const mapAreas = (activeType && activeType !== 'place'
    ? []
    : input.mapAreas)
    .filter(area => matchesSearchQuery(query, [
      area.name,
      area.description,
      area.geometrySource === 'wia-shape-batch' ? '不规则区域 边界 面积 周长' : '范围 区域'
    ]))
    .map((area): PublicSearchResult => ({
      key: `map-area-${area.id}`,
      resultType: 'place',
      title: area.name,
      summary: mapAreaSummary(area.name),
      typeLabel: '地点',
      icon: 'i-lucide-pentagon',
      to: `/map?q=${encodeURIComponent(query)}&area=${encodeURIComponent(area.id)}`,
      sourceLabel: '高德绘图区域'
    }))

  const staticGuides = (allowStaticGuides
    && (!activeType || activeType === 'guide')
    ? input.guides
    : [])
    .filter(guide => !apiKeys.has(`content:guide:${guide.slug}`))
    .filter(guide => matchesSearchQuery(query, [guide.title, guide.shortTitle, guide.summary, ...guide.audience]))
    .map((guide): PublicSearchResult => ({
      key: `static-guide-${guide.slug}`,
      resultType: 'guide',
      title: guide.title,
      summary: guide.summary,
      typeLabel: '指南',
      icon: guide.icon,
      to: guide.slug === 'arrival'
        ? '/procedures/arrival'
        : `/guides/${encodeURIComponent(guide.slug)}`,
      sourceLabel: '基础指南'
    }))

  const staticDepartments = (allowStaticDepartments
    && (!activeType || activeType === 'department')
    ? input.departments
    : [])
    .map(department => ({ department, slug: department.slug }))
    .filter(({ department }) => !apiDepartmentNames.has(normalizeSearchText(department.name)))
    .filter(({ department }) => matchesSearchQuery(query, [department.name, department.summary]))
    .map(({ department, slug }): PublicSearchResult => ({
      key: slug,
      resultType: 'department',
      title: department.name,
      summary: department.summary,
      typeLabel: '部门',
      icon: 'i-lucide-landmark',
      to: `/departments/${encodeURIComponent(slug)}`,
      sourceLabel: '官网部门入口'
    }))

  return [...dynamic, ...mapReferences, ...mapAreas, ...staticGuides, ...staticDepartments]
}

export function groupPublicSearchResults(results: PublicSearchResult[]) {
  return PUBLIC_SEARCH_RESULT_TYPES.flatMap((type) => {
    const items = results.filter(result => result.resultType === type)
    return items.length > 0
      ? [{
          type,
          label: searchTypePresentation[type].label,
          icon: searchTypePresentation[type].icon,
          items
        }]
      : []
  })
}

export function buildSearchAnnouncement(input: {
  query: string
  searching: boolean
  searchError: string
  resultCount: number
  groupCount: number
}): string {
  if (!input.query) return '请输入关键词开始搜索。'
  if (input.searching) return `正在搜索“${input.query}”。`
  if (input.searchError) return `动态搜索暂时不可用，当前显示 ${input.resultCount} 项可用结果。`
  return `搜索完成，当前显示 ${input.resultCount} 项匹配结果，分为 ${input.groupCount} 组。`
}
