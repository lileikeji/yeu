import { thirdPartyVoteManualQuerySchema } from '../../../../../../shared/schemas/server'
import { MANUAL_FORM_TOKEN, deleteThirdPartyVote, summarizeThirdPartyVotes } from '../../../../../modules/vote-sync/manual'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { readJinshujuConfig } from '../../../../../utils/jinshuju'
import { parseQuery } from '../../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const query = parseQuery(event, thirdPartyVoteManualQuerySchema)
  if (!query.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Vote record id is required',
      data: { code: 'VOTE_RECORD_ID_REQUIRED' }
    })
  }

  const formToken = readJinshujuConfig(event)?.formToken || MANUAL_FORM_TOKEN
  const result = deleteThirdPartyVote(client, formToken, query.id)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_third_party_manual_delete',
    entityType: 'third_party_vote_records',
    entityId: query.id,
    details: { formToken, deleted: result.deleted }
  })

  return { ...result, formToken, summary: summarizeThirdPartyVotes(client, formToken) }
})
