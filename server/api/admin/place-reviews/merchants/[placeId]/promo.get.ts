import { getRouterParam } from 'h3'
import { getMerchantPromo } from '../../../../../modules/place-reviews/service'
import { useAdminRequest } from '../../../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const placeId = getRouterParam(event, 'placeId') ?? ''
  if (!placeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid placeId',
      data: { code: 'INVALID_ROUTE_PARAMETER' }
    })
  }
  return getMerchantPromo(client, placeId)
})
