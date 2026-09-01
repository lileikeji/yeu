import { getRouterParam } from 'h3'
import { adminGetPlaceMerchantDetail } from '../../../../modules/place-reviews/service'
import { useAdminRequest } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  // placeId 是 AMap POI id（如 B0IGDU8ILV），非 UUID——直接取路由参数
  const placeId = getRouterParam(event, 'placeId') ?? ''
  if (!placeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid placeId',
      data: { code: 'INVALID_ROUTE_PARAMETER' }
    })
  }
  const detail = adminGetPlaceMerchantDetail(client, placeId)
  if (!detail) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Merchant not found',
      data: { code: 'MERCHANT_NOT_FOUND' }
    })
  }
  return detail
})
