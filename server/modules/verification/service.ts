import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, inArray, like, ne, or, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import type { sourcesQuerySchema, createSourceSchema, updateSourceSchema } from '../../../shared/schemas/server'
import type { DatabaseClient } from '../../database/client'
import {
  contents,
  contentSources,
  places,
  placeSources,
  procedures,
  procedureSources,
  sources
} from '../../database/schema'
import { rethrowDatabaseError, throwNotFound } from '../../utils/errors'
import { fromIso, serializeAdminSource } from '../../utils/serializers'

type CreateSourceInput = z.infer<typeof createSourceSchema>
type UpdateSourceInput = z.infer<typeof updateSourceSchema>
type SourcesQuery = z.infer<typeof sourcesQuerySchema>
type SourceRow = typeof sources.$inferSelect

function cleanSearchTerm(value: string): string {
  return value.replace(/[%_]/g, '').trim()
}

export function assertSourceIds(client: DatabaseClient, sourceIds: string[]): string[] {
  const uniqueIds = [...new Set(sourceIds)]

  if (uniqueIds.length === 0) {
    return uniqueIds
  }

  const rows = client.db.select({ id: sources.id }).from(sources)
    .where(inArray(sources.id, uniqueIds))
    .all()

  if (rows.length !== uniqueIds.length) {
    throw createError({
      statusCode: 422,
      statusMessage: 'One or more sourceIds do not exist',
      data: { code: 'INVALID_SOURCE_REFERENCE' }
    })
  }

  return uniqueIds
}

export function replacePlaceSources(
  client: DatabaseClient,
  placeId: string,
  sourceIds: string[]
): void {
  const uniqueIds = assertSourceIds(client, sourceIds)
  client.db.delete(placeSources).where(eq(placeSources.placeId, placeId)).run()

  if (uniqueIds.length > 0) {
    client.db.insert(placeSources).values(uniqueIds.map((sourceId, index) => ({
      placeId,
      sourceId,
      isPrimary: index === 0,
      createdAt: Date.now()
    }))).run()
  }
}

export function replaceContentSources(
  client: DatabaseClient,
  contentId: string,
  sourceIds: string[]
): void {
  const uniqueIds = assertSourceIds(client, sourceIds)
  client.db.delete(contentSources).where(eq(contentSources.contentId, contentId)).run()

  if (uniqueIds.length > 0) {
    client.db.insert(contentSources).values(uniqueIds.map((sourceId, index) => ({
      contentId,
      sourceId,
      isPrimary: index === 0,
      createdAt: Date.now()
    }))).run()
  }
}

export function getPlaceSourceMap(client: DatabaseClient, placeIds: string[]): Map<string, SourceRow[]> {
  const result = new Map<string, SourceRow[]>()

  if (placeIds.length === 0) {
    return result
  }

  const rows = client.db.select({
    targetId: placeSources.placeId,
    source: sources
  }).from(placeSources)
    .innerJoin(sources, eq(placeSources.sourceId, sources.id))
    .where(inArray(placeSources.placeId, placeIds))
    .orderBy(desc(placeSources.isPrimary), sources.sourceLevel)
    .all()

  for (const row of rows) {
    const values = result.get(row.targetId) ?? []
    values.push(row.source)
    result.set(row.targetId, values)
  }

  return result
}

export function getContentSourceMap(client: DatabaseClient, contentIds: string[]): Map<string, SourceRow[]> {
  const result = new Map<string, SourceRow[]>()

  if (contentIds.length === 0) {
    return result
  }

  const rows = client.db.select({
    targetId: contentSources.contentId,
    source: sources
  }).from(contentSources)
    .innerJoin(sources, eq(contentSources.sourceId, sources.id))
    .where(inArray(contentSources.contentId, contentIds))
    .orderBy(desc(contentSources.isPrimary), sources.sourceLevel)
    .all()

  for (const row of rows) {
    const values = result.get(row.targetId) ?? []
    values.push(row.source)
    result.set(row.targetId, values)
  }

  return result
}

