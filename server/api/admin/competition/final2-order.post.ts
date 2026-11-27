import { competitionFinal2OrderSchema } from '../../../../shared/schemas/server'
import {
  getAdminCompetitionPayload,
  setFinal2Order
} from '../../../modules/competition/service'
import { writeAudit } from '../../../utils/audit'
import { resolveCompetitionContentId } from '../../../utils/competition-admin'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

/** 排定决赛第二轮出场顺序：晋级的人按这个先后排，没晋级的在确认名单时剔除。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const input = await parseBody(event, competitionFinal2OrderSchema)

  const result = setFinal2Order(client, contentId, input.names)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.final2_order',
    entityType: 'competition_event',
    entityId: contentId,
    details: {
      count: result.order.length,
      unmatched: result.unmatched
    }
  })

  return {
    ...result,
    payload: getAdminCompetitionPayload(client, contentId)
  }
})
