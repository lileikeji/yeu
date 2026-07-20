import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildMapPlaceDetailsTarget,
  buildMapPlaceFeedbackTarget,
  buildMapPoiLocationCopyText,
  buildMapPoiUseChecklist,
  filterMapAreasForMapSearch,
  filterOwnerMapPlacesInScope,
  filterPublicMapPlacesByScope,
  filterPublicMapPlacesForMapList,
  formatMapAreaSquareMeters,
  formatMapPerimeter,
  MAP_LOAD_ERROR_MESSAGE,
  mapCategories,
  resolveInitialMapViewMode,
  resolveMapCategoryIcon,
  resolveMapCategoryLabel,
  resolveMapDataLabel,
  resolveMapFallbackMessage,
  resolveMapPoiStatusText,
  resolveMobileSheetHeightClass,
  resolveOfficialPlanNumber,
  filterMapAreasForProviderScope,
  findPublicMapPlaceByOfficialPlanNumber,
  resolveAutoSelectSearchDecision,
  resolveMapUnsupportedBaseStyleMessage,
  resolveSelectedMapPoiId,
  resolveSelectedPublicMapPlace,
  buildFilteredMapPois,
  canShowOfficialCampusPlan,
  resolveInitialMapCategoryId,
  resolveInitialSelectedMapPoiId,
  resolveMapPoiClickSelection,
  resolveOfficialPlanHotspotSelectionReset,
  resolveSelectPoiFlyAction,
  resolveSelectPoiMapViewMode,
  resolveSelectPoiMobileSheetState,
  resolveSelectPoiUiDecision,
  shouldClearSelectedMapPoiOnListChange,
  resolveAreaSelectedDecision,
  resolveSelectAreaDecision,
  shouldScrollAfterAutoSelectPoi,
  resolveAutoSelectSearchApply,
  resolveClosePoiDetailsDecision,
  resolveCloseAreaDetailsDecision,
  resolveSetCategoryDecision,
  resolveFitToVisiblePoisDecision,
  resolveSearchQueryChangeReset,
  resolveSelectPoiApplyDecision,
  resolveMapPoiClickApply,
  resolveSelectOfficialPlanNumberDecision,
  toggleMapDisplayOption,
  withMapLabelSize,
  resolveMapViewModeSwitchDecision
} from '../app/utils/map-presentation'
import type { MapPoiStatusFields } from '../app/utils/map-presentation'
import type { MapArea } from '../map/core/types'
import type { PublicMapPlace } from '../app/utils/public-catalog'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
const placeDetailsPanelSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')

function samplePoi(overrides: Partial<MapPoiStatusFields> = {}): MapPoiStatusFields {
  return {
    name: '旧区1号楼',
    referenceLabel: '编号 12',
    campusArea: '旧区',
    address: '马甲镇',
    pointIsVerified: false,
    coordinateVerification: 'owner-map-only',
    coordinateSystem: null,
    usesPreviewPoint: false,
    category: 'dorm',
    usageChecklist: [],
    ...overrides
  }
}

