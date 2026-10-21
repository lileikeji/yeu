import { createCompetitionJudgesSchema } from '../../../../../../../shared/schemas/server'
import {
  createJudgeAccounts,
  ensureCompetitionEvent,
  getRoundByKey
} from '../../../../../../modules/competition/service'
import { writeAudit } from '../../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../../utils/http'
import { parseBody } from '../../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, createCompetitionJudgesSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const judges = await createJudgeAccounts(client, round, input.count)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.judges_create',
    entityType: 'competition_round',
    entityId: round.id,
    details: { key: roundKey, count: judges.length, usernames: judges.map(judge => judge.username) }
  })

  setResponseStatus(event, 201)
  return { judges }
})
