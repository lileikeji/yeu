import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { PublicMapPlace } from '../app/utils/public-catalog'
import {
  apiSearchPresentation,
  apiSearchSummary,
  apiSearchTarget,
  buildPublicSearchResults,
  buildSearchAnnouncement,
  buildSearchErrorMessage,
  groupPublicSearchResults,
  mergePublicSearchApiResponses,
  mapAreaSummary,
  mapResultSummary,
  mapSourceLabel,
  mapTypeLabel,
  matchesSearchQuery,
  normalizeSearchText,
  popularSearchSuggestions,
  publicSearchApiQueries,
  queryVariants,
  resolveSearchInputSyncFromRoute,
  resolveSearchNavigationStaleCorrection,
  routeMatchesSearchState,
  routeQueryString,
  routeSearchType,
  searchRouteQuery,
  searchStartingPoints,
  searchTypeOptions,
  searchTypePresentation,
  shouldSkipSearchNavigation
} from '../app/utils/public-search-presentation'
import type { ApiSearchItem, ApiSearchResponse } from '../shared/types/server'

const pageSource = readFileSync(resolve('app/pages/search.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/public-search-presentation.ts'), 'utf8')

function place(partial: Partial<PublicMapPlace> & Pick<PublicMapPlace, 'id' | 'name'>): PublicMapPlace {
  return {
    id: partial.id,
    slug: partial.slug ?? partial.id,
    name: partial.name,
    scope: partial.scope ?? 'campus',
    category: partial.category ?? 'facility',
    summary: partial.summary ?? '',
    body: partial.body ?? '',
    address: partial.address ?? null,
    campusArea: partial.campusArea ?? null,
    openingHours: partial.openingHours ?? null,
    phone: partial.phone ?? null,
    usageChecklist: partial.usageChecklist ?? [],
    point: partial.point ?? null,
    pointIsVerified: partial.pointIsVerified ?? false,
    usesPreviewPoint: partial.usesPreviewPoint ?? false,
    referenceLabel: partial.referenceLabel ?? null,
    officialPlanNumber: partial.officialPlanNumber ?? null,
    coordinateVerification: partial.coordinateVerification ?? 'unverified',
    coordinateSystem: partial.coordinateSystem ?? 'gcj02',
    navigationUrl: partial.navigationUrl ?? null,
    isApiPublished: partial.isApiPublished ?? false,
    searchText: partial.searchText ?? partial.name
  }
}

test('search page keeps route/fetch shell and imports presentation util', () => {
  assert.match(pageSource, /from '~~\/app\/utils\/public-search-presentation'/)
  for (const name of [
    'buildPublicSearchResults',
    'buildSearchAnnouncement',
    'buildSearchErrorMessage',
    'groupPublicSearchResults',
    'resolveSearchInputSyncFromRoute',
    'resolveSearchNavigationStaleCorrection',
    'routeQueryString',
    'routeSearchType',
    'searchRouteQuery',
    'shouldSkipSearchNavigation',
    'searchTypeOptions'
  ]) {
    assert.match(pageSource, new RegExp(`\\b${name}\\b`))
  }

  assert.doesNotMatch(pageSource, /function normalize\b/)
  assert.doesNotMatch(pageSource, /function queryVariants\b/)
  assert.doesNotMatch(pageSource, /function matches\b/)
  assert.doesNotMatch(pageSource, /function apiTarget\b/)
  assert.doesNotMatch(pageSource, /function mapSourceLabel\b/)
  assert.doesNotMatch(pageSource, /function routeMatches\b/)
  assert.doesNotMatch(pageSource, /interface SearchResult\b/)
  assert.match(pageSource, /useAsyncData<ApiSearchResponse>/)
  assert.match(pageSource, /router\.replace/)
})

