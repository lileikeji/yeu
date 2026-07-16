import type { MapArea, MapPoi } from '~~/map/core/types'
import type { ComputedRef, Ref } from 'vue'
import type {
  MapBaseStyle,
  MapDisplayOptions,
  MapProvider,
  MapProviderId
} from '~~/map/core/provider'
import { createRuntimeMapProvider } from '~~/map/providers/factory'
import {
  createMapProviderMountGate,
  initializeMapProvider
} from '~/utils/map-provider-lifecycle'

type MapStatus = 'loading' | 'ready' | 'error'

type ValueRef<T> = Ref<T>
type ReadonlyValueRef<T> = Ref<T> | ComputedRef<T>

interface UseMapProviderLifecycleOptions {
  mapElement: ReadonlyValueRef<HTMLElement | null>
  mapProvider: ValueRef<MapProvider | null>
  activeMapProviderId: ValueRef<MapProviderId | null>
  mapStatus: ValueRef<MapStatus>
  mapErrorMessage: ValueRef<string>
  displayOptions: ReadonlyValueRef<MapDisplayOptions>
  baseStyle: ReadonlyValueRef<MapBaseStyle>
  areas: ReadonlyValueRef<MapArea[]>
  pois: ReadonlyValueRef<MapPoi[]>
  selectedPoiId: ReadonlyValueRef<string | null>
  selectedAreaId: ReadonlyValueRef<string | null>
  resizeSignal: ReadonlyValueRef<unknown>
  onPoiSelected: Parameters<MapProvider['onPoiSelect']>[0]
  onAreaSelected: Parameters<MapProvider['onAreaSelect']>[0]
  beforeMount: () => void
  onReady: () => void
  createProvider?: () => Promise<MapProvider>
}

const DEFAULT_MAP_ERROR = '地图暂时无法加载，请检查网络和地图配置后重试。'

export function useMapProviderLifecycle(options: UseMapProviderLifecycleOptions) {
  const mountGate = createMapProviderMountGate()
  const createProvider = options.createProvider ?? createRuntimeMapProvider

  function clearProvider(provider?: MapProvider | null): void {
    if (!provider || options.mapProvider.value === provider) {
      options.mapProvider.value = null
      options.activeMapProviderId.value = null
    }
  }

  async function mountMap(): Promise<void> {
    const element = options.mapElement.value
    if (!element) return

    const request = mountGate.begin()
    options.beforeMount()
    options.mapStatus.value = 'loading'
    options.mapErrorMessage.value = DEFAULT_MAP_ERROR
    options.mapProvider.value?.destroy()
    clearProvider()
    let createdProvider: MapProvider | null = null
    let mountReportedError = false

    try {
      const provider = await initializeMapProvider(createProvider, {
        element,
        displayOptions: options.displayOptions.value,
        baseStyle: options.baseStyle.value,
        areas: options.areas.value,
        pois: options.pois.value,
        selectedPoiId: options.selectedPoiId.value,
        selectedAreaId: options.selectedAreaId.value
      }, {
        onCreated(created) {
          createdProvider = created
          if (!mountGate.isCurrent(request)) return
          options.mapProvider.value = created
          options.activeMapProviderId.value = created.id
        },
        onPoiSelected: options.onPoiSelected,
        onAreaSelected: options.onAreaSelected,
        onError(_error) {
          mountReportedError = true
          options.mapErrorMessage.value = DEFAULT_MAP_ERROR
          options.mapStatus.value = 'error'
        }
      }, () => mountGate.isCurrent(request))

      if (!provider) {
        clearProvider(createdProvider)
        return
      }
      if (!mountReportedError) options.mapStatus.value = 'ready'
      options.onReady()
    } catch {
      if (!mountGate.isCurrent(request)) return
      clearProvider(createdProvider)
      options.mapErrorMessage.value = DEFAULT_MAP_ERROR
      options.mapStatus.value = 'error'
    }
  }

  function destroyMapProvider(): void {
    mountGate.invalidate()
    const provider = options.mapProvider.value
    provider?.destroy()
    clearProvider(provider)
  }

  watch(options.pois, pois => options.mapProvider.value?.setPois(pois))
  watch(options.displayOptions, displayOptions => (
    options.mapProvider.value?.setDisplayOptions(displayOptions)
  ), { deep: true })
  watch(options.areas, areas => options.mapProvider.value?.setAreas(areas))
  watch(options.resizeSignal, () => {
    void nextTick(() => options.mapProvider.value?.resize())
  })

  onMounted(() => void mountMap())
  onBeforeUnmount(destroyMapProvider)

  return { mountMap }
}
