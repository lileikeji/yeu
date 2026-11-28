/**
 * 第三方投票明细入库：归一化 → 窗口统计 → 风险评分 → 幂等落库。
 *
 * 幂等键是平台侧的 recordId，重复拉取同一页不会产生重复票。
 */

import { createHash } from 'node:crypto'
import { and, eq, gte, lte } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { thirdPartyVoteRecords, thirdPartyVoteSyncStates } from '../../database/schema'
import { useAppDatabase } from '../../utils/database'
import { normalizeJinshujuEntry } from './jinshuju-map'
import {
  decideThirdPartyStatus,
  normalizeIpCidr,
  scoreThirdPartyVote,
  type ThirdPartyVoteRow
} from './risk'
import {
  BURST_WINDOW_MS,
  WINDOW_MS,
  computeThirdPartyContext,
  estimateBaselinePerMinute,
  type VoteWindowSample
} from './window'

export {
  BURST_WINDOW_MS,
  WINDOW_MS,
  computeThirdPartyContext,
  estimateBaselinePerMinute,
  type VoteWindowSample
}

const DEFAULT_PROVIDER = 'jinshuju'

export interface ThirdPartyIngestResult {
  received: number
  inserted: number
  skipped: number
  watch: number
  voided: number
}

function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 16)
}

function readIpHashSalt(event?: H3Event): string {
  const config = useRuntimeConfig(event) as Record<string, unknown>
  const dedicated = typeof config.jinshujuIpHashSecret === 'string' ? config.jinshujuIpHashSecret.trim() : ''
  if (dedicated) return dedicated
  const session = typeof config.adminSessionSecret === 'string' ? config.adminSessionSecret.trim() : ''
  return session || 'yeu-third-party-vote'
}

/**
 * 入库依赖。把 client 与盐从 event 里剥出来后，路由和定时插件能共用同一套写入逻辑。
 */
export interface IngestContext {
  client: ReturnType<typeof useAppDatabase>
  salt: string
}

export function resolveIngestContext(event?: H3Event): IngestContext {
  return { client: useAppDatabase(event), salt: readIpHashSalt(event) }
}

export interface IngestOptions {
  provider?: string
  formToken: string
  optionField: string
}

/**
 * 把一页金数据条目写进库。返回本次新增/跳过/待审/作废的统计。
 */
