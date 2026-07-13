import { getAdminContent } from '../../../modules/content/service'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return getAdminContent(client, requireUuidParam(event))
})
