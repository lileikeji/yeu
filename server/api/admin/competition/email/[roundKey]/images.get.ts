import {
  ensureCompetitionEvent,
  listEmailImages
} from '../../../../../modules/competition/service'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  void requireCompetitionRoundKey(event)
  const competition = ensureCompetitionEvent(client, contentId)
  return { images: listEmailImages(client, competition.id) }
})
