import { createError, getQuery, setHeader } from 'h3'
import type { ApiWalkingRoute } from '../../../../../shared/types/server'
import { toMapCoordinate } from '../../../../../shared/utils/coordinate-convert'
import { fetchAmapWalkingRoute } from '../../../../modules/directions/amap'
import { getPublicPlace } from '../../../../modules/places/service'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'

/** 起点缺省值：仰恩大学第三校区（WGS84，和库里存储口径一致）。 */
const CAMPUS_ORIGIN = { label: '仰恩大学第三校区', longitude: 118.60513135, latitude: 25.11207855 }

const routeCache = new Map<string, { expiresAt: number, route: ApiWalkingRoute }>()
const CACHE_TTL_MS = 60_000
/** 起点按约 11m 精度取整后再做缓存键，避免同一位置产生大量缓存条目。 */
const ORIGIN_PRECISION = 4

interface ParsedOrigin {
  label: string
  longitude: number
  latitude: number
}

function parseOrigin(value: unknown): ParsedOrigin | null {
  if (typeof value !== 'string') return null
  const [longitudeText, latitudeText] = value.split(',')
  const longitude = Number(longitudeText)
  const latitude = Number(latitudeText)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null
  return { label: '我的位置', longitude, latitude }
}

export default defineEventHandler(async (event): Promise<ApiWalkingRoute> => {
  setHeader(event, 'Cache-Control', 'no-store')

  const query = getQuery(event)
  const slug = typeof query.slug === 'string' ? query.slug.trim() : ''
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported walking route destination' })
  }

  // 小程序 getLocation 拿到的已经是 GCJ-02；高德步行接口同样吃 GCJ-02，直接传。
  // 没拿到定位时退化成「从校区中心出发」，保证没授权定位也能看路线。
  const campusGcj02 = toMapCoordinate(CAMPUS_ORIGIN.longitude, CAMPUS_ORIGIN.latitude, 'WGS84')!
  const origin = parseOrigin(query.origin) ?? {
    label: CAMPUS_ORIGIN.label,
    longitude: campusGcj02.longitude,
    latitude: campusGcj02.latitude
  }

  const cacheKey = `${slug}:${origin.longitude.toFixed(ORIGIN_PRECISION)},${origin.latitude.toFixed(ORIGIN_PRECISION)}`
  const cached = routeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.route

  assertRateLimit(event, `miniapp-walking:${getClientIpAddress(event)}`, 30, 60_000)
  assertRateLimit(event, 'miniapp-walking:global', 180, 60_000)

  const place = getPublicPlace(useAppDatabase(event), slug)
  if (!place.navigationAvailable) {
    throw createError({ statusCode: 422, statusMessage: 'This place has no verified coordinate' })
  }
  const target = toMapCoordinate(place.longitude, place.latitude, place.coordinateSystem)
  if (!target) {
    throw createError({ statusCode: 422, statusMessage: 'This place has no usable coordinate' })
  }

  const key = String(useRuntimeConfig(event).amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || '').trim()
  if (!key) throw createError({ statusCode: 503, statusMessage: 'Walking route service is not configured' })

  let route: ApiWalkingRoute
  try {
    route = await fetchAmapWalkingRoute(
      key,
      origin,
      { label: place.name, slug: place.slug, ...target },
      { timeoutMs: 8_000 }
    )
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Walking route provider is temporarily unavailable' })
  }

  routeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, route })
  return route
})
