/**
 * Lazy temporal knowledge-graph retrieval (P3).
 *
 * Inspired by Graphiti/Zep (bi-temporal claim edges) and Microsoft's
 * LazyGraphRAG (expand the graph only at query time, no prebuilt summaries).
 * At query time we:
 *
 * 1. match the query against knowledge_entities (canonical name + aliases),
 * 2. walk 1-2 hops through knowledge_claim_entities to find related claims,
 * 3. keep only published, currently-valid claims that are not superseded,
 * 4. return them as candidate evidence (the third retrieval leg next to
 *    keyword/n-gram and the P1 vector channel).
 *
 * Everything is best-effort over the existing admin-managed knowledge library;
 * empty tables simply yield no graph evidence. No schema changes are needed:
 * knowledge_claims already carries valid_from / valid_until (the temporal
 * window) and supersedes_claim_id (the "this claim was replaced" edge).
 *
 * @module server/modules/assistant/graph-search
 */

import { and, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  knowledgeClaimEntities,
  knowledgeClaims,
  knowledgeEntities
} from '../../database/schema'
import { normalizeAssistantQuery } from '../../../shared/utils/assistant-query'

export const GRAPH_EVIDENCE_LIMIT = 8
export const GRAPH_MAX_HOPS = 2

export interface GraphEvidence {
  title: string
  url: string
  snippet: string
  source: 'site'
  text: string
  /** Retrieval strength used by downstream ranking. */
  score: number
}

interface EntityRow {
  id: string
  entityType: string
  canonicalName: string
  normalizedName: string
  aliasesJson: string
}

interface ClaimRow {
  id: string
  title: string
  statement: string
  publicUrl: string | null
}

function normalizeText(value: string): string {
  return normalizeAssistantQuery(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/[?？。！!，,、；;：:""''（）()\s]+/gu, '')
}

