import { isWechatUserAgent } from '../../app/utils/browser-environment'

export interface ProviderFallbackInput {
  /** 配置的 provider 原始值（NUXT_PUBLIC_MAP_PROVIDER）。 */
  configuredProvider: unknown
  amapKey?: unknown
  amapSecurityCode?: unknown
  /** 显式传入 UA 便于测试与 SSR 可预测；缺省用 navigator.userAgent。 */
  userAgent?: string
}

/**
 * 决定实际装配的地图 provider id。
 *
 * 优先级：
 *  - 显式 'offline' / 'maplibre-dev'：尊重配置；
 *  - 空配置、amap 但缺密钥、或微信内置浏览器（WebView 能力降级）→ 'offline' 自绘；
 *  - amap 且密钥齐全、非微信 → 'amap'；
 *  - 其他未知配置原样透传，交给 factory 抛「不支持的地图 provider」。
 *
 * 返回类型刻意放宽为 string：未知配置透传后由 `resolveMapProviderConfig` 给出确定性报错。
 */
export function resolveProviderFallback(input: ProviderFallbackInput): string {
  const configured = (typeof input.configuredProvider === 'string' ? input.configuredProvider : '').trim()
  const amapKey = (typeof input.amapKey === 'string' ? input.amapKey : '').trim()
  const amapSecurityCode = (typeof input.amapSecurityCode === 'string' ? input.amapSecurityCode : '').trim()
  const isWechat = typeof input.userAgent === 'string'
    ? isWechatUserAgent(input.userAgent)
    : (typeof navigator !== 'undefined' && isWechatUserAgent(navigator.userAgent))

  if (configured === 'offline') return 'offline'
  if (configured === 'maplibre-dev') return 'maplibre-dev'
  if (!configured) return 'offline'

  // 未知配置：原样透传，让 factory 抛「不支持的地图 provider」。
  if (configured !== 'amap') return configured

  // amap 但微信内置浏览器或密钥缺失 → 能力降级到离线自绘。
  if (isWechat || !amapKey || !amapSecurityCode) return 'offline'
  return 'amap'
}
