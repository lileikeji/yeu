import type { MapArea } from '~~/map/core/types'
import type { MapProvider } from '~~/map/core/provider'
import type { PublicMapPlace } from '~/utils/public-catalog'
import {
  buildMapRouteQuery,
  mapRouteFiltersChanged,
  resolveMapRouteState,
  type MapRouteQuery
} from '~/utils/map-route-state'

type MapViewMode = 'geographic' | 'official-plan'

interface ValueRef<T> {
  value: T
}

interface ReadonlyValueRef<T> {
  readonly value: T
}

interface UseMapRouteSyncOptions {
  categoryIds: ReadonlySet<string>
  places: ReadonlyValueRef<PublicMapPlace[]>
  areas: MapArea[]
  filteredPois: ReadonlyValueRef<PublicMapPlace[]>
  mapProvider: ValueRef<MapProvider | null>
  mapViewMode: ValueRef<MapViewMode>
  searchQuery: ValueRef<string>
  activeCategory: ValueRef<string>
  selectedPoiId: ValueRef<string | null>
  selectedArea: ValueRef<MapArea | null>
  selectedAreaId: ReadonlyValueRef<string | null>
  scrollToPoi: (id: string) => void
}

const ROUTE_WRITE_DEBOUNCE_MS = 180

export function useMapRouteSync(options: UseMapRouteSyncOptions) {
  const route = useRoute()
  const router = useRouter()
  let routeSyncTimer: ReturnType<typeof setTimeout> | null = null
  let applyingRouteState = false
  let routeApplyVersion = 0

  watch([
    options.searchQuery,
    options.activeCategory,
    options.selectedPoiId,
    options.selectedAreaId
  ], () => {
    if (applyingRouteState) return
    if (routeSyncTimer) clearTimeout(routeSyncTimer)

    routeSyncTimer = setTimeout(() => {
      const query = buildMapRouteQuery(route.query as MapRouteQuery, {
        searchQuery: options.searchQuery.value,
        activeCategory: options.activeCategory.value,
        selectedPoiId: options.selectedPoiId.value,
        selectedAreaId: options.selectedAreaId.value
      }, options.places.value)
      void router.replace({ query })
    }, ROUTE_WRITE_DEBOUNCE_MS)
  })

  watch(() => route.query, async (query, previousQuery) => {
    if (routeSyncTimer) clearTimeout(routeSyncTimer)
    routeSyncTimer = null
    const applyVersion = ++routeApplyVersion
    applyingRouteState = true
    try {
      const filtersChanged = mapRouteFiltersChanged(
        query as MapRouteQuery,
        previousQuery as MapRouteQuery | undefined
      )
      const state = resolveMapRouteState(
        query as MapRouteQuery,
        options.categoryIds,
        options.places.value,
        options.areas
      )

      if (state.scope === 'nearby') options.mapViewMode.value = 'geographic'
      options.searchQuery.value = state.searchQuery
      options.activeCategory.value = state.activeCategory
      options.selectedPoiId.value = state.selectedPoiId
      options.selectedArea.value = state.selectedArea

      await nextTick()
      if (applyVersion !== routeApplyVersion) return

      const nextSelected = options.places.value.find(poi => poi.id === options.selectedPoiId.value)
      const selectionIsVisible = Boolean(
        nextSelected && options.filteredPois.value.some(poi => poi.id === nextSelected.id)
      )
      options.mapProvider.value?.setSelectedPoi(
        selectionIsVisible && nextSelected?.point ? nextSelected.id : null
      )
      options.mapProvider.value?.setSelectedArea(options.selectedArea.value?.id ?? null)

      if (selectionIsVisible && nextSelected?.point) {
        options.mapProvider.value?.flyToPoi(nextSelected.id)
      } else if (options.selectedArea.value) {
        options.mapProvider.value?.setSelectedArea(options.selectedArea.value.id)
      } else if (
        filtersChanged
        || (!selectionIsVisible && !options.selectedArea.value)
        || !nextSelected?.point
      ) {
        options.mapProvider.value?.fitToPois()
      }

      if (selectionIsVisible && nextSelected) options.scrollToPoi(nextSelected.id)
    } finally {
      if (applyVersion === routeApplyVersion) applyingRouteState = false
    }
  }, { deep: true, immediate: true })

  function cancelMapRouteSync(): void {
    if (routeSyncTimer) clearTimeout(routeSyncTimer)
    routeSyncTimer = null
    ++routeApplyVersion
  }

  return { cancelMapRouteSync }
}
