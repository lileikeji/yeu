import { studentFacingGuideText, type PublicMapPlace } from './public-catalog'
import { resolvePlaceStudentSummary } from './place-detail-presentation'
import { studentFacingProcedureText, studentFacingProcedureTitle } from './procedure-detail-presentation'
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

const ACTION_ORIENTED_SEARCH_TERMS = [
  '报到',
  '校园网',
  '宿舍',
  '快递',
  '缴费',
  '请假',
  '补办',
  '申请',
  '办理',
  '办事',
  '流程',
  '手续',
  '材料',
  '怎么',
  '如何'
] as const

const ACTION_FIRST_SEARCH_RESULT_TYPES = [
  'procedure',
  'guide',
  'place',
  'department',
  'club',
  'notice'
] as const satisfies readonly PublicSearchResultType[]

const BROAD_LIFE_SEARCH_RESULT_TYPE_ORDERS: Readonly<Record<string, readonly PublicSearchResultType[]>> = {
  宿舍: ['guide', 'procedure', 'place', 'department', 'club', 'notice'],
  快递: ['guide', 'place', 'procedure', 'department', 'club', 'notice'],
  外卖: ['guide', 'place', 'procedure', 'department', 'club', 'notice'],
  取餐: ['guide', 'place', 'procedure', 'department', 'club', 'notice'],
  快递点: ['place', 'guide', 'procedure', 'department', 'club', 'notice']
}

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
  procedure: { label: '办事', icon: 'i-lucide-list-checks' },
  guide: { label: '指南', icon: 'i-lucide-notebook-tabs' },
  department: { label: '部门', icon: 'i-lucide-landmark' },
  club: { label: '社团', icon: 'i-lucide-users-round' },
  notice: { label: '公告', icon: 'i-lucide-megaphone' }
} satisfies Record<PublicSearchResultType, { label: string, icon: string }>

export const searchTypeOptions = [
  { label: '全部', value: 'all' },
  ...PUBLIC_SEARCH_RESULT_TYPES.map(value => ({
    label: searchTypePresentation[value].label,
    value
  }))
]

export const popularSearchSuggestions = [
  { label: '新生报到', query: '新生报到', icon: 'i-lucide-clipboard-check' },
  { label: '校园网', query: '校园网', icon: 'i-lucide-wifi' },
  { label: '宿舍', query: '宿舍', icon: 'i-lucide-bed-single' },
  { label: '快递', query: '快递', icon: 'i-lucide-package' },
  { label: '图书馆', query: '图书馆', icon: 'i-lucide-library' },
  { label: '医务室', query: '医务室', icon: 'i-lucide-heart-pulse' }
] as const

export const searchStartingPoints = [
  {
    title: '找校内位置',
    description: '教学楼、宿舍、食堂和常用服务点',
    to: '/map',
    icon: 'i-lucide-map'
  },
  {
    title: '办理校园事项',
    description: '按步骤准备材料，找到负责部门',
    to: '/procedures',
    icon: 'i-lucide-list-checks'
  },
  {
    title: '准备入学生活',
    description: '从报到前到开学后的实用指南',
    to: '/guides',
    icon: 'i-lucide-notebook-tabs'
  },
  {
    title: '看看校园周边',
    description: '吃饭、快递、购物和日常服务',
    to: '/nearby',
    icon: 'i-lucide-store'
  }
] as const

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
  if (normalized === '快递点') variants.add('快递')
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

export function publicSearchApiQueries(value: string): string[] {
  const query = value.trim()
  if (!query) return []

  const normalized = normalizeSearchText(query)
  const queries = new Set([query])
  if (normalized.includes('宿舍') && normalized.includes('报修')) {
    queries.add('报修')
  }
  return [...queries]
}

