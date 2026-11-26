/**
 * 金数据条目拉取入库的一次完整运行。
 *
 * 后台手动同步、外部 cron 调用、站内定时插件都走这里，
 * 保证三处的增量水位、分页上限与失败记录口径一致。
 */

import { and, desc, eq } from 'drizzle-orm'
import { thirdPartyVoteRecords } from '../../database/schema'
import {
  fetchJinshujuEntries,
  JinshujuApiError,
  toJinshujuTimestamp,
  type JinshujuConfig
} from '../../utils/jinshuju'
import { ingestJinshujuEntries, recordThirdPartySyncState, type IngestContext } from './ingest'

export const OVERLAP_MS = 24 * 60 * 60 * 1000
export const MAX_PAGES_LIMIT = 50
export const DEFAULT_MAX_PAGES = 10

export interface SyncRunOptions {
  full?: boolean
  maxPages?: number
}

export interface SyncRunResult {
  received: number
  inserted: number
  skipped: number
  watch: number
  voided: number
  pages: number
  incrementalFrom: string | null
  nextCursor: string | null
}

/** 平台最新一条已入库票的投票时间，作为下次增量的水位。 */
export function latestSyncedVotedAt(context: IngestContext, formToken: string): number | null {
  return context.client.db
    .select({ votedAt: thirdPartyVoteRecords.votedAt })
    .from(thirdPartyVoteRecords)
    .where(and(
      eq(thirdPartyVoteRecords.provider, 'jinshuju'),
      eq(thirdPartyVoteRecords.formToken, formToken)
    ))
    .orderBy(desc(thirdPartyVoteRecords.votedAt))
    .limit(1)
    .get()?.votedAt ?? null
}

export async function runJinshujuSync(
  config: JinshujuConfig,
  context: IngestContext,
  options: SyncRunOptions = {}
): Promise<SyncRunResult> {
  const rawMaxPages = Number(options.maxPages ?? DEFAULT_MAX_PAGES)
  const maxPages = Number.isFinite(rawMaxPages)
    ? Math.min(MAX_PAGES_LIMIT, Math.max(1, Math.trunc(rawMaxPages)))
    : DEFAULT_MAX_PAGES

  const watermark = latestSyncedVotedAt(context, config.formToken)
  const created = !options.full && watermark !== null
    ? toJinshujuTimestamp(new Date(watermark - OVERLAP_MS))
    : undefined

  let cursor: string | null = null
  let pages = 0
  const totals = { received: 0, inserted: 0, skipped: 0, watch: 0, voided: 0 }

  try {
    while (pages < maxPages) {
      const page = await fetchJinshujuEntries(config, { created, next: cursor })
      pages += 1
      const outcome = ingestJinshujuEntries(context, page.data, {
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
    recordThirdPartySyncState(context, {
      formToken: config.formToken,
      error: message,
      added: totals.inserted
    })
    throw error instanceof JinshujuApiError
      ? new JinshujuApiError(message, error.status)
      : new JinshujuApiError(message, 0)
  }

  recordThirdPartySyncState(context, {
    formToken: config.formToken,
    cursor,
    lastEntryAt: latestSyncedVotedAt(context, config.formToken),
    added: totals.inserted
  })

  return {
    ...totals,
    pages,
    incrementalFrom: created ?? null,
    nextCursor: cursor
  }
}
