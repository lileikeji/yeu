import { and, eq, sql } from 'drizzle-orm'
import {
  ensureCompetitionEvent,
  listPopularityCandidates
} from '../../../../../modules/competition/service'
import {
  DEFAULT_OPTION_FIELD,
  readActiveFormConfig
} from '../../../../../modules/vote-sync/form-config'
import { MANUAL_FORM_TOKEN, summarizeThirdPartyVotes } from '../../../../../modules/vote-sync/manual'
import { thirdPartyVoteRecords, thirdPartyVoteSyncStates } from '../../../../../database/schema'
import { resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import {
  fetchJinshujuForm,
  listJinshujuForms,
  readJinshujuConfig,
  readJinshujuToken
} from '../../../../../utils/jinshuju'
import type { JinshujuFormSummary } from '../../../../../utils/jinshuju'

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 后台读取第三方表单状态：账号下的表单清单 + 远端结构 + 本地统计 + 同步水位。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const config = readJinshujuConfig(event)
  const stored = readActiveFormConfig(event)
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
      remoteError = describeError(error)
    }
  }

  const apiToken = readJinshujuToken(event)
  let forms: JinshujuFormSummary[] = []
  let formsError: string | null = null
  if (apiToken) {
    try {
      forms = await listJinshujuForms({
        apiToken,
        formToken: config?.formToken ?? '',
        optionField: config?.optionField ?? DEFAULT_OPTION_FIELD
      })
    } catch (error) {
      formsError = describeError(error)
    }
  }

  return {
    configured: Boolean(config),
    tokenConfigured: Boolean(apiToken),
    formToken,
    optionField: config?.optionField ?? null,
    activeSource: stored ? 'file' : (config ? 'env' : 'none'),
    storedConfig: stored,
    form,
    remoteError,
    forms,
    formsError,
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
          lastError: syncState.lastError,
          lastErrorAt: syncState.lastErrorAt,
          failureStreak: syncState.failureStreak,
          totalFailures: syncState.totalFailures,
          // 连续两轮以上失败才算「同步挂了」：单次网络抖动不应该在后台亮红灯。
          healthy: syncState.failureStreak < 2
        }
      : null
  }
})