test('presentation util owns pure search builders', () => {
  for (const name of [
    'export function normalizeSearchText',
    'export function queryVariants',
    'export function matchesSearchQuery',
    'export function buildPublicSearchResults',
    'export function groupPublicSearchResults',
    'export function buildSearchAnnouncement',
    'export function buildSearchErrorMessage',
    'export function searchRouteQuery',
    'export function routeMatchesSearchState',
    'export function shouldSkipSearchNavigation',
    'export function resolveSearchNavigationStaleCorrection',
    'export function resolveSearchInputSyncFromRoute'
  ]) {
    assert.match(utilSource, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('local search result type list stays synchronized with shared constants', async () => {
  const { PUBLIC_SEARCH_RESULT_TYPES } = await import('../shared/constants/server')
  assert.deepEqual(
    searchTypeOptions.slice(1).map(item => item.value),
    [...PUBLIC_SEARCH_RESULT_TYPES]
  )
})

test('search type options cover all result types plus all', () => {
  assert.equal(searchTypeOptions[0]?.value, 'all')
  assert.equal(searchTypeOptions[0]?.label, '全部')
  assert.deepEqual(
    searchTypeOptions.slice(1).map(item => item.value),
    Object.keys(searchTypePresentation)
  )
})

test('search empty state offers useful student starting points', () => {
  assert.deepEqual(
    popularSearchSuggestions.map(item => item.query),
    ['新生报到', '校园网', '宿舍', '快递', '图书馆', '医务室']
  )
  assert.deepEqual(
    searchStartingPoints.map(item => item.to),
    ['/map', '/procedures', '/guides', '/nearby']
  )
  assert.match(pageSource, /v-for="suggestion in popularSearchSuggestions"/)
  assert.match(pageSource, /v-for="item in searchStartingPoints"/)
  assert.match(pageSource, /大家常找/)
  assert.match(pageSource, /校园搜索/)
  assert.match(pageSource, /搜索地点、办事或部门/)
  assert.doesNotMatch(pageSource, /地图结果点开后/)
  assert.doesNotMatch(pageSource, /一处查找/)
})

test('route helpers normalize query and type values', () => {
  assert.equal(routeQueryString(' 图书馆 '), ' 图书馆 ')
  assert.equal(routeQueryString(['校园网']), '校园网')
  assert.equal(routeQueryString(['a', 'b']), 'a')
  assert.equal(routeQueryString(undefined), '')
  assert.equal(routeSearchType('place'), 'place')
  assert.equal(routeSearchType('unknown'), undefined)
  assert.equal(routeSearchType(['guide']), 'guide')
  assert.deepEqual(searchRouteQuery('报到', 'procedure'), { q: '报到', type: 'procedure' })
  assert.deepEqual(searchRouteQuery('', 'place'), { type: 'place' })
  assert.equal(searchRouteQuery('', undefined), undefined)
})

test('search navigation decisions stay pure', () => {
  assert.equal(routeMatchesSearchState({
    routeQuery: '图书馆',
    routeType: 'place',
    query: '图书馆',
    type: 'place'
  }), true)
  assert.equal(routeMatchesSearchState({
    routeQuery: '图书馆',
    routeType: 'place',
    query: '图书馆',
    type: 'guide'
  }), false)
  assert.equal(shouldSkipSearchNavigation({
    routeQuery: '  报到  ',
    routeType: undefined,
    query: '报到',
    type: undefined
  }), true)
  assert.equal(shouldSkipSearchNavigation({
    routeQuery: '报到',
    routeType: undefined,
    query: '校园网',
    type: undefined
  }), false)

  assert.equal(resolveSearchNavigationStaleCorrection({
    navigationId: 2,
    searchNavigationSequence: 2,
    routeQuery: 'a',
    routeType: undefined,
    latestSubmittedQuery: 'b',
    latestSubmittedType: undefined
  }), null)
  assert.equal(resolveSearchNavigationStaleCorrection({
    navigationId: 1,
    searchNavigationSequence: 2,
    routeQuery: 'b',
    routeType: 'place',
    latestSubmittedQuery: 'b',
    latestSubmittedType: 'place'
  }), null)
  assert.deepEqual(resolveSearchNavigationStaleCorrection({
    navigationId: 1,
    searchNavigationSequence: 2,
    routeQuery: 'a',
    routeType: undefined,
    latestSubmittedQuery: 'b',
    latestSubmittedType: 'guide'
  }), {
    shouldCorrect: true,
    query: 'b',
    type: 'guide'
  })

  assert.deepEqual(resolveSearchInputSyncFromRoute({
    pendingSearchNavigations: 1,
    routeQuery: 'route-q',
    routeType: 'place',
    latestSubmittedQuery: 'submitted-q',
    latestSubmittedType: 'place'
  }), {
    shouldUpdateInput: false,
    searchInput: null,
    shouldUpdateLatestSubmitted: false,
    latestSubmittedQuery: null
  })
  assert.deepEqual(resolveSearchInputSyncFromRoute({
    pendingSearchNavigations: 1,
    routeQuery: 'same',
    routeType: undefined,
    latestSubmittedQuery: 'same',
    latestSubmittedType: undefined
  }), {
    shouldUpdateInput: true,
    searchInput: 'same',
    shouldUpdateLatestSubmitted: false,
    latestSubmittedQuery: 'same',
    latestSubmittedType: undefined
  })
  assert.deepEqual(resolveSearchInputSyncFromRoute({
    pendingSearchNavigations: 0,
    routeQuery: 'from-route',
    routeType: 'notice',
    latestSubmittedQuery: 'old',
    latestSubmittedType: undefined
  }), {
    shouldUpdateInput: true,
    searchInput: 'from-route',
    shouldUpdateLatestSubmitted: true,
    latestSubmittedQuery: 'from-route',
    latestSubmittedType: 'notice'
  })
})

test('normalize and query variants handle campus name aliases', () => {
  assert.equal(normalizeSearchText(' 仰恩 教学楼 '), '仰恩教学楼')
  assert.ok(queryVariants('仰恩楼').includes('仰恩教学楼'))
  assert.ok(queryVariants('仰恩教学楼').includes('仰恩楼'))
  assert.deepEqual(queryVariants('教学楼A'), ['教学楼a', '楼a'])
  assert.ok(queryVariants('a楼').includes('a教学楼'))
  assert.ok(queryVariants('学生街').includes('新区学生街'))
  assert.ok(queryVariants('新区学生街').includes('学生街'))
  assert.ok(queryVariants('快递点').includes('快递'))
  assert.equal(matchesSearchQuery('仰恩楼', ['仰恩教学楼东侧']), true)
  assert.equal(matchesSearchQuery('不存在', ['图书馆']), false)
})

test('common freshman phrases expand API searches and merge results without duplicates', () => {
  assert.deepEqual(publicSearchApiQueries(' 宿舍报修 '), ['宿舍报修', '报修'])
  assert.deepEqual(publicSearchApiQueries('宿舍维修报修'), ['宿舍维修报修', '报修'])
  assert.deepEqual(publicSearchApiQueries('校园网'), ['校园网'])
  assert.deepEqual(publicSearchApiQueries('   '), [])

  const guide = {
    entityType: 'content',
    resultType: 'guide',
    id: 'guide-dorm',
    slug: 'find-campus',
    title: '找宿舍与教学楼',
    summary: '找楼指南',
    category: 'arrival',
    kind: 'guide',
    updatedAt: '2026-07-20'
  } satisfies ApiSearchItem
  const procedure = {
    entityType: 'procedure',
    resultType: 'procedure',
    id: 'procedure-dorm-repair',
    slug: 'dorm-repair',
    title: '宿舍维修报修',
    summary: '报修流程',
    category: 'life',
    kind: null,
    updatedAt: '2026-07-20'
  } satisfies ApiSearchItem
  const merged = mergePublicSearchApiResponses('宿舍报修', undefined, [
    {
      query: '宿舍报修',
      type: null,
      items: [guide],
      total: 1,
      hasManagedContent: true,
      managedKinds: ['guide']
    },
    {
      query: '报修',
      type: null,
      items: [procedure, guide],
      total: 2,
      hasManagedContent: true,
      managedKinds: ['guide']
    }
  ])
  assert.equal(merged.query, '宿舍报修')
  assert.equal(merged.type, null)
  assert.deepEqual(merged.items.map(item => item.id), ['guide-dorm', 'procedure-dorm-repair'])
  assert.equal(merged.total, 2)
  assert.deepEqual(merged.managedKinds, ['guide'])
})

test('api target and presentation map entity kinds', () => {
  const placeItem = {
    id: '1',
    entityType: 'place',
    kind: null,
    resultType: 'place',
    slug: 'lib',
    title: '图书馆',
    summary: '自习'
  } as ApiSearchItem
  const procedureItem = {
    id: '2',
    entityType: 'procedure',
    kind: null,
    resultType: 'procedure',
    slug: 'arrival',
    title: '报到',
    summary: '流程'
  } as ApiSearchItem
  const guideItem = {
    id: '3',
    entityType: 'content',
    kind: 'guide',
    resultType: 'guide',
    slug: 'network',
    title: '校园网',
    summary: '指南'
  } as ApiSearchItem
  const departmentItem = {
    id: '4',
    entityType: 'content',
    kind: 'department',
    resultType: 'department',
    slug: 'net-center',
    title: '网络中心',
    summary: '部门'
  } as ApiSearchItem
  const clubItem = {
    id: '5',
    entityType: 'content',
    kind: 'club',
    resultType: 'club',
    slug: 'photo',
    title: '摄影社',
    summary: '社团'
  } as ApiSearchItem
  const noticeItem = {
    id: '6',
    entityType: 'content',
    kind: 'notice',
    resultType: 'notice',
    slug: 'welcome',
    title: '欢迎',
    summary: '公告'
  } as ApiSearchItem

  assert.equal(apiSearchTarget(placeItem), '/map?place=lib')
  assert.equal(apiSearchTarget(procedureItem), '/procedures/arrival')
  assert.equal(apiSearchTarget(guideItem), '/guides/network')
  assert.equal(apiSearchTarget(departmentItem), '/departments/net-center')
  assert.equal(apiSearchTarget(clubItem), '/clubs/photo')
  assert.equal(apiSearchTarget(noticeItem), '/campus#notice-welcome')
  assert.deepEqual(apiSearchPresentation(placeItem), {
    typeLabel: '地点',
    icon: 'i-lucide-map-pin'
  })
  assert.equal(
    apiSearchSummary({
      ...placeItem,
      title: '上海楼',
      summary: '上海楼 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护，具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。'
    }),
    '上海楼是校园地点，可以先用地图确认大致方向。具体入口、楼层、开放时间和当前用途请以现场标识或学校通知为准。'
  )
  assert.equal(
    apiSearchSummary({ ...procedureItem, summary: '统一认证仍待核验' }),
    '账号登录仍待确认'
  )
  assert.equal(
    apiSearchSummary({
      ...departmentItem,
      summary: '新生处理校园网、统一认证、VPN、网络故障和信息化服务问题的主管部门入口。'
    }),
    '新生遇到校园网、在校外打开校内系统、网络故障或校园系统问题时，可以找这个部门。'
  )
  assert.equal(
    apiSearchSummary({
      ...departmentItem,
      title: '招生办公室',
      summary: '本科和专升本新生查询招生章程、录取进度、通知书和入学前咨询的官方入口。'
    }),
    '本科和专升本新生可以在这里查询招生章程、录取进度、通知书和入学前咨询。'
  )
})

test('map labels and summaries use student-facing location wording', () => {
  const owner = place({
    id: 'owner-1',
    name: '高德点',
    coordinateVerification: 'owner-map-only',
    summary: ''
  })
  const preview = place({
    id: 'preview-1',
    name: '平面图点',
    usesPreviewPoint: true,
    summary: ''
  })
  const catalog = place({
    id: 'catalog-1',
    name: '目录点',
    summary: '已有摘要'
  })

  assert.equal(mapSourceLabel(owner), '高德地图')
  assert.equal(mapSourceLabel(preview), '学校平面图')
  assert.equal(mapSourceLabel(catalog), '校园地点')
  assert.equal(mapTypeLabel(owner), '高德地点')
  assert.equal(mapTypeLabel(preview), '平面图地点')
  assert.match(mapResultSummary(owner), /已经放到地图上/)
  assert.match(mapResultSummary(preview), /文字方位/)
  assert.equal(mapResultSummary(catalog), '已有摘要')
  assert.match(mapAreaSummary('新区学生街'), /大致范围/)
})

test('buildPublicSearchResults merges api, map and static fallbacks without duplicates', () => {
  const apiResponse: ApiSearchResponse = {
    query: '校园',
    type: null,
    items: [
      {
        id: 'p1',
        entityType: 'place',
        kind: null,
        resultType: 'place',
        slug: 'library',
        title: '图书馆',
        summary: '已发布地点'
      },
      {
        id: 'g1',
        entityType: 'content',
        kind: 'guide',
        resultType: 'guide',
        slug: 'network',
        title: '校园网指南',
        summary: '已发布指南'
      }
    ] as ApiSearchItem[],
    total: 2,
    hasManagedContent: false,
    managedKinds: []
  }

  const results = buildPublicSearchResults({
    query: '校园',
    activeType: undefined,
    apiResponse,
    hasSearchError: false,
    mapPlaces: [
      place({
        id: 'library',
        name: '图书馆',
        coordinateVerification: 'owner-map-only',
        summary: '地图重复点',
        searchText: '校园 图书馆'
      }),
      place({
        id: 'owner-shop',
        name: '校园便利店',
        coordinateVerification: 'owner-map-only',
        searchText: '校园 便利店',
        summary: ''
      })
    ],
    mapAreas: [
      {
        id: 'area-1',
        name: '校园商业区',
        description: '购物',
        geometrySource: 'wia-shape-batch'
      }
    ],
    guides: [
      {
        slug: 'network',
        title: '校园网指南',
        shortTitle: '校园网',
        summary: '静态重复指南',
        audience: ['本科'],
        icon: 'i-lucide-wifi'
      },
      {
        slug: 'arrival',
        title: '校园报到',
        shortTitle: '报到',
        summary: '到校流程',
        audience: ['本科'],
        icon: 'i-lucide-plane'
      }
    ],
    departments: [
      {
        slug: 'net-center',
        name: '网络信息中心',
        summary: '校园网与账号'
      }
    ]
  })

  const keys = results.map(item => item.key)
  assert.ok(keys.includes('api-place-p1'))
  assert.ok(keys.includes('api-content-g1'))
  assert.ok(keys.includes('map-reference-owner-shop'))
  assert.ok(keys.includes('map-area-area-1'))
  assert.ok(keys.includes('static-guide-arrival'))
  assert.ok(keys.includes('net-center'))
  assert.equal(keys.includes('map-reference-library'), false)
  assert.equal(keys.includes('static-guide-network'), false)

  const arrival = results.find(item => item.key === 'static-guide-arrival')
  assert.equal(arrival?.to, '/procedures/arrival')
})

test('buildPublicSearchResults respects active type and managed-kind fallback gates', () => {
  const managedResponse: ApiSearchResponse = {
    query: '报到',
    type: 'guide',
    items: [],
    total: 0,
    hasManagedContent: true,
    managedKinds: ['guide']
  }

  const guideOnly = buildPublicSearchResults({
    query: '报到',
    activeType: 'guide',
    apiResponse: managedResponse,
    hasSearchError: false,
    mapPlaces: [
      place({
        id: 'gate',
        name: '报到大门',
        searchText: '报到'
      })
    ],
    mapAreas: [],
    guides: [
      {
        slug: 'arrival',
        title: '报到指南',
        shortTitle: '报到',
        summary: '流程',
        audience: ['本科'],
        icon: 'i-lucide-plane'
      }
    ],
    departments: [
      {
        slug: 'reg',
        name: '教务处',
        summary: '报到'
      }
    ]
  })

  assert.deepEqual(guideOnly, [])

  const withError = buildPublicSearchResults({
    query: '报到',
    activeType: undefined,
    apiResponse: {
      query: '报到',
      type: null,
      items: [],
      total: 0,
      hasManagedContent: false,
      managedKinds: []
    },
    hasSearchError: true,
    mapPlaces: [
      place({
        id: 'gate',
        name: '报到大门',
        searchText: '报到'
      })
    ],
    mapAreas: [],
    guides: [
      {
        slug: 'arrival',
        title: '报到指南',
        shortTitle: '报到',
        summary: '流程',
        audience: ['本科'],
        icon: 'i-lucide-plane'
      }
    ],
    departments: []
  })

  assert.equal(withError.some(item => item.resultType === 'place'), true)
  assert.equal(withError.some(item => item.resultType === 'guide'), false)
})

test('groupPublicSearchResults and announcement helpers stay stable', () => {
  const grouped = groupPublicSearchResults([
    {
      key: 'g1',
      resultType: 'guide',
      title: '指南',
      summary: 's',
      typeLabel: '指南',
      icon: 'i-lucide-book',
      to: '/guides/a',
      sourceLabel: '新生指南'
    },
    {
      key: 'p1',
      resultType: 'place',
      title: '地点',
      summary: 's',
      typeLabel: '地点',
      icon: 'i-lucide-map-pin',
      to: '/map',
      sourceLabel: '校园地点'
    }
  ])

  assert.deepEqual(grouped.map(group => group.type), ['place', 'guide'])
  assert.equal(grouped[0]?.items.length, 1)
  assert.equal(buildSearchErrorMessage(false, 'place'), '')
  assert.match(buildSearchErrorMessage(true, 'guide'), /稍后再试/)
  assert.match(buildSearchErrorMessage(true, 'place'), /地图里能找到/)
  assert.equal(buildSearchAnnouncement({
    query: '',
    searching: false,
    searchError: '',
    resultCount: 0,
    groupCount: 0
  }), '输入关键词后，就能查找地点、办事、部门和社团。')
  assert.equal(buildSearchAnnouncement({
    query: '图书馆',
    searching: true,
    searchError: '',
    resultCount: 0,
    groupCount: 0
  }), '正在查找“图书馆”……')
  assert.equal(buildSearchAnnouncement({
    query: '图书馆',
    searching: false,
    searchError: 'err',
    resultCount: 2,
    groupCount: 1
  }), '有些内容暂时没显示出来，先为你找到 2 项。')
  assert.equal(buildSearchAnnouncement({
    query: '图书馆',
    searching: false,
    searchError: 'err',
    resultCount: 0,
    groupCount: 0
  }), '有些内容暂时没显示出来，请稍后再试。')
  assert.equal(buildSearchAnnouncement({
    query: '不存在的地点',
    searching: false,
    searchError: '',
    resultCount: 0,
    groupCount: 0
  }), '没有找到“不存在的地点”相关内容。可以换个名称，或直接写想办的事。')
  assert.equal(buildSearchAnnouncement({
    query: '图书馆',
    searching: false,
    searchError: '',
    resultCount: 2,
    groupCount: 1
  }), '找到 2 项相关内容。')
  assert.equal(buildSearchAnnouncement({
    query: '图书馆',
    searching: false,
    searchError: '',
    resultCount: 3,
    groupCount: 2
  }), '找到 3 项相关内容，已按类别整理。')
})

test('search result groups follow the freshman intent behind broad and specific queries', () => {
  const results = [
    {
      key: 'place-dorm',
      resultType: 'place' as const,
      title: '学生宿舍',
      summary: '宿舍区',
      typeLabel: '地点',
      icon: 'i-lucide-map-pin',
      to: '/map?place=dorm',
      sourceLabel: '校园地点'
    },
    {
      key: 'procedure-dorm',
      resultType: 'procedure' as const,
      title: '宿舍入住',
      summary: '入住流程',
      typeLabel: '办事',
      icon: 'i-lucide-list-checks',
      to: '/procedures/dorm',
      sourceLabel: '办事流程'
    },
    {
      key: 'guide-dorm',
      resultType: 'guide' as const,
      title: '宿舍生活指南',
      summary: '生活准备',
      typeLabel: '指南',
      icon: 'i-lucide-notebook-tabs',
      to: '/guides/dorm',
      sourceLabel: '新生指南'
    }
  ]

  assert.deepEqual(
    groupPublicSearchResults(results, '宿舍').map(group => group.type),
    ['guide', 'procedure', 'place']
  )
  assert.deepEqual(
    groupPublicSearchResults(results, '宿舍报修').map(group => group.type),
    ['procedure', 'guide', 'place']
  )
  assert.deepEqual(
    groupPublicSearchResults(results, '快递').map(group => group.type),
    ['guide', 'place', 'procedure']
  )
  assert.deepEqual(
    groupPublicSearchResults(results, '快递点').map(group => group.type),
    ['place', 'guide', 'procedure']
  )
  assert.deepEqual(
    groupPublicSearchResults(results, '上海楼').map(group => group.type),
    ['place', 'procedure', 'guide']
  )
  assert.deepEqual(
    groupPublicSearchResults(results.filter(result => result.resultType === 'place'), '宿舍')
      .map(group => group.type),
    ['place']
  )
  assert.match(pageSource, /groupPublicSearchResults\(results\.value, activeQuery\.value\)/)
})

test('search results offer touch-friendly shortcuts to each visible group', () => {
  assert.match(pageSource, /aria-label="快速跳到结果分类"/)
  assert.match(pageSource, /v-if="groupedResults\.length > 1"/)
  assert.match(pageSource, /:href="`#search-group-\$\{group\.type\}`"/)
  assert.match(pageSource, /class="inline-flex min-h-11[^"]*"/)
  assert.match(pageSource, /\{\{ group\.items\.length \}\} 项/)
  assert.match(pageSource, /class="scroll-mt-20 py-5"/)
})
