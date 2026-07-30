<script setup lang="ts">
/**
 * Temporary diagnostic overlay for embedded WebViews (WeChat / QQ X5).
 * Only rendered when the page URL carries ?debug=map, so it never reaches
 * ordinary visitors. Remove once the AMap basemap issue is resolved.
 */
interface Props {
  mapStatus: string
  activeProviderId: string | null
  poiCount: number
}

const props = defineProps<Props>()

const lines = ref<string[]>([])
const copied = ref(false)

function log(label: string, value: unknown): void {
  lines.value.push(`${label}: ${String(value)}`)
}

function detectWebgl(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return 'NONE'
    const context = gl as WebGLRenderingContext
    const info = context.getExtension('WEBGL_debug_renderer_info')
    const renderer = info
      ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : 'masked'
    return `OK (${renderer})`
  } catch (error) {
    return `THREW ${(error as Error).message}`
  }
}

const tileState = reactive({ ok: 0, failed: 0, failedUrls: [] as string[] })

function watchTileRequests(): void {
  if (typeof PerformanceObserver === 'undefined') {
    log('PerformanceObserver', 'unavailable')
    return
  }
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const url = entry.name
        if (!/autonavi\.com|amap\.com/.test(url)) continue
        const timing = entry as PerformanceResourceTiming
        // A cross-origin image that failed yields a zero transfer size.
        if (timing.responseEnd > 0 && timing.transferSize === 0 && timing.decodedBodySize === 0) {
          tileState.failed += 1
          if (tileState.failedUrls.length < 3) tileState.failedUrls.push(url.slice(0, 90))
        } else {
          tileState.ok += 1
        }
      }
    })
    observer.observe({ type: 'resource', buffered: true })
  } catch (error) {
    log('tileObserver', (error as Error).message)
  }
}

onMounted(() => {
  const runtimeConfig = useRuntimeConfig()
  const amapWindow = window as unknown as {
    AMap?: Record<string, unknown>
    _AMapSecurityConfig?: { securityJsCode?: string }
  }

  log('UA', navigator.userAgent.slice(0, 120))
  log('provider(cfg)', runtimeConfig.public.mapProvider)
  log('key set', Boolean(runtimeConfig.public.amapKey))
  // Sampled again in the delayed block below; loadAMap sets this after mount.
  log('WebGL', detectWebgl())
  log('devicePixelRatio', window.devicePixelRatio)

  window.addEventListener('error', (event) => {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'SCRIPT' || target.tagName === 'IMG')) {
      log('resErr', (target as HTMLImageElement).src?.slice(0, 90) ?? target.tagName)
      return
    }
    log('jsErr', event.message)
  }, true)

  window.addEventListener('unhandledrejection', (event) => {
    log('reject', String(event.reason).slice(0, 140))
  })

  watchTileRequests()

  log('navType', (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? '?')
  log('rAF', typeof window.requestAnimationFrame)

  // Track how the canvas evolves. A canvas that stays 0x0 while the container
  // has a real size is the blank-basemap failure; if it recovers late, the
  // timeline shows which attempt fixed it.
  const timeline: string[] = []
  const sample = (tag: string): void => {
    const container = document.querySelector('.amap-container') as HTMLElement | null
    const canvas = document.querySelector('.amap-container canvas') as HTMLCanvasElement | null
    timeline.push(`${tag} c=${container ? `${container.clientWidth}x${container.clientHeight}` : 'none'} cv=${canvas ? `${canvas.width}x${canvas.height}` : 'none'}`)
  }

  for (const delay of [300, 800, 1500, 3000, 6000]) {
    window.setTimeout(() => sample(`t${delay}`), delay)
  }

  window.setTimeout(() => {
    log('secCode set', Boolean(amapWindow._AMapSecurityConfig?.securityJsCode))
    log('AMap loaded', Boolean(amapWindow.AMap))
    if (amapWindow.AMap) {
      log('AMap.Map', typeof amapWindow.AMap.Map)
      log('MarkerCluster', typeof amapWindow.AMap.MarkerCluster)
    }
    const canvases = document.querySelectorAll('.amap-container canvas, .amap-layers canvas')
    log('amap canvases', canvases.length)
    const container = document.querySelector('.amap-container') as HTMLElement | null
    log('amap container', container
      ? `${container.clientWidth}x${container.clientHeight}`
      : 'MISSING')
    const canvas = document.querySelector('.amap-container canvas') as HTMLCanvasElement | null
    log('canvas attr', canvas ? `${canvas.width}x${canvas.height}` : 'MISSING')
    log('canvas css', canvas
      ? `${Math.round(canvas.getBoundingClientRect().width)}x${Math.round(canvas.getBoundingClientRect().height)}`
      : 'MISSING')

    // Distinguish "AMap never sized itself" from "AMap sized itself but the
    // container is hidden or clipped by an ancestor".
    const container = document.querySelector('.amap-container') as HTMLElement | null
    if (container) {
      const style = getComputedStyle(container)
      log('container css', `disp=${style.display} vis=${style.visibility} op=${style.opacity}`)
      const maps = container.querySelector('.amap-maps') as HTMLElement | null
      log('amap-maps', maps ? `${maps.clientWidth}x${maps.clientHeight}` : 'MISSING')
      const layers = container.querySelector('.amap-layers') as HTMLElement | null
      log('amap-layers', layers ? `${layers.clientWidth}x${layers.clientHeight}` : 'MISSING')
    }

    for (const entry of timeline) log('tl', entry)
  }, 6500)
})

async function copyReport(): Promise<void> {
  const report = [
    `status=${props.mapStatus} provider=${props.activeProviderId} pois=${props.poiCount}`,
    `tiles ok=${tileState.ok} failed=${tileState.failed}`,
    ...tileState.failedUrls.map(url => `  fail ${url}`),
    ...lines.value
  ].join('\n')
  try {
    await navigator.clipboard.writeText(report)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="map-debug-overlay">
    <div class="map-debug-head">
      <strong>MAP DEBUG</strong>
      <button
        type="button"
        @click="copyReport"
      >
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <div class="map-debug-body">
      <div>status={{ mapStatus }} provider={{ activeProviderId }} pois={{ poiCount }}</div>
      <div>tiles ok={{ tileState.ok }} failed={{ tileState.failed }}</div>
      <div
        v-for="url in tileState.failedUrls"
        :key="url"
        class="map-debug-fail"
      >
        fail {{ url }}
      </div>
      <div
        v-for="(line, index) in lines"
        :key="index"
      >
        {{ line }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-debug-overlay {
  position: absolute;
  inset-inline: 0.5rem;
  top: 0.5rem;
  z-index: 60;
  max-height: 55%;
  display: flex;
  flex-direction: column;
  border: 1px solid #f59e0b;
  border-radius: 6px;
  background: rgb(0 0 0 / 85%);
  color: #f8fafc;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  line-height: 1.45;
}

.map-debug-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid rgb(245 158 11 / 50%);
  color: #fbbf24;
}

.map-debug-head button {
  padding: 0.15rem 0.5rem;
  border: 1px solid #fbbf24;
  border-radius: 4px;
  background: transparent;
  color: #fbbf24;
  font-size: 10px;
}

.map-debug-body {
  overflow-y: auto;
  padding: 0.35rem 0.5rem;
  word-break: break-all;
}

.map-debug-fail {
  color: #fca5a5;
}
</style>
