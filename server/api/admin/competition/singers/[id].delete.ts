import {
  deleteSinger,
  ensureCompetitionEvent
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const singerId = requireUuidParam(event)

  const competition = ensureCompetitionEvent(client, contentId)
  deleteSinger(client, competition.id, singerId)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.singer_delete',
    entityType: 'competition_singer',
    entityId: singerId
  })
  return { deleted: true }
})
