import type { MapProvider, MapProviderId } from '../core/provider'

export interface MapProviderRuntimeConfig {
  mapProvider?: unknown
  amapKey?: unknown
  amapSecurityCode?: unknown
}

export interface ResolvedMapProviderConfig {
  id: MapProviderId
  amapKey?: string
  amapSecurityCode?: string
}

export class MapProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapProviderConfigurationError'
  }
}

function requiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveMapProviderConfig(config: MapProviderRuntimeConfig): ResolvedMapProviderConfig {
  const id = requiredString(config.mapProvider)

  if (id === 'maplibre-dev') {
    return { id }
  }

  if (id === 'amap') {
    const amapKey = requiredString(config.amapKey)
    const amapSecurityCode = requiredString(config.amapSecurityCode)

    if (!amapKey) {
      throw new MapProviderConfigurationError('高德地图未配置 NUXT_PUBLIC_AMAP_KEY。')
    }
    if (!amapSecurityCode) {
      throw new MapProviderConfigurationError('高德地图未配置 NUXT_PUBLIC_AMAP_SECURITY_CODE。')
    }

    return { id, amapKey, amapSecurityCode }
  }

  if (!id) {
    throw new MapProviderConfigurationError('未配置 NUXT_PUBLIC_MAP_PROVIDER。')
  }

  throw new MapProviderConfigurationError(`不支持的地图 provider：${id}`)
}

export async function createMapProvider(config: MapProviderRuntimeConfig): Promise<MapProvider> {
  const resolved = resolveMapProviderConfig(config)

  if (resolved.id === 'amap') {
    const { AMapProvider } = await import('./amap/provider')
    return new AMapProvider({
      key: resolved.amapKey!,
      securityCode: resolved.amapSecurityCode!
    })
  }

  const { MapLibrePreviewProvider } = await import('./maplibre/provider')
  return new MapLibrePreviewProvider()
}

export async function createRuntimeMapProvider(): Promise<MapProvider> {
  const runtimeConfig = useRuntimeConfig()
  return createMapProvider({
    mapProvider: runtimeConfig.public.mapProvider,
    amapKey: runtimeConfig.public.amapKey,
    amapSecurityCode: runtimeConfig.public.amapSecurityCode
  })
}
