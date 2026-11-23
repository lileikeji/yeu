import { z } from 'zod'
import {
  clearFinalPairs,
  drawFinalPairs,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

const bodySchema = z.object({
  action: z.enum(['draw', 'clear'])
}).strict()

/** 决赛抽签 1v1：开唱前随机配对；有评分后不可再抽。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, bodySchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)

  if (input.action === 'draw') {
    drawFinalPairs(client, round)
  } else {
    clearFinalPairs(client, round)
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.final_pairs',
    entityType: 'competition_round',
    entityId: round.id,
    details: { roundKey, action: input.action }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
