import type { MiniAppApiError, MiniAppTelemetryMeta } from '../types/app'
import { toMapCoordinate } from '@shared/utils/coordinate-convert'
import { trackMiniApp } from '../services/http'

function safeSegment(value: string): string {
  return value.trim().replace(/[^\w\-.\u4e00-\u9fff/]/g, '').slice(0, 80)
}

function safeQueryValue(value: string): string {
  return encodeURIComponent(value.slice(0, 80).replace(/[\u0000-\u001f]/g, ''))
}

export function goHome(): void {
  trackMiniApp('module_view', '/pages/index/index', { target: 'home' })
  uni.switchTab({ url: '/pages/index/index' })
}

export function goMap(slug?: string): void {
  const safeSlug = slug ? safeSegment(slug) : ''
  if (safeSlug) uni.setStorageSync('miniapp-map-place', safeSlug)
  else uni.removeStorageSync('miniapp-map-place')
  trackMiniApp('module_view', '/pages/map/index', { target: 'map', hasPlace: Boolean(safeSlug) })
  // WeChat drops query parameters on switchTab; keep the place in storage for the map tab.
  uni.switchTab({ url: '/pages/map/index' })
}

export function goGuides(): void {
  trackMiniApp('module_view', '/pages/guides/index', { target: 'guides' })
  uni.switchTab({ url: '/pages/guides/index' })
}

export function goSearch(q?: string): void {
  const safeQ = q?.trim().slice(0, 40) || ''
  if (safeQ) uni.setStorageSync('miniapp-search-query', safeQ)
  else uni.removeStorageSync('miniapp-search-query')
  trackMiniApp('module_view', '/pages/search/index', { target: 'search', hasQuery: Boolean(safeQ) })
  // WeChat drops query parameters on switchTab; the search tab reads this short-lived handoff.
  uni.switchTab({ url: '/pages/search/index' })
}

export function goServices(): void {
  trackMiniApp('module_view', '/pages/services/index', { target: 'services' })
  uni.switchTab({ url: '/pages/services/index' })
}

/** 打开地图并按分类筛选；分类经 storage 传递（switchTab 会丢 query）。 */
export function goMapCategory(category: string): void {
  const safeCategory = safeSegment(category)
  if (safeCategory) uni.setStorageSync('miniapp-map-category', safeCategory)
  else uni.removeStorageSync('miniapp-map-category')
  trackMiniApp('module_view', '/pages/map/index', { target: 'map-category', hasQuery: Boolean(safeCategory) })
  uni.switchTab({ url: '/pages/map/index' })
}

export function goProcedures(): void {
  trackMiniApp('module_view', '/pages/procedures/index', { target: 'procedures' })
  uni.navigateTo({ url: '/pages/procedures/index' })
}

export function goNotices(): void {
  trackMiniApp('module_view', '/pages/notices/index', { target: 'notices' })
  uni.navigateTo({ url: '/pages/notices/index' })
}

export function goAbout(): void {
  trackMiniApp('module_view', '/pages/about/index', { target: 'about' })
  uni.navigateTo({ url: '/pages/about/index' })
}

export function openProcedure(slug: string): void {
  const safeSlug = safeSegment(slug)
  if (!safeSlug) return
  trackMiniApp('result_click', '/pages/procedures/detail', { entityType: 'procedure', slug: safeSlug })
  uni.navigateTo({ url: `/pages/procedures/detail?slug=${safeQueryValue(safeSlug)}` })
}

export function openPlace(slug: string): void {
  const safeSlug = safeSegment(slug)
  if (!safeSlug) return
  trackMiniApp('result_click', '/pages/places/detail', { entityType: 'place', slug: safeSlug })
  uni.navigateTo({ url: `/pages/places/detail?slug=${safeQueryValue(safeSlug)}` })
}

export function openNotice(slug: string): void {
  const safeSlug = safeSegment(slug)
  if (!safeSlug) return
  trackMiniApp('result_click', '/pages/guides/detail', { entityType: 'content', kind: 'notice', slug: safeSlug })
  uni.navigateTo({ url: `/pages/guides/detail?slug=${safeQueryValue(safeSlug)}&kind=notice` })
}

export function openExternal(url: string | null | undefined): void {
  if (!url || !/^https:\/\//i.test(url)) return
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: '链接已复制', icon: 'none' }),
    fail: () => {
      trackMiniApp('api_error', '/pages/about/index', { api: 'clipboard', error: 'CLIPBOARD_FAILED' })
      uni.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
    }
  })
}

export function explainError(error: unknown): string {
  const details = (error as { details?: MiniAppApiError })?.details
  if (details?.code === 'CONTENT_NOT_PUBLIC') return '这份内容暂未公开或已过期。'
  if (details?.code === 'CONTENT_CATALOG_UNMANAGED') return '这类内容正在整理中。'
  if (details?.code === 'NOT_FOUND') return '没有找到对应内容。'
  if (details?.code === 'RATE_LIMITED' || details?.status === 429) return '请求太频繁，请稍后再试。'
  return details?.message || '加载失败，请稍后重试。'
}

export function openLocation(place: {
  name: string
  address: string | null
  longitude?: number | null
  latitude?: number | null
  coordinateSystem?: string | null
  navigationAvailable: boolean
}): void {
  // 库里存 WGS84，微信 openLocation 要 GCJ-02，否则会偏几百米。
  const coordinate = toMapCoordinate(place.longitude, place.latitude, place.coordinateSystem)
  const telemetry: MiniAppTelemetryMeta = { hasCoordinate: coordinate !== null }
  trackMiniApp('open_location', '/pages/map/index', telemetry)
  if (!place.navigationAvailable || !coordinate) {
    uni.showToast({ title: place.address || '暂无可用坐标', icon: 'none' })
    return
  }
  uni.openLocation({
    name: place.name,
    address: place.address || undefined,
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
    scale: 18,
    fail: (cause) => {
      const message = cause.errMsg || '地图打开失败，请稍后重试'
      trackMiniApp('open_location', '/pages/map/index', { ...telemetry, success: false, error: message.slice(0, 120) })
      uni.showToast({ title: '地图打开失败，请稍后重试', icon: 'none' })
    }
  })
}
