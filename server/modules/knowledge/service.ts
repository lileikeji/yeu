import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import type { z } from 'zod'
import type {
  adminKnowledgeClaimsQuerySchema,
  createKnowledgeClaimSchema,
  updateKnowledgeClaimSchema
} from '../../../shared/schemas/server'
import { cleanSearchTerm } from '../../../shared/utils/like-search'
import type { DatabaseClient } from '../../database/client'
import {
  knowledgeClaims,
  knowledgeClaimSources,
  knowledgeConflicts,
  knowledgeDocuments,
  sources
} from '../../database/schema'
import { rethrowDatabaseError, throwNotFound } from '../../utils/errors'
import { fromIso } from '../../utils/serializers'
import { assertSourceIds, countPublishableSourcesByIds } from '../verification/service'

type CreateKnowledgeClaimInput = z.infer<typeof createKnowledgeClaimSchema>
type UpdateKnowledgeClaimInput = z.infer<typeof updateKnowledgeClaimSchema>
type KnowledgeClaimsQuery = z.infer<typeof adminKnowledgeClaimsQuerySchema>
type KnowledgeClaimRow = typeof knowledgeClaims.$inferSelect
type ClaimSourceInput = CreateKnowledgeClaimInput['sources'][number]

export interface PublishedKnowledgeMatch {
  id: string
  category: string
  title: string
  statement: string
  url: string
  confidenceScore: number
  score: number
}

export interface OfficialDocumentMatch {
  id: string
  title: string
  excerpt: string
  url: string
  capturedAt: number
  score: number
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

function parseKeywords(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 100)
      : []
  } catch {
    return []
  }
}

function normalizedKeywords(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim().toLocaleLowerCase('zh-CN')).filter(Boolean))].slice(0, 100)
}

function searchableNgrams(value: string): string[] {
  const grams = new Set<string>()
  const chunks = value.toLocaleLowerCase('zh-CN').match(/[\p{L}\p{N}]+/gu) ?? []
  for (const rawChunk of chunks) {
    const chunk = rawChunk.slice(0, 120)
    if (chunk.length >= 2 && chunk.length <= 24) grams.add(chunk)
    for (const width of [2, 3]) {
      for (let index = 0; index <= chunk.length - width; index += 1) {
        grams.add(chunk.slice(index, index + width))
        if (grams.size >= 2400) return [...grams]
      }
    }
  }
  return [...grams]
}

export function buildKnowledgeSearchText(title: string, statement: string, keywords: string[]): string {
  const explicit = normalizedKeywords(keywords)
  return [...new Set([
    ...explicit,
    ...searchableNgrams(`${title} ${explicit.join(' ')} ${statement.slice(0, 12_000)}`)
  ])].join(' ')
}

function serializeClaim(row: KnowledgeClaimRow, sourceRows: ReturnType<typeof claimSourcesForIds> = []) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    statement: row.statement,
    keywords: parseKeywords(row.keywordsJson),
    confidenceLabel: row.confidenceLabel,
    confidenceScore: row.confidenceScore,
    reviewStatus: row.reviewStatus,
    publicUrl: row.publicUrl,
    sourceNote: row.sourceNote,
    validFrom: toIso(row.validFrom),
    validUntil: toIso(row.validUntil),
    publishedAt: toIso(row.publishedAt),
    reviewedAt: toIso(row.reviewedAt),
    supersedesClaimId: row.supersedesClaimId,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    sources: sourceRows
  }
}

function claimSourcesForIds(client: DatabaseClient, claimIds: string[]) {
  if (claimIds.length === 0) return []
  return client.db.select({
    id: knowledgeClaimSources.id,
    claimId: knowledgeClaimSources.claimId,
    sourceId: knowledgeClaimSources.sourceId,
    documentId: knowledgeClaimSources.documentId,
    evidenceQuote: knowledgeClaimSources.evidenceQuote,
    locator: knowledgeClaimSources.locator,
    isPrimary: knowledgeClaimSources.isPrimary,
    sourceTitle: sources.title,
    sourceUrl: sources.url,
    sourceLevel: sources.sourceLevel,
    sourceStatus: sources.status
  }).from(knowledgeClaimSources)
    .leftJoin(sources, eq(knowledgeClaimSources.sourceId, sources.id))
    .where(inArray(knowledgeClaimSources.claimId, claimIds))
    .orderBy(desc(knowledgeClaimSources.isPrimary), knowledgeClaimSources.createdAt)
    .all()
}

