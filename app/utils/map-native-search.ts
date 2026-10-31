import type { MapPoi } from '~~/map/core/types'
import type { PublicMapPlace } from './public-catalog'
import { equivalentMapSearchTerms } from './map-search'

type MapPlaceScope = PublicMapPlace['scope']

interface NativeSearchRequest {
  query: string
  version: number
}

export interface NativeSearchRequestGate {
  begin: (query: string) => NativeSearchRequest
  isCurrent: (request: NativeSearchRequest, currentQuery: string) => boolean
  invalidate: () => void
}

export function createNativeSearchRequestGate(): NativeSearchRequestGate {
  let version = 0

  return {
    begin(query) {
      return { query: query.trim(), version: ++version }
    },
    isCurrent(request, currentQuery) {
      return request.version === version && request.query === currentQuery.trim()
    },
    invalidate() {
      ++version
    }
  }
}

/** 高德 marker 导航链接（前端解码坐标后拼装，公共出口不再下发含坐标的 URL）。 */
export function buildAmapMarkerNavigationUrl(
  point: { lng: number, lat: number },
  name?: string | null
): string {
  const navigation = new URL('https://uri.amap.com/marker')
  navigation.searchParams.set('position', `${point.lng},${point.lat}`)
  if (name) navigation.searchParams.set('name', name)
  navigation.searchParams.set('coordinate', 'gaode')
  navigation.searchParams.set('callnative', '0')
  return navigation.toString()
}

export function createNativeMapPlace(
  poi: MapPoi,
  scope: MapPlaceScope | null
): PublicMapPlace {
  const navigation = buildAmapMarkerNavigationUrl(poi.point, poi.name)

  return {
    id: poi.id,
    slug: null,
    name: poi.name,
    scope: scope ?? 'nearby',
    category: poi.category,
    summary: '这是高德地图在当前视野里找到的地点。可以临时查看和导航，但刷新后不会加入学校地点目录。',
    body: '这是高德地图在当前视野里找到的地点。可以临时查看和导航，但刷新后不会加入学校地点目录。',
    address: poi.address ?? null,
    campusArea: null,
    openingHours: null,
    phone: null,
    usageChecklist: [],
    point: poi.point,
    pointIsVerified: false,
    usesPreviewPoint: false,
    referenceLabel: '高德地图临时地点',
    officialPlanNumber: null,
    coordinateVerification: 'native-map-session',
    coordinateSystem: 'GCJ-02',
    navigationUrl: navigation.toString(),
    isApiPublished: false,
    searchText: [poi.name, poi.address, '高德 原生 商家 当前地图'].filter(Boolean).join(' ')
  }
}

export function buildNativeSearchPlaces(
  results: MapPoi[],
  catalogPlaces: PublicMapPlace[],
  scope: MapPlaceScope | null
): PublicMapPlace[] {
  const catalogNames = new Set(
    catalogPlaces.flatMap(place => equivalentMapSearchTerms(place.name))
  )

  return results
    .filter((poi) => {
      // Only drop a native hit when it is EXACTLY the same merchant as a
      // catalog place (normalized name equality). Substring overlap was too
      // aggressive: searching "串烧烤肉" returned several nearby merchants
      // and any overlap with a catalog term filtered ALL of them, so the
      // map could never auto-select the searched shop. Exact-match keeps
      // genuine duplicates out while still letting real hits through.
      const nativeNames = equivalentMapSearchTerms(poi.name)
      return !nativeNames.some(name => catalogNames.has(name))
    })
    .map(poi => createNativeMapPlace(poi, scope))
}
