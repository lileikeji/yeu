import type { H3Event } from 'h3'
import { listPublicAmapOwnerDraftPlaces } from '../../modules/places/service'
import { useAppDatabase } from '../../utils/database'
import { setPublicCache } from '../../utils/http'
import { presentPublicAmapOwnerDraftPlace } from '../../utils/public-api-presentation'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'

function isAmapOwnerDraftsEnabled(event: H3Event): boolean {
  const runtimeConfig = useRuntimeConfig(event)
  // RuntimeConfig types this as boolean; also accept common env string/number disables.
  const raw = runtimeConfig.public.enableAmapOwnerDrafts as boolean | string | number
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') {
    return false
  }
  // Default true: product uses map/search overlay for authorized draft points.
  return true
}

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  if (!isAmapOwnerDraftsEnabled(event)) {
    setPublicCache(event, 60)
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: 0
    }
  }

  const ipAddress = getClientIpAddress(event)
  const client = useAppDatabase(event)
  assertRateLimit(event, `public-amap-owner-drafts:${ipAddress}`, 600, 60 * 1000, client)

  const items = listPublicAmapOwnerDraftPlaces(client)
  setPublicCache(event, 60)
  return {
    items: items.map(presentPublicAmapOwnerDraftPlace),
    total: items.length,
    page: 1,
    pageSize: items.length
  }
})
