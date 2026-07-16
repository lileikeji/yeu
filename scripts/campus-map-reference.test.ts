import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { officialCampusPlanAnchors } from '../data/seeds/official-campus-plan-anchors'
import { officialCampusPlanReference } from '../data/seeds/official-campus-plan-reference'
import { campusMapReferencePlaces } from '../data/seeds/preview-places'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import { amapImportedAreas } from '../data/seeds/amap-imported-areas'
import type { ApiPlace } from '../shared/types/server'
import { mergeAmapImportedPlacesWithDrafts, mergePublicMapPlaces } from '../app/utils/public-catalog'

function publishedPlace(id: string, name: string): ApiPlace {
  const timestamp = '2026-07-13T00:00:00.000Z'
  return {
    id,
    slug: id,
    name,
    summary: `${name} 已核验地点`,
    body: '地点说明。\n【到这里前先确认】\n- 后台维护的第一条确认项\n- 后台维护的第二条确认项',
    scope: 'campus',
    type: 'service',
    category: 'service',
    address: null,
    campusArea: null,
    floor: null,
    room: null,
    longitude: 118.605,
    latitude: 25.115,
    coordinateSystem: 'WGS84',
    coordinateVerification: 'verified',
    coordinateVerifiedAt: timestamp,
    coordinatePointRole: 'site-point',
    navigationAvailable: true,
    openingHours: null,
    phone: null,
    website: null,
    externalMapUrl: null,
    isOfficial: true,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: timestamp,
    publishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    sources: []
  }
}

test('official campus diagram index keeps all 47 text-only numbered entries', () => {
  assert.equal(campusMapReferencePlaces.length, 47)
  assert.deepEqual(
    campusMapReferencePlaces.map(place => place.mapNumber),
    Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'))
  )
  assert.equal(new Set(campusMapReferencePlaces.map(place => place.id)).size, 47)
  assert.equal(new Set(campusMapReferencePlaces.map(place => place.name)).size, 47)

  for (const place of campusMapReferencePlaces) {
    assert.equal('point' in place, false)
    assert.equal('longitude' in place, false)
    assert.equal('latitude' in place, false)
  }

  const networkCenter = campusMapReferencePlaces.find(place => place.mapNumber === '16')
  assert.equal(networkCenter?.name, '网络中心')
  assert.ok(networkCenter?.aliases?.includes('网络信息中心'))
})

test('published alias names replace their official text-only reference entries', () => {
  const aliases = [
    ['治安保卫处', '校保卫处'],
    ['网络中心', '网络信息中心'],
    ['祥贤教学楼', '祥贤楼'],
    ['仰恩楼', '仰恩教学楼']
  ] as const
  const published = aliases.map(([, alias], index) => publishedPlace(`published-alias-${index + 1}`, alias))
  const merged = mergePublicMapPlaces(campusMapReferencePlaces, published)

  assert.equal(merged.length, campusMapReferencePlaces.length)
  for (const [officialName, alias] of aliases) {
    assert.equal(merged.some(place => place.name === officialName), false)
    const replacement = merged.find(place => place.name === alias)
    assert.ok(replacement?.pointIsVerified)
    assert.equal(replacement?.usesPreviewPoint, false)
    assert.ok(replacement?.searchText.includes(officialName))
    assert.ok(replacement?.searchText.includes(alias))
    assert.ok(replacement?.searchText.includes(campusMapReferencePlaces.find(place => place.name === officialName)?.mapNumber ?? ''))
    assert.equal(
      replacement?.officialPlanNumber,
      campusMapReferencePlaces.find(place => place.name === officialName)?.mapNumber
    )
  }
})

