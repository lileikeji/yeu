import { and, eq, sql } from 'drizzle-orm'
import {
  ensureCompetitionEvent,
  listPopularityCandidates
} from '../../../../../modules/competition/service'
import { MANUAL_FORM_TOKEN, summarizeThirdPartyVotes } from '../../../../../modules/vote-sync/manual'
import { thirdPartyVoteRecords, thirdPartyVoteSyncStates } from '../../../../../database/schema'
import { resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { fetchJinshujuForm, readJinshujuConfig } from '../../../../../utils/jinshuju'

/** 后台读取第三方表单状态：远端结构 + 本地统计 + 同步水位。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const config = readJinshujuConfig(event)
  const formToken = config?.formToken || MANUAL_FORM_TOKEN

  const syncState = client.db
    .select()
    .from(thirdPartyVoteSyncStates)
    .where(eq(thirdPartyVoteSyncStates.formToken, formToken))
    .get() ?? null

  const countRows = client.db
    .select({ optionId: thirdPartyVoteRecords.optionId, count: sql<number>`count(*)` })
    .from(thirdPartyVoteRecords)
    .where(and(
      eq(thirdPartyVoteRecords.formToken, formToken),
      eq(thirdPartyVoteRecords.status, 'valid')
    ))
    .groupBy(thirdPartyVoteRecords.optionId)
    .all()
  const optionCounts: Record<string, number> = {}
  for (const row of countRows) optionCounts[row.optionId] = row.count

  let form = null
  let remoteError: string | null = null
  if (config) {
    try {
      form = await fetchJinshujuForm(config)
    } catch (error) {
      remoteError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    configured: Boolean(config),
    formToken,
    optionField: config?.optionField ?? null,
    form,
    remoteError,
    candidates: listPopularityCandidates(client, eventRow.id).map(item => ({
      singerId: item.singerId,
      name: item.name,
      number: item.number,
      className: item.className,
      song: item.song
    })),
    optionCounts,
    summary: summarizeThirdPartyVotes(client, formToken),
    syncState: syncState
      ? {
          cursor: syncState.cursor,
          lastSyncedAt: syncState.lastSyncedAt,
          lastEntryAt: syncState.lastEntryAt,
          totalSynced: syncState.totalSynced,
          lastError: syncState.lastError
        }
      : null
  }
})
