import { competitionSingerSchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  updateSinger
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const singerId = requireUuidParam(event)
  const input = await parseBody(event, competitionSingerSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const singer = updateSinger(client, competition.id, singerId, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.singer_update',
    entityType: 'competition_singer',
    entityId: singerId
  })
  return { singer }
})
