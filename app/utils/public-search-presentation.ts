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
  { label: '食堂', query: '食堂', icon: 'i-lucide-utensils' },
  { label: '教学楼', query: '教学楼', icon: 'i-lucide-school' },
  { label: '图书馆', query: '图书馆', icon: 'i-lucide-library' },
  { label: '医务室', query: '医务室', icon: 'i-lucide-heart-pulse' },
  { label: '校门', query: '校门', icon: 'i-lucide-fence' },
  { label: '社团', query: '社团', icon: 'i-lucide-users-round' }
] as const

/** Action shortcuts under the search box: same student tone as guides/nearby. */
export const searchNeedShortcuts = [
  { label: '新生报到', query: '新生报到', icon: 'i-lucide-clipboard-check' },
  { label: '连校园网', query: '校园网', icon: 'i-lucide-wifi' },
  { label: '找宿舍', query: '宿舍', icon: 'i-lucide-bed-single' },
  { label: '取快递', query: '快递', icon: 'i-lucide-package' },
  { label: '交学费', query: '缴费', icon: 'i-lucide-wallet' },
  { label: '补办证件', query: '补办', icon: 'i-lucide-id-card' }
] as const

export const searchListMessages = {
  needShortcutsTitle: '按要办的事找',
  emptyMatchTitle: '没找到合适的内容',
  emptyMatchHint: '换个叫法试试，或者直接写“宿舍报修”“校园网登录”这类问题。',
  emptyErrorTitle: '暂时没能完成搜索',
  emptyErrorHint: '请稍后再试，或先从校园地图和新生指南里找找。',
  clearSearch: '换个关键词',
  openMap: '打开校园地图',
  openGuides: '浏览指南',
  openNearby: '看看周边',
  tellUsMissing: '告诉我们还缺什么',
  retrySearch: '重新搜索',
  onlyMap: '在地图里看',
  searching: '正在帮你查找',
  resultHeadingPrefix: '找到',
  resultHeadingSuffix: '项',
  resultQuerySuffix: '的结果',
  jumpToGroups: '快速跳到',
  resultCountPrefix: '下方找到',
  resultCountSuffix: '项相关内容'
} as const

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
    title: '看看吃喝玩乐',
    description: '学生街、马甲周边与泉州市区攻略',
    to: '/nearby',
    icon: 'i-lucide-compass'
  }
] as const

export function isSearchNeedShortcutActive(
  shortcut: { query: string },
  activeQuery: string
): boolean {
  return normalizeSearchText(activeQuery) === normalizeSearchText(shortcut.query)
}

export function searchAlternativeSuggestions(
  activeQuery: string,
  limit = 3
): Array<(typeof popularSearchSuggestions)[number]> {
  const normalizedQuery = normalizeSearchText(activeQuery)
  return popularSearchSuggestions
    .filter(suggestion => normalizeSearchText(suggestion.query) !== normalizedQuery)
    .slice(0, Math.max(0, limit))
}

export function searchResultCountLabel(count: number): string {
  if (count <= 0) return searchListMessages.emptyMatchTitle
  return `${searchListMessages.resultHeadingPrefix} ${count} ${searchListMessages.resultHeadingSuffix}`
}

export function searchMatchCountLabel(count: number): string {
  return `${searchListMessages.resultCountPrefix} ${count} ${searchListMessages.resultCountSuffix}`
}

export function searchResultActionLabel(resultType: PublicSearchResultType): string {
  const labels: Record<PublicSearchResultType, string> = {
    place: '在地图中查看',
    procedure: '查看办理步骤',
    guide: '打开指南',
    department: '查看部门信息',
    club: '了解社团',
    notice: '查看校园通知'
  }
  return labels[resultType]
}

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
  if (normalized.includes('食堂')) variants.add(normalized.replace(/食堂/g, '餐厅'))
  if (normalized.includes('餐厅')) variants.add(normalized.replace(/餐厅/g, '食堂'))
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
    managedKinds: [...new Set(responses.flatMap(response => response.managedKinds))],
    features: [...new Map(
      responses
        .flatMap(response => response.features ?? [])
        .map(feature => [feature.id, feature] as const)
    ).values()]
  }
}

export function matchesSearchQuery(query: string, values: Array<string | null | undefined>): boolean {
  const haystack = normalizeSearchText(values.filter(Boolean).join(' '))
  return queryVariants(query).some(needle => haystack.includes(needle))
}

const requiredActionIntentRules = [
  { queryTerms: ['报修'], resultTerms: ['报修', '维修'] },
  { queryTerms: ['缴费'], resultTerms: ['缴费', '学费', '费用', '收费', '支付'] },
  { queryTerms: ['补办'], resultTerms: ['补办', '挂失', '补领'] }
] as const

/** Keep action searches from matching unrelated content that only shares a broad word such as “宿舍”. */
export function matchesRequiredSearchIntent(
  query: string,
  values: Array<string | null | undefined>
): boolean {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedResult = normalizeSearchText(values.filter(Boolean).join(' '))
  return requiredActionIntentRules.every(rule => (
    !rule.queryTerms.some(term => normalizedQuery.includes(normalizeSearchText(term)))
    || rule.resultTerms.some(term => normalizedResult.includes(normalizeSearchText(term)))
  ))
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
  return place.summary || '点开会切换到学校平面图并标出编号，方便你按图找方向；这里不能直接规划路线。'
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
    : '有些内容暂时没显示出来，先为你保留地图里能找到的地点。'
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
    .filter(item => matchesRequiredSearchIntent(query, [item.title, item.summary, item.category]))
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

  const featureResults = (!activeType || activeType === 'guide'
    ? input.apiResponse?.features ?? []
    : [])
    .map((feature): PublicSearchResult => ({
      key: `system-feature-${feature.id}`,
      resultType: 'guide',
      title: feature.title,
      summary: feature.summary,
      typeLabel: '功能入口',
      icon: feature.icon,
      to: feature.to,
      sourceLabel: '站内功能'
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
    .filter(place => matchesRequiredSearchIntent(query, [
      place.name,
      place.summary,
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
    .filter(area => matchesRequiredSearchIntent(query, [area.name, area.description]))
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
    .filter(guide => matchesRequiredSearchIntent(query, [guide.title, guide.shortTitle, guide.summary]))
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
    .filter(({ department }) => matchesRequiredSearchIntent(query, [department.name, department.summary]))
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

  return [...featureResults, ...dynamic, ...mapReferences, ...mapAreas, ...staticGuides, ...staticDepartments]
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
  if (!input.query) return '输入关键词，或点下方要办的事，就能查找地点、办事和校园信息。'
  if (input.searching) return `正在查找“${input.query}”……`
  if (input.searchError) {
    return input.resultCount > 0
      ? `有些内容暂时没显示出来，先为你找到 ${input.resultCount} 项。`
      : '有些内容暂时没显示出来，请稍后再试。'
  }
  if (input.resultCount === 0) {
    return `没有找到“${input.query}”相关内容。可以换个名称，或直接写想办的事。`
  }
  return input.groupCount > 1
    ? `找到 ${input.resultCount} 项相关内容，已按类别整理。`
    : `找到 ${input.resultCount} 项相关内容。`
}
