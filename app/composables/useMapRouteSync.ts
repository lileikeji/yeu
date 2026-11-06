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
// 手机端逐字输入时不要每个字都写 URL：写一次就触发 route.query 变化 → 回写搜索框，
// 输入法还没提交就被覆盖，表现是「打一个字母就被清空」。移动端延后到 700ms 再落 URL。
const ROUTE_WRITE_DEBOUNCE_MOBILE_MS = 700

export function useMapRouteSync(options: UseMapRouteSyncOptions) {
  const route = useRoute()
  const router = useRouter()
  let routeSyncTimer: ReturnType<typeof setTimeout> | null = null
  // 我们自己写进 URL 的 q，回读时跳过，避免和输入框打架。
  let lastWrittenQuery = ''
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
      lastWrittenQuery = typeof query.q === 'string' ? query.q : ''
      const mobile = typeof window !== 'undefined' && window.innerWidth < 768
      void router.replace({ query })
    }, typeof window !== 'undefined' && window.innerWidth < 768
      ? ROUTE_WRITE_DEBOUNCE_MOBILE_MS
      : ROUTE_WRITE_DEBOUNCE_MS)
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

      const incomingQuery = typeof query.q === 'string' ? query.q : ''
      if (incomingQuery !== lastWrittenQuery) {
        options.searchQuery.value = state.searchQuery
      }
      options.activeCategory.value = state.activeCategory
      options.selectedPoiId.value = state.selectedPoiId
      options.selectedArea.value = state.selectedArea

      const selectionCleared = !state.selectedPoiId && !state.selectedArea && lastAppliedSelectionId !== null
      const decision = resolveMapRouteApplyDecision({
        scope: state.scope,
        selectedPoiId: state.selectedPoiId,
        selectedArea: state.selectedArea,
        places: options.places.value,
        filteredPlaces: options.filteredPois.value,
        filtersChanged,
        selectionCleared
      })
      lastAppliedSelectionId = state.selectedPoiId ?? state.selectedArea?.id ?? null
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

  let lastAppliedSelectionId: string | null = null

  function cancelMapRouteSync(): void {
    if (routeSyncTimer) clearTimeout(routeSyncTimer)
    routeSyncTimer = null
    ++routeApplyVersion
  }

  return { cancelMapRouteSync }
}
