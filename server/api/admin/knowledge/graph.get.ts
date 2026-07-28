import { getKnowledgeLandscapeGraph } from '../../../modules/knowledge/library'
import { requireSuperAdmin } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  return getKnowledgeLandscapeGraph(client)
})