test('owner-authorized WIA points render as drafts with explicit GCJ-02 AMap navigation', () => {
  assert.equal(amapImportedPlaces.length, 76)
  assert.equal(new Set(amapImportedPlaces.map(place => place.name)).size, 76)
  assert.equal(new Set(amapImportedPlaces.map(place => `${place.point.lng},${place.point.lat}`)).size, 76)

  const merged = mergePublicMapPlaces(campusMapReferencePlaces, [], amapImportedPlaces)
  const ownerViews = merged.filter(place => place.coordinateVerification === 'owner-map-only')
  assert.equal(ownerViews.length, 76)
  assert.ok(ownerViews.every(place => place.point && !place.pointIsVerified))
  assert.ok(ownerViews.every(place => !place.isApiPublished && place.navigationUrl))
  assert.ok(ownerViews.every(place => !place.summary.includes('用户授权的高德工作地图标点，尚未经过独立现场核验')))
  assert.ok(ownerViews.every(place => /现场|通知|到店或电话确认|急救/.test(place.summary)))
  assert.match(ownerViews.find(place => place.name === '长春楼')?.summary ?? '', /宿舍楼标点/)
  assert.match(ownerViews.find(place => place.name === '西苑餐厅')?.summary ?? '', /餐厅|餐饮/)
  assert.match(ownerViews.find(place => place.name === '韵达快递')?.summary ?? '', /取件|快递/)
  assert.match(ownerViews.find(place => place.name === '新区行政楼')?.summary ?? '', /校资助中心|就业中心/)
  for (const [index, place] of ownerViews.entries()) {
    const url = new URL(place.navigationUrl!)
    const source = amapImportedPlaces[index]!.sourcePoint
    assert.deepEqual(place.point, source)
    assert.equal(place.coordinateSystem, 'GCJ-02')
    assert.equal(url.origin, 'https://uri.amap.com')
    assert.equal(url.searchParams.get('coordinate'), 'gaode')
    assert.equal(url.searchParams.get('mode'), 'walk')
    assert.equal(url.searchParams.get('to'), `${source.lng},${source.lat},${place.name}`)
  }
  const yangEnTeachingBuilding = ownerViews.find(place => place.name === '仰恩教学楼')
  assert.equal(yangEnTeachingBuilding?.officialPlanNumber, '08')
  assert.match(yangEnTeachingBuilding?.searchText ?? '', /仰恩楼/)
  assert.match(yangEnTeachingBuilding?.searchText ?? '', /08/)
})

test('managed AMap owner drafts override static imported map points without changing stable ids', () => {
  const mergedSeeds = mergeAmapImportedPlacesWithDrafts(amapImportedPlaces, [{
    id: 'managed-row-49',
    sourceRow: 49,
    slug: 'amap-workmap-20260713-r049',
    name: '辽宁楼',
    summary: '辽宁楼在后台维护后的新生可读说明。',
    body: '后台正文。',
    scope: 'campus',
    type: 'building',
    category: 'dorm',
    address: '仰恩大学新区辽宁楼',
    longitude: 118.59973890906161,
    latitude: 25.103396572681646,
    coordinateSystem: 'GCJ-02',
    coordinateVerification: 'unverified',
    status: 'draft',
    openingHours: null,
    phone: null,
    externalMapUrl: null,
    updatedAt: new Date().toISOString()
  }])

  const seed = amapImportedPlaces.find(place => place.sourceRow === 49)!
  const overridden = mergedSeeds.find(place => place.sourceRow === 49)!
  assert.equal(overridden.id, seed.id)
  assert.equal(overridden.id, 'amap-import-row-049')
  assert.equal(overridden.name, '辽宁楼')
  assert.equal(overridden.summary, '辽宁楼在后台维护后的新生可读说明。')
  assert.equal(overridden.address, '仰恩大学新区辽宁楼')
  assert.deepEqual(overridden.sourcePoint, {
    lng: 118.59973890906161,
    lat: 25.103396572681646,
    crs: 'GCJ-02'
  })

  const mapPlace = mergePublicMapPlaces(campusMapReferencePlaces, [], mergedSeeds)
    .find(place => place.id === 'amap-import-row-049')
  assert.equal(mapPlace?.summary.includes('辽宁楼在后台维护后的新生可读说明'), true)
  assert.deepEqual(mapPlace?.point, {
    lng: 118.59973890906161,
    lat: 25.103396572681646,
    crs: 'GCJ-02'
  })
})

test('published map places expose backend-maintained student use checklist from body', () => {
  const merged = mergePublicMapPlaces(campusMapReferencePlaces, [publishedPlace('service-desk', '服务点')], [])
  const place = merged.find(item => item.id === 'service-desk')
  assert.deepEqual(place?.usageChecklist, [
    '后台维护的第一条确认项',
    '后台维护的第二条确认项'
  ])
  assert.equal(place?.body.includes('【到这里前先确认】'), true)
})

