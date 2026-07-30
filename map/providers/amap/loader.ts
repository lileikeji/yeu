import type { AMapNamespace } from './types'

interface AMapWindow extends Window {
  AMap?: AMapNamespace
  _AMapSecurityConfig?: Record<string, unknown>
}
let loaderPromise: Promise<AMapNamespace> | null = null
const PLUGIN_LOAD_TIMEOUT_MS = 15_000

export const AMAP_REQUIRED_PLUGINS = ['AMap.MarkerCluster', 'AMap.Walking', 'AMap.PlaceSearch'] as const
const AMAP_BOOT_PLUGINS = ['AMap.MarkerCluster'] as const

export interface AMapLoaderOptions {
  key: string
  securityCode: string
}

export function buildAMapScriptUrl(key: string): string {
  const url = new URL('https://webapi.amap.com/maps')
  url.searchParams.set('v', '2.0')
  url.searchParams.set('key', key)
  url.searchParams.set('plugin', AMAP_REQUIRED_PLUGINS.join(','))
  return url.toString()
}

function hasPlugin(amap: AMapNamespace, plugin: string): boolean {
  if (plugin === 'AMap.MarkerCluster') return typeof amap.MarkerCluster === 'function'
  if (plugin === 'AMap.Walking') return typeof amap.Walking === 'function'
  if (plugin === 'AMap.PlaceSearch') return typeof amap.PlaceSearch === 'function'
  return false
}

export function ensureAMapPlugins(
  amap: AMapNamespace,
  plugins: readonly string[],
  timeoutMs = PLUGIN_LOAD_TIMEOUT_MS
): Promise<boolean> {
  const missing = plugins.filter(plugin => !hasPlugin(amap, plugin))
  if (!missing.length) return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    const finish = (loaded: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(loaded)
    }
    const timeout = window.setTimeout(() => finish(false), timeoutMs)

    try {
      amap.plugin([...missing], () => finish(missing.every(plugin => hasPlugin(amap, plugin))))
    } catch {
      finish(false)
    }
  })
}

export function loadAMap(options: AMapLoaderOptions): Promise<AMapNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('高德地图只能在浏览器中加载。'))
  }

  const amapWindow = window as AMapWindow
  // Do not block the base map on optional route/search plugins. Embedded
  // browsers can delay those callbacks while AMap itself is ready to render.
  if (amapWindow.AMap) return Promise.resolve(amapWindow.AMap)
  if (loaderPromise) return loaderPromise

  amapWindow._AMapSecurityConfig = {
    ...amapWindow._AMapSecurityConfig,
    securityJsCode: options.securityCode
  }

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = buildAMapScriptUrl(options.key)
    script.async = true
    script.dataset.yeuAmapLoader = 'true'

    const timeout = window.setTimeout(() => {
      script.remove()
      loaderPromise = null
      reject(new Error('高德地图脚本加载超时。'))
    }, 15_000)

    script.onload = async () => {
      window.clearTimeout(timeout)
      if (!amapWindow.AMap) {
        loaderPromise = null
        reject(new Error('高德地图脚本已加载，但 API 未初始化。'))
        return
      }
      // Marker clustering is an enhancement; ordinary markers remain usable
      // when an embedded browser blocks the plugin callback.
      void ensureAMapPlugins(amapWindow.AMap, AMAP_BOOT_PLUGINS)
      resolve(amapWindow.AMap)
    }
    script.onerror = () => {
      window.clearTimeout(timeout)
      script.remove()
      loaderPromise = null
      reject(new Error('高德地图脚本加载失败。'))
    }

    document.head.appendChild(script)
  })

  return loaderPromise
}
