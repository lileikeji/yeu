import { setCompetitionEntrySongSchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  setEntrySong
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/** 后台按轮次改曲目：只改这一轮的条目，初赛/复赛/决赛各记各的。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, setCompetitionEntrySongSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  setEntrySong(client, round, input.entryId, input.song)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.entry_song',
    entityType: 'competition_round_entry',
    entityId: input.entryId,
    details: { key: roundKey, song: input.song }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
