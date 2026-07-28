import { adminKnowledgeLibraryQuerySchema } from '../../../../shared/schemas/server'
import { listKnowledgeLibrary } from '../../../modules/knowledge/library'
import { requireSuperAdmin } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  return listKnowledgeLibrary(client, parseQuery(event, adminKnowledgeLibraryQuerySchema))
})