test('map page is a thin shell over map-presentation util for labels and checklists', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/map-presentation['"]/)
  assert.match(pageSource, /buildMapPoiUseChecklist/)
  assert.match(pageSource, /resolveMapPoiStatusText/)
  assert.match(pageSource, /resolveMapFallbackMessage/)
  assert.match(pageSource, /buildMapPlaceDetailsTarget/)
  assert.match(pageSource, /buildMapPlaceFeedbackTarget/)
  assert.match(pageSource, /resolveOfficialPlanNumber/)
  assert.match(pageSource, /filterPublicMapPlacesForMapList/)
  assert.match(pageSource, /filterMapAreasForMapSearch/)
  assert.match(pageSource, /resolveMobileSheetHeightClass/)
  assert.match(pageSource, /resolveInitialMapViewMode/)
  assert.match(pageSource, /resolveMapViewModeSwitchDecision/)
  assert.match(pageSource, /setMapViewMode/)
  assert.match(utilSource, /export function resolveMapViewModeSwitchDecision/)
  assert.match(pageSource, /mapCategories/)
  assert.doesNotMatch(pageSource, /const categories: MapCategory\[\] = \[/)
  assert.doesNotMatch(pageSource, /这个点来自你提供的高德地图标点，可以先导航到附近/)
  assert.match(utilSource, /export function buildMapPoiUseChecklist/)
  assert.match(utilSource, /export function resolveMapPoiStatusText/)
  assert.match(utilSource, /export function filterPublicMapPlacesForMapList/)
  assert.match(utilSource, /export function resolveMobileSheetHeightClass/)
  assert.match(utilSource, /export const mapCategories/)
  assert.match(pageSource, /搜索地点或附近商家/)
  assert.match(pageSource, /地图搜索找到/)
  assert.match(pageSource, /校园范围参考/)
  assert.doesNotMatch(pageSource, /错误标点|高德绘制区域|用户授权的高德地图绘制/)
  assert.doesNotMatch(pageSource, /官网文字索引|当前地图还没有可展示的已确认地点/)
  assert.doesNotMatch(utilSource, /文字目录|官网文字索引|47 个编号/)
})

test('map data labels and fallback messages follow scope and data readiness', () => {
  assert.equal(MAP_LOAD_ERROR_MESSAGE, '可以重新试一次，也可以先查看学校平面图或地点清单。')
  assert.match(pageSource, /地图画面暂时没有显示出来/)
  assert.match(pageSource, /label="重新试一次"/)
  assert.match(pageSource, /label="查看学校平面图"/)
  assert.match(pageSource, /@click="setMapViewMode\('official-plan'\)"/)
  assert.match(
    pageSource,
    /button\[aria-label\^="平面图 "\]::before[\s\S]*?inset: -12px/
  )
  assert.match(
    pageSource,
    /@media \(min-width: 640px\)[\s\S]*?button\[aria-label\^="平面图 "\]::before[\s\S]*?inset: -8px/
  )
  assert.match(pageSource, /z-40 grid place-items-start[^"]*pt-32[^"]*md:place-items-center/)
  assert.match(pageSource, /!bg-green-800 !text-white/)
  assert.doesNotMatch(pageSource, /地图暂时无法载入|label="重新载入"/)
  assert.match(placeDetailsPanelSource, /v-if="props\.canPlanRoute \|\| safeNavigationUrl"/)
  assert.match(
    placeDetailsPanelSource,
    /这个地点目前只能在学校平面图中查看，还不能直接规划路线/
  )

  assert.equal(resolveMapDataLabel({
    publishedCount: 2,
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null
  }), '校园地点')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 3,
    hasPublicPlaceError: false,
    activeScope: null
  }), '校园地点')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 0,
    hasPublicPlaceError: true,
    activeScope: null
  }), '地点清单')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: 'nearby'
  }), '周边生活')
  assert.equal(resolveMapDataLabel({
    publishedCount: 4,
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: 'nearby'
  }), '周边生活')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null
  }), '平面图地点')

  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 1,
    hasPublicPlaceError: false,
    activeScope: null,
    publishedCount: 0
  }) ?? '', /76 个地点/)
  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: true,
    activeScope: null,
    publishedCount: 0
  }) ?? '', /有些校园地点暂时没显示出来/)
  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: 'nearby',
    publishedCount: 0
  }) ?? '', /附近地点还在整理中/)
  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null,
    publishedCount: 0
  }) ?? '', /学校平面图的 47 个地点编号/)
  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null,
    publishedCount: 0
  }) ?? '', /已有地图标点或到校后确认具体入口/)
  assert.equal(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null,
    publishedCount: 4
  }), null)
})

test('map poi checklist status and formatters stay student-facing', () => {
  assert.equal(mapCategories.length, 8)
  assert.equal(resolveMapCategoryLabel('express'), '快递')
  assert.equal(resolveMapCategoryIcon('food'), 'i-lucide-utensils')
  assert.equal(resolveMapCategoryLabel('unknown'), '地点')

  assert.equal(resolveMapPoiStatusText(samplePoi({ pointIsVerified: true })), '入口位置已确认')
  assert.match(resolveMapPoiStatusText(samplePoi()), /入口细节请现场确认/)
  assert.match(resolveMapPoiStatusText(samplePoi({
    coordinateVerification: 'native-map-session'
  })), /仅供本次查看/)

  const provided = ['现场先看指示牌']
  assert.deepEqual(buildMapPoiUseChecklist(samplePoi({ usageChecklist: provided })), provided)

  const owner = buildMapPoiUseChecklist(samplePoi())
  assert.match(owner[0]!, /地图位置/)
  assert.match(owner.join('\n'), /宿管|辅导员/)
  assert.match(owner[2]!, /还需要再次确认/)
  assert.doesNotMatch(owner.join('\n'), /两次现场确认/)

  const express = buildMapPoiUseChecklist(samplePoi({ category: 'express' }))
  assert.match(express.join('\n'), /取件码/)

  const native = buildMapPoiUseChecklist(samplePoi({
    coordinateVerification: 'native-map-session',
    category: 'nearby'
  }))
  assert.match(native[0]!, /临时地点/)

  const preview = samplePoi({
    coordinateVerification: 'preview',
    usesPreviewPoint: true,
    referenceLabel: '平面图编号 29'
  })
  assert.equal(resolveMapPoiStatusText(preview), '平面图编号 29 · 只能在平面图中查看')
  assert.match(buildMapPoiUseChecklist(preview)[0]!, /按编号找方向/)
  assert.doesNotMatch(buildMapPoiUseChecklist(preview).join('\n'), /精确导航|文字方位/)

  assert.equal(buildMapPoiLocationCopyText(samplePoi()), '旧区1号楼 · 编号 12 · 旧区 · 马甲镇')
  assert.equal(formatMapAreaSquareMeters(null), '面积还未整理')
  assert.match(formatMapAreaSquareMeters(12500), /1\.25 公顷/)
  assert.equal(formatMapPerimeter(null), '边界长度还未整理')
  assert.match(formatMapPerimeter(2500), /2\.50 公里/)
  assert.match(formatMapPerimeter(800), /800/)
})

