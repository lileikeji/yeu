import { and, count, desc, eq } from 'drizzle-orm'
import type { ApiClaimEvidence, ApiClaimEvidenceSource } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import {
  knowledgeClaimEntities,
  knowledgeClaimSources,
  knowledgeClaims,
  knowledgeDocuments,
  knowledgeEntities,
  sources
} from '../../database/schema'

/** 结论 id 允许 `docclaim:<documentId>:<digest>` 这种复合形态，所以不强制 UUID。 */
const CLAIM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/
const QUOTE_MAX_LENGTH = 200

export function isPublicClaimId(value: string): boolean {
  return CLAIM_ID_PATTERN.test(value)
}

function toIso(value: Date | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return new Date(value).toISOString()
}

function clipQuote(value: string): string {
  const text = value.trim()

  return text.length > QUOTE_MAX_LENGTH ? `${text.slice(0, QUOTE_MAX_LENGTH)}…` : text
}

/**
 * 公开端只读的证据链：一条已发布结论 + 它的来源。
 *
 * 硬规则：没有来源时 `citationStatus` 必须是 `'none'` 且 `sources` 为空数组，
 * 绝不拿同一实体的其它结论或别的来源顶替。
 */
export function getClaimEvidence(client: DatabaseClient, claimId: string): ApiClaimEvidence | null {
  if (!isPublicClaimId(claimId)) {
    return null
  }

  const claim = client.db.select({
    id: knowledgeClaims.id,
    title: knowledgeClaims.title,
    statement: knowledgeClaims.statement,
    category: knowledgeClaims.category,
    confidenceLabel: knowledgeClaims.confidenceLabel,
    confidenceScore: knowledgeClaims.confidenceScore,
    validFrom: knowledgeClaims.validFrom,
    validUntil: knowledgeClaims.validUntil,
    publishedAt: knowledgeClaims.publishedAt,
    updatedAt: knowledgeClaims.updatedAt
  }).from(knowledgeClaims).where(and(
    eq(knowledgeClaims.id, claimId),
    eq(knowledgeClaims.reviewStatus, 'published')
  )).get()

  if (!claim) {
    return null
  }

  const sourceRows = client.db.select({
    id: knowledgeClaimSources.id,
    documentId: knowledgeClaimSources.documentId,
    documentTitle: knowledgeDocuments.title,
    sourceTitle: sources.title,
    sourceUrl: sources.url,
    sourceLevel: sources.sourceLevel,
    isOfficial: sources.isOfficial,
    accessedAt: sources.accessedAt,
    capturedAt: knowledgeDocuments.capturedAt,
    evidenceQuote: knowledgeClaimSources.evidenceQuote
  }).from(knowledgeClaimSources)
    .leftJoin(sources, eq(knowledgeClaimSources.sourceId, sources.id))
    .leftJoin(knowledgeDocuments, eq(knowledgeClaimSources.documentId, knowledgeDocuments.id))
    .where(eq(knowledgeClaimSources.claimId, claimId))
    .orderBy(desc(knowledgeClaimSources.isPrimary), knowledgeClaimSources.createdAt)
    .all()

  const evidenceSources: ApiClaimEvidenceSource[] = sourceRows.map(row => ({
    id: row.id,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl,
    sourceLevel: row.sourceLevel,
    isOfficial: row.isOfficial,
    verifiedAt: toIso(row.accessedAt),
    fetchedAt: toIso(row.capturedAt),
    quote: clipQuote(row.evidenceQuote)
  }))

  const entityRows = client.db.select({
    id: knowledgeEntities.id,
    entityType: knowledgeEntities.entityType,
    canonicalName: knowledgeEntities.canonicalName,
    role: knowledgeClaimEntities.role
  }).from(knowledgeClaimEntities)
    .innerJoin(knowledgeEntities, eq(knowledgeClaimEntities.entityId, knowledgeEntities.id))
    .where(eq(knowledgeClaimEntities.claimId, claimId))
    .all()

  // 结论的「主语实体」最能代表它讲的是谁；没有主语就退回第一条关联实体。
  const entity = entityRows.find(row => row.role === 'subject') ?? entityRows[0] ?? null

  const claimCount = entity
    ? client.db.select({ value: count() }).from(knowledgeClaimEntities)
      .innerJoin(knowledgeClaims, eq(knowledgeClaims.id, knowledgeClaimEntities.claimId))
      .where(and(
        eq(knowledgeClaimEntities.entityId, entity.id),
        eq(knowledgeClaims.reviewStatus, 'published')
      )).get()?.value ?? null
    : null

  return {
    claim: {
      id: claim.id,
      title: claim.title,
      statement: claim.statement,
      category: claim.category,
      confidenceLabel: claim.confidenceLabel,
      confidenceScore: claim.confidenceScore,
      validFrom: toIso(claim.validFrom),
      validUntil: toIso(claim.validUntil),
      publishedAt: toIso(claim.publishedAt),
      updatedAt: toIso(claim.updatedAt) ?? new Date(0).toISOString()
    },
    entity,
    sources: evidenceSources,
    claimCount,
    citationStatus: evidenceSources.length > 0 ? 'available' : 'none',
    updatedAt: toIso(claim.updatedAt) ?? new Date(0).toISOString()
  }
}