function validateClaimSources(client: DatabaseClient, input: ClaimSourceInput[]): ClaimSourceInput[] {
  const unique = input.filter((item, index, items) => (
    items.findIndex(candidate => candidate.sourceId === item.sourceId && candidate.documentId === item.documentId) === index
  ))
  const normalized = [...unique]
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
    .map((item, index) => ({ ...item, isPrimary: index === 0 }))
  assertSourceIds(client, normalized.map(item => item.sourceId))
  const documentIds = normalized.map(item => item.documentId).filter((id): id is string => Boolean(id))
  if (documentIds.length > 0) {
    const found = client.db.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments)
      .where(inArray(knowledgeDocuments.id, documentIds)).all()
    if (found.length !== new Set(documentIds).size) {
      throw createError({ statusCode: 422, statusMessage: 'One or more documentIds do not exist', data: { code: 'INVALID_DOCUMENT_REFERENCE' } })
    }
  }
  return normalized
}

function assertPublishableClaim(
  client: DatabaseClient,
  input: Pick<CreateKnowledgeClaimInput, 'reviewStatus' | 'confidenceLabel'>,
  sourceRows: ClaimSourceInput[]
): void {
  if (input.reviewStatus === 'draft' || input.reviewStatus === 'rejected' || input.reviewStatus === 'archived') return
  if (sourceRows.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'Knowledge under review requires a source', data: { code: 'KNOWLEDGE_SOURCE_REQUIRED' } })
  }
  if (input.reviewStatus !== 'published') return
  if (input.confidenceLabel === 'unverified' || input.confidenceLabel === 'ambiguous') {
    throw createError({ statusCode: 422, statusMessage: 'Unverified or ambiguous knowledge cannot be published', data: { code: 'KNOWLEDGE_CONFIDENCE_TOO_LOW' } })
  }
  if (countPublishableSourcesByIds(client, sourceRows.map(item => item.sourceId)) === 0) {
    throw createError({ statusCode: 422, statusMessage: 'Published knowledge requires at least one active publishable source', data: { code: 'KNOWLEDGE_PUBLISHABLE_SOURCE_REQUIRED' } })
  }
  if (!sourceRows.some(item => item.evidenceQuote.trim().length > 0)) {
    throw createError({ statusCode: 422, statusMessage: 'Published knowledge requires a quoted piece of evidence', data: { code: 'KNOWLEDGE_EVIDENCE_REQUIRED' } })
  }
}

function replaceClaimSources(client: DatabaseClient, claimId: string, input: ClaimSourceInput[]): void {
  client.db.delete(knowledgeClaimSources).where(eq(knowledgeClaimSources.claimId, claimId)).run()
  if (input.length === 0) return
  client.db.insert(knowledgeClaimSources).values(input.map(item => ({
    id: randomUUID(),
    claimId,
    sourceId: item.sourceId,
    documentId: item.documentId ?? null,
    evidenceQuote: item.evidenceQuote,
    locator: item.locator,
    isPrimary: item.isPrimary,
    createdAt: Date.now()
  }))).run()
}

function issueCondition(issue: KnowledgeClaimsQuery['issue'], now: number): SQL | undefined {
  if (issue === 'missing-source') {
    return and(
      inArray(knowledgeClaims.reviewStatus, ['review', 'published']),
      sql`not exists (select 1 from knowledge_claim_sources kcs where kcs.claim_id = ${knowledgeClaims.id})`
    )
  }
  if (issue === 'expired') {
    return and(eq(knowledgeClaims.reviewStatus, 'published'), sql`${knowledgeClaims.validUntil} < ${now}`)
  }
  if (issue === 'unverified') return eq(knowledgeClaims.confidenceLabel, 'unverified')
  if (issue === 'conflict') {
    return sql`exists (select 1 from knowledge_conflicts kc where kc.status = 'open' and (kc.left_claim_id = ${knowledgeClaims.id} or kc.right_claim_id = ${knowledgeClaims.id}))`
  }
  return undefined
}

