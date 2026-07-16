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

function searchTerms(values: Array<string | null | undefined>): string[] {
  return values.flatMap(value => equivalentMapSearchTerms(value ?? ''))
}

export function createNativeMapPlace(
  poi: MapPoi,
  scope: MapPlaceScope | null
): PublicMapPlace {
  const navigation = new URL('https://uri.amap.com/marker')
  navigation.searchParams.set('position', `${poi.point.lng},${poi.point.lat}`)
  navigation.searchParams.set('name', poi.name)
  navigation.searchParams.set('coordinate', 'gaode')
  navigation.searchParams.set('callnative', '0')

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
  const catalogTerms = catalogPlaces.flatMap(place => searchTerms([
    place.name,
    place.searchText
  ]))

  return results
    .filter((poi) => {
      const nativeTerms = searchTerms([poi.name, poi.address])
      return !nativeTerms.some(term => catalogTerms.some(catalogTerm => (
        catalogTerm.includes(term) || term.includes(catalogTerm)
      )))
    })
    .map(poi => createNativeMapPlace(poi, scope))
}