test('buildMapPlaceDetailsTarget only returns published place detail routes', () => {
  assert.deepEqual(
    buildMapPlaceDetailsTarget({ isApiPublished: true, slug: 'nanmen' }, '/map'),
    { path: '/places/nanmen', query: { from: '/map' } }
  )
  assert.equal(
    buildMapPlaceDetailsTarget({ isApiPublished: false, slug: 'nanmen' }, '/map'),
    undefined
  )
  assert.equal(
    buildMapPlaceDetailsTarget({ isApiPublished: true, slug: '' }, '/map'),
    undefined
  )
})

test('buildMapPlaceFeedbackTarget and official plan number stay pure', () => {
  assert.equal(
    buildMapPlaceFeedbackTarget({ isApiPublished: false, id: 'p1', name: '南门' }, '/map'),
    undefined
  )
  assert.deepEqual(
    buildMapPlaceFeedbackTarget({ isApiPublished: true, id: 'p1', name: '南门' }, '/map'),
    {
      path: '/feedback',
      query: {
        targetType: 'place',
        targetId: 'p1',
        targetName: '南门',
        type: 'place_error',
        from: '/map'
      }
    }
  )
  assert.equal(resolveOfficialPlanNumber(null), null)
  assert.equal(resolveOfficialPlanNumber({ officialPlanNumber: '12' }), '12')
  assert.equal(resolveOfficialPlanNumber({ officialPlanNumber: null }), null)
})

test('map list filtering and mobile sheet helpers stay pure', () => {
  function samplePlace(overrides: Partial<import('../app/utils/public-catalog').PublicMapPlace> & Pick<import('../app/utils/public-catalog').PublicMapPlace, 'id' | 'name' | 'scope' | 'category'>): import('../app/utils/public-catalog').PublicMapPlace {
    return {
      id: overrides.id,
      slug: overrides.slug ?? overrides.id,
      name: overrides.name,
      scope: overrides.scope,
      category: overrides.category,
      summary: overrides.summary ?? '',
      body: overrides.body ?? '',
      address: overrides.address ?? null,
      campusArea: overrides.campusArea ?? null,
      openingHours: overrides.openingHours ?? null,
      phone: overrides.phone ?? null,
      usageChecklist: overrides.usageChecklist ?? [],
      point: overrides.point ?? null,
      pointIsVerified: overrides.pointIsVerified ?? false,
      usesPreviewPoint: overrides.usesPreviewPoint ?? false,
      referenceLabel: overrides.referenceLabel ?? null,
      officialPlanNumber: overrides.officialPlanNumber ?? null,
      coordinateVerification: overrides.coordinateVerification ?? 'preview',
      coordinateSystem: overrides.coordinateSystem ?? null,
      navigationUrl: overrides.navigationUrl ?? null,
      isApiPublished: overrides.isApiPublished ?? false,
      searchText: overrides.searchText ?? overrides.name
    }
  }

  const campus = samplePlace({ id: 'c1', name: '南门', scope: 'campus', category: 'gate' })
  const nearby = samplePlace({ id: 'n1', name: '洗衣店', scope: 'nearby', category: 'nearby', searchText: '洗衣店 洗衣' })
  const ownerOnly = samplePlace({
    id: 'o1',
    name: '旧区商业区',
    scope: 'campus',
    category: 'service',
    coordinateVerification: 'owner-map-only'
  })

  assert.deepEqual(
    filterPublicMapPlacesByScope([campus, nearby], 'campus').map(p => p.id),
    ['c1']
  )
  assert.deepEqual(
    filterOwnerMapPlacesInScope([campus, ownerOnly], 'campus').map(p => p.id),
    ['o1']
  )
  assert.deepEqual(
    filterPublicMapPlacesForMapList([campus, nearby, ownerOnly], {
      query: '',
      activeScope: 'campus',
      activeCategory: 'gate'
    }).map(p => p.id),
    ['c1']
  )
  assert.deepEqual(
    filterPublicMapPlacesForMapList([campus, nearby], {
      query: '洗衣',
      activeScope: null,
      activeCategory: 'gate'
    }).map(p => p.id),
    ['n1']
  )

  const area = {
    id: 'a1',
    name: '旧区商业区',
    description: '商铺集中',
    category: 'commercial',
    tags: ['商业'],
    polygon: [
      { lng: 118.9, lat: 25.1 },
      { lng: 118.91, lat: 25.1 },
      { lng: 118.91, lat: 25.11 }
    ],
    center: { lng: 118.905, lat: 25.105 },
    areaSquareMeters: 1000,
    perimeterMeters: 400
  } as import('../map/core/types').MapArea

  assert.deepEqual(
    filterMapAreasForMapSearch([area], { query: '', activeScope: 'campus' }),
    []
  )
  assert.deepEqual(
    filterMapAreasForMapSearch([area], { query: '商业', activeScope: 'nearby' }),
    []
  )
  assert.equal(
    filterMapAreasForMapSearch([area], { query: '商业', activeScope: 'campus' }).length,
    1
  )

  assert.equal(
    resolveMobileSheetHeightClass('collapsed'),
    'h-0 overflow-hidden border-0 shadow-none pointer-events-none'
  )
  assert.equal(resolveMobileSheetHeightClass('half'), 'h-[44%]')
  assert.equal(resolveMobileSheetHeightClass('expanded'), 'h-[calc(100%_-_0.75rem)]')

  assert.equal(resolveInitialMapViewMode({
    activeScope: 'nearby',
    publishedCount: 0,
    ownerMapCount: 0
  }), 'geographic')
  assert.equal(resolveInitialMapViewMode({
    activeScope: null,
    publishedCount: 0,
    ownerMapCount: 0
  }), 'official-plan')
  assert.equal(resolveInitialMapViewMode({
    activeScope: null,
    publishedCount: 2,
    ownerMapCount: 0
  }), 'geographic')
})

