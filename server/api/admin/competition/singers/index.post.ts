import { competitionSingerSchema } from '../../../../../shared/schemas/server'
import {
  createSinger,
  ensureCompetitionEvent
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const input = await parseBody(event, competitionSingerSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const singer = createSinger(client, competition.id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.singer_create',
    entityType: 'competition_singer',
    entityId: singer.id,
    details: { name: singer.name, song: singer.song }
  })

  setResponseStatus(event, 201)
  return { singer }
})