function publishableSourceCondition(): SQL {
  return and(
    eq(sources.status, 'active'),
    or(
      and(eq(sources.sourceLevel, 'A'), eq(sources.isOfficial, true)),
      and(eq(sources.sourceLevel, 'B'), eq(sources.isOfficial, true)),
      eq(sources.sourceLevel, 'C')
    )
  )!
}

export function isPublishableSourceMetadata(
  value: Pick<SourceRow, 'status' | 'sourceLevel' | 'isOfficial'>
): boolean {
  return value.status === 'active'
    && (value.sourceLevel === 'C'
      || ((value.sourceLevel === 'A' || value.sourceLevel === 'B') && value.isOfficial))
}

export function countPublishableSourcesByIds(client: DatabaseClient, sourceIds: string[]): number {
  if (sourceIds.length === 0) return 0

  return client.db.select({ value: count() }).from(sources)
    .where(and(inArray(sources.id, sourceIds), publishableSourceCondition()))
    .get()?.value ?? 0
}

export function countPublishablePlaceSources(client: DatabaseClient, placeId: string): number {
  return client.db.select({ value: count() }).from(placeSources)
    .innerJoin(sources, eq(placeSources.sourceId, sources.id))
    .where(and(eq(placeSources.placeId, placeId), publishableSourceCondition()))
    .get()?.value ?? 0
}

export function countPublishableContentSources(client: DatabaseClient, contentId: string): number {
  return client.db.select({ value: count() }).from(contentSources)
    .innerJoin(sources, eq(contentSources.sourceId, sources.id))
    .where(and(eq(contentSources.contentId, contentId), publishableSourceCondition()))
    .get()?.value ?? 0
}

export function countPublishableProcedureSources(client: DatabaseClient, procedureId: string): number {
  return client.db.select({ value: count() }).from(procedureSources)
    .innerJoin(sources, eq(procedureSources.sourceId, sources.id))
    .where(and(eq(procedureSources.procedureId, procedureId), publishableSourceCondition()))
    .get()?.value ?? 0
}

export function publishedTargetsWithoutAlternativeSource(
  client: DatabaseClient,
  sourceId: string
): { placeIds: string[], contentIds: string[], procedureIds: string[] } {
  const publishedPlaceIds = client.db.select({ id: placeSources.placeId })
    .from(placeSources)
    .innerJoin(places, eq(placeSources.placeId, places.id))
    .where(and(eq(placeSources.sourceId, sourceId), eq(places.status, 'published')))
    .all()
    .map(row => row.id)
  const publishedContentIds = client.db.select({ id: contentSources.contentId })
    .from(contentSources)
    .innerJoin(contents, eq(contentSources.contentId, contents.id))
    .where(and(eq(contentSources.sourceId, sourceId), eq(contents.status, 'published')))
    .all()
    .map(row => row.id)
  const publishedProcedureIds = client.db.select({ id: procedureSources.procedureId })
    .from(procedureSources)
    .innerJoin(procedures, eq(procedureSources.procedureId, procedures.id))
    .where(and(eq(procedureSources.sourceId, sourceId), eq(procedures.status, 'published')))
    .all()
    .map(row => row.id)

  const placeIds = publishedPlaceIds.filter((placeId) => {
    const alternatives = client.db.select({ value: count() }).from(placeSources)
      .innerJoin(sources, eq(placeSources.sourceId, sources.id))
      .where(and(
        eq(placeSources.placeId, placeId),
        ne(placeSources.sourceId, sourceId),
        publishableSourceCondition()
      ))
      .get()?.value ?? 0
    return alternatives === 0
  })
  const contentIds = publishedContentIds.filter((contentId) => {
    const alternatives = client.db.select({ value: count() }).from(contentSources)
      .innerJoin(sources, eq(contentSources.sourceId, sources.id))
      .where(and(
        eq(contentSources.contentId, contentId),
        ne(contentSources.sourceId, sourceId),
        publishableSourceCondition()
      ))
      .get()?.value ?? 0
    return alternatives === 0
  })
  const procedureIds = publishedProcedureIds.filter((procedureId) => {
    const alternatives = client.db.select({ value: count() }).from(procedureSources)
      .innerJoin(sources, eq(procedureSources.sourceId, sources.id))
      .where(and(
        eq(procedureSources.procedureId, procedureId),
        ne(procedureSources.sourceId, sourceId),
        publishableSourceCondition()
      ))
      .get()?.value ?? 0
    return alternatives === 0
  })

  return { placeIds, contentIds, procedureIds }
}

