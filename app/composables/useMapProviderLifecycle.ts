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
import { MAP_LOAD_ERROR_MESSAGE } from '~/utils/map-presentation'

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

const DEFAULT_MAP_ERROR = MAP_LOAD_ERROR_MESSAGE

export function useMapProviderLifecycle(options: UseMapProviderLifecycleOptions) {
  const mountGate = createMapProviderMountGate()
  const createProvider = options.createProvider ?? createRuntimeMapProvider

  function reportProviderFailure(error: unknown): void {
    options.mapErrorMessage.value = DEFAULT_MAP_ERROR
    options.mapStatus.value = 'error'
    void error
  }

  function runProviderOperation(operation: () => void): void {
    try {
      operation()
    } catch (error) {
      reportProviderFailure(error)
    }
  }

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
    runProviderOperation(() => options.mapProvider.value?.destroy())
    clearProvider()
    let createdProvider: MapProvider | null = null

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
        onError() {
          // Providers also report recoverable rendering failures here. A failed mount
          // rejects initializeMapProvider and is handled by the catch block below.
        }
      }, () => mountGate.isCurrent(request))

      if (!provider) {
        clearProvider(createdProvider)
        return
      }
      options.mapStatus.value = 'ready'
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
    runProviderOperation(() => provider?.destroy())
    clearProvider(provider)
  }

  watch(options.pois, pois => runProviderOperation(() => options.mapProvider.value?.setPois(pois)))
  watch(options.displayOptions, displayOptions => runProviderOperation(() => (
    options.mapProvider.value?.setDisplayOptions(displayOptions)
  )), { deep: true })
  watch(options.areas, areas => runProviderOperation(() => options.mapProvider.value?.setAreas(areas)))
  watch(options.resizeSignal, () => {
    void nextTick(() => runProviderOperation(() => options.mapProvider.value?.resize()))
  })

  onMounted(() => void mountMap())
  onBeforeUnmount(destroyMapProvider)

  return { mountMap }
}
