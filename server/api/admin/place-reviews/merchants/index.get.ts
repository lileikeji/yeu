import { adminListPlaceMerchants } from '../../../../modules/place-reviews/service'
import { useAdminRequest } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return adminListPlaceMerchants(client)
})
