import { getRouterParam } from 'h3'
import { updateMerchantPromoSchema } from '../../../../../../shared/schemas/server'
import { updateMerchantPromo } from '../../../../../modules/place-reviews/service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const placeId = getRouterParam(event, 'placeId') ?? ''
  if (!placeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid placeId',
      data: { code: 'INVALID_ROUTE_PARAMETER' }
    })
  }
  const input = await parseBody(event, updateMerchantPromoSchema)
  const result = updateMerchantPromo(client, placeId, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place_merchant.promo',
    entityType: 'place-merchant',
    entityId: placeId,
    details: {
      meituanUrl: result.meituanUrl ?? null,
      promoWeight: result.promoWeight,
      aiFrequency: result.aiFrequency,
      enabled: result.enabled
    }
  })
  return result
})
