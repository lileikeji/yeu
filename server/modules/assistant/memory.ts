/**
 * Session-scoped assistant memory (zero-dependency, SQLite-only).
 *
 * Design follows the ADD-only extraction pattern popularized by Mem0: each
 * completed assistant turn appends compact memory entries instead of mutating
 * older ones, and retrieval scores them against the current query. The current
 * production constraints (single-core 768 MB, no local transformer, gateway
 * without an embedding endpoint) rule out a vector store or a model-based
 * extractor, so extraction is rule-based over the normalized query and
 * retrieval reuses the existing character n-gram Dice similarity from
 * `./retrieval-semantic`.
 *
 * Privacy: a session id is never stored raw. The API layer hashes it with
 * `hashSessionKey` and only the digest (a `session_key`) is persisted, so the
 * server cannot recover the client session identity from the table. Entries
 * are scoped to one session, expire by default after
 * `SESSION_MEMORY_DEFAULT_TTL_MS`, and `clearSessionMemories` drops everything
 * for a session on demand.
 *
 * @module server/modules/assistant/memory
 */

import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import { assistantSessionMemory } from '../../database/schema'
import { normalizeAssistantQuery } from '../../../shared/utils/assistant-query'
import { semanticTextSimilarity } from './retrieval-semantic'

export const SESSION_MEMORY_KINDS = ['preference', 'fact', 'answered', 'open_question'] as const
export type SessionMemoryKind = (typeof SESSION_MEMORY_KINDS)[number]

/** Default memory lifetime: 30 days. */
export const SESSION_MEMORY_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Effective memory TTL in ms; NUXT_ASSISTANT_MEMORY_TTL_DAYS (1..365) overrides the default. */
export function sessionMemoryTtlMs(): number {
  const raw = process.env.NUXT_ASSISTANT_MEMORY_TTL_DAYS?.trim()
  if (raw) {
    const days = Number(raw)
    if (Number.isInteger(days) && days >= 1 && days <= 365) return days * 24 * 60 * 60 * 1000
  }
  return SESSION_MEMORY_DEFAULT_TTL_MS
}

/** Hard cap on entries per session; the oldest entries are pruned first. */
export const SESSION_MEMORY_MAX_PER_SESSION = 200

/** Maximum memory lines injected into the model context on one turn. */
export const SESSION_MEMORY_CONTEXT_LIMIT = 8

/** Minimum retrieval score for a memory entry to enter the context. */
const SESSION_MEMORY_MIN_SCORE = 0.08

