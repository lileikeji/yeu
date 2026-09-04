import type { MapProvider } from '~~/map/core/provider'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { buildNativeSearchPlaces, createNativeSearchRequestGate } from '~/utils/map-native-search'

type MapViewMode = 'geographic' | 'official-plan'
type MapPlaceScope = PublicMapPlace['scope']

interface ValueRef<T> {
  value: T
}

interface UseMapNativeSearchOptions {
  mapProvider: ValueRef<MapProvider | null>
  mapViewMode: ValueRef<MapViewMode>
  activeScope: ValueRef<MapPlaceScope | null>
  searchQuery: ValueRef<string>
  catalogPlaces: ValueRef<PublicMapPlace[]>
  onResultsReady: () => void
}

const NATIVE_SEARCH_DEBOUNCE_MS = 320

export function useMapNativeSearch(options: UseMapNativeSearchOptions) {
  const results = ref<PublicMapPlace[]>([])
  const loading = ref(false)
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  const requestGate = createNativeSearchRequestGate()

  function resetResults(): void {
    results.value = []
    loading.value = false
  }

  async function searchNativePlaces(): Promise<void> {
    const query = options.searchQuery.value.trim()
    const provider = options.mapProvider.value
    const request = requestGate.begin(query)
    // 单个字符（尤其英文/拼音单字母）做不了有意义的 POI 搜索，只会让地图乱跳。
    // 站内地点列表的本地过滤不受此限制。
    if (!query || query.length < 2 || provider?.id !== 'amap' || options.mapViewMode.value !== 'geographic') {
      resetResults()
      return
    }

    loading.value = true
    try {
      const nativePois = await provider.searchVisiblePois(query)
      if (!requestGate.isCurrent(request, options.searchQuery.value)) return
      results.value = buildNativeSearchPlaces(
        nativePois,
        options.catalogPlaces.value,
        options.activeScope.value
      )
      await nextTick()
      options.onResultsReady()
    } catch {
      if (requestGate.isCurrent(request, options.searchQuery.value)) results.value = []
    } finally {
      if (requestGate.isCurrent(request, options.searchQuery.value)) loading.value = false
    }
  }

  function queueNativeSearch(): void {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void searchNativePlaces(), NATIVE_SEARCH_DEBOUNCE_MS)
  }

  function cancelNativeSearch(): void {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = null
    requestGate.invalidate()
    resetResults()
  }

  return {
    nativeSearchResults: computed<PublicMapPlace[]>(() => results.value),
    nativeSearchLoading: readonly(loading),
    queueNativeSearch,
    cancelNativeSearch
  }
}
