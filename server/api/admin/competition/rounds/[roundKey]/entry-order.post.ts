import { setCompetitionEntryOrderSchema } from '../../../../../../shared/schemas/server'
import {
  applyEntrySortOrders,
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

/** 现场手写号再排：一次提交整批出场顺序。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, setCompetitionEntryOrderSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  applyEntrySortOrders(client, round, input.orders)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.entry_order',
    entityType: 'competition_round',
    entityId: round.id,
    details: { roundKey, count: input.orders.length }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