export function listSources(client: DatabaseClient, query: SourcesQuery) {
  const conditions: SQL[] = []
  const search = query.q ? cleanSearchTerm(query.q) : ''

  if (query.level) {
    conditions.push(eq(sources.sourceLevel, query.level))
  }
  if (query.status) {
    conditions.push(eq(sources.status, query.status))
  }
  if (query.official) {
    conditions.push(eq(sources.isOfficial, query.official === 'true'))
  }
  if (search) {
    conditions.push(like(sources.title, `%${search}%`))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select().from(sources)
    .where(where)
    .orderBy(desc(sources.updatedAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(sources).where(where).get()?.value ?? 0

  return {
    items: rows.map(serializeAdminSource),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export function getSource(client: DatabaseClient, id: string) {
  const row = client.db.select().from(sources).where(eq(sources.id, id)).get()
  return row ? serializeAdminSource(row) : throwNotFound('source')
}

export function createSource(client: DatabaseClient, input: CreateSourceInput) {
  const now = Date.now()
  const id = randomUUID()

  try {
    client.db.insert(sources).values({
      id,
      title: input.title,
      url: input.url,
      platform: input.platform,
      publisherName: input.publisherName,
      sourceLevel: input.sourceLevel,
      isOfficial: input.isOfficial,
      publishedAt: fromIso(input.publishedAt) ?? null,
      accessedAt: Date.parse(input.accessedAt),
      notes: input.notes ?? null,
      status: input.status,
      createdAt: now,
      updatedAt: now
    }).run()
  } catch (error) {
    rethrowDatabaseError(error)
  }

  return getSource(client, id)
}

export function updateSource(client: DatabaseClient, id: string, input: UpdateSourceInput) {
  const existing = client.db.select().from(sources).where(eq(sources.id, id)).get()

  if (!existing) {
    throwNotFound('source')
  }

  const remainsPublishable = isPublishableSourceMetadata({
    status: input.status ?? existing.status,
    sourceLevel: input.sourceLevel ?? existing.sourceLevel,
    isOfficial: input.isOfficial ?? existing.isOfficial
  })
  if (!remainsPublishable) {
    const affected = publishedTargetsWithoutAlternativeSource(client, id)
    if (affected.placeIds.length > 0
      || affected.contentIds.length > 0
      || affected.procedureIds.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Unpublish dependent records or add another active A/B/C source first',
        data: {
          code: 'SOURCE_REQUIRED_BY_PUBLISHED_RECORDS',
          placeIds: affected.placeIds,
          contentIds: affected.contentIds,
          procedureIds: affected.procedureIds
        }
      })
    }
  }

  try {
    client.db.update(sources).set({
      ...input,
      publishedAt: fromIso(input.publishedAt),
      accessedAt: input.accessedAt ? Date.parse(input.accessedAt) : undefined,
      notes: input.notes,
      updatedAt: Date.now()
    }).where(eq(sources.id, id)).run()
  } catch (error) {
    rethrowDatabaseError(error)
  }

  return getSource(client, id)
}

export function deleteSource(client: DatabaseClient, id: string): void {
  const existing = client.db.select({ id: sources.id }).from(sources).where(eq(sources.id, id)).get()

  if (!existing) {
    throwNotFound('source')
  }

  try {
    client.db.delete(sources).where(eq(sources.id, id)).run()
  } catch (error) {
    rethrowDatabaseError(error)
  }
}
