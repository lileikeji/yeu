import { thirdPartySyncRunSchema } from '../../../../../../shared/schemas/server'
import { resolveIngestContext } from '../../../../../modules/vote-sync/ingest'
import { MANUAL_FORM_TOKEN, summarizeThirdPartyVotes } from '../../../../../modules/vote-sync/manual'
import { runJinshujuSync } from '../../../../../modules/vote-sync/sync-runner'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { JinshujuApiError, readJinshujuConfig } from '../../../../../utils/jinshuju'
import { parseBody } from '../../../../../utils/validation'

/** 后台按钮触发一次同步，不用带 sync secret。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, thirdPartySyncRunSchema)
  const config = readJinshujuConfig(event)
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Jinshuju is not configured',
      data: { code: 'JINSHUJU_NOT_CONFIGURED' }
    })
  }

  try {
    const result = await runJinshujuSync(config, resolveIngestContext(event), input)
    writeAudit(client, event, {
      actorAdminId: session.admin.id,
      action: 'competition.popularity_third_party_sync',
      entityType: 'third_party_vote_records',
      entityId: config.formToken,
      details: { ...result, full: input.full === true }
    })

    return {
      ok: true,
      ...result,
      summary: summarizeThirdPartyVotes(client, config.formToken || MANUAL_FORM_TOKEN)
    }
  } catch (error) {
    const message = error instanceof JinshujuApiError ? error.message : String(error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Jinshuju request failed',
      data: { code: 'JINSHUJU_REQUEST_FAILED', message }
    })
  }
})
