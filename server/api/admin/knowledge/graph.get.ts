import {
  COMPACT_GRAPH_NODE_LIMIT,
  getKnowledgeLandscapeGraph
} from '../../../modules/knowledge/library'
import { requireSuperAdmin } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  const compact = getQuery(event).compact === '1'
  return getKnowledgeLandscapeGraph(client, {
    nodeLimit: compact ? COMPACT_GRAPH_NODE_LIMIT : undefined
  })
})