const sampleArea: MapArea = {
  id: 'a1',
  name: 'A',
  strokeColor: '#176f46',
  fillColor: '#176f46',
  areaSquareMeters: null,
  perimeterMeters: null,
  paths: [],
  geometrySource: 'wia-shape-batch'
}

const areaFixture2: MapArea = {
  id: 'area-1',
  name: 'Area',
  strokeColor: '#176f46',
  fillColor: '#176f46',
  areaSquareMeters: null,
  perimeterMeters: null,
  paths: [],
  geometrySource: 'wia-shape-batch'
}

function partialPlace(overrides: Partial<PublicMapPlace> & Pick<PublicMapPlace, 'id' | 'name'>): PublicMapPlace {
  return {
    slug: null,
    scope: 'campus',
    category: 'service',
    summary: '',
    body: '',
    address: null,
    campusArea: null,
    openingHours: null,
    phone: null,
    usageChecklist: [],
    point: null,
    pointIsVerified: false,
    usesPreviewPoint: false,
    referenceLabel: null,
    officialPlanNumber: null,
    coordinateVerification: 'preview',
    coordinateSystem: null,
    navigationUrl: null,
    isApiPublished: false,
    searchText: overrides.name,
    ...overrides
  }
}

test('map selection, display options and auto-select decisions stay pure', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const utilSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

  assert.match(source, /resolveAutoSelectSearchDecision/)
  assert.match(source, /resolveSelectedPublicMapPlace/)
  assert.match(source, /toggleMapDisplayOption/)
  assert.match(source, /withMapLabelSize/)
  assert.match(source, /filterMapAreasForProviderScope/)
  assert.match(source, /resolveSelectOfficialPlanNumberDecision/)
  assert.match(utilSource, /export function findPublicMapPlaceByOfficialPlanNumber/)
  assert.match(utilSource, /export function resolveAutoSelectSearchDecision/)
  assert.match(utilSource, /export function toggleMapDisplayOption/)

  const toggled = toggleMapDisplayOption({
    showPois: true,
    showAreas: true,
    showLabels: true,
    autoCluster: true,
    labelSize: 'medium'
  }, 'showLabels')
  assert.equal(toggled.showLabels, false)
  assert.equal(withMapLabelSize(toggled, 'large').labelSize, 'large')
  assert.equal(resolveMapUnsupportedBaseStyleMessage(), '当前地图暂不支持这个显示选项')

  const areas: MapArea[] = [sampleArea]
  assert.deepEqual(filterMapAreasForProviderScope(areas, 'nearby'), [])
  assert.equal(filterMapAreasForProviderScope(areas, 'campus').length, 1)

  assert.equal(resolveSelectedMapPoiId([{ id: 'p1' }, { id: 'p2' }], 'p2'), 'p2')
  assert.equal(resolveSelectedMapPoiId([{ id: 'p1' }], 'missing'), null)

  const placeA = partialPlace({ id: 'p1', name: 'A', officialPlanNumber: '12' })
  const placeB = partialPlace({ id: 'native-1', name: 'B', coordinateVerification: 'native-map-session' })
  assert.equal(resolveSelectedPublicMapPlace({
    places: [placeA],
    selectedNativePlace: placeB,
    nativeSearchResults: [],
    selectedPoiId: 'p1'
  })?.id, 'p1')
  assert.equal(resolveSelectedPublicMapPlace({
    places: [],
    selectedNativePlace: placeB,
    nativeSearchResults: [],
    selectedPoiId: 'native-1'
  })?.id, 'native-1')
  assert.equal(findPublicMapPlaceByOfficialPlanNumber([placeA], '12')?.id, 'p1')
  assert.equal(findPublicMapPlaceByOfficialPlanNumber([placeA], '99'), undefined)

  assert.equal(resolveAutoSelectSearchDecision({
    query: '  ',
    activeCategory: 'all',
    lastAutoLocatedSearchKey: 'x',
    visiblePois: [placeA],
    visibleAreas: [],
    selectedAreaId: null,
    selectedPoiId: null,
    nativeSearchResults: []
  }).action, 'clear-key')

  const selectPoi = resolveAutoSelectSearchDecision({
    query: 'A',
    activeCategory: 'all',
    lastAutoLocatedSearchKey: '',
    visiblePois: [placeA],
    visibleAreas: [],
    selectedAreaId: null,
    selectedPoiId: null,
    nativeSearchResults: []
  })
  assert.equal(selectPoi.action, 'select-poi')
  if (selectPoi.action === 'select-poi') {
    assert.equal(selectPoi.target.id, 'p1')
    assert.equal(selectPoi.autoKey, 'A|all|p1|')
  }

  const sameKey = resolveAutoSelectSearchDecision({
    query: 'A',
    activeCategory: 'all',
    lastAutoLocatedSearchKey: 'A|all|p1|',
    visiblePois: [placeA],
    visibleAreas: [],
    selectedAreaId: null,
    selectedPoiId: null,
    nativeSearchResults: []
  })
  assert.equal(sameKey.action, 'noop')

  const area = areaFixture2
  const selectArea = resolveAutoSelectSearchDecision({
    query: 'Area',
    activeCategory: 'all',
    lastAutoLocatedSearchKey: '',
    visiblePois: [],
    visibleAreas: [area],
    selectedAreaId: null,
    selectedPoiId: null,
    nativeSearchResults: []
  })
  assert.equal(selectArea.action, 'select-area')
  if (selectArea.action === 'select-area') {
    assert.equal(selectArea.targetArea.id, 'area-1')
  }
})