export function knowledgeHealth(client: DatabaseClient, now = Date.now()) {
  const row = client.sqlite.prepare(`
    SELECT
      count(*) AS total,
      sum(review_status = 'draft') AS draft,
      sum(review_status = 'review') AS review,
      sum(review_status = 'published') AS published,
      sum(review_status = 'rejected') AS rejected,
      sum(review_status = 'archived') AS archived,
      sum(review_status IN ('review', 'published') AND NOT EXISTS (
        SELECT 1 FROM knowledge_claim_sources kcs WHERE kcs.claim_id = knowledge_claims.id
      )) AS missingSource,
      sum(review_status = 'published' AND valid_until IS NOT NULL AND valid_until < ?) AS expired,
      sum(review_status = 'published' AND confidence_label = 'unverified') AS publishedUnverified
    FROM knowledge_claims
  `).get(now) as Record<string, number | null>
  const openConflicts = client.db.select({ value: count() }).from(knowledgeConflicts)
    .where(eq(knowledgeConflicts.status, 'open')).get()?.value ?? 0
  const orphanEntities = client.sqlite.prepare(`
    SELECT count(*) AS value FROM knowledge_entities ke
    WHERE ke.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM knowledge_claim_entities kce WHERE kce.entity_id = ke.id
    )
  `).get() as { value: number }
  const documents = client.sqlite.prepare(`
    SELECT count(*) AS total,
      sum(status = 'ready') AS ready,
      sum(status = 'processing') AS processing,
      sum(status = 'failed') AS failed
    FROM knowledge_documents
  `).get() as Record<string, number | null>
  const crawl = client.sqlite.prepare(`
    SELECT count(*) AS total,
      sum(status = 'pending') AS pending,
      sum(status = 'processing') AS processing,
      sum(status = 'completed') AS completed,
      sum(status = 'failed') AS failed
    FROM knowledge_crawl_queue
  `).get() as Record<string, number | null>
  const categories = client.db.select({ category: knowledgeClaims.category, value: count() })
    .from(knowledgeClaims).groupBy(knowledgeClaims.category).orderBy(desc(count())).all()

  const number = (value: number | null | undefined): number => Number(value ?? 0)
  return {
    claims: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, number(value)])),
    issues: {
      missingSource: number(row.missingSource),
      expired: number(row.expired),
      publishedUnverified: number(row.publishedUnverified),
      openConflicts: number(openConflicts),
      orphanEntities: number(orphanEntities.value)
    },
    documents: Object.fromEntries(Object.entries(documents).map(([key, value]) => [key, number(value)])),
    crawl: Object.fromEntries(Object.entries(crawl).map(([key, value]) => [key, number(value)])),
    categories
  }
}

export function listKnowledgeClaims(client: DatabaseClient, query: KnowledgeClaimsQuery) {
  const conditions: SQL[] = []
  const search = query.q ? cleanSearchTerm(query.q) : ''
  if (query.status) conditions.push(eq(knowledgeClaims.reviewStatus, query.status))
  if (query.confidenceLabel) conditions.push(eq(knowledgeClaims.confidenceLabel, query.confidenceLabel))
  if (query.category) conditions.push(eq(knowledgeClaims.category, query.category))
  if (search) {
    conditions.push(or(
      like(knowledgeClaims.title, `%${search}%`),
      like(knowledgeClaims.statement, `%${search}%`),
      like(knowledgeClaims.category, `%${search}%`)
    )!)
  }
  const issue = issueCondition(query.issue, Date.now())
  if (issue) conditions.push(issue)
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const rows = client.db.select().from(knowledgeClaims).where(where)
    .orderBy(desc(knowledgeClaims.updatedAt))
    .limit(query.pageSize).offset((query.page - 1) * query.pageSize).all()
  const total = client.db.select({ value: count() }).from(knowledgeClaims).where(where).get()?.value ?? 0
  const sourceRows = claimSourcesForIds(client, rows.map(row => row.id))
  return {
    items: rows.map(row => serializeClaim(row, sourceRows.filter(source => source.claimId === row.id))),
    total,
    health: knowledgeHealth(client)
  }
}

export function getKnowledgeClaim(client: DatabaseClient, id: string) {
  const row = client.db.select().from(knowledgeClaims).where(eq(knowledgeClaims.id, id)).get()
  if (!row) throwNotFound('Knowledge claim')
  return serializeClaim(row, claimSourcesForIds(client, [id]))
}

