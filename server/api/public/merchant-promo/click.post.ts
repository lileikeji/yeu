import { recordPromoClickSchema } from '../../../../shared/schemas/server'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { getMerchantPromo, recordPromoClick } from '../../../modules/place-reviews/service'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `promo-click-ip:${ip}`, 30, 60 * 1000, client)
  const body = await parseBody(event, recordPromoClickSchema)
  const promo = getMerchantPromo(client, body.placeId)
  // Only count clicks for places with an active promotion (enabled + URL).
  if (promo.enabled && promo.meituanUrl) {
    recordPromoClick(client, event, body.placeId)
  }
  setResponseStatus(event, 204)
})