test('selectPoi and map click selection decisions stay pure', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const utilSrc = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

  assert.match(source, /resolveSelectPoiApplyDecision/)
  assert.match(source, /resolveMapPoiClickApply/)
  assert.match(source, /canShowOfficialCampusPlan/)
  assert.match(utilSrc, /export function resolveSelectPoiUiDecision/)
  assert.match(utilSrc, /export function resolveMapPoiClickSelection/)
  assert.match(utilSrc, /export function resolveSelectPoiApplyDecision/)
  assert.match(utilSrc, /export function resolveMapPoiClickApply/)
  assert.doesNotMatch(source, /if \(mobileSheetState\.value === 'collapsed'\) mobileSheetState\.value = 'half'/)
  assert.doesNotMatch(source, /if \(poi\.usesPreviewPoint && canShowOfficialPlan\.value\) mapViewMode\.value = 'official-plan'/)
  assert.doesNotMatch(source, /poi\.coordinateVerification === 'native-map-session' \? poi : null/)

  assert.equal(canShowOfficialCampusPlan('nearby'), false)
  assert.equal(canShowOfficialCampusPlan('campus'), true)
  assert.equal(resolveSelectPoiMobileSheetState('collapsed'), 'collapsed')
  assert.equal(resolveSelectPoiMobileSheetState('half'), 'collapsed')
  assert.equal(resolveSelectPoiMobileSheetState('expanded'), 'collapsed')
  assert.equal(resolveSelectPoiMapViewMode({
    usesPreviewPoint: true,
    canShowOfficialPlan: true,
    currentMode: 'geographic'
  }), 'official-plan')
  assert.equal(resolveSelectPoiMapViewMode({
    usesPreviewPoint: true,
    canShowOfficialPlan: false,
    currentMode: 'geographic'
  }), 'geographic')
  assert.equal(resolveSelectPoiMapViewMode({
    usesPreviewPoint: false,
    canShowOfficialPlan: true,
    currentMode: 'geographic'
  }), 'geographic')

  const previewPlace = partialPlace({
    id: 'preview-1',
    name: 'Preview',
    usesPreviewPoint: true,
    point: { lng: 118.5, lat: 25.1 },
    coordinateVerification: 'owner-map-only'
  })
  const nativePlace = partialPlace({
    id: 'native-2',
    name: 'Native',
    usesPreviewPoint: false,
    point: { lng: 118.6, lat: 25.2 },
    coordinateVerification: 'native-map-session'
  })
  const noPoint = partialPlace({
    id: 'nopoint',
    name: 'NoPoint',
    point: null,
    usesPreviewPoint: false
  })

  assert.equal(resolveSelectPoiFlyAction(previewPlace), 'fly-to-poi')
  assert.equal(resolveSelectPoiFlyAction(nativePlace), 'fly-to-point')
  assert.equal(resolveSelectPoiFlyAction(noPoint), 'none')

  const ui = resolveSelectPoiUiDecision({
    poi: previewPlace,
    mobileSheetState: 'collapsed',
    mapViewMode: 'geographic',
    canShowOfficialPlan: true
  })
  assert.equal(ui.mobileSheetState, 'collapsed')
  assert.equal(ui.mapViewMode, 'official-plan')
  assert.equal(ui.selectedNativePlace, null)
  assert.equal(ui.providerSelectedPoiId, 'preview-1')
  assert.equal(ui.flyAction, 'fly-to-poi')

  const uiNative = resolveSelectPoiUiDecision({
    poi: nativePlace,
    mobileSheetState: 'expanded',
    mapViewMode: 'geographic',
    canShowOfficialPlan: true
  })
  assert.equal(uiNative.mobileSheetState, 'collapsed')
  assert.equal(uiNative.mapViewMode, 'geographic')
  assert.equal(uiNative.selectedNativePlace?.id, 'native-2')
  assert.equal(uiNative.flyAction, 'fly-to-point')

  assert.deepEqual(resolveMapPoiClickSelection({ poi: null, nativePlaceId: null }), {
    clearArea: false,
    selectedPoiId: null,
    expandSidebarAndScroll: false
  })
  assert.deepEqual(resolveMapPoiClickSelection({
    poi: { id: 'catalog-1', source: 'catalog' as never },
    nativePlaceId: null
  }), {
    clearArea: true,
    selectedPoiId: 'catalog-1',
    expandSidebarAndScroll: true
  })
  assert.deepEqual(resolveMapPoiClickSelection({
    poi: { id: 'amap-x', source: 'amap-native' as never },
    nativePlaceId: 'native-resolved'
  }), {
    clearArea: true,
    selectedPoiId: 'native-resolved',
    expandSidebarAndScroll: false
  })
})