export function createKnowledgeClaim(client: DatabaseClient, input: CreateKnowledgeClaimInput, adminId: string) {
  const sourceRows = validateClaimSources(client, input.sources)
  assertPublishableClaim(client, input, sourceRows)
  const id = randomUUID()
  const now = Date.now()
  const keywords = normalizedKeywords(input.keywords)
  try {
    client.sqlite.transaction(() => {
      client.db.insert(knowledgeClaims).values({
        id,
        category: input.category,
        title: input.title,
        statement: input.statement,
        keywordsJson: JSON.stringify(keywords),
        searchText: buildKnowledgeSearchText(input.title, input.statement, keywords),
        confidenceLabel: input.confidenceLabel,
        confidenceScore: input.confidenceScore,
        reviewStatus: input.reviewStatus,
        publicUrl: input.publicUrl || null,
        sourceNote: input.sourceNote,
        validFrom: fromIso(input.validFrom) ?? null,
        validUntil: fromIso(input.validUntil) ?? null,
        publishedAt: input.reviewStatus === 'published' ? now : null,
        reviewedAt: ['published', 'rejected'].includes(input.reviewStatus) ? now : null,
        reviewedByAdminId: ['published', 'rejected'].includes(input.reviewStatus) ? adminId : null,
        createdByAdminId: adminId,
        supersedesClaimId: input.supersedesClaimId ?? null,
        createdAt: now,
        updatedAt: now
      }).run()
      replaceClaimSources(client, id, sourceRows)
    })()
  } catch (error) {
    rethrowDatabaseError(error)
  }
  return getKnowledgeClaim(client, id)
}

export function updateKnowledgeClaim(client: DatabaseClient, id: string, input: UpdateKnowledgeClaimInput, adminId: string) {
  const current = client.db.select().from(knowledgeClaims).where(eq(knowledgeClaims.id, id)).get()
  if (!current) throwNotFound('Knowledge claim')
  const currentSources = claimSourcesForIds(client, [id]).map(item => ({
    sourceId: item.sourceId!,
    documentId: item.documentId,
    evidenceQuote: item.evidenceQuote,
    locator: item.locator,
    isPrimary: item.isPrimary
  })).filter(item => Boolean(item.sourceId))
  const sourceRows = input.sources ? validateClaimSources(client, input.sources) : currentSources
  const reviewStatus = input.reviewStatus ?? current.reviewStatus
  const confidenceLabel = input.confidenceLabel ?? current.confidenceLabel
  assertPublishableClaim(client, { reviewStatus, confidenceLabel }, sourceRows)
  const title = input.title ?? current.title
  const statement = input.statement ?? current.statement
  const keywords = input.keywords ? normalizedKeywords(input.keywords) : parseKeywords(current.keywordsJson)
  const now = Date.now()
  try {
    client.sqlite.transaction(() => {
      client.db.update(knowledgeClaims).set({
        category: input.category ?? current.category,
        title,
        statement,
        keywordsJson: JSON.stringify(keywords),
        searchText: buildKnowledgeSearchText(title, statement, keywords),
        confidenceLabel,
        confidenceScore: input.confidenceScore ?? current.confidenceScore,
        reviewStatus,
        publicUrl: input.publicUrl === undefined ? current.publicUrl : (input.publicUrl || null),
        sourceNote: input.sourceNote ?? current.sourceNote,
        validFrom: input.validFrom === undefined ? current.validFrom : (fromIso(input.validFrom) ?? null),
        validUntil: input.validUntil === undefined ? current.validUntil : (fromIso(input.validUntil) ?? null),
        publishedAt: reviewStatus === 'published' ? (current.publishedAt ?? now) : current.publishedAt,
        reviewedAt: ['published', 'rejected'].includes(reviewStatus) ? now : current.reviewedAt,
        reviewedByAdminId: ['published', 'rejected'].includes(reviewStatus) ? adminId : current.reviewedByAdminId,
        supersedesClaimId: input.supersedesClaimId === undefined ? current.supersedesClaimId : input.supersedesClaimId,
        updatedAt: now
      }).where(eq(knowledgeClaims.id, id)).run()
      if (input.sources) replaceClaimSources(client, id, sourceRows)
    })()
  } catch (error) {
    rethrowDatabaseError(error)
  }
  return getKnowledgeClaim(client, id)
}

export function archiveKnowledgeClaim(client: DatabaseClient, id: string, adminId: string) {
  const result = client.db.update(knowledgeClaims).set({
    reviewStatus: 'archived',
    reviewedAt: Date.now(),
    reviewedByAdminId: adminId,
    updatedAt: Date.now()
  }).where(eq(knowledgeClaims.id, id)).run()
  if (result.changes === 0) throwNotFound('Knowledge claim')
}

