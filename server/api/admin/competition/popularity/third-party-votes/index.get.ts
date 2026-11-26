import { thirdPartyVoteManualQuerySchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  listPopularityCandidates
} from '../../../../../modules/competition/service'
import { MANUAL_FORM_TOKEN, listThirdPartyVotes, summarizeThirdPartyVotes } from '../../../../../modules/vote-sync/manual'
import { resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { readJinshujuConfig } from '../../../../../utils/jinshuju'
import { parseQuery } from '../../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const query = parseQuery(event, thirdPartyVoteManualQuerySchema)
  const formToken = readJinshujuConfig(event)?.formToken || MANUAL_FORM_TOKEN

  return {
    formToken,
    summary: summarizeThirdPartyVotes(client, formToken),
    candidates: listPopularityCandidates(client, eventRow.id).map(item => ({
      singerId: item.singerId,
      name: item.name,
      number: item.number,
      className: item.className,
      song: item.song
    })),
    records: listThirdPartyVotes(client, formToken, query.limit ?? 50)
  }
})