export function mergePublicSearchApiResponses(
  query: string,
  type: PublicSearchResultType | undefined,
  responses: ApiSearchResponse[]
): ApiSearchResponse {
  const items = [...new Map(
    responses
      .flatMap(response => response.items)
      .map(item => [`${item.resultType}:${item.id}`, item] as const)
  ).values()]

  return {
    query,
    type: type ?? null,
    items,
    total: items.length,
    hasManagedContent: responses.some(response => response.hasManagedContent),
    managedKinds: [...new Set(responses.flatMap(response => response.managedKinds))]
  }
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

export function apiSearchSummary(item: ApiSearchItem): string {
  if (item.entityType === 'place') {
    return resolvePlaceStudentSummary(item.summary, item.title, null, null)
  }
  if (item.entityType === 'procedure') {
    return studentFacingProcedureText(item.summary)
  }
  return studentFacingGuideText(item.summary)
}

export function mapSourceLabel(place: PublicMapPlace): string {
  if (place.coordinateVerification === 'owner-map-only') return '高德地图'
  if (place.usesPreviewPoint) return '学校平面图'
  return '校园地点'
}

export function mapTypeLabel(place: PublicMapPlace): string {
  return place.coordinateVerification === 'owner-map-only' ? '高德地点' : '平面图地点'
}

export function mapResultSummary(place: PublicMapPlace): string {
  if (place.coordinateVerification === 'owner-map-only') {
    return place.summary || '已经放到地图上，点开会直接定位；具体入口和开放情况请以现场标识为准。'
  }
  return place.summary || '点开后会进入校园地图；没有精确坐标的平面图地点，会显示文字方位帮助对照。'
}

export function mapAreaSummary(name: string): string {
  return `点开地图可以查看${name}的大致范围，方便辨认方向；边界只作参考。`
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

export function routeMatchesSearchState(input: {
  routeQuery: unknown
  routeType: unknown
  query: string
  type?: PublicSearchResultType
}): boolean {
  return routeQueryString(input.routeQuery).trim() === input.query
    && routeSearchType(input.routeType) === input.type
}

export function shouldSkipSearchNavigation(input: {
  routeQuery: unknown
  routeType: unknown
  query: string
  type?: PublicSearchResultType
}): boolean {
  return routeMatchesSearchState(input)
}

export function resolveSearchNavigationStaleCorrection(input: {
  navigationId: number
  searchNavigationSequence: number
  routeQuery: unknown
  routeType: unknown
  latestSubmittedQuery: string
  latestSubmittedType?: PublicSearchResultType
}): {
  shouldCorrect: boolean
  query: string
  type?: PublicSearchResultType
} | null {
  if (input.navigationId === input.searchNavigationSequence) return null
  if (routeMatchesSearchState({
    routeQuery: input.routeQuery,
    routeType: input.routeType,
    query: input.latestSubmittedQuery,
    type: input.latestSubmittedType
  })) {
    return null
  }

  return {
    shouldCorrect: true,
    query: input.latestSubmittedQuery,
    type: input.latestSubmittedType
  }
}

export function resolveSearchInputSyncFromRoute(input: {
  pendingSearchNavigations: number
  routeQuery: string
  routeType?: PublicSearchResultType
  latestSubmittedQuery: string
  latestSubmittedType?: PublicSearchResultType
}): {
  shouldUpdateInput: boolean
  searchInput: string | null
  shouldUpdateLatestSubmitted: boolean
  latestSubmittedQuery: string | null
  latestSubmittedType?: PublicSearchResultType
} {
  if (
    input.pendingSearchNavigations > 0
    && (
      input.routeQuery !== input.latestSubmittedQuery
      || input.routeType !== input.latestSubmittedType
    )
  ) {
    return {
      shouldUpdateInput: false,
      searchInput: null,
      shouldUpdateLatestSubmitted: false,
      latestSubmittedQuery: null
    }
  }

  return {
    shouldUpdateInput: true,
    searchInput: input.routeQuery,
    shouldUpdateLatestSubmitted: input.pendingSearchNavigations === 0,
    latestSubmittedQuery: input.routeQuery,
    latestSubmittedType: input.routeType
  }
}

export function buildSearchErrorMessage(
  hasError: boolean,
  activeType?: PublicSearchResultType
): string {
  if (!hasError) return ''
  return activeType && activeType !== 'place'
    ? '现在没搜出来，请稍后再试。'
    : '部分内容暂时没加载出来，先为你显示地图里能找到的地点。'
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
    title: item.entityType === 'procedure' ? studentFacingProcedureTitle(item.title) : item.title,
    summary: apiSearchSummary(item),
    ...apiSearchPresentation(item),
    to: apiSearchTarget(item),
    sourceLabel: '本站整理'
  }))

  const mapReferences = (activeType && activeType !== 'place'
    ? []
    : input.mapPlaces)
    .filter(place => !apiPlaceNames.has(normalizeSearchText(place.name)))
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
      sourceLabel: '地图范围'
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
      sourceLabel: '新生指南'
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
      sourceLabel: '学校官网'
    }))

  return [...dynamic, ...mapReferences, ...mapAreas, ...staticGuides, ...staticDepartments]
}

export function groupPublicSearchResults(results: PublicSearchResult[], query = '') {
  const normalizedQuery = normalizeSearchText(query)
  const resultTypeOrder = BROAD_LIFE_SEARCH_RESULT_TYPE_ORDERS[normalizedQuery]
    ?? (ACTION_ORIENTED_SEARCH_TERMS.some(term => normalizedQuery.includes(term))
      ? ACTION_FIRST_SEARCH_RESULT_TYPES
      : PUBLIC_SEARCH_RESULT_TYPES)

  return resultTypeOrder.flatMap((type) => {
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
  if (input.searchError) return `部分内容暂时没加载出来，当前显示 ${input.resultCount} 项结果。`
  return `搜索完成，当前显示 ${input.resultCount} 项匹配结果，分为 ${input.groupCount} 组。`
}
