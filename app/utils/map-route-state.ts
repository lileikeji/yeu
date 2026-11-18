import type { MapArea } from '~~/map/core/types'
import type { PublicMapPlace } from './public-catalog'

export type MapRouteQueryValue = string | null | undefined | Array<string | null>
export type MapRouteQuery = Record<string, MapRouteQueryValue>
export type MapRouteScope = PublicMapPlace['scope'] | null

export interface MapResolvedRouteState {
  searchQuery: string
  activeCategory: string
  scope: MapRouteScope
  selectedPoiId: string | null
  selectedArea: MapArea | null
}

interface MapRouteWriteState {
  searchQuery: string
  activeCategory: string
  selectedPoiId: string | null
  selectedAreaId: string | null
}

export function mapQueryValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

export function mapRouteScope(query: MapRouteQuery): MapRouteScope {
  const scope = mapQueryValue(query.scope)
  return scope === 'campus' || scope === 'nearby' ? scope : null
}

export function resolveMapRouteState(
  query: MapRouteQuery,
  categoryIds: ReadonlySet<string>,
  places: PublicMapPlace[],
  areas: MapArea[]
): MapResolvedRouteState {
  const category = mapQueryValue(query.category)
  const place = mapQueryValue(query.place)
  const selectedPoiId = places.find(poi => poi.slug === place || poi.id === place)?.id ?? null
  const area = mapQueryValue(query.area)

  return {
    searchQuery: mapQueryValue(query.q),
    activeCategory: categoryIds.has(category) ? category : 'all',
    scope: mapRouteScope(query),
    selectedPoiId,
    selectedArea: selectedPoiId
      ? null
      : areas.find(candidate => candidate.id === area) ?? null
  }
}

export function buildMapRouteQuery(
  currentQuery: MapRouteQuery,
  state: MapRouteWriteState,
  places: PublicMapPlace[]
): MapRouteQuery {
  const query = { ...currentQuery }
  const searchQuery = state.searchQuery.trim()

  if (searchQuery) query.q = searchQuery
  else delete query.q

  if (state.activeCategory !== 'all') query.category = state.activeCategory
  else delete query.category

  const selected = places.find(poi => poi.id === state.selectedPoiId)
  if (selected) query.place = selected.slug ?? selected.id
  else delete query.place

  if (state.selectedAreaId) query.area = state.selectedAreaId
  else delete query.area

  return query
}

/**
 * URL 里真正承载状态的五个键是否相同。
 * 面板的守卫历史层（pushState / history.back()）只动历史条目、不改 URL，
 * popstate 之后 route.query 会给出内容一致的新对象；这时不能再回灌状态，
 * 否则刚点选的地点会被「没有 place」的旧 URL 清掉，浮窗一闪就没。
 */
export function mapRouteQueryEqual(
  query: MapRouteQuery,
  previousQuery: MapRouteQuery | undefined
): boolean {
  if (!previousQuery) return false
  return mapQueryValue(query.q) === mapQueryValue(previousQuery.q)
    && mapQueryValue(query.category) === mapQueryValue(previousQuery.category)
    && mapQueryValue(query.scope) === mapQueryValue(previousQuery.scope)
    && mapQueryValue(query.place) === mapQueryValue(previousQuery.place)
    && mapQueryValue(query.area) === mapQueryValue(previousQuery.area)
}

export function mapRouteFiltersChanged(
  query: MapRouteQuery,
  previousQuery: MapRouteQuery | undefined
): boolean {
  return mapQueryValue(query.q) !== mapQueryValue(previousQuery?.q)
    || mapQueryValue(query.category) !== mapQueryValue(previousQuery?.category)
    || mapQueryValue(query.scope) !== mapQueryValue(previousQuery?.scope)
}
