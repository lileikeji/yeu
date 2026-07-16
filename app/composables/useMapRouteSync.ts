import type { MapArea } from '~~/map/core/types'
import type { MapProvider } from '~~/map/core/provider'
import type { PublicMapPlace } from '~/utils/public-catalog'
import {
  buildMapRouteQuery,
  mapRouteFiltersChanged,
  resolveMapRouteState,
  type MapRouteQuery
} from '~/utils/map-route-state'
import { resolveMapRouteApplyDecision } from '~/utils/map-presentation'

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

      options.searchQuery.value = state.searchQuery
      options.activeCategory.value = state.activeCategory
      options.selectedPoiId.value = state.selectedPoiId
      options.selectedArea.value = state.selectedArea

      const decision = resolveMapRouteApplyDecision({
        scope: state.scope,
        selectedPoiId: state.selectedPoiId,
        selectedArea: state.selectedArea,
        places: options.places.value,
        filteredPlaces: options.filteredPois.value,
        filtersChanged
      })
      if (decision.forceGeographicView) options.mapViewMode.value = 'geographic'

      await nextTick()
      if (applyVersion !== routeApplyVersion) return

      options.mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
      options.mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)

      if (decision.cameraAction.kind === 'fly-to-poi') {
        options.mapProvider.value?.flyToPoi(decision.cameraAction.poiId)
      } else if (decision.cameraAction.kind === 'refocus-selected-area') {
        options.mapProvider.value?.setSelectedArea(decision.cameraAction.areaId)
      } else if (decision.cameraAction.kind === 'fit-to-pois') {
        options.mapProvider.value?.fitToPois()
      }

      if (decision.scrollToPoiId) options.scrollToPoi(decision.scrollToPoiId)
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
