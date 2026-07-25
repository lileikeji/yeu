import { listFrontendFeatures } from '../../modules/features/service'
import { useAdminRequest } from '../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return { items: listFrontendFeatures(client) }
})
