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
import { isWechatUserAgent } from '~/utils/browser-environment'
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

async function createWechatOfflineProvider(): Promise<MapProvider> {
  const { WechatOfflineMapProvider } = await import('~~/map/providers/offline/provider')
  return new WechatOfflineMapProvider()
}

export function useMapProviderLifecycle(options: UseMapProviderLifecycleOptions) {
  const mountGate = createMapProviderMountGate()
  const createProvider = options.createProvider ?? createRuntimeMapProvider
  let mountInFlight = false
  let waitingForVisibleElement = false
  let resizeFrame = 0
  let removeViewportListeners: (() => void) | null = null

  function hasUsableSize(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect()
    return rect.width >= 2 && rect.height >= 2
  }

  function scheduleResize(): void {
    if (typeof window === 'undefined') return
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0
        runProviderOperation(() => options.mapProvider.value?.resize())
      })
    })
  }

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

    // Mobile sheets and v-show transitions can leave the map at 0x0 for a
    // frame. Do not initialize AMap/MapLibre against that size; wait for the
    // ResizeObserver below to call us again once the container is visible.
    if (!hasUsableSize(element)) {
      waitingForVisibleElement = true
      options.mapStatus.value = 'loading'
      return
    }
    if (mountInFlight) return

    const request = mountGate.begin()
    mountInFlight = true
    waitingForVisibleElement = false
    options.beforeMount()
    options.mapStatus.value = 'loading'
    options.mapErrorMessage.value = DEFAULT_MAP_ERROR
    runProviderOperation(() => options.mapProvider.value?.destroy())
    clearProvider()
    let createdProvider: MapProvider | null = null
    const useWechatOfflineMap = typeof navigator !== 'undefined'
      && isWechatUserAgent(navigator.userAgent)
    const providerFactory = useWechatOfflineMap
      ? createWechatOfflineProvider
      : createProvider
    const providerAreas = useWechatOfflineMap ? [] : options.areas.value

    try {
      // WeChat WebViews frequently block AMap/WebGL after the script appears
      // to load. Use the bundled DOM renderer immediately so the map never
      // spends several seconds in a retry state or depends on external tiles.
      const provider = await initializeMapProvider(providerFactory, {
        element,
        displayOptions: options.displayOptions.value,
        baseStyle: options.baseStyle.value,
        areas: providerAreas,
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
      scheduleResize()
    } catch {
      if (!mountGate.isCurrent(request)) return

      clearProvider(createdProvider)
      options.mapErrorMessage.value = DEFAULT_MAP_ERROR
      options.mapStatus.value = 'error'
    } finally {
      mountInFlight = false
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
    void nextTick(scheduleResize)
  })

  onMounted(() => {
    const element = options.mapElement.value
    const resizeObserver = typeof ResizeObserver !== 'undefined' && element
      ? new ResizeObserver(() => {
          if (waitingForVisibleElement && !mountInFlight && hasUsableSize(element)) {
            void mountMap()
            return
          }
          scheduleResize()
        })
      : null

    if (resizeObserver && element) resizeObserver.observe(element)

    const handleViewportResize = () => scheduleResize()
    window.addEventListener('resize', handleViewportResize, { passive: true })
    window.addEventListener('orientationchange', handleViewportResize, { passive: true })
    window.visualViewport?.addEventListener('resize', handleViewportResize, { passive: true })
    removeViewportListeners = () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleViewportResize)
      window.removeEventListener('orientationchange', handleViewportResize)
      window.visualViewport?.removeEventListener('resize', handleViewportResize)
      removeViewportListeners = null
    }

    void mountMap()
  })
  onBeforeUnmount(() => {
    removeViewportListeners?.()
    if (resizeFrame && typeof window !== 'undefined') window.cancelAnimationFrame(resizeFrame)
    resizeFrame = 0
    destroyMapProvider()
  })

  return { mountMap }
}