function excerpt(value: string, max = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

/**
 * Match the query against active knowledge entities. A match is scored by the
 * length of the matched name (canonical name, normalized name, or alias);
 * longer, more specific names win.
 */
export function extractEntityIdsFromQuery(
  client: DatabaseClient,
  query: string,
  limit = 6
): Array<{ id: string, entityType: string, canonicalName: string, score: number }> {
  const normalized = normalizeText(query)
  if (normalized.length < 2) return []

  let rows: EntityRow[]
  try {
    rows = client.db.select({
      id: knowledgeEntities.id,
      entityType: knowledgeEntities.entityType,
      canonicalName: knowledgeEntities.canonicalName,
      normalizedName: knowledgeEntities.normalizedName,
      aliasesJson: knowledgeEntities.aliasesJson
    }).from(knowledgeEntities).where(eq(knowledgeEntities.status, 'active')).all()
  } catch {
    return []
  }

  const scored: Array<{ id: string, entityType: string, canonicalName: string, score: number }> = []
  for (const row of rows) {
    const candidates = [row.canonicalName, row.normalizedName]
    try {
      const aliases = JSON.parse(row.aliasesJson || '[]') as unknown
      if (Array.isArray(aliases)) {
        candidates.push(...aliases.filter((item): item is string => typeof item === 'string'))
      }
    } catch {
      // Malformed aliases are ignored.
    }
    let best = 0
    for (const candidate of candidates) {
      const name = normalizeText(candidate)
      if (!name || name.length < 2) continue
      if (normalized.includes(name)) {
        best = Math.max(best, name.length)
      } else if (name.length >= 2 && name.length <= 6 && name.includes(normalized)) {
        best = Math.max(best, normalized.length)
      }
    }
    if (best > 0) {
      scored.push({ id: row.id, entityType: row.entityType, canonicalName: row.canonicalName, score: best })
    }
  }
  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

/**
 * Load published, currently-valid claims by id, excluding claims that are
 * superseded by any other claim (the temporal "this fact was replaced" edge).
 */
function loadClaimsByIds(client: DatabaseClient, claimIds: string[], now: number): ClaimRow[] {
  if (claimIds.length === 0) return []
  const rows = client.db.select({
    id: knowledgeClaims.id,
    title: knowledgeClaims.title,
    statement: knowledgeClaims.statement,
    publicUrl: knowledgeClaims.publicUrl,
    supersedesClaimId: knowledgeClaims.supersedesClaimId
  }).from(knowledgeClaims).where(and(
    inArray(knowledgeClaims.id, claimIds),
    eq(knowledgeClaims.reviewStatus, 'published'),
    or(isNull(knowledgeClaims.validFrom), lte(knowledgeClaims.validFrom, now)),
    or(isNull(knowledgeClaims.validUntil), gte(knowledgeClaims.validUntil, now))
  )).all()

  // A claim that carries supersedes_claim_id declares that it has been
  // replaced by the referenced claim; keep only claims that are not themselves
  // superseded.
  return rows
    .filter(row => row.supersedesClaimId === null)
    .map(({ supersedesClaimId: _superseded, ...row }) => row)
}

/**
 * Walk the entity->claim graph 1..2 hops and return currently-valid published
 * claims as candidate evidence. Hop-1 claims (directly linked to a matched
 * entity) are ranked above hop-2 claims.
 */
export function expandClaimsFromEntities(
  client: DatabaseClient,
  entityIds: string[],
  now = Date.now(),
  maxHops = GRAPH_MAX_HOPS,
  limit = GRAPH_EVIDENCE_LIMIT
): GraphEvidence[] {
  if (entityIds.length === 0) return []

  const visitedClaims = new Set<string>()
  const seenClaims = new Set<string>()
  let frontier: string[] = entityIds
  const results: GraphEvidence[] = []

  for (let hop = 1; hop <= maxHops; hop += 1) {
    if (frontier.length === 0) break

    let linked: Array<{ claimId: string }>
    try {
      linked = client.db.select({
        claimId: knowledgeClaimEntities.claimId
      }).from(knowledgeClaimEntities)
        .where(inArray(knowledgeClaimEntities.entityId, frontier))
        .all()
    } catch {
      break
    }
    const newClaimIds = [...new Set(linked.map(row => row.claimId))].filter(id => !visitedClaims.has(id))
    for (const id of newClaimIds) visitedClaims.add(id)

    const claims = loadClaimsByIds(client, newClaimIds, now)
    for (const claim of claims) {
      if (seenClaims.has(claim.id)) continue
      seenClaims.add(claim.id)
      results.push({
        title: claim.title || claim.statement.slice(0, 60),
        url: claim.publicUrl ?? '',
        snippet: excerpt(claim.statement),
        source: 'site' as const,
        text: claim.statement,
        score: hop === 1 ? 46 : 32
      })
    }
    if (results.length >= limit) break

    // Next frontier: entities referenced by the newly found claims.
    if (hop < maxHops && newClaimIds.length > 0) {
      let nextEntities: Array<{ entityId: string }>
      try {
        nextEntities = client.db.select({
          entityId: knowledgeClaimEntities.entityId
        }).from(knowledgeClaimEntities)
          .where(inArray(knowledgeClaimEntities.claimId, newClaimIds))
          .all()
      } catch {
        break
      }
      frontier = [...new Set(nextEntities.map(row => row.entityId))].filter(id => !entityIds.includes(id))
    }
  }

  return results.slice(0, limit)
}

/** One-stop graph retrieval: match entities, expand claims, return evidence. */
export function retrieveGraphEvidence(
  client: DatabaseClient,
  query: string,
  limit = GRAPH_EVIDENCE_LIMIT,
  now = Date.now()
): GraphEvidence[] {
  try {
    const entities = extractEntityIdsFromQuery(client, query)
    if (entities.length === 0) return []
    return expandClaimsFromEntities(client, entities.map(item => item.id), now, GRAPH_MAX_HOPS, limit)
  } catch {
    return []
  }
}