function ftsQuery(terms: string[]): string {
  return [...new Set(terms.map(term => term.trim().toLocaleLowerCase('zh-CN')).filter(term => term.length >= 2))]
    .slice(0, 16)
    .map(term => `"${term.replaceAll('"', '""')}"`)
    .join(' OR ')
}

function normalizedKnowledgeKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function knowledgeTitleBucket(value: string): string {
  const normalized = normalizedKnowledgeKey(value)
  // A crawler can expose the same page as either “官网正文” or “正文要点”.
  // Treat those suffix variants as one bucket so equivalent claims do not
  // bypass the per-document context limit.
  return normalized.replace(/(?:官网)?正文(?:要点)?$/u, '') || normalized
}

const GENERIC_KNOWLEDGE_TERMS = new Set([
  '什么', '时候', '哪些', '谁是', '是谁', '主要', '专业', '学院', '学校', '大学',
  '学生', '要求', '条件', '规则', '流程', '信息', '内容', '情况', '相关', '具体',
  '可以', '需要', '现在', '当前', '怎么', '如何', '哪里', '申请', '办理', '地点',
  '时间', '宿舍', '寝室', '住宿', '生活', '校园'
])

function relevantExcerpt(value: string, terms: string[], limit = 1600): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  const lowered = normalized.toLocaleLowerCase('zh-CN')
  const positions = terms
    .map(term => lowered.indexOf(term.trim().toLocaleLowerCase('zh-CN')))
    .filter(position => position >= 0)
  const first = positions.length > 0 ? Math.min(...positions) : 0
  const start = Math.max(0, first - Math.floor(limit * 0.28))
  const excerpt = normalized.slice(start, start + limit)
  return `${start > 0 ? '...' : ''}${excerpt}${start + limit < normalized.length ? '...' : ''}`
}

