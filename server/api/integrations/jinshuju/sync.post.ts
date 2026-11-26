/**
 * 主动从金数据拉取表单条目并入库。
 *
 * 触发方式：后台手动点一次，或外部 cron 带 Bearer 调。
 * 增量策略：首次不带 created_at 全量翻页；之后用「水位 - 1 天」做重叠窗口，
 * 重叠部分的重复条目靠 recordId 幂等丢弃。
 */

import { and, desc, eq } from 'drizzle-orm'
import { getHeader, getQuery } from 'h3'
import { thirdPartyVoteRecords } from '../../../database/schema'
import { verifyBearerToken } from '../../../modules/bots/security'
import { ingestJinshujuEntries, recordThirdPartySyncState, resolveIngestContext } from '../../../modules/vote-sync/ingest'
import { useAppDatabase } from '../../../utils/database'
import {
  fetchJinshujuEntries,
  readJinshujuConfig,
  toJinshujuTimestamp,
  JinshujuApiError
} from '../../../utils/jinshuju'

const MAX_PAGES_LIMIT = 50
const DEFAULT_MAX_PAGES = 10
const OVERLAP_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event) as Record<string, unknown>
  const syncSecret = typeof runtimeConfig.jinshujuSyncSecret === 'string'
    ? runtimeConfig.jinshujuSyncSecret.trim()
    : ''
  if (syncSecret.length < 16) {
    return { ok: false, reason: 'sync_secret_not_configured' }
  }
  const syncQueryToken = getQuery(event).token
  const syncAuthorization = getHeader(event, 'authorization')
    ?? (typeof syncQueryToken === 'string' && syncQueryToken ? `Bearer ${syncQueryToken}` : undefined)
  if (!verifyBearerToken(syncAuthorization, syncSecret)) {
    setResponseStatus(event, 401)
    return { ok: false, reason: 'unauthorized' }
  }

  const config = readJinshujuConfig(event)
  if (!config) {
    setResponseStatus(event, 503)
    return { ok: false, reason: 'jinshuju_not_configured' }
  }

  const client = useAppDatabase(event)
  const ingestContext = resolveIngestContext(event)
  const latestVotedAt = () => client.db
    .select({ votedAt: thirdPartyVoteRecords.votedAt })
    .from(thirdPartyVoteRecords)
    .where(and(
      eq(thirdPartyVoteRecords.provider, 'jinshuju'),
      eq(thirdPartyVoteRecords.formToken, config.formToken)
    ))
    .orderBy(desc(thirdPartyVoteRecords.votedAt))
    .limit(1)
    .get()?.votedAt ?? null

  const query = getQuery(event)
  const full = String(query.full ?? '') === '1'
  const rawMaxPages = Number(query.maxPages ?? DEFAULT_MAX_PAGES)
  const maxPages = Number.isFinite(rawMaxPages)
    ? Math.min(MAX_PAGES_LIMIT, Math.max(1, Math.trunc(rawMaxPages)))
    : DEFAULT_MAX_PAGES

  const watermark = latestVotedAt()
  const created = !full && watermark !== null
    ? toJinshujuTimestamp(new Date(watermark - OVERLAP_MS))
    : undefined

  let cursor: string | null = null
  let pages = 0
  const totals = { received: 0, inserted: 0, skipped: 0, watch: 0, voided: 0 }

  try {
    while (pages < maxPages) {
      const page = await fetchJinshujuEntries(config, { created, next: cursor })
      pages += 1
      const outcome = ingestJinshujuEntries(ingestContext, page.data, {
        formToken: config.formToken,
        optionField: config.optionField
      })
      totals.received += outcome.received
      totals.inserted += outcome.inserted
      totals.skipped += outcome.skipped
      totals.watch += outcome.watch
      totals.voided += outcome.voided
      cursor = page.next
      if (!cursor) break
    }
  } catch (error) {
    const message = error instanceof JinshujuApiError
      ? `${error.message}（status=${error.status}）`
      : error instanceof Error ? error.message : String(error)
    recordThirdPartySyncState(ingestContext, {
      formToken: config.formToken,
      error: message,
      added: totals.inserted
    })
    setResponseStatus(event, 502)
    return { ok: false, reason: 'jinshuju_request_failed', message, ...totals }
  }

  recordThirdPartySyncState(ingestContext, {
    formToken: config.formToken,
    cursor,
    lastEntryAt: latestVotedAt(),
    added: totals.inserted
  })

  return {
    ok: true,
    provider: 'jinshuju',
    formToken: config.formToken,
    incrementalFrom: created ?? null,
    pages,
    ...totals,
    nextCursor: cursor
  }
})
