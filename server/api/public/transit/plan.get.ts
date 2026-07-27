import { createError, getQuery, setResponseHeaders } from 'h3'
import type { ApiTransitPlanResponse } from '../../../../shared/types/server'
import {
  isTransitPointId,
  parseAmapTransitResponse,
  transitPoints
} from '../../../modules/transit/amap'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'

const responseCache = new Map<string, { expiresAt: number, response: ApiTransitPlanResponse }>()
const CACHE_TTL_MS = 90_000

export default defineEventHandler(async (event): Promise<ApiTransitPlanResponse> => {
  setHeader(event, 'Cache-Control', 'no-store')

  const query = getQuery(event)
  const originId = query.from
  const destinationId = query.to
  if (!isTransitPointId(originId) || !isTransitPointId(destinationId) || originId === destinationId) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported transit points' })
  }

  const cacheKey = `${originId}:${destinationId}`
  const cached = responseCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    setResponseHeaders(event, {
      'Cache-Control': 'public, max-age=30, s-maxage=90, stale-while-revalidate=180',
      'X-Transit-Cache': 'HIT'
    })
    return cached.response
  }

  // Only uncached requests consume an upstream AMap call. CDN peers may group
  // several visitors behind one address, so keep a generous peer ceiling and
  // a separate global ceiling for provider protection.
  assertRateLimit(event, `public:transit:${getClientIpAddress(event)}`, 300, 60_000)
  assertRateLimit(event, 'public:transit:global', 120, 60_000)

  const runtimeConfig = useRuntimeConfig(event)
  const key = String(runtimeConfig.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || '').trim()
  if (!key) throw createError({ statusCode: 503, statusMessage: 'Transit service is not configured' })

  const origin = transitPoints[originId]!
  const destination = transitPoints[destinationId]!
  let payload: unknown
  try {
    payload = await $fetch('https://restapi.amap.com/v3/direction/transit/integrated', {
      query: {
        key,
        origin: origin.location,
        destination: destination.location,
        city: '泉州',
        cityd: '泉州',
        strategy: 0,
        nightflag: 0,
        extensions: 'all'
      },
      timeout: 8_000,
      retry: 1
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Transit provider is temporarily unavailable' })
  }

  let response: ApiTransitPlanResponse
  try {
    response = parseAmapTransitResponse(payload, originId, destinationId)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Transit provider returned no usable route' })
  }
  responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, response })
  setResponseHeaders(event, {
    'Cache-Control': 'public, max-age=30, s-maxage=90, stale-while-revalidate=180',
    'X-Transit-Cache': 'MISS'
  })
  return response
})
