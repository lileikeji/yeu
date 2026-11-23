import {
  ensureCompetitionEvent,
  getPopularityAdminState
} from '../../../../modules/competition/service'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  return { popularity: getPopularityAdminState(client, eventRow.id) }
})
