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
  toggleMapDisplayOption,
  withMapLabelSize
} from '../app/utils/map-presentation'
import type { MapPoiStatusFields } from '../app/utils/map-presentation'
import type { MapArea } from '../map/core/types'
import type { PublicMapPlace } from '../app/utils/public-catalog'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

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
  assert.match(pageSource, /mapCategories/)
  assert.doesNotMatch(pageSource, /const categories: MapCategory\[\] = \[/)
  assert.doesNotMatch(pageSource, /这个点来自你提供的高德地图标点，可以先导航到附近/)
  assert.match(utilSource, /export function buildMapPoiUseChecklist/)
  assert.match(utilSource, /export function resolveMapPoiStatusText/)
  assert.match(utilSource, /export function filterPublicMapPlacesForMapList/)
  assert.match(utilSource, /export function resolveMobileSheetHeightClass/)
  assert.match(utilSource, /export const mapCategories/)
})

test('map data labels and fallback messages follow scope and data readiness', () => {
  assert.equal(resolveMapDataLabel({
    publishedCount: 2,
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null
  }), '已发布目录')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 3,
    hasPublicPlaceError: false,
    activeScope: null
  }), '高德地图标点')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 0,
    hasPublicPlaceError: true,
    activeScope: null
  }), '静态目录')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: 'nearby'
  }), '周边生活')
  assert.equal(resolveMapDataLabel({
    publishedCount: 0,
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null
  }), '官网文字编号索引')

  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 1,
    hasPublicPlaceError: false,
    activeScope: null,
    publishedCount: 0
  }) ?? '', /76 个标点/)
  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: true,
    activeScope: null,
    publishedCount: 0
  }) ?? '', /公开地点暂时不可用/)
  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: 'nearby',
    publishedCount: 0
  }) ?? '', /周边地点/)
  assert.match(resolveMapFallbackMessage({
    ownerMapCount: 0,
    hasPublicPlaceError: false,
    activeScope: null,
    publishedCount: 0
  }) ?? '', /47 项文字编号/)
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

  assert.equal(resolveMapPoiStatusText(samplePoi({ pointIsVerified: true })), '入口位置已现场核对')
  assert.match(resolveMapPoiStatusText(samplePoi()), /入口细节请现场确认/)
  assert.match(resolveMapPoiStatusText(samplePoi({
    coordinateVerification: 'native-map-session'
  })), /临时查看/)

  const provided = ['现场先看指示牌']
  assert.deepEqual(buildMapPoiUseChecklist(samplePoi({ usageChecklist: provided })), provided)

  const owner = buildMapPoiUseChecklist(samplePoi())
  assert.match(owner[0]!, /高德地图标点/)
  assert.match(owner.join('\n'), /宿管|辅导员/)

  const express = buildMapPoiUseChecklist(samplePoi({ category: 'express' }))
  assert.match(express.join('\n'), /取件码/)

  const native = buildMapPoiUseChecklist(samplePoi({
    coordinateVerification: 'native-map-session',
    category: 'nearby'
  }))
  assert.match(native[0]!, /临时地点/)

  assert.equal(buildMapPoiLocationCopyText(samplePoi()), '旧区1号楼 · 编号 12 · 旧区 · 马甲镇')
  assert.equal(formatMapAreaSquareMeters(null), '暂无数据')
  assert.match(formatMapAreaSquareMeters(12500), /1\.25 公顷/)
  assert.equal(formatMapPerimeter(null), '暂无数据')
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

  assert.equal(resolveMobileSheetHeightClass('collapsed'), 'h-20')
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
  assert.match(source, /findPublicMapPlaceByOfficialPlanNumber/)
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
  assert.equal(resolveMapUnsupportedBaseStyleMessage(), '当前地图不支持该图层')

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
