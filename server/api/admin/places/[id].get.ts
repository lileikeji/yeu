import { getAdminPlace } from '../../../modules/places/service'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return getAdminPlace(client, requireUuidParam(event))
})
