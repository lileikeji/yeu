/**
 * 后台手动录入第三方投票明细。
 *
 * 金数据表单限制只有微信内能填写，现场有人投不了时由后台代录；
 * 代录票与平台拉回来的票同表存放，同一个 form_token 下一起进榜单。
 * 人工录入视为人工判定，不跑风险评分（score 恒 0、flags 为空），
 * 需要标记待审或作废时由录入人直接选状态。
 */

import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { thirdPartyVoteRecords } from '../../database/schema'
import { useAppDatabase } from '../../utils/database'

/** 未配置金数据表单时，手动录入与榜单接口共用的固定 form_token。 */
export const MANUAL_FORM_TOKEN = 'manual'

/** 单次最多补录的条数，防止手滑填错量级。 */
const MAX_BATCH = 50

export type ThirdPartyVoteStatus = 'valid' | 'watch' | 'void'

export interface ManualVoteInput {
  optionId: string
  count?: number
  votedAt?: number
  voterRef?: string
  status?: ThirdPartyVoteStatus
}

export interface ThirdPartyVoteListRow {
  id: string
  provider: string
  optionId: string
  voterRef: string | null
  votedAt: number
  status: ThirdPartyVoteStatus
  score: number
  flags: string[]
  fillSeconds: number | null
}

export interface ThirdPartyVoteSummary {
  total: number
  valid: number
  watch: number
  voided: number
}

export function insertManualVotes(
  client: ReturnType<typeof useAppDatabase>,
  formToken: string,
  input: ManualVoteInput
): { inserted: number } {
  const count = Math.min(Math.max(Math.trunc(input.count ?? 1), 1), MAX_BATCH)
  const votedAt = input.votedAt ?? Date.now()
  const status = input.status ?? 'valid'
  const now = Date.now()

  const insert = client.sqlite.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const recordId = randomUUID()
      client.db.insert(thirdPartyVoteRecords).values({
        id: `manual:${recordId}`,
        provider: 'manual',
        formToken,
        recordId,
        optionId: input.optionId,
        voterRef: input.voterRef || null,
        ipHash: null,
        ipCidr: null,
        uaSummary: null,
        votedAt,
        fillSeconds: null,
        score: 0,
        flagsJson: '[]',
        status,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing().run()
    }
  })
  insert()

  return { inserted: count }
}

export function listThirdPartyVotes(
  client: ReturnType<typeof useAppDatabase>,
  formToken: string,
  limit = 50
): ThirdPartyVoteListRow[] {
  const rows = client.db
    .select({
      id: thirdPartyVoteRecords.id,
      provider: thirdPartyVoteRecords.provider,
      optionId: thirdPartyVoteRecords.optionId,
      voterRef: thirdPartyVoteRecords.voterRef,
      votedAt: thirdPartyVoteRecords.votedAt,
      status: thirdPartyVoteRecords.status,
      score: thirdPartyVoteRecords.score,
      flagsJson: thirdPartyVoteRecords.flagsJson,
      fillSeconds: thirdPartyVoteRecords.fillSeconds
    })
    .from(thirdPartyVoteRecords)
    .where(eq(thirdPartyVoteRecords.formToken, formToken))
    .orderBy(desc(thirdPartyVoteRecords.votedAt))
    .limit(limit)
    .all()

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    optionId: row.optionId,
    voterRef: row.voterRef,
    votedAt: row.votedAt,
    status: row.status,
    score: row.score,
    flags: parseFlags(row.flagsJson),
    fillSeconds: row.fillSeconds
  }))
}

export function summarizeThirdPartyVotes(
  client: ReturnType<typeof useAppDatabase>,
  formToken: string
): ThirdPartyVoteSummary {
  const rows = client.db
    .select({ status: thirdPartyVoteRecords.status, count: sql<number>`count(*)` })
    .from(thirdPartyVoteRecords)
    .where(eq(thirdPartyVoteRecords.formToken, formToken))
    .groupBy(thirdPartyVoteRecords.status)
    .all()

  const summary: ThirdPartyVoteSummary = { total: 0, valid: 0, watch: 0, voided: 0 }
  for (const row of rows) {
    summary.total += row.count
    if (row.status === 'valid') summary.valid += row.count
    if (row.status === 'watch') summary.watch += row.count
    if (row.status === 'void') summary.voided += row.count
  }

  return summary
}

export function updateThirdPartyVoteStatus(
  client: ReturnType<typeof useAppDatabase>,
  formToken: string,
  id: string,
  status: ThirdPartyVoteStatus
): { updated: number } {
  const result = client.db
    .update(thirdPartyVoteRecords)
    .set({ status, updatedAt: Date.now() })
    .where(and(eq(thirdPartyVoteRecords.formToken, formToken), eq(thirdPartyVoteRecords.id, id)))
    .run()

  return { updated: result.changes }
}

export function deleteThirdPartyVote(
  client: ReturnType<typeof useAppDatabase>,
  formToken: string,
  id: string
): { deleted: number } {
  const result = client.db
    .delete(thirdPartyVoteRecords)
    .where(and(eq(thirdPartyVoteRecords.formToken, formToken), eq(thirdPartyVoteRecords.id, id)))
    .run()

  return { deleted: result.changes }
}

function parseFlags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}
