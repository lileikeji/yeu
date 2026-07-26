import { getAdminContent } from '../../../modules/content/service'
import { requireAdminContentAccess } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const id = requireUuidParam(event)
  requireAdminContentAccess(session, id)
  return getAdminContent(client, id)
})
