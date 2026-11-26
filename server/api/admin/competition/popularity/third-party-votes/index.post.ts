import { thirdPartyVoteManualCreateSchema } from '../../../../../../shared/schemas/server'
import { MANUAL_FORM_TOKEN, insertManualVotes, summarizeThirdPartyVotes } from '../../../../../modules/vote-sync/manual'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { readJinshujuConfig } from '../../../../../utils/jinshuju'
import { parseBody } from '../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const formToken = readJinshujuConfig(event)?.formToken || MANUAL_FORM_TOKEN
  const input = await parseBody(event, thirdPartyVoteManualCreateSchema)

  const result = insertManualVotes(client, formToken, input)
  const summary = summarizeThirdPartyVotes(client, formToken)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_manual_add',
    entityType: 'third_party_vote_records',
    entityId: formToken,
    details: {
      optionId: input.optionId,
      count: result.inserted,
      status: input.status ?? 'valid',
      votedAt: input.votedAt ?? null,
      voterRef: input.voterRef ?? ''
    }
  })

  return { ...result, formToken, summary }
})
