import type { AMapNamespace } from './types'

interface AMapWindow extends Window {
  AMap?: AMapNamespace
  _AMapSecurityConfig?: Record<string, unknown>
}
let loaderPromise: Promise<AMapNamespace> | null = null
const PLUGIN_LOAD_TIMEOUT_MS = 15_000

export const AMAP_REQUIRED_PLUGINS = ['AMap.MarkerCluster', 'AMap.Walking'] as const

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

function hasRequiredPlugins(amap: AMapNamespace): boolean {
  return typeof amap.MarkerCluster === 'function' && typeof amap.Walking === 'function'
}

function ensureRequiredPlugins(amap: AMapNamespace): Promise<AMapNamespace> {
  if (hasRequiredPlugins(amap)) return Promise.resolve(amap)

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (error) reject(error)
      else resolve(amap)
    }
    const timeout = window.setTimeout(() => {
      finish(new Error('高德地图点聚合插件加载超时。'))
    }, PLUGIN_LOAD_TIMEOUT_MS)

    try {
      amap.plugin([...AMAP_REQUIRED_PLUGINS], () => {
        finish(hasRequiredPlugins(amap)
          ? undefined
          : new Error('高德地图点聚合或步行路线插件未初始化。'))
      })
    } catch {
      finish(new Error('高德地图点聚合插件加载失败。'))
    }
  })
}

export function loadAMap(options: AMapLoaderOptions): Promise<AMapNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('高德地图只能在浏览器中加载。'))
  }

  const amapWindow = window as AMapWindow
  if (amapWindow.AMap) return ensureRequiredPlugins(amapWindow.AMap)
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
      try {
        resolve(await ensureRequiredPlugins(amapWindow.AMap))
      } catch (error) {
        loaderPromise = null
        reject(error)
      }
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