test('map initial selection, filtered map pois and list-change clear stay pure', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const utilSrc = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

  assert.match(source, /resolveInitialMapCategoryId/)
  assert.match(source, /resolveInitialSelectedMapPoiId/)
  assert.match(source, /buildFilteredMapPois/)
  assert.match(source, /shouldClearSelectedMapPoiOnListChange/)
  assert.match(source, /resolveSelectOfficialPlanNumberDecision/)
  assert.match(utilSrc, /export function resolveOfficialPlanHotspotSelectionReset/)
  assert.match(utilSrc, /export function shouldClearSelectedMapPoiOnListChange/)
  assert.doesNotMatch(source, /categoryIds\.has\(initialCategory\) \? initialCategory : 'all'/)
  assert.doesNotMatch(source, /selectedIsNativeDetail/)
  assert.doesNotMatch(source, /filteredPois\.value\.flatMap/)

  assert.equal(resolveInitialMapCategoryId('dorm', new Set(['all', 'dorm'])), 'dorm')
  assert.equal(resolveInitialMapCategoryId('missing', new Set(['all', 'dorm'])), 'all')
  assert.equal(resolveInitialMapCategoryId(null, new Set(['all'])), 'all')

  const places = [
    partialPlace({ id: 'p1', name: 'A', slug: 'place-a' }),
    partialPlace({ id: 'p2', name: 'B', slug: 'place-b' })
  ]
  assert.equal(resolveInitialSelectedMapPoiId(places, 'place-b'), 'p2')
  assert.equal(resolveInitialSelectedMapPoiId(places, 'p1'), 'p1')
  assert.equal(resolveInitialSelectedMapPoiId(places, 'nope'), null)
  assert.equal(resolveInitialSelectedMapPoiId(places, null), null)

  const withPoint = partialPlace({
    id: 'geo-1',
    name: 'Geo',
    point: { lng: 118.5, lat: 25.1, crs: 'WGS84' as const },
    pointIsVerified: true,
    coordinateVerification: 'verified',
    coordinateSystem: 'WGS84'
  })
  const withoutPoint = partialPlace({ id: 'no-geo', name: 'NoGeo', point: null })
  const mapPois = buildFilteredMapPois([withPoint, withoutPoint])
  assert.equal(mapPois.length, 1)
  assert.equal(mapPois[0]?.id, 'geo-1')

  assert.equal(shouldClearSelectedMapPoiOnListChange({
    selectedPoiId: null,
    filteredPlaces: places,
    nativeSearchResults: [],
    selectedNativePlaceId: null
  }), false)
  assert.equal(shouldClearSelectedMapPoiOnListChange({
    selectedPoiId: 'p1',
    filteredPlaces: places,
    nativeSearchResults: [],
    selectedNativePlaceId: null
  }), false)
  assert.equal(shouldClearSelectedMapPoiOnListChange({
    selectedPoiId: 'gone',
    filteredPlaces: places,
    nativeSearchResults: [],
    selectedNativePlaceId: null
  }), true)
  assert.equal(shouldClearSelectedMapPoiOnListChange({
    selectedPoiId: 'native-x',
    filteredPlaces: places,
    nativeSearchResults: [{ id: 'native-x' }],
    selectedNativePlaceId: null
  }), false)
  assert.equal(shouldClearSelectedMapPoiOnListChange({
    selectedPoiId: 'native-detail',
    filteredPlaces: places,
    nativeSearchResults: [],
    selectedNativePlaceId: 'native-detail'
  }), false)

  assert.deepEqual(resolveOfficialPlanHotspotSelectionReset(), {
    searchQuery: '',
    activeCategory: 'all',
    sidebarCollapsed: false
  })
})