export interface SessionMemoryRecord {
  id: string
  sessionKey: string
  kind: SessionMemoryKind
  content: string
  sourceQueryHash: string
  sourceQuery: string
  answerDigest: string | null
  importance: number
  hitCount: number
  lastHitAt: number | null
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

export interface RememberTurnInput {
  /** The raw client query (not the follow-up-composed one). */
  query: string
  /** The answer text returned for this turn. */
  answer: string
  /** Model confidence (0..1); low confidence turns are remembered as open questions. */
  confidence: number
  mode: 'local' | 'ai'
}

interface MemoryRow {
  id: string
  session_key: string
  kind: SessionMemoryKind
  content: string
  source_query_hash: string
  source_query: string
  answer_digest: string | null
  importance: number
  hit_count: number
  last_hit_at: number | null
  expires_at: number | null
  created_at: number
  updated_at: number
}

function rowToRecord(row: MemoryRow): SessionMemoryRecord {
  return {
    id: row.id,
    sessionKey: row.session_key,
    kind: row.kind,
    content: row.content,
    sourceQueryHash: row.source_query_hash,
    sourceQuery: row.source_query,
    answerDigest: row.answer_digest,
    importance: row.importance,
    hitCount: row.hit_count,
    lastHitAt: row.last_hit_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** Session id format accepted from clients: URL-safe, 8..128 chars. */
export function isValidSessionId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length >= 8
    && trimmed.length <= 128
    && /^[A-Za-z0-9._~-]+$/.test(trimmed)
}

/** One-way digest of a client session id; the only form persisted to SQLite. */
export function hashSessionKey(sessionId: string): string {
  return createHash('sha256').update(sessionId.normalize('NFKC')).digest('hex')
}

/** Stable hash of a normalized query, used for ADD-only de-duplication. */
export function sessionQueryHash(query: string): string {
  return createHash('sha256')
    .update(normalizeAssistantQuery(query).toLocaleLowerCase('zh-CN'))
    .digest('hex')
}

function answerDigestOf(answer: string): string {
  return answer.replace(/\s+/g, ' ').trim().slice(0, 160)
}

/** Rule-based fact extraction from a raw query; returns null when nothing is clear. */
function extractQueryFacts(query: string): string[] {
  const normalized = normalizeAssistantQuery(query)
    .toLocaleLowerCase('zh-CN')
    .replace(/[?？。！!，,、；;]+$/u, '')
  const facts: string[] = []

  const identityMatch = normalized.match(/(?:我是|我读|我学|我今年|我想|我要|我准备).{0,24}?(专升本|研究生|普通本科|大一|大二|大三|大四|新生)/u)
  if (identityMatch) {
    facts.push(`提问者身份线索：${identityMatch[1]}`)
  }

  const majorMatch = normalized.match(/(?:我是|我读|我学|我想(?:学|读)|我准备(?:学|读))(?:的)?(?:专业)?[:：]?([\u4e00-\u9fff]{2,12})(?:专业|系|学院|方向)/u)
  if (majorMatch && majorMatch[1] && majorMatch[1].length >= 2) {
    facts.push(`提问者关注的专业：${majorMatch[1]}`)
  }

  const dormMatch = normalized.match(/(?:我住|我分到|我在).{0,16}?([\u4e00-\u9fff]{1,8}楼)/u)
  if (dormMatch) {
    facts.push(`提问者宿舍线索：${dormMatch[1]}`)
  }

  return [...new Set(facts)]
}

/**
 * Append memory for one completed assistant turn. Best-effort: callers wrap
 * this in try/catch and never let a memory write fail the answer. ADD-only —
 * an identical (session, kind, query-hash) entry is refreshed in place instead
 * of being duplicated.
 */
export function rememberSessionTurn(
  client: DatabaseClient,
  sessionKey: string,
  input: RememberTurnInput
): void {
  const query = normalizeAssistantQuery(input.query)
  if (!query) return
  const now = Date.now()
  const queryHash = sessionQueryHash(query)
  const digest = answerDigestOf(input.answer)
  const expiresAt = now + sessionMemoryTtlMs()

  const upsert = (kind: SessionMemoryKind, content: string, answerDigest: string | null): void => {
    const existing = client.db.select({ id: assistantSessionMemory.id })
      .from(assistantSessionMemory)
      .where(and(
        eq(assistantSessionMemory.sessionKey, sessionKey),
        eq(assistantSessionMemory.kind, kind),
        eq(assistantSessionMemory.sourceQueryHash, queryHash)
      ))
      .get()
    if (existing) {
      client.db.update(assistantSessionMemory)
        .set({
          content,
          answerDigest,
          importance: sql<number>`min(100, ${assistantSessionMemory.importance} + 5)`,
          expiresAt,
          updatedAt: now
        })
        .where(eq(assistantSessionMemory.id, existing.id))
        .run()
      return
    }
    client.db.insert(assistantSessionMemory).values({
      id: createHash('sha256').update(`${sessionKey}:${kind}:${queryHash}`).digest('hex').slice(0, 32),
      sessionKey,
      kind,
      content,
      contentHash: sessionMemoryContentHash(content),
      sourceQueryHash: queryHash,
      sourceQuery: query.slice(0, 300),
      answerDigest,
      importance: 50,
      hitCount: 0,
      lastHitAt: null,
      expiresAt,
      createdAt: now,
      updatedAt: now
    }).onConflictDoNothing().run()
  }

  upsert('answered', query, digest)

  for (const fact of extractQueryFacts(query)) {
    upsert('fact', fact, null)
  }

  // A low-confidence turn means the local sources could not answer; remember
  // the open question so a later turn can avoid repeating the same dead end.
  if (input.confidence < 0.6 && /(?:无法确认|资料不足|待学校通知|未能|暂无|尚未公布|没有找到)/.test(input.answer)) {
    upsert('open_question', query, digest)
  }

  // Prune the session back to its cap, oldest first.
  const total = client.sqlite.prepare(
    'SELECT count(*) AS value FROM assistant_session_memory WHERE session_key = ?'
  ).get(sessionKey) as { value: number }
  if (total.value > SESSION_MEMORY_MAX_PER_SESSION) {
    const excess = client.db.select({ id: assistantSessionMemory.id })
      .from(assistantSessionMemory)
      .where(eq(assistantSessionMemory.sessionKey, sessionKey))
      .orderBy(asc(sql`rowid`))
      .limit(total.value - SESSION_MEMORY_MAX_PER_SESSION)
      .all()
    if (excess.length > 0) {
      client.db.delete(assistantSessionMemory)
        .where(inArray(assistantSessionMemory.id, excess.map(item => item.id)))
        .run()
    }
  }
}

/** Score one memory entry against the query (similarity + importance + recency). */
function memoryScore(
  query: string,
  record: SessionMemoryRecord,
  now: number,
  semantic = 0
): number {
  // Semantic cosine (0..1) from the vector channel acts as an alternative
  // similarity signal: a recall question phrased differently from the stored
  // fact ("我刚才说我喜欢什么时候学习" vs "用户认为自己晚上学习效率更高")
  // shares few character n-grams, so pure lexical Dice would drop it below the
  // threshold. When the semantic score is stronger, use it instead of the
  // lexical Dice similarity; importance/recency keep their original weight.
  const similarity = Math.max(semanticTextSimilarity(query, record.content), semantic)
  const ageMs = Math.max(0, now - record.createdAt)
  const recency = Math.max(0, 1 - ageMs / SESSION_MEMORY_DEFAULT_TTL_MS)
  return similarity * 0.6 + (record.importance / 100) * 0.2 + recency * 0.2
}

/**
 * Rank this session's active memories against the query and return the top
 * `limit` entries. Hits are recorded best-effort (retrieval must never throw).
 */
export function retrieveSessionMemories(
  client: DatabaseClient,
  sessionKey: string,
  query: string,
  limit = SESSION_MEMORY_CONTEXT_LIMIT,
  /** Optional memoryId -> cosine similarity (0..1) from the vector channel. */
  semanticScores?: ReadonlyMap<string, number>
): SessionMemoryRecord[] {
  if (!query.trim()) return []
  const now = Date.now()
  let rows: MemoryRow[]
  try {
    rows = client.sqlite.prepare(
      'SELECT * FROM assistant_session_memory WHERE session_key = ? AND (expires_at IS NULL OR expires_at > ?)'
    ).all(sessionKey, now) as MemoryRow[]
  } catch {
    return []
  }
  const records = rows.map(rowToRecord)
  const scored = records
    .map(record => ({
      record,
      score: memoryScore(query, record, now, semanticScores?.get(record.id) ?? 0)
    }))
    .filter(item => item.score >= SESSION_MEMORY_MIN_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
  if (scored.length > 0) {
    try {
      const nowMs = Date.now()
      for (const item of scored) {
        client.db.update(assistantSessionMemory)
          .set({ hitCount: sql<number>`${assistantSessionMemory.hitCount} + 1`, lastHitAt: nowMs, updatedAt: nowMs })
          .where(eq(assistantSessionMemory.id, item.record.id))
          .run()
      }
    } catch {
      // Hit accounting must never break retrieval.
    }
  }
  return scored.map(item => item.record)
}

/** Most recent remembered query for a session (for follow-up composition). */
export function readLastSessionQuery(client: DatabaseClient, sessionKey: string): string | null {
  const row = client.db.select({ sourceQuery: assistantSessionMemory.sourceQuery })
    .from(assistantSessionMemory)
    .where(and(
      eq(assistantSessionMemory.sessionKey, sessionKey),
      eq(assistantSessionMemory.kind, 'answered')
    ))
    .orderBy(desc(sql`rowid`))
    .limit(1)
    .get()
  return row?.sourceQuery ?? null
}

/** Delete one memory entry by id; returns true when it existed under the session. */
export function forgetSessionMemory(client: DatabaseClient, sessionKey: string, memoryId: string): boolean {
  const existing = client.db.select({ id: assistantSessionMemory.id })
    .from(assistantSessionMemory)
    .where(and(
      eq(assistantSessionMemory.id, memoryId),
      eq(assistantSessionMemory.sessionKey, sessionKey)
    ))
    .get()
  if (!existing) return false
  client.db.delete(assistantSessionMemory).where(eq(assistantSessionMemory.id, memoryId)).run()
  return true
}

/** Delete every memory entry for a session; returns the number removed. */
export function clearSessionMemories(client: DatabaseClient, sessionKey: string): number {
  const before = client.sqlite.prepare(
    'SELECT count(*) AS value FROM assistant_session_memory WHERE session_key = ?'
  ).get(sessionKey) as { value: number }
  client.db.delete(assistantSessionMemory).where(eq(assistantSessionMemory.sessionKey, sessionKey)).run()
  return before.value
}

/** Delete expired memories across all sessions; returns the number removed. */
export function cleanupExpiredSessionMemories(client: DatabaseClient, now = Date.now()): number {
  const expired = client.db.select({ id: assistantSessionMemory.id })
    .from(assistantSessionMemory)
    .where(lt(assistantSessionMemory.expiresAt, now))
    .all()
  if (expired.length === 0) return 0
  client.db.delete(assistantSessionMemory)
    .where(inArray(assistantSessionMemory.id, expired.map(item => item.id)))
    .run()
  return expired.length
}

/** Per-kind counts for a session (admin/debug surface). */
export function sessionMemoryStats(client: DatabaseClient, sessionKey: string): Record<SessionMemoryKind, number> {
  const rows = client.sqlite.prepare(
    'SELECT kind, count(*) AS value FROM assistant_session_memory WHERE session_key = ? GROUP BY kind'
  ).all(sessionKey) as Array<{ kind: SessionMemoryKind, value: number }>
  const stats: Record<SessionMemoryKind, number> = {
    preference: 0,
    fact: 0,
    answered: 0,
    open_question: 0
  }
  for (const row of rows) {
    if (row.kind in stats) stats[row.kind] = row.value
  }
  return stats
}

/** Human-readable context line for one memory entry. */
export function sessionMemoryContextLine(record: SessionMemoryRecord): string {
  const label = record.kind === 'answered'
    ? '此前问过'
    : record.kind === 'fact'
      ? '此前透露'
      : record.kind === 'preference'
        ? '此前偏好'
        : '此前问过但资料不足'
  const digest = record.answerDigest ? `，当时回答：${record.answerDigest}` : ''
  return `[${label}] ${record.content}${digest}`
}

/** Stable hash used to de-duplicate ADD-only extracted memory entries. */
export function sessionMemoryContentHash(content: string): string {
  return createHash('sha256')
    .update(content.normalize('NFKC'))
    .digest('hex')
}

export interface ExtractedMemoryFact {
  kind: 'preference' | 'fact'
  content: string
}

/**
 * ADD-only write of LLM-extracted facts (P2). Unlike the rule-based turn
 * writer, extracted entries are appended rather than merged: an identical
 * (session, kind, content-hash) entry is skipped, and conflicting older
 * entries stay in place while the newer one wins retrieval by recency.
 * Returns the number of new entries written.
 */
export function rememberExtractedFacts(
  client: DatabaseClient,
  sessionKey: string,
  sourceQuery: string,
  facts: ExtractedMemoryFact[]
): number {
  const query = normalizeAssistantQuery(sourceQuery)
  const now = Date.now()
  const queryHash = sessionQueryHash(query)
  const expiresAt = now + sessionMemoryTtlMs()
  let added = 0
  for (const fact of facts) {
    const content = fact.content.replace(/\s+/g, ' ').trim()
    if (!content || content.length < 4 || content.length > 200) continue
    if (fact.kind !== 'preference' && fact.kind !== 'fact') continue
    const contentHash = sessionMemoryContentHash(content)
    const existing = client.sqlite.prepare(
      'SELECT id FROM assistant_session_memory WHERE session_key = ? AND kind = ? AND content_hash = ?'
    ).get(sessionKey, fact.kind, contentHash)
    if (existing) continue
    client.db.insert(assistantSessionMemory).values({
      id: createHash('sha256').update(`${sessionKey}:${fact.kind}:${contentHash}`).digest('hex').slice(0, 32),
      sessionKey,
      kind: fact.kind,
      content,
      sourceQueryHash: queryHash,
      sourceQuery: query.slice(0, 300),
      answerDigest: null,
      importance: 60,
      hitCount: 0,
      lastHitAt: null,
      expiresAt,
      createdAt: now,
      updatedAt: now
    }).onConflictDoNothing().run()
    added += 1
  }
  return added
}


export interface ConsolidationReport {
  sessions: number
  scanned: number
  removed: number
  kept: number
  duplicates: Array<{ sessionKey: string, kind: SessionMemoryKind, keptId: string, removedId: string, content: string }>
}

export interface ConsolidateSessionMemoryOptions {
  /** Persist deletions. Default false = dry run (report only). */
  apply?: boolean
  /** Similarity threshold (0..1) above which two entries are duplicates. Default 0.78. */
  similarityThreshold?: number
}

/**
 * Offline memory consolidation (P6): within each session, merge near-duplicate
 * extracted facts/preferences. The newest entry of a duplicate cluster is kept
 * (it reflects the user's most recent statement), older near-duplicates are
 * removed — mirroring Mem0's consolidation and Letta's sleep-time compaction
 * without a model call: dedupe is exact content-hash first, then character
 * n-gram similarity. Dry-run by default; set `apply` to persist deletions.
 */
export function consolidateSessionMemories(
  client: DatabaseClient,
  options: ConsolidateSessionMemoryOptions = {}
): ConsolidationReport {
  const apply = options.apply === true
  const threshold = Math.min(1, Math.max(0, options.similarityThreshold ?? 0.78))
  const now = Date.now()
  let rows: Array<{ id: string, sessionKey: string, kind: SessionMemoryKind, content: string, updatedAt: number }>
  try {
    rows = client.sqlite.prepare(
      'SELECT id, session_key AS sessionKey, kind, content, updated_at AS updatedAt FROM assistant_session_memory'
      + ' WHERE kind IN (?, ?) AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC'
    ).all('preference', 'fact', now) as Array<{ id: string, sessionKey: string, kind: SessionMemoryKind, content: string, updatedAt: number }>
  } catch {
    return { sessions: 0, scanned: 0, removed: 0, kept: 0, duplicates: [] }
  }

  const report: ConsolidationReport = { sessions: 0, scanned: 0, removed: 0, kept: 0, duplicates: [] }
  const bySession = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = bySession.get(row.sessionKey) ?? []
    list.push(row)
    bySession.set(row.sessionKey, list)
  }
  report.sessions = bySession.size

  const removeIds: string[] = []
  for (const [sessionKey, sessionRows] of bySession) {
    const keptPerKind = new Map<SessionMemoryKind, typeof rows>()
    for (const row of sessionRows) {
      const kept = keptPerKind.get(row.kind) ?? []
      const duplicate = kept.find(candidate => semanticTextSimilarity(row.content, candidate.content) >= threshold)
      if (duplicate) {
        report.duplicates.push({
          sessionKey,
          kind: row.kind,
          keptId: duplicate.id,
          removedId: row.id,
          content: row.content
        })
        removeIds.push(row.id)
        continue
      }
      kept.push(row)
      keptPerKind.set(row.kind, kept)
    }
  }
  report.scanned = rows.length
  report.removed = removeIds.length
  report.kept = rows.length - removeIds.length

  if (apply && removeIds.length > 0) {
    try {
      client.sqlite.prepare(
        'DELETE FROM assistant_session_memory WHERE id IN (' + removeIds.map(() => '?').join(',') + ')'
      ).run(...removeIds)
    } catch {
      // Best-effort: a failed delete leaves the rows in place.
    }
  }
  return report
}
