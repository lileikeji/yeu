import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, or, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import type {
  adminContentQuerySchema,
  createContentSchema,
  publicContentQuerySchema,
  updateContentSchema
} from '../../../shared/schemas/server'
import type { ContentKind } from '../../../shared/constants/server'
import type { DatabaseClient } from '../../database/client'
import { contents, contentSources } from '../../database/schema'
import { rethrowDatabaseError, throwNotFound } from '../../utils/errors'
import { fromIso, safeMetadata, safeMetadataRecord, serializeContent } from '../../utils/serializers'
import {
  assertSourceIds,
  countPublishableContentSources,
  countPublishableSourcesByIds,
  getContentSourceMap
} from '../verification/service'
import { getManagedContentKinds } from './catalog-state'
import {
  activePublicContentCondition,
  isPublicContentCurrentlyVisible
} from './visibility'
import { bumpAssistantKnowledgeRevision } from '../assistant/knowledge-revision'
import { cleanSearchTerm } from '../../../shared/utils/like-search'

type CreateContentInput = z.infer<typeof createContentSchema>
type UpdateContentInput = z.infer<typeof updateContentSchema>
type PublicContentQuery = z.infer<typeof publicContentQuerySchema>
type AdminContentQuery = z.infer<typeof adminContentQuerySchema>

function getContentByIdRow(client: DatabaseClient, id: string) {
  return client.db.select().from(contents).where(eq(contents.id, id)).get()
}

function assertContentPublishableState(
  lastVerifiedAt: number | null,
  publishableSourceCount: number,
  now: number
): void {
  if (!lastVerifiedAt || lastVerifiedAt > now || publishableSourceCount === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Current verification and at least one active A/B/C source are required before publishing',
      data: { code: 'PUBLISH_REQUIREMENTS_NOT_MET' }
    })
  }
}

function serializeContentRows(client: DatabaseClient, rows: Array<typeof contents.$inferSelect>) {
  const sourceMap = getContentSourceMap(client, rows.map(row => row.id))
  return rows.map(row => serializeContent(row, sourceMap.get(row.id) ?? []))
}

export function listContent(
  client: DatabaseClient,
  query: PublicContentQuery | AdminContentQuery,
  publicOnly: boolean,
  forcedKind?: ContentKind
) {
  const conditions: SQL[] = []
  const search = query.q ? cleanSearchTerm(query.q) : ''

  if (publicOnly) {
    conditions.push(eq(contents.status, 'published'))
    conditions.push(activePublicContentCondition())
  } else if ('status' in query && query.status) {
    conditions.push(eq(contents.status, query.status))
  }
  if (forcedKind) {
    conditions.push(eq(contents.kind, forcedKind))
  } else if (query.kind) {
    conditions.push(eq(contents.kind, query.kind))
  }
  if (query.category) {
    conditions.push(eq(contents.category, query.category))
  }
  if (query.featured) {
    conditions.push(eq(contents.isFeatured, query.featured === 'true'))
  }
  if (search) {
    conditions.push(or(
      like(contents.title, `%${search}%`),
      like(contents.summary, `%${search}%`),
      like(contents.body, `%${search}%`)
    )!)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize
  const orderBy = query.kind === 'notice'
    ? [
        sql<number>`case when json_extract(${contents.metadataJson}, '$.pinned') = 1 then 0 else 1 end asc`,
        sql<number>`coalesce(cast(json_extract(${contents.metadataJson}, '$.sortOrder') as integer), 10000) asc`,
        desc(contents.publishedAt),
        desc(contents.updatedAt),
        contents.title
      ]
    : [
        sql<number>`coalesce(cast(json_extract(${contents.metadataJson}, '$.sortOrder') as integer), 10000) asc`,
        desc(contents.isFeatured),
        desc(contents.publishedAt),
        contents.title
      ]
  const rows = client.db.select().from(contents)
    .where(where)
    .orderBy(...orderBy)
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(contents).where(where).get()?.value ?? 0
  const managedKinds = publicOnly ? getManagedContentKinds(client) : undefined
  const managedKind = forcedKind ?? query.kind
  const hasManagedRecords = publicOnly
    ? managedKind
      ? managedKinds!.includes(managedKind)
      : managedKinds!.length > 0
    : undefined

  return {
    items: serializeContentRows(client, rows),
    total,
    page: query.page,
    pageSize: query.pageSize,
    ...(publicOnly && { hasManagedRecords, managedKinds })
  }
}

export function getPublicContent(client: DatabaseClient, slug: string, forcedKind?: ContentKind) {
  const conditions = [eq(contents.slug, slug)]

  if (forcedKind) {
    conditions.push(eq(contents.kind, forcedKind))
  }

  const row = client.db.select().from(contents).where(and(...conditions)).get()

  if (!row) {
    if (forcedKind && !getManagedContentKinds(client).includes(forcedKind)) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Content catalog is not managed',
        data: { code: 'CONTENT_CATALOG_UNMANAGED' }
      })
    }
    throwNotFound('content')
  }

  if (row.status !== 'published'
    || !isPublicContentCurrentlyVisible(row.kind, row.metadataJson)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Content not found',
      data: { code: 'CONTENT_NOT_PUBLIC' }
    })
  }

  return serializeContentRows(client, [row])[0]!
}

