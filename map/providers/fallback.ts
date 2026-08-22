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
 *  - 空配置、或 amap 但缺密钥 → 'offline' 自绘；
 *  - amap 且密钥齐全（含微信内置浏览器）→ 'amap'；
 *  - 其他未知配置原样透传，交给 factory 抛「不支持的地图 provider」。
 *
 * 说明：微信 WebView 早期曾降级到 offline 自绘，但实测微信内高德 JS
 * API 可以正常渲染，且用户期望微信里也用完整高德地图，因此不再按 UA
 * 降级；offline 仅作为「无密钥/显式配置」的兜底。
 */
export function resolveProviderFallback(input: ProviderFallbackInput): string {
  const configured = (typeof input.configuredProvider === 'string' ? input.configuredProvider : '').trim()
  const amapKey = (typeof input.amapKey === 'string' ? input.amapKey : '').trim()
  const amapSecurityCode = (typeof input.amapSecurityCode === 'string' ? input.amapSecurityCode : '').trim()

  if (configured === 'offline') return 'offline'
  if (configured === 'maplibre-dev') return 'maplibre-dev'
  if (!configured) return 'offline'

  // 未知配置：原样透传，让 factory 抛「不支持的地图 provider」。
  if (configured !== 'amap') return configured

  // amap 但密钥缺失 → 能力降级到离线自绘。
  if (!amapKey || !amapSecurityCode) return 'offline'
  return 'amap'
}