test('owner-authorized WIA areas contain exact closed shapeBatch paths', () => {
  assert.equal(amapImportedAreas.length, 8)
  assert.equal(new Set(amapImportedAreas.map(area => area.id)).size, 8)
  assert.ok(amapImportedAreas.every(area => area.geometrySource === 'wia-shape-batch'))
  assert.ok(amapImportedAreas.every((area) => {
    if (area.geometrySource !== 'wia-shape-batch') return false
    const path = area.paths[0]
    const first = path?.[0]
    const last = path?.at(-1)
    return area.paths.length === 1
      && Boolean(first && last && path && path.length >= 5)
      && path!.every(point => point.crs === 'GCJ-02')
      && first!.lng === last!.lng
      && first!.lat === last!.lat
  }))
  const oldStudentStreet = amapImportedAreas.find(area => area.id === 'wia-area-2003534061878101222')
  assert.equal(oldStudentStreet?.geometrySource, 'wia-shape-batch')
  if (oldStudentStreet?.geometrySource === 'wia-shape-batch') {
    assert.equal(oldStudentStreet.paths[0]?.length, 15)
  }
})

test('official campus plan anchors cover every numbered reference without becoming coordinates', () => {
  const referenceNumbers = new Set(campusMapReferencePlaces.map(place => place.mapNumber))
  const anchorNumbers = new Set(officialCampusPlanAnchors.map(anchor => anchor.mapNumber))
  assert.deepEqual([...anchorNumbers].sort(), [...referenceNumbers].sort())
  assert.ok(officialCampusPlanAnchors.length > campusMapReferencePlaces.length)
  for (const anchor of officialCampusPlanAnchors) {
    assert.ok(anchor.x > 0 && anchor.x < 100)
    assert.ok(anchor.y > 0 && anchor.y < 100)
    assert.deepEqual(Object.keys(anchor).sort(), ['mapNumber', 'x', 'y'])
  }
})

test('committed campus plan asset is the exact reviewed official image', () => {
  const assetPath = resolve('public', officialCampusPlanReference.localAssetUrl.slice(1))
  const bytes = readFileSync(assetPath)
  assert.equal(bytes.byteLength, officialCampusPlanReference.imageContentLength)
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    officialCampusPlanReference.imageSha256
  )
})