export function getAdminContent(client: DatabaseClient, id: string) {
  const row = getContentByIdRow(client, id)

  if (!row) {
    throwNotFound('content')
  }

  return serializeContentRows(client, [row])[0]!
}

export function createContent(client: DatabaseClient, input: CreateContentInput) {
  const sourceIds = assertSourceIds(client, input.sourceIds)
  const id = randomUUID()
  const now = Date.now()

  try {
    client.db.transaction((transaction) => {
      transaction.insert(contents).values({
        id,
        kind: input.kind,
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        body: input.body,
        category: input.category ?? null,
        audience: input.audience ?? null,
        metadataJson: JSON.stringify(safeMetadataRecord(input.metadata)),
        isFeatured: input.isFeatured,
        status: 'draft',
        lastVerifiedAt: fromIso(input.lastVerifiedAt) ?? null,
        createdAt: now,
        updatedAt: now
      }).run()

      if (sourceIds.length > 0) {
        transaction.insert(contentSources).values(sourceIds.map((sourceId, index) => ({
          contentId: id,
          sourceId,
          isPrimary: index === 0,
          createdAt: now
        }))).run()
      }
    })
  } catch (error) {
    rethrowDatabaseError(error)
  }

  bumpAssistantKnowledgeRevision()
  return getAdminContent(client, id)
}

export function updateContent(client: DatabaseClient, id: string, input: UpdateContentInput) {
  const existing = getContentByIdRow(client, id)

  if (!existing) {
    throwNotFound('content')
  }

  const { sourceIds: requestedSourceIds, metadata, ...fields } = input
  const mergedMetadata = metadata === undefined
    ? undefined
    : safeMetadataRecord({ ...safeMetadata(existing.metadataJson), ...metadata })
  const sourceIds = requestedSourceIds === undefined
    ? undefined
    : assertSourceIds(client, requestedSourceIds)
  const nextLastVerifiedAt = fields.lastVerifiedAt === undefined
    ? existing.lastVerifiedAt
    : fromIso(fields.lastVerifiedAt) ?? null

  if (existing.status === 'published' && existing.kind !== 'notice') {
    const publishableSourceCount = sourceIds === undefined
      ? countPublishableContentSources(client, id)
      : countPublishableSourcesByIds(client, sourceIds)
    assertContentPublishableState(nextLastVerifiedAt, publishableSourceCount, Date.now())
  }

  try {
    client.db.transaction((transaction) => {
      transaction.update(contents).set({
        ...fields,
        category: fields.category,
        audience: fields.audience,
        metadataJson: mergedMetadata === undefined ? undefined : JSON.stringify(mergedMetadata),
        lastVerifiedAt: fromIso(fields.lastVerifiedAt),
        updatedAt: Date.now()
      }).where(eq(contents.id, id)).run()

      if (sourceIds !== undefined) {
        transaction.delete(contentSources).where(eq(contentSources.contentId, id)).run()
        if (sourceIds.length > 0) {
          transaction.insert(contentSources).values(sourceIds.map((sourceId, index) => ({
            contentId: id,
            sourceId,
            isPrimary: index === 0,
            createdAt: Date.now()
          }))).run()
        }
      }
    })
  } catch (error) {
    rethrowDatabaseError(error)
  }

  bumpAssistantKnowledgeRevision()
  return getAdminContent(client, id)
}

export function publishContent(client: DatabaseClient, id: string) {
  const row = getContentByIdRow(client, id)

  if (!row) {
    throwNotFound('content')
  }

  const now = Date.now()
  if (row.kind !== 'notice') {
    assertContentPublishableState(row.lastVerifiedAt, countPublishableContentSources(client, id), now)
  }

  client.db.update(contents).set({
    status: 'published',
    publishedAt: now,
    updatedAt: now
  }).where(eq(contents.id, id)).run()
  bumpAssistantKnowledgeRevision()
  return getAdminContent(client, id)
}

export function archiveContent(client: DatabaseClient, id: string) {
  const row = getContentByIdRow(client, id)

  if (!row) {
    throwNotFound('content')
  }

  client.db.update(contents).set({
    status: 'archived',
    updatedAt: Date.now()
  }).where(eq(contents.id, id)).run()
  bumpAssistantKnowledgeRevision()
  return getAdminContent(client, id)
}