test('area selected / select area / auto-select apply stay pure', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const utilSrc = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

  assert.match(source, /resolveAreaSelectedDecision/)
  assert.match(source, /resolveSelectAreaDecision/)
  assert.match(source, /resolveAutoSelectSearchApply/)
  assert.match(utilSrc, /export function resolveAreaSelectedDecision/)
  assert.match(utilSrc, /export function resolveSelectAreaDecision/)
  assert.match(utilSrc, /export function shouldScrollAfterAutoSelectPoi/)
  assert.match(utilSrc, /export function resolveAutoSelectSearchApply/)
  assert.doesNotMatch(source, /shouldScrollAfterAutoSelectPoi/)
  assert.doesNotMatch(source, /coordinateVerification !== 'native-map-session'/)

  const area = areaFixture2

  assert.deepEqual(resolveAreaSelectedDecision(null), {
    selectedArea: null,
    providerSelectedAreaId: null,
    clearSelectedPoi: false
  })
  assert.deepEqual(resolveAreaSelectedDecision(area), {
    selectedArea: area,
    providerSelectedAreaId: 'area-1',
    clearSelectedPoi: true
  })
  assert.deepEqual(resolveSelectAreaDecision(area), {
    selectedArea: area,
    selectedPoiId: null,
    selectedNativePlace: null,
    providerSelectedPoiId: null,
    providerSelectedAreaId: 'area-1'
  })

  assert.equal(shouldScrollAfterAutoSelectPoi({
    coordinateVerification: 'verified'
  }), true)
  assert.equal(shouldScrollAfterAutoSelectPoi({
    coordinateVerification: 'native-map-session'
  }), false)

  const catalog = partialPlace({ id: 'c1', name: 'Catalog', coordinateVerification: 'verified' })
  const native = partialPlace({
    id: 'n1',
    name: 'Native',
    coordinateVerification: 'native-map-session'
  })

  assert.deepEqual(resolveAutoSelectSearchApply({ action: 'clear-key' }), { kind: 'clear-key' })
  assert.deepEqual(resolveAutoSelectSearchApply({ action: 'noop' }), { kind: 'noop' })
  assert.deepEqual(resolveAutoSelectSearchApply({
    action: 'select-poi',
    autoKey: 'q|all|c1',
    target: catalog
  }), {
    kind: 'select-poi',
    autoKey: 'q|all|c1',
    target: catalog,
    expandSidebar: true,
    scrollToPoiId: 'c1'
  })
  assert.deepEqual(resolveAutoSelectSearchApply({
    action: 'select-poi',
    autoKey: 'q|all|n1',
    target: native
  }), {
    kind: 'select-poi',
    autoKey: 'q|all|n1',
    target: native,
    expandSidebar: true,
    scrollToPoiId: null
  })
  assert.deepEqual(resolveAutoSelectSearchApply({
    action: 'select-area',
    autoKey: 'q|all|area-1',
    targetArea: area
  }), {
    kind: 'select-area',
    autoKey: 'q|all|area-1',
    targetArea: area,
    expandSidebar: true
  })
})

test('close / category / fit / search-reset decisions stay pure', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const utilSrc = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

  assert.match(source, /resolveClosePoiDetailsDecision/)
  assert.match(source, /resolveCloseAreaDetailsDecision/)
  assert.match(source, /resolveSetCategoryDecision/)
  assert.match(source, /resolveFitToVisiblePoisDecision/)
  assert.match(source, /resolveSearchQueryChangeReset/)
  assert.match(utilSrc, /export function resolveClosePoiDetailsDecision/)
  assert.match(utilSrc, /export function resolveCloseAreaDetailsDecision/)
  assert.match(utilSrc, /export function resolveSetCategoryDecision/)
  assert.match(utilSrc, /export function resolveFitToVisiblePoisDecision/)
  assert.match(utilSrc, /export function resolveSearchQueryChangeReset/)
  assert.doesNotMatch(source, /activeCategory\.value = categoryId\s*\r?\n\s*closePoiDetails\(\)/)
  assert.doesNotMatch(source, /closePoiDetails\(\)\s*\r?\n\s*closeAreaDetails\(\)\s*\r?\n\s*mapProvider\.value\?\.fitToPois\(\)/)
  assert.doesNotMatch(source, /lastAutoLocatedSearchKey = ''\s*\r?\n\s*selectedNativePlace\.value = null\s*\r?\n\s*queueNativeSearch\(\)/)

  assert.deepEqual(resolveClosePoiDetailsDecision(), {
    selectedPoiId: null,
    selectedNativePlace: null,
    providerSelectedPoiId: null
  })
  assert.deepEqual(resolveCloseAreaDetailsDecision(), {
    selectedArea: null,
    providerSelectedAreaId: null
  })
  assert.deepEqual(resolveSetCategoryDecision('food'), {
    activeCategory: 'food',
    selectedPoiId: null,
    selectedNativePlace: null,
    providerSelectedPoiId: null
  })
  assert.deepEqual(resolveFitToVisiblePoisDecision(), {
    selectedPoiId: null,
    selectedNativePlace: null,
    selectedArea: null,
    providerSelectedPoiId: null,
    providerSelectedAreaId: null,
    shouldFitToPois: true
  })
  assert.deepEqual(resolveSearchQueryChangeReset(), {
    lastAutoLocatedSearchKey: '',
    selectedNativePlace: null
  })
})