test('map page uses the Nuxt auto-import name for the nested map component', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const placeDetailsSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
  const geolocationSource = readFileSync(resolve('app/composables/useMapGeolocation.ts'), 'utf8')
  const geolocationUtilitySource = readFileSync(resolve('app/utils/map-geolocation.ts'), 'utf8')
  const nativeSearchSource = readFileSync(resolve('app/composables/useMapNativeSearch.ts'), 'utf8')
  const nativeSearchUtilitySource = readFileSync(resolve('app/utils/map-native-search.ts'), 'utf8')
  const routeSyncSource = readFileSync(resolve('app/composables/useMapRouteSync.ts'), 'utf8')
  const routeStateSource = readFileSync(resolve('app/utils/map-route-state.ts'), 'utf8')
  const providerLifecycleSource = readFileSync(resolve('app/composables/useMapProviderLifecycle.ts'), 'utf8')
  const mapPresentationSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
  assert.match(source, /<MapOfficialCampusPlan\b/)
  assert.match(source, /label="平面图"/)
  assert.doesNotMatch(source, /label="文字索引"/)
  assert.doesNotMatch(source, /<OfficialCampusPlan\b/)
  assert.match(source, /<MapPlaceDetailsPanel\b/)
  assert.match(placeDetailsSource, /label="地图内路线"/)
  assert.match(source, /useMapGeolocation\(\{/)
  assert.match(source, /startWalkingRoute\(selectedPoi\.name, selectedPoi\.point\)/)
  assert.doesNotMatch(source, /navigator\.geolocation/)
  assert.match(geolocationSource, /planWalkingMapRoute\(\(\) => options\.mapProvider\.value, geolocation, destination\)/)
  assert.match(geolocationSource, /if \(!geolocationFailed\) clearWalkingRoute\(\)/)
  assert.match(geolocationUtilitySource, /provider\.planWalkingRoute\(origin, destination\)/)
  assert.match(mapPresentationSource, /8 个不规则区域边界/)
  assert.match(source, /resolveMapFallbackMessage/)
  assert.match(source, /findPublicMapPlaceByOfficialPlanNumber/)
  assert.match(mapPresentationSource, /place.officialPlanNumber === mapNumber/)
  assert.doesNotMatch(source, /place.officialPlanNumber === mapNumber/)
  assert.match(source, /sidebarCollapsed \? 'md:grid-cols-1'/)
  assert.match(source, /useMapNativeSearch\(\{/)
  assert.doesNotMatch(source, /searchVisiblePois\(query\)|nativeSearchTimer|nativeSearchVersion/)
  assert.match(nativeSearchSource, /provider\.searchVisiblePois\(query\)/)
  assert.match(nativeSearchSource, /requestGate\.isCurrent\(request, options\.searchQuery\.value\)/)
  assert.match(nativeSearchUtilitySource, /buildNativeSearchPlaces/)
  assert.match(source, /filterPublicMapPlacesForMapList/)
  assert.match(source, /filterMapAreasForMapSearch/)
  assert.match(mapPresentationSource, /import \{ areaMatchesQuery, placeMatchesQuery \} from '\.\/map-search'/)
  assert.doesNotMatch(source, /from '~\/utils\/map-search'/)
  assert.match(source, /useMapRouteSync\(\{/)
  assert.doesNotMatch(source, /routeSyncTimer|applyingRouteState|router\.replace/)
  assert.match(routeSyncSource, /router\.replace\(\{ query \}\)/)
  assert.match(routeSyncSource, /deep: true, immediate: true/)
  assert.match(routeSyncSource, /applyVersion !== routeApplyVersion/)
  assert.match(routeStateSource, /buildMapRouteQuery/)
  assert.match(source, /resolveAutoSelectSearchDecision/)
  assert.match(mapPresentationSource, /export function resolveAutoSelectSearchDecision/)
  assert.doesNotMatch(source, /const currentArea = visibleAreas\.find/)
  assert.doesNotMatch(source, /const target = currentArea/)
  assert.match(mapPresentationSource, /export function filterPublicMapPlacesForMapList/)
  assert.match(mapPresentationSource, /export function filterMapAreasForMapSearch/)
  assert.doesNotMatch(source, /const hasQuery = Boolean\(query\)/)
  assert.doesNotMatch(source, /const matchesCategory = hasQuery/)
  assert.match(mapPresentationSource, /高德底图地点 · 临时查看，不加入左侧地点列表/)
  assert.match(source, /resolveMapPoiStatusText/)
  assert.match(source, /const selectedNativePlace = ref<PublicMapPlace \| null>\(null\)/)
  assert.match(source, /selectedNativePlace\.value = selected/)
  assert.match(source, /mapProvider\.value\?\.setSelectedArea\(null\)/)
  assert.match(source, /useMapProviderLifecycle\(\{/)
  assert.doesNotMatch(source, /createRuntimeMapProvider|watch\(sidebarCollapsed/)
  assert.match(providerLifecycleSource, /watch\(options\.resizeSignal,[\s\S]*?options\.mapProvider\.value\?\.resize\(\)/)
  assert.match(source, /const places = computed\(\(\) => catalogPlaces\.value\)/)
  assert.doesNotMatch(source, /\[\.\.\.catalogPlaces\.value,\s*\.\.\.nativeSearch/)
})

test('geographic map keeps a full-height wrapper around provider-owned container styles', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  assert.match(
    source,
    /v-show="mapViewMode === 'geographic'"\s+class="absolute inset-0"[\s\S]*?ref="mapElement"\s+class="h-full w-full"/
  )
  assert.doesNotMatch(source, /ref="mapElement"\s+class="absolute inset-0"/)
})

test('official campus plan renders the reviewed image with hotspots and navigation limitations', () => {
  const source = readFileSync(resolve('app/components/map/OfficialCampusPlan.vue'), 'utf8')
  assert.match(source, /const OFFICIAL_PLAN_IMAGE_URL = officialCampusPlanReference\.localAssetUrl/)
  assert.match(source, /<img/)
  assert.match(source, /v-for="\(anchor, index\) in officialCampusPlanAnchors"/)
  assert.match(source, /emit\('selectNumber', anchor\.mapNumber\)/)
  assert.match(source, /aria-label="放大平面图"/)
  assert.match(source, /aria-label="缩小平面图"/)
  assert.match(source, /仅用于校内方位对照，不作为导航坐标/)
  assert.match(source, />查看来源<\/a>/)
})
