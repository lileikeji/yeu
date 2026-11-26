import { thirdPartyVoteStatusSchema } from '../../../../../../shared/schemas/server'
import {
  MANUAL_FORM_TOKEN,
  summarizeThirdPartyVotes,
  updateThirdPartyVoteStatus
} from '../../../../../modules/vote-sync/manual'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { readJinshujuConfig } from '../../../../../utils/jinshuju'
import { parseBody } from '../../../../../utils/validation'

/** 人工复核：把单条记录改成有效 / 待审 / 作废。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, thirdPartyVoteStatusSchema)
  const formToken = readJinshujuConfig(event)?.formToken || MANUAL_FORM_TOKEN

  const result = updateThirdPartyVoteStatus(client, formToken, input.id, input.status)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_status',
    entityType: 'third_party_vote_records',
    entityId: input.id,
    details: { status: input.status, updated: result.updated }
  })

  return { ...result, formToken, summary: summarizeThirdPartyVotes(client, formToken) }
})
