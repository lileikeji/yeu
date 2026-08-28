import { adminListAmapRatings } from '../../../modules/place-reviews/service'
import { useAdminRequest } from '../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const items = adminListAmapRatings(client)
  return { items, total: items.length }
})
