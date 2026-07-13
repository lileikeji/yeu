import { getSource } from '../../../modules/verification/service'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return getSource(client, requireUuidParam(event))
})