export function ingestJinshujuEntries(
  context: IngestContext,
  entries: unknown[],
  options: IngestOptions
): ThirdPartyIngestResult {
  const provider = options.provider ?? DEFAULT_PROVIDER
  const client = context.client
  const now = Date.now()
  const salt = context.salt

  const normalized: ThirdPartyVoteRow[] = []
  for (const entry of entries) {
    const row = normalizeJinshujuEntry(entry, { optionField: options.optionField })
    if (row) normalized.push(row)
  }

  const result: ThirdPartyIngestResult = {
    received: entries.length,
    inserted: 0,
    skipped: 0,
    watch: 0,
    voided: 0
  }
  if (normalized.length === 0) return result

  normalized.sort((left, right) => left.votedAt - right.votedAt)
  const minVotedAt = normalized[0]!.votedAt
  const maxVotedAt = normalized[normalized.length - 1]!.votedAt

  const existing = client.db
    .select({
      recordId: thirdPartyVoteRecords.recordId,
      ipCidr: thirdPartyVoteRecords.ipCidr,
      voterRef: thirdPartyVoteRecords.voterRef,
      votedAt: thirdPartyVoteRecords.votedAt
    })
    .from(thirdPartyVoteRecords)
    .where(and(
      eq(thirdPartyVoteRecords.provider, provider),
      eq(thirdPartyVoteRecords.formToken, options.formToken),
      gte(thirdPartyVoteRecords.votedAt, minVotedAt - WINDOW_MS),
      lte(thirdPartyVoteRecords.votedAt, maxVotedAt + WINDOW_MS)
    ))
    .all()

  const seen = new Set(existing.map((item) => item.recordId))
  const pool: VoteWindowSample[] = existing.map((item) => ({
    recordId: item.recordId,
    ipCidr: item.ipCidr,
    voterRef: item.voterRef,
    votedAt: item.votedAt
  }))
  const baselinePerMinute = estimateBaselinePerMinute(pool)

  const insertAll = client.sqlite.transaction(() => {
    for (const row of normalized) {
      if (seen.has(row.recordId)) {
        result.skipped += 1
        continue
      }

      const ipCidr = normalizeIpCidr(row.ip)
      const sample: VoteWindowSample = {
        recordId: row.recordId,
        ipCidr,
        voterRef: row.voterRef,
        votedAt: row.votedAt
      }
      const scored = scoreThirdPartyVote(row, computeThirdPartyContext(sample, pool, baselinePerMinute))
      const status = decideThirdPartyStatus(scored.score)

      client.db.insert(thirdPartyVoteRecords).values({
        id: `${provider}:${row.recordId}`,
        provider,
        formToken: options.formToken,
        recordId: row.recordId,
        optionId: row.optionId,
        voterRef: row.voterRef,
        ipHash: hashIp(row.ip, salt),
        ipCidr,
        uaSummary: row.uaSummary,
        votedAt: row.votedAt,
        fillSeconds: row.fillSeconds,
        score: scored.score,
        flagsJson: JSON.stringify(scored.flags),
        status,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing().run()

      seen.add(row.recordId)
      pool.push(sample)
      result.inserted += 1
      if (status === 'watch') result.watch += 1
      if (status === 'void') result.voided += 1
    }
  })
  insertAll()

  return result
}

/** 更新同步游标；表单维度单行，重复调用覆盖写。 */
export function recordThirdPartySyncState(
  context: IngestContext,
  options: {
    provider?: string
    formToken: string
    cursor?: string | null
    lastEntryAt?: number | null
    added?: number
    error?: string | null
  }
): void {
  const provider = options.provider ?? DEFAULT_PROVIDER
  const client = context.client
  const now = Date.now()
  const id = `${provider}:${options.formToken}`
  const failed = Boolean(options.error)
  const current = client.db
    .select()
    .from(thirdPartyVoteSyncStates)
    .where(eq(thirdPartyVoteSyncStates.id, id))
    .get()

  if (!current) {
    client.db.insert(thirdPartyVoteSyncStates).values({
      id,
      provider,
      formToken: options.formToken,
      cursor: options.cursor ?? null,
      lastSyncedAt: now,
      lastEntryAt: options.lastEntryAt ?? null,
      totalSynced: options.added ?? 0,
      lastError: options.error ?? null,
      lastErrorAt: failed ? now : null,
      failureStreak: failed ? 1 : 0,
      totalFailures: failed ? 1 : 0,
      createdAt: now,
      updatedAt: now
    }).run()
    return
  }

  const lastEntryAt = options.lastEntryAt ?? current.lastEntryAt
  client.db.update(thirdPartyVoteSyncStates)
    .set({
      cursor: options.cursor ?? current.cursor,
      lastSyncedAt: now,
      lastEntryAt: lastEntryAt !== null && current.lastEntryAt !== null
        ? Math.max(lastEntryAt, current.lastEntryAt)
        : lastEntryAt,
      totalSynced: current.totalSynced + (options.added ?? 0),
      lastError: options.error ?? null,
      lastErrorAt: failed ? now : current.lastErrorAt,
      // 连续失败次数用于后台提示「同步一直在挂」，累计失败次数用于判断是否偶发。
      failureStreak: failed ? current.failureStreak + 1 : 0,
      totalFailures: current.totalFailures + (failed ? 1 : 0),
      updatedAt: now
    })
    .where(eq(thirdPartyVoteSyncStates.id, id))
    .run()
}