function documentCoreQueryTerms(value: string): string[] {
  const normalized = value.toLocaleLowerCase('zh-CN')
    .replace(/(?:仰恩大学|这个学校|学校|请问|麻烦|帮我|告诉我|想知道|怎么样|怎么|如何|为什么|为啥|什么时候|有多少人|多少人|有多少|多少|申请条件|申请要求|具体条件|具体要求|相关规定|相关办法|什么|是否|能不能|可不可以|可以|需要|要求|条件|规定|办法|有|一下|里面|其中|里|呢|吗|呀|啊)/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
  return [...new Set(normalized.split(/\s+/).map(term => term.trim()).filter(term => term.length >= 2))].slice(0, 6)
}

export function searchOfficialKnowledgeDocuments(
  client: DatabaseClient,
  terms: string[],
  limit = 8,
  rawQuery = '',
  allowLikeFallback = true
): OfficialDocumentMatch[] {
  const searchableTerms = [...new Set(terms.map(term => term.trim().toLocaleLowerCase('zh-CN')).filter(term => term.length >= 2))]
  if (searchableTerms.length === 0) return []
  // Run focused terms independently. A single OR expression that combines a
  // named entity with generic terms such as "teaching area" makes FTS rank
  // and extract snippets from a large part of the long-document corpus on a
  // cold connection. The trigram index cannot use terms shorter than three
  // characters, so leave those to the bounded title fallback below.
  const documentQueries = searchableTerms
    .filter(term => term.length >= 3)
    .slice(0, 4)
    .map(term => ftsQuery([term]))
    .filter(Boolean)
  type SearchRow = {
    id: string
    title: string
    extractedText: string
    url: string
    contentHash: string
    capturedAt: number
    ftsRank: number
    attachmentLandingPage: number
  }
  let rows: SearchRow[]
  try {
    const fetchLimit = Math.max(12, Math.min(120, limit * 10))
    const statement = client.sqlite.prepare(`
      SELECT kd.id, kd.title,
        snippet(knowledge_documents_fts, 2, '', '', ' ... ', 192) AS extractedText,
        kd.content_hash AS contentHash,
        kd.original_url AS url, kd.captured_at AS capturedAt,
        bm25(knowledge_documents_fts, 0.0, 7.0, 2.0) AS ftsRank,
        coalesce(json_extract(kd.metadata_json, '$.attachmentLandingPage'), 0) AS attachmentLandingPage
      FROM knowledge_documents_fts
      INNER JOIN knowledge_documents kd ON kd.id = knowledge_documents_fts.document_id
      INNER JOIN sources s ON s.id = kd.source_id
      WHERE knowledge_documents_fts MATCH ?
        AND kd.status = 'ready'
        AND kd.original_url IS NOT NULL
        AND s.status = 'active'
        AND s.is_official = 1
        AND s.source_level = 'A'
        AND (
          s.url LIKE 'https://yeu.edu.cn/%'
          OR s.url LIKE 'https://%.yeu.edu.cn/%'
          OR s.platform = '仰恩大学官方迎新系统'
        )
      ORDER BY ftsRank ASC, kd.captured_at DESC
      LIMIT ?
    `)
    rows = []
    for (const documentQuery of documentQueries) {
      const matches = statement.all(documentQuery, fetchLimit) as SearchRow[]
      if (matches.length === 0) continue
      rows = matches
      break
    }
    if (rows.length === 0 && allowLikeFallback) {
      const likeTerms = searchableTerms.slice(0, 6)
      const matches = likeTerms.map(() => 'kd.title LIKE ? ESCAPE \'\\\'').join(' OR ')
      const values = likeTerms.map((term) => {
        const escaped = term.replace(/[\\%_]/g, value => `\\${value}`)
        return `%${escaped}%`
      })
      rows = client.sqlite.prepare(`
        SELECT kd.id, kd.title, kd.extracted_text AS extractedText,
          kd.content_hash AS contentHash,
          kd.original_url AS url, kd.captured_at AS capturedAt, 0 AS ftsRank,
          coalesce(json_extract(kd.metadata_json, '$.attachmentLandingPage'), 0) AS attachmentLandingPage
        FROM knowledge_documents kd
        INNER JOIN sources s ON s.id = kd.source_id
        WHERE (${matches})
          AND kd.status = 'ready'
          AND kd.original_url IS NOT NULL
          AND s.status = 'active'
          AND s.is_official = 1
          AND s.source_level = 'A'
          AND (
            s.url LIKE 'https://yeu.edu.cn/%'
            OR s.url LIKE 'https://%.yeu.edu.cn/%'
            OR s.platform = '仰恩大学官方迎新系统'
          )
        ORDER BY kd.captured_at DESC
        LIMIT ?
      `).all(...values, Math.max(20, Math.min(160, limit * 12))) as SearchRow[]
    }
  } catch {
    rows = []
  }
  const ranked = rows.map((row) => {
    const title = row.title.toLocaleLowerCase('zh-CN')
    const text = row.extractedText.toLocaleLowerCase('zh-CN')
    const coreTerms = documentCoreQueryTerms(rawQuery)
    const corePositions = coreTerms
      .map(term => ({ term, position: `${title} ${text}`.indexOf(term) }))
      .filter(item => item.position >= 0)
    const titleMatches = searchableTerms.filter(term => title.includes(term))
    const textMatches = searchableTerms.filter(term => text.includes(term))
    const strongSearchMatches = [...new Set([...titleMatches, ...textMatches].filter(term => term.length >= 4))]
    if (coreTerms.length >= 2 && corePositions.length < 2 && strongSearchMatches.length < 2) return null
    if (
      coreTerms.length === 1
      && corePositions.length === 0
      && !titleMatches.some(term => term.length >= 3)
      && !textMatches.some(term => term.length >= 4)
    ) return null
    const primary = searchableTerms[0] ?? ''
    const primaryBigrams = (primary.length >= 3
      ? Array.from({ length: primary.length - 1 }, (_, index) => primary.slice(index, index + 2))
      : [primary]).slice(0, 10)
    const primaryTrigrams = (primary.length >= 3
      ? Array.from({ length: primary.length - 2 }, (_, index) => primary.slice(index, index + 3))
      : []).slice(0, 10)
    const bigramPositions = primaryBigrams.map(term => text.indexOf(term)).filter(position => position >= 0)
    const nearbyCore = bigramPositions.length >= 2
      && text.includes(primaryBigrams[0] ?? primary)
      && Math.max(...bigramPositions) - Math.min(...bigramPositions) <= 120
    const strongMatch = (primary.length >= 2 && (title.includes(primary) || text.includes(primary)))
      || primaryTrigrams.some(term => title.includes(term) || text.includes(term))
      || nearbyCore
      || titleMatches.some(term => term.length >= 3)
      || textMatches.some(term => term.length >= 4)
    if (!strongMatch) return null
    const relevance = titleMatches.reduce((score, term) => score + 10 + term.length * 3, 0)
      + textMatches.reduce((score, term) => score + 2 + Math.min(8, term.length), 0)
    const answerCoreTerms = corePositions
      .map(item => item.term)
      .filter(term => !title.includes(term))
    const excerptTerms = answerCoreTerms.length > 0
      ? answerCoreTerms
      : (corePositions.length > 0 ? corePositions.map(item => item.term) : (textMatches.length > 0 ? textMatches : terms))
    return {
      id: row.id,
      title: row.title,
      excerpt: relevantExcerpt(row.extractedText, excerptTerms),
      url: row.url,
      contentHash: row.contentHash,
      capturedAt: row.capturedAt,
      score: 20 + relevance
        + Math.min(26, Math.max(0, -Number(row.ftsRank || 0) * 8))
        - (row.attachmentLandingPage ? 28 : 0)
    }
  })
    .filter((row): row is OfficialDocumentMatch & { contentHash: string } => Boolean(row))
    .sort((left, right) => right.score - left.score || right.capturedAt - left.capturedAt)

  const seenContentHashes = new Set<string>()
  const titleCounts = new Map<string, number>()
  return ranked
    .filter((row) => {
      if (seenContentHashes.has(row.contentHash)) return false
      const titleKey = normalizedKnowledgeKey(row.title)
      const titleLimit = /正文要点|官网正文/.test(titleKey) ? 2 : 3
      const count = titleCounts.get(titleKey) ?? 0
      if (count >= titleLimit) return false
      seenContentHashes.add(row.contentHash)
      titleCounts.set(titleKey, count + 1)
      return true
    })
    .slice(0, Math.max(1, Math.min(30, limit)))
    .map(row => ({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      url: row.url,
      capturedAt: row.capturedAt,
      score: row.score
    }))
}

export function searchPublishedKnowledgeClaims(
  client: DatabaseClient,
  terms: string[],
  limit = 8,
  now = Date.now(),
  titleOnly = false,
  allowLikeFallback = true
): PublishedKnowledgeMatch[] {
  const query = ftsQuery(terms)
  if (!query) return []
  type SearchRow = {
    id: string
    category: string
    title: string
    statement: string
    publicUrl: string | null
    confidenceScore: number
    ftsRank: number
    sourceUrl: string | null
  }
  let rows: SearchRow[]
  try {
    rows = client.sqlite.prepare(`
      SELECT kc.id, kc.category, kc.title, kc.statement,
        kc.public_url AS publicUrl, kc.confidence_score AS confidenceScore,
        bm25(knowledge_claims_fts, 0.0, 6.0, 3.0, 2.0) AS ftsRank,
        (SELECT s.url FROM knowledge_claim_sources kcs
          LEFT JOIN sources s ON s.id = kcs.source_id
          WHERE kcs.claim_id = kc.id
          ORDER BY kcs.is_primary DESC, kcs.created_at ASC LIMIT 1) AS sourceUrl
      FROM knowledge_claims_fts
      INNER JOIN knowledge_claims kc ON kc.id = knowledge_claims_fts.claim_id
      WHERE knowledge_claims_fts MATCH ?
        AND kc.review_status = 'published'
        AND (kc.valid_from IS NULL OR kc.valid_from <= ?)
        AND (kc.valid_until IS NULL OR kc.valid_until >= ?)
      ORDER BY ftsRank ASC, kc.confidence_score DESC
      LIMIT ?
    `).all(query, now, now, Math.max(12, Math.min(160, limit * 10))) as SearchRow[]
  } catch {
    rows = []
  }
  if (rows.length === 0 && allowLikeFallback) {
    const likeTerms = [...new Set(terms.map(term => term.trim()).filter(term => term.length >= 2))].slice(0, 8)
    if (likeTerms.length > 0) {
      // Identity lookups usually have a name in the title. When the FTS
      // tokenizer misses that name, searching the long statement/search_text
      // columns turns an 80k-row fallback into a multi-second scan. Keep the
      // broad body fallback for policy questions, but use the cheap title-only
      // path for person lookups.
      const matches = likeTerms
        .map(() => titleOnly
          ? '(kc.title LIKE ? ESCAPE \'\\\')'
          : '(kc.title LIKE ? ESCAPE \'\\\' OR kc.statement LIKE ? ESCAPE \'\\\' OR kc.search_text LIKE ? ESCAPE \'\\\')')
        .join(' OR ')
      const escapeLike = (term: string) => `%${term.replace(/[\\%_]/g, value => `\\${value}`)}%`
      const values = titleOnly
        ? likeTerms.map(escapeLike)
        : likeTerms.flatMap(term => [escapeLike(term), escapeLike(term), escapeLike(term)])
      rows = client.sqlite.prepare(`
        SELECT kc.id, kc.category, kc.title, kc.statement,
          kc.public_url AS publicUrl, kc.confidence_score AS confidenceScore,
          0 AS ftsRank,
          (SELECT s.url FROM knowledge_claim_sources kcs
            LEFT JOIN sources s ON s.id = kcs.source_id
            WHERE kcs.claim_id = kc.id
            ORDER BY kcs.is_primary DESC, kcs.created_at ASC LIMIT 1) AS sourceUrl
        FROM knowledge_claims kc
        WHERE (${matches})
          AND kc.review_status = 'published'
          AND (kc.valid_from IS NULL OR kc.valid_from <= ?)
          AND (kc.valid_until IS NULL OR kc.valid_until >= ?)
        ORDER BY kc.confidence_score DESC, kc.updated_at DESC
        LIMIT ?
      `).all(...values, now, now, Math.max(12, Math.min(160, limit * 10))) as SearchRow[]
    }
  }
  const normalizedTerms = [...new Set(terms
    .map(term => normalizedKnowledgeKey(term))
    .filter(term => term.length >= 2))]
  const specificTerms = normalizedTerms.filter(term => term.length >= 3 || !GENERIC_KNOWLEDGE_TERMS.has(term))
  const ranked = rows.map((row) => {
    const title = normalizedKnowledgeKey(row.title)
    const statement = normalizedKnowledgeKey(row.statement)
    const searchable = `${title}${statement}`
    const titleMatches = normalizedTerms.filter(term => title.includes(term))
    const textMatches = normalizedTerms.filter(term => searchable.includes(term))
    const specificMatches = specificTerms.filter(term => searchable.includes(term))

    // FTS is intentionally broad (terms are OR-ed for Chinese text). Do not
    // let a page that only contains generic words such as “宿舍” or “要求”
    // become evidence for a more specific question like “床垫尺寸”.
    if (specificTerms.length > 0 && specificMatches.length === 0) return null
    if (specificTerms.length === 0 && titleMatches.length === 0 && textMatches.length < 2) return null

    return {
      id: row.id,
      category: row.category,
      title: row.title,
      statement: row.statement,
      url: row.publicUrl || row.sourceUrl || `/search?q=${encodeURIComponent(row.title)}`,
      confidenceScore: row.confidenceScore,
      score: 18
        + Math.min(24, Math.max(0, -Number(row.ftsRank || 0) * 8))
        + row.confidenceScore / 10
        + Math.min(24, titleMatches.reduce((total, term) => total + Math.max(2, term.length), 0))
        + Math.min(12, specificMatches.length * 4)
    }
  }).filter((row): row is NonNullable<typeof row> => Boolean(row)).sort((left, right) => (
    right.score - left.score
    || right.confidenceScore - left.confidenceScore
    || left.title.localeCompare(right.title, 'zh-CN')
    || left.statement.localeCompare(right.statement, 'zh-CN')
    || left.id.localeCompare(right.id)
  ))

  const statements = new Set<string>()
  const claimKeys = new Set<string>()
  const titleCounts = new Map<string, number>()
  return ranked
    .filter((row) => {
      const statementKey = normalizedKnowledgeKey(row.statement)
      const titleKey = normalizedKnowledgeKey(row.title)
      const claimKey = `${titleKey}\u0000${statementKey}`
      if (!statementKey || claimKeys.has(claimKey) || statements.has(statementKey)) return false
      // Crawler-generated “正文要点” claims are useful, but only a couple of
      // distinct passages from the same title should enter one answer context.
      const compiledTitle = /正文要点|官网正文/.test(titleKey)
      const titleLimit = compiledTitle ? 2 : 3
      const titleBucket = compiledTitle ? knowledgeTitleBucket(row.title) : titleKey
      const count = titleCounts.get(titleBucket) ?? 0
      if (count >= titleLimit) return false
      claimKeys.add(claimKey)
      statements.add(statementKey)
      titleCounts.set(titleBucket, count + 1)
      return true
    })
    .slice(0, Math.max(1, Math.min(30, limit)))
}
