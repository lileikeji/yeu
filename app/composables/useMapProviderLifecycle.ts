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
  let mountInFlight = false
  let waitingForVisibleElement = false
  let resizeFrame = 0
  let visibilityRetryTimer: ReturnType<typeof globalThis.setTimeout> | null = null
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

  function clearVisibilityRetry(): void {
    if (visibilityRetryTimer !== null) {
      globalThis.clearTimeout(visibilityRetryTimer)
      visibilityRetryTimer = null
    }
  }

  function scheduleVisibleMountRetry(): void {
    if (typeof window === 'undefined' || !waitingForVisibleElement || mountInFlight) return
    if (visibilityRetryTimer !== null) return

    // Older embedded browsers can report a zero-sized v-show container during
    // the first mounted frame and do not implement ResizeObserver. Keep
    // checking at a low frequency so the real AMap provider mounts as soon as
    // the sheet/layout has settled without spinning the main thread.
    visibilityRetryTimer = globalThis.setTimeout(() => {
      visibilityRetryTimer = null
      const element = options.mapElement.value
      if (element && hasUsableSize(element)) {
        void mountMap()
        return
      }
      scheduleVisibleMountRetry()
    }, 120)
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
      scheduleVisibleMountRetry()
      return
    }
    if (mountInFlight) return

    const request = mountGate.begin()
    mountInFlight = true
    waitingForVisibleElement = false
    clearVisibilityRetry()
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
    void nextTick(() => {
      // Give embedded WebViews an immediate repaint after a sheet/layout
      // change, then keep the double-frame resize for providers that settle
      // their canvas dimensions one frame later.
      runProviderOperation(() => options.mapProvider.value?.resize())
      scheduleResize()
    })
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
    clearVisibilityRetry()
    if (resizeFrame && typeof window !== 'undefined') window.cancelAnimationFrame(resizeFrame)
    resizeFrame = 0
    destroyMapProvider()
  })

  return { mountMap }
}
