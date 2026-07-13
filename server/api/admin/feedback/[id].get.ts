import { getFeedback } from '../../../modules/feedback/service'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return getFeedback(client, requireUuidParam(event))
})