test('selectPoi apply / map click apply / official plan number decisions stay pure', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const utilSrc = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

  assert.match(source, /resolveSelectPoiApplyDecision/)
  assert.match(source, /resolveMapPoiClickApply/)
  assert.match(source, /resolveSelectOfficialPlanNumberDecision/)
  assert.match(utilSrc, /export function resolveSelectPoiApplyDecision/)
  assert.match(utilSrc, /export function resolveMapPoiClickApply/)
  assert.match(utilSrc, /export function resolveSelectOfficialPlanNumberDecision/)
  assert.doesNotMatch(source, /selectedArea\.value = null\s*\r?\n\s*mapProvider\.value\?\.setSelectedArea\(null\)\s*\r?\n\s*const decision = resolveSelectPoiUiDecision/)
  assert.doesNotMatch(source, /resolveMapPoiClickSelection\(\{/)
  assert.doesNotMatch(source, /findPublicMapPlaceByOfficialPlanNumber\(places\.value/)
  assert.doesNotMatch(source, /resolveOfficialPlanHotspotSelectionReset\(\)/)

  const catalogPoi = partialPlace({
    id: 'place-demo',
    name: 'Demo Building',
    point: { lng: 118.5, lat: 25.1 },
    usesPreviewPoint: false,
    pointIsVerified: true,
    coordinateVerification: 'owner-map-only',
    officialPlanNumber: '08'
  })

  const apply = resolveSelectPoiApplyDecision({
    poi: catalogPoi,
    mobileSheetState: 'collapsed',
    mapViewMode: 'geographic',
    canShowOfficialPlan: true
  })
  assert.equal(apply.selectedArea, null)
  assert.equal(apply.providerSelectedAreaId, null)
  assert.equal(apply.selectedPoiId, 'place-demo')
  assert.equal(apply.selectedNativePlace, null)
  assert.equal(apply.providerSelectedPoiId, 'place-demo')
  assert.equal(apply.mobileSheetState, 'collapsed')
  assert.equal(apply.mapViewMode, 'geographic')
  assert.equal(apply.flyAction, 'fly-to-poi')

  const click = resolveMapPoiClickApply({
    poi: { id: 'place-demo', source: 'catalog' },
    nativePlace: null
  })
  assert.equal(click.clearArea, true)
  assert.equal(click.selectedPoiId, 'place-demo')
  assert.equal(click.selectedNativePlace, null)
  assert.equal(click.providerSelectedPoiId, 'place-demo')
  assert.equal(click.expandSidebarAndScroll, true)
  assert.equal(click.scrollToPoiId, 'place-demo')

  const clickClear = resolveMapPoiClickApply({ poi: null, nativePlace: null })
  assert.equal(clickClear.clearArea, false)
  assert.equal(clickClear.selectedPoiId, null)
  assert.equal(clickClear.expandSidebarAndScroll, false)
  assert.equal(clickClear.scrollToPoiId, null)

  const planHit = resolveSelectOfficialPlanNumberDecision([catalogPoi], '08')
  assert.ok(planHit)
  assert.equal(planHit!.poi.id, 'place-demo')
  assert.equal(planHit!.searchQuery, '')
  assert.equal(planHit!.activeCategory, 'all')
  assert.equal(planHit!.sidebarCollapsed, false)

  const planMiss = resolveSelectOfficialPlanNumberDecision([catalogPoi], '99')
  assert.equal(planMiss, null)
})

test('map/plan mode switch keeps selection and focuses the basemap', () => {
  const withPoint = {
    id: 'p1',
    point: { lng: 118.8, lat: 25.1 },
    usesPreviewPoint: false
  }
  const withoutPoint = {
    id: 'p2',
    point: null,
    usesPreviewPoint: true
  }

  assert.deepEqual(
    resolveMapViewModeSwitchDecision({
      nextMode: 'geographic',
      currentMode: 'geographic',
      selectedPoi: withPoint,
      mobileSheetState: 'half'
    }),
    {
      mapViewMode: 'geographic',
      mobileSheetState: null,
      providerSelectedPoiId: null,
      cameraAction: 'none',
      keepSelection: true
    }
  )

  assert.deepEqual(
    resolveMapViewModeSwitchDecision({
      nextMode: 'official-plan',
      currentMode: 'geographic',
      selectedPoi: withPoint,
      mobileSheetState: 'half'
    }),
    {
      mapViewMode: 'official-plan',
      mobileSheetState: 'collapsed',
      providerSelectedPoiId: null,
      cameraAction: 'none',
      keepSelection: true
    }
  )

  assert.deepEqual(
    resolveMapViewModeSwitchDecision({
      nextMode: 'geographic',
      currentMode: 'official-plan',
      selectedPoi: withPoint,
      mobileSheetState: 'full'
    }),
    {
      mapViewMode: 'geographic',
      mobileSheetState: 'collapsed',
      providerSelectedPoiId: 'p1',
      cameraAction: 'fly-to-point',
      keepSelection: true
    }
  )

  assert.deepEqual(
    resolveMapViewModeSwitchDecision({
      nextMode: 'geographic',
      currentMode: 'official-plan',
      selectedPoi: withoutPoint,
      mobileSheetState: 'half'
    }),
    {
      mapViewMode: 'geographic',
      mobileSheetState: 'collapsed',
      providerSelectedPoiId: 'p2',
      cameraAction: 'fly-to-poi',
      keepSelection: true
    }
  )

  assert.deepEqual(
    resolveMapViewModeSwitchDecision({
      nextMode: 'official-plan',
      currentMode: 'geographic',
      selectedPoi: null,
      mobileSheetState: 'half'
    }),
    {
      mapViewMode: 'official-plan',
      mobileSheetState: null,
      providerSelectedPoiId: null,
      cameraAction: 'none',
      keepSelection: false
    }
  )
})
