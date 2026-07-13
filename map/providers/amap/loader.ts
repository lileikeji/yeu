import type { AMapNamespace } from './types'

interface AMapWindow extends Window {
  AMap?: AMapNamespace
  _AMapSecurityConfig?: Record<string, unknown>
}
let loaderPromise: Promise<AMapNamespace> | null = null

export interface AMapLoaderOptions {
  key: string
  securityCode: string
}

export function loadAMap(options: AMapLoaderOptions): Promise<AMapNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('高德地图只能在浏览器中加载。'))
  }

  const amapWindow = window as AMapWindow
  if (amapWindow.AMap) return Promise.resolve(amapWindow.AMap)
  if (loaderPromise) return loaderPromise

  amapWindow._AMapSecurityConfig = {
    ...amapWindow._AMapSecurityConfig,
    securityJsCode: options.securityCode
  }

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const url = new URL('https://webapi.amap.com/maps')
    url.searchParams.set('v', '2.0')
    url.searchParams.set('key', options.key)
    script.src = url.toString()
    script.async = true
    script.dataset.yeuAmapLoader = 'true'

    const timeout = window.setTimeout(() => {
      script.remove()
      loaderPromise = null
      reject(new Error('高德地图脚本加载超时。'))
    }, 15_000)

    script.onload = () => {
      window.clearTimeout(timeout)
      if (!amapWindow.AMap) {
        loaderPromise = null
        reject(new Error('高德地图脚本已加载，但 API 未初始化。'))
        return
      }
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
