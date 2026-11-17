import type { MapArea } from '~~/map/core/types'
import type { MapProvider } from '~~/map/core/provider'
import type { PublicMapPlace } from '~/utils/public-catalog'
import {
  buildMapRouteQuery,
  mapRouteFiltersChanged,
  mapRouteQueryEqual,
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
  /**
   * 面板的守卫历史层是页面自己 push 的；收起时那次 history.back() 只会把 URL 退回压层前的样子，
   * 既不是用户导航，也不该拿它覆盖本地状态（否则刚点开的地点卡与筛选条件一起被打掉）。
   * 返回 true 表示这一次 route.query 变化由页面自己吞掉。
   */
  consumeSelfNavigation?: () => boolean
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
  // 上一条自己写进去的 URL（fullPath）。用它认领 router.replace 的回声，别把回声当成用户导航。
  let lastWrittenFullPath = ''
  let applyingRouteState = false
  let routeApplyVersion = 0
  // 上一轮真正应用过的选中项：关闭详情时 URL 里的 place 会消失，不能据此重新适配全量视野。
  let lastAppliedSelectionId: string | null = null

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
      lastWrittenFullPath = router.resolve({ query }).fullPath
      void router.replace({ query })
    }, typeof window !== 'undefined' && window.innerWidth < 768
      ? ROUTE_WRITE_DEBOUNCE_MOBILE_MS
      : ROUTE_WRITE_DEBOUNCE_MS)
  })

  watch(() => route.query, async (query, previousQuery) => {
    // 面板收起会撤掉自己的守卫历史层（history.back()），URL 内容没变但 popstate 会送一个新对象进来；
    // 照旧回灌会把用户刚点选的地点清成 null，浮窗一闪就没。内容一致就当没发生。
    // 自己撤层引起的那次回退：URL 会退回压层前的样子，不能拿它回灌状态。
    // 先判它，再动 routeSyncTimer —— 待写的本地改动不能被这次假导航取消。
    if (options.consumeSelfNavigation?.()) return
    if (mapRouteQueryEqual(query as MapRouteQuery, previousQuery as MapRouteQuery | undefined)) return
    // 自己刚写进去的那一条 URL 回灌没有意义：状态本来就是从这边出去的。
    // 关键是它会顺手把「还没写进 URL 的本地选中」清成 null（面板收起时就是这样把刚点开的地点卡打掉的）。
    if (route.fullPath === lastWrittenFullPath) {
      lastWrittenFullPath = ''
      return
    }
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

  function cancelMapRouteSync(): void {
    if (routeSyncTimer) clearTimeout(routeSyncTimer)
    routeSyncTimer = null
    ++routeApplyVersion
  }

  return { cancelMapRouteSync }
}
