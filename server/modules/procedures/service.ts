import { randomUUID } from 'node:crypto'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import type { z } from 'zod'
import type {
  adminProceduresQuerySchema,
  createProcedureSchema,
  publicProceduresQuerySchema,
  updateProcedureSchema
} from '../../../shared/schemas/server'
import { PROCEDURE_AUDIENCES } from '../../../shared/constants/server'
import type {
  ApiProcedure,
  ApiProcedureDepartment,
  ApiProcedureGuide,
  ApiProcedurePlace
} from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import {
  contents,
  places,
  procedureMaterials,
  procedurePlaces,
  procedures,
  procedureSources,
  procedureSteps,
  sources
} from '../../database/schema'
import { rethrowDatabaseError, throwNotFound } from '../../utils/errors'
import { fromIso, serializeSource } from '../../utils/serializers'
import {
  assertSourceIds,
  countPublishableSourcesByIds
} from '../verification/service'
import { cleanSearchTerm } from '../../../shared/utils/like-search'

type CreateProcedureInput = z.infer<typeof createProcedureSchema>
type UpdateProcedureInput = z.infer<typeof updateProcedureSchema>
type PublicProcedureQuery = z.infer<typeof publicProceduresQuerySchema>
type AdminProcedureQuery = z.infer<typeof adminProceduresQuerySchema>
type ProcedureRow = typeof procedures.$inferSelect
type ContentRow = typeof contents.$inferSelect
type PlaceRow = typeof places.$inferSelect
type ProcedurePublicationRow = Pick<
  ProcedureRow,
  'lastVerifiedAt' | 'validUntil' | 'departmentId' | 'guideId' | 'startsAt' | 'endsAt' | 'validFrom'
>

interface RelationRefs {
  placeId?: string | null
  departmentId?: string | null
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

function safeAudience(value: string): Array<'undergraduate' | 'transfer'> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is 'undergraduate' | 'transfer' => (
      typeof item === 'string'
      && PROCEDURE_AUDIENCES.includes(item as 'undergraduate' | 'transfer')
    ))
  } catch {
    return []
  }
}

function safeMetadata(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function serializeDepartment(row: ContentRow | undefined, publicOnly: boolean): ApiProcedureDepartment | null {
  if (!row || row.kind !== 'department' || row.status === 'archived') return null
  if (publicOnly && row.status !== 'published') return null
  const website = safeMetadata(row.metadataJson).website
  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    summary: row.summary,
    website: typeof website === 'string' ? website : null
  }
}

function serializeGuide(row: ContentRow | undefined, publicOnly: boolean): ApiProcedureGuide | null {
  if (!row || row.kind !== 'guide' || row.status === 'archived') return null
  if (publicOnly && row.status !== 'published') return null
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary
  }
}

function serializeProcedurePlace(row: PlaceRow | undefined, publicOnly: boolean): ApiProcedurePlace | null {
  if (!row || row.status === 'archived') return null
  if (publicOnly && row.status !== 'published') return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    address: row.address,
    navigationAvailable: row.status === 'published'
      && row.coordinateVerification === 'verified'
      && row.longitude !== null
      && row.latitude !== null
      && row.coordinateSystem !== null
  }
}

export function isProcedureCurrentlyVisible(
  row: Pick<ProcedureRow, 'status' | 'validFrom' | 'validUntil'>,
  now = Date.now()
): boolean {
  return row.status === 'published'
    && (row.validFrom === null || row.validFrom <= now)
    && (row.validUntil === null || row.validUntil >= now)
}

export function activePublicProcedureCondition(now = Date.now()): SQL {
  return and(
    eq(procedures.status, 'published'),
    or(isNull(procedures.validFrom), lte(procedures.validFrom, now)),
    or(isNull(procedures.validUntil), gte(procedures.validUntil, now))
  )!
}

function serializeProcedureRows(
  client: DatabaseClient,
  rows: ProcedureRow[],
  publicOnly: boolean
): ApiProcedure[] {
  if (rows.length === 0) return []
  const procedureIds = rows.map(row => row.id)
  const stepRows = client.db.select().from(procedureSteps)
    .where(inArray(procedureSteps.procedureId, procedureIds))
    .orderBy(asc(procedureSteps.procedureId), asc(procedureSteps.stepOrder))
    .all()
  const materialRows = client.db.select().from(procedureMaterials)
    .where(inArray(procedureMaterials.procedureId, procedureIds))
    .orderBy(asc(procedureMaterials.procedureId), asc(procedureMaterials.itemOrder))
    .all()
  const placeLinkRows = client.db.select().from(procedurePlaces)
    .where(inArray(procedurePlaces.procedureId, procedureIds))
    .orderBy(asc(procedurePlaces.procedureId), asc(procedurePlaces.sortOrder))
    .all()
  const sourceRows = client.db.select({
    procedureId: procedureSources.procedureId,
    claimScope: procedureSources.claimScope,
    isPrimary: procedureSources.isPrimary,
    order: procedureSources.sortOrder,
    source: sources
  }).from(procedureSources)
    .innerJoin(sources, eq(procedureSources.sourceId, sources.id))
    .where(inArray(procedureSources.procedureId, procedureIds))
    .orderBy(asc(procedureSources.procedureId), asc(procedureSources.sortOrder))
    .all()

  const contentIds = new Set<string>()
  const placeIds = new Set<string>()
  for (const row of rows) {
    if (row.departmentId) contentIds.add(row.departmentId)
    if (row.guideId) contentIds.add(row.guideId)
  }
  for (const row of [...stepRows, ...materialRows]) {
    if (row.departmentId) contentIds.add(row.departmentId)
    if (row.placeId) placeIds.add(row.placeId)
  }
  for (const row of placeLinkRows) placeIds.add(row.placeId)

  const contentRows = contentIds.size > 0
    ? client.db.select().from(contents).where(inArray(contents.id, [...contentIds])).all()
    : []
  const linkedPlaceRows = placeIds.size > 0
    ? client.db.select().from(places).where(inArray(places.id, [...placeIds])).all()
    : []
  const contentMap = new Map(contentRows.map(row => [row.id, row]))
  const placeMap = new Map(linkedPlaceRows.map(row => [row.id, row]))

  return rows.map((row) => {
    const steps = stepRows.filter(item => item.procedureId === row.id)
    const materials = materialRows.filter(item => item.procedureId === row.id)
    const linkedPlaces = placeLinkRows
      .filter(item => item.procedureId === row.id)
      .map(item => serializeProcedurePlace(placeMap.get(item.placeId), publicOnly))
      .filter((item): item is ApiProcedurePlace => item !== null)

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      category: row.category,
      audience: safeAudience(row.audienceJson),
      method: row.method,
      informationState: row.informationState,
      statusText: row.statusText,
      processingTime: row.processingTime,
      deadlineText: row.deadlineText,
      startsAt: toIso(row.startsAt),
      endsAt: toIso(row.endsAt),
      validFrom: toIso(row.validFrom),
      validUntil: toIso(row.validUntil),
      department: serializeDepartment(
        row.departmentId ? contentMap.get(row.departmentId) : undefined,
        publicOnly
      ),
      relatedGuide: serializeGuide(row.guideId ? contentMap.get(row.guideId) : undefined, publicOnly),
      places: linkedPlaces,
      steps: steps.map(step => ({
        id: step.id,
        order: step.stepOrder,
        title: step.title,
        description: step.description,
        audience: safeAudience(step.audienceJson),
        informationState: step.informationState,
        timeText: step.timeText,
        place: serializeProcedurePlace(step.placeId ? placeMap.get(step.placeId) : undefined, publicOnly),
        department: serializeDepartment(
          step.departmentId ? contentMap.get(step.departmentId) : undefined,
          publicOnly
        ),
        actionUrl: step.actionUrl
      })),
      materials: materials.map(material => ({
        id: material.id,
        order: material.itemOrder,
        name: material.name,
        description: material.description,
        audience: safeAudience(material.audienceJson),
        isRequired: material.isRequired,
        informationState: material.informationState,
        place: serializeProcedurePlace(
          material.placeId ? placeMap.get(material.placeId) : undefined,
          publicOnly
        ),
        department: serializeDepartment(
          material.departmentId ? contentMap.get(material.departmentId) : undefined,
          publicOnly
        )
      })),
      sources: sourceRows
        .filter(item => item.procedureId === row.id)
        .map(item => ({
          ...serializeSource(item.source),
          claimScope: item.claimScope,
          isPrimary: item.isPrimary,
          order: item.order
        })),
      status: row.status,
      lastVerifiedAt: toIso(row.lastVerifiedAt),
      publishedAt: toIso(row.publishedAt),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString()
    }
  })
}

function getProcedureByIdRow(client: DatabaseClient, id: string): ProcedureRow | undefined {
  return client.db.select().from(procedures).where(eq(procedures.id, id)).get()
}

function assertDateRanges(value: Pick<ProcedureRow, 'startsAt' | 'endsAt' | 'validFrom' | 'validUntil'>): void {
  if ((value.startsAt !== null && value.endsAt !== null && value.endsAt < value.startsAt)
    || (value.validFrom !== null && value.validUntil !== null && value.validUntil < value.validFrom)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Procedure date ranges are invalid',
      data: { code: 'INVALID_PROCEDURE_DATE_RANGE' }
    })
  }
}

function assertContentReference(
  client: DatabaseClient,
  id: string | null | undefined,
  kind: 'department' | 'guide',
  requirePublished: boolean
): void {
  if (!id) return
  const row = client.db.select({ kind: contents.kind, status: contents.status })
    .from(contents)
    .where(eq(contents.id, id))
    .get()
  if (!row || row.kind !== kind || row.status === 'archived' || (requirePublished && row.status !== 'published')) {
    throw createError({
      statusCode: 422,
      statusMessage: `Invalid ${kind} reference`,
      data: { code: 'INVALID_PROCEDURE_CONTENT_REFERENCE', kind, id }
    })
  }
}

function assertPlaceReferences(
  client: DatabaseClient,
  ids: Array<string | null | undefined>,
  requirePublished: boolean
): void {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return
  const rows = client.db.select({ id: places.id, status: places.status }).from(places)
    .where(inArray(places.id, uniqueIds))
    .all()
  if (rows.length !== uniqueIds.length
    || rows.some(row => row.status === 'archived' || (requirePublished && row.status !== 'published'))) {
    throw createError({
      statusCode: 422,
      statusMessage: 'One or more procedure place references are unavailable',
      data: { code: 'INVALID_PROCEDURE_PLACE_REFERENCE' }
    })
  }
}

function assertRelationReferences(
  client: DatabaseClient,
  value: {
    departmentId?: string | null
    guideId?: string | null
    placeIds: string[]
    steps: RelationRefs[]
    materials: RelationRefs[]
  },
  requirePublished: boolean
): void {
  const departmentIds = [
    value.departmentId,
    ...value.steps.map(step => step.departmentId),
    ...value.materials.map(material => material.departmentId)
  ]
  for (const id of new Set(departmentIds.filter((item): item is string => Boolean(item)))) {
    assertContentReference(client, id, 'department', requirePublished)
  }
  assertContentReference(client, value.guideId, 'guide', requirePublished)
  assertPlaceReferences(client, [
    ...value.placeIds,
    ...value.steps.map(step => step.placeId),
    ...value.materials.map(material => material.placeId)
  ], requirePublished)
}

function existingRelations(client: DatabaseClient, procedureId: string) {
  const sourceLinks = client.db.select({
    id: procedureSources.sourceId,
    claimScope: procedureSources.claimScope,
    isPrimary: procedureSources.isPrimary
  }).from(procedureSources)
    .where(eq(procedureSources.procedureId, procedureId))
    .orderBy(asc(procedureSources.sortOrder))
    .all()
  return {
    sourceIds: sourceLinks.map(row => row.id),
    sourceLinks,
    placeIds: client.db.select({ id: procedurePlaces.placeId }).from(procedurePlaces)
      .where(eq(procedurePlaces.procedureId, procedureId))
      .orderBy(asc(procedurePlaces.sortOrder))
      .all()
      .map(row => row.id),
    steps: client.db.select().from(procedureSteps)
      .where(eq(procedureSteps.procedureId, procedureId))
      .orderBy(asc(procedureSteps.stepOrder))
      .all(),
    materials: client.db.select().from(procedureMaterials)
      .where(eq(procedureMaterials.procedureId, procedureId))
      .orderBy(asc(procedureMaterials.itemOrder))
      .all()
  }
}

function assertProcedurePublishable(
  client: DatabaseClient,
  row: ProcedurePublicationRow,
  relationState: {
    sourceIds: string[]
    placeIds: string[]
    steps: Array<RelationRefs & { stepOrder?: number }>
    materials: RelationRefs[]
  },
  now: number
): void {
  if (!row.lastVerifiedAt
    || row.lastVerifiedAt > now
    || (row.validUntil !== null && row.validUntil < now)
    || relationState.steps.length === 0
    || countPublishableSourcesByIds(client, relationState.sourceIds) === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Current verification, ordered steps, and active evidence are required before publishing',
      data: { code: 'PROCEDURE_PUBLISH_REQUIREMENTS_NOT_MET' }
    })
  }
  if (relationState.steps.some((step, index) => (
    step.stepOrder !== undefined && step.stepOrder !== index + 1
  ))) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Procedure step order must be continuous from 1',
      data: { code: 'PROCEDURE_STEPS_INVALID' }
    })
  }
  assertDateRanges({
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    validFrom: row.validFrom,
    validUntil: row.validUntil
  })
  assertRelationReferences(client, {
    departmentId: row.departmentId,
    guideId: row.guideId,
    placeIds: relationState.placeIds,
    steps: relationState.steps,
    materials: relationState.materials
  }, true)
}

export function listProcedures(
  client: DatabaseClient,
  query: PublicProcedureQuery | AdminProcedureQuery,
  publicOnly: boolean
) {
  const conditions: SQL[] = []
  const search = query.q ? cleanSearchTerm(query.q) : ''
  if (publicOnly) {
    conditions.push(activePublicProcedureCondition())
  } else if ('status' in query && query.status) {
    conditions.push(eq(procedures.status, query.status))
  }
  if (query.category) conditions.push(eq(procedures.category, query.category))
  if (query.audience) {
    conditions.push(sql`exists (
      select 1 from json_each(${procedures.audienceJson})
      where json_each.value = ${query.audience}
    )`)
  }
  if (search) {
    const matchingChildIds = new Set([
      ...client.db.select({ id: procedureSteps.procedureId }).from(procedureSteps)
        .where(or(
          like(procedureSteps.title, `%${search}%`),
          like(procedureSteps.description, `%${search}%`),
          like(procedureSteps.timeText, `%${search}%`)
        ))
        .all()
        .map(row => row.id),
      ...client.db.select({ id: procedureMaterials.procedureId }).from(procedureMaterials)
        .where(or(
          like(procedureMaterials.name, `%${search}%`),
          like(procedureMaterials.description, `%${search}%`)
        ))
        .all()
        .map(row => row.id)
    ])
    conditions.push(or(
      like(procedures.title, `%${search}%`),
      like(procedures.summary, `%${search}%`),
      like(procedures.body, `%${search}%`),
      ...(matchingChildIds.size > 0 ? [inArray(procedures.id, [...matchingChildIds])] : [])
    )!)
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select().from(procedures)
    .where(where)
    .orderBy(desc(procedures.publishedAt), asc(procedures.startsAt), asc(procedures.title))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(procedures).where(where).get()?.value ?? 0
  return {
    items: serializeProcedureRows(client, rows, publicOnly),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export function getPublicProcedure(client: DatabaseClient, slug: string): ApiProcedure {
  const row = client.db.select().from(procedures).where(eq(procedures.slug, slug)).get()
  if (!row || !isProcedureCurrentlyVisible(row)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Procedure not found',
      data: { code: 'PROCEDURE_NOT_PUBLIC' }
    })
  }
  return serializeProcedureRows(client, [row], true)[0]!
}

export function getAdminProcedure(client: DatabaseClient, id: string): ApiProcedure {
  const row = getProcedureByIdRow(client, id)
  if (!row) throwNotFound('procedure')
  return serializeProcedureRows(client, [row], false)[0]!
}

export function createProcedure(client: DatabaseClient, input: CreateProcedureInput): ApiProcedure {
  const sourceIds = assertSourceIds(client, input.sourceIds)
  assertRelationReferences(client, input, false)
  const id = randomUUID()
  const now = Date.now()
  const dateState = {
    startsAt: fromIso(input.startsAt) ?? null,
    endsAt: fromIso(input.endsAt) ?? null,
    validFrom: fromIso(input.validFrom) ?? null,
    validUntil: fromIso(input.validUntil) ?? null
  }
  assertDateRanges(dateState)

  try {
    client.db.transaction((transaction) => {
      transaction.insert(procedures).values({
        id,
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        body: input.body,
        category: input.category ?? null,
        audienceJson: JSON.stringify(input.audience),
        method: input.method,
        informationState: input.informationState,
        statusText: input.statusText,
        processingTime: input.processingTime ?? null,
        deadlineText: input.deadlineText ?? null,
        ...dateState,
        departmentId: input.departmentId ?? null,
        guideId: input.guideId ?? null,
        status: 'draft',
        lastVerifiedAt: fromIso(input.lastVerifiedAt) ?? null,
        createdAt: now,
        updatedAt: now
      }).run()
      if (input.steps.length > 0) {
        transaction.insert(procedureSteps).values(input.steps.map((step, index) => ({
          id: randomUUID(),
          procedureId: id,
          stepOrder: index + 1,
          title: step.title,
          description: step.description,
          audienceJson: JSON.stringify(step.audience),
          informationState: step.informationState,
          timeText: step.timeText ?? null,
          placeId: step.placeId ?? null,
          departmentId: step.departmentId ?? null,
          actionUrl: step.actionUrl === '' ? null : step.actionUrl ?? null,
          createdAt: now,
          updatedAt: now
        }))).run()
      }
      if (input.materials.length > 0) {
        transaction.insert(procedureMaterials).values(input.materials.map((material, index) => ({
          id: randomUUID(),
          procedureId: id,
          itemOrder: index + 1,
          name: material.name,
          description: material.description,
          audienceJson: JSON.stringify(material.audience),
          isRequired: material.isRequired,
          informationState: material.informationState,
          placeId: material.placeId ?? null,
          departmentId: material.departmentId ?? null,
          createdAt: now,
          updatedAt: now
        }))).run()
      }
      if (input.placeIds.length > 0) {
        transaction.insert(procedurePlaces).values(input.placeIds.map((placeId, index) => ({
          procedureId: id,
          placeId,
          sortOrder: index + 1,
          createdAt: now
        }))).run()
      }
      if (sourceIds.length > 0) {
        transaction.insert(procedureSources).values(sourceIds.map((sourceId, index) => ({
          procedureId: id,
          sourceId,
          claimScope: '',
          isPrimary: index === 0,
          sortOrder: index + 1,
          createdAt: now
        }))).run()
      }
    })
  } catch (error) {
    rethrowDatabaseError(error)
  }
  return getAdminProcedure(client, id)
}

export function updateProcedure(
  client: DatabaseClient,
  id: string,
  input: UpdateProcedureInput
): ApiProcedure {
  const existing = getProcedureByIdRow(client, id)
  if (!existing) throwNotFound('procedure')
  const currentRelations = existingRelations(client, id)
  const nextSourceIds = input.sourceIds === undefined
    ? currentRelations.sourceIds
    : assertSourceIds(client, input.sourceIds)
  const nextPlaceIds = input.placeIds ?? currentRelations.placeIds
  const nextSteps = input.steps ?? currentRelations.steps
  const nextMaterials = input.materials ?? currentRelations.materials
  const existingSourceMetadata = new Map(
    currentRelations.sourceLinks.map(link => [link.id, link])
  )
  const retainedPrimary = nextSourceIds.some(sourceId => existingSourceMetadata.get(sourceId)?.isPrimary)
  const nextSourceLinks = nextSourceIds.map((sourceId, index) => {
    const existingLink = existingSourceMetadata.get(sourceId)
    return {
      sourceId,
      claimScope: existingLink?.claimScope ?? '',
      isPrimary: retainedPrimary ? existingLink?.isPrimary ?? false : index === 0
    }
  })
  const nextRow = {
    ...existing,
    departmentId: input.departmentId === undefined ? existing.departmentId : input.departmentId,
    guideId: input.guideId === undefined ? existing.guideId : input.guideId,
    startsAt: input.startsAt === undefined ? existing.startsAt : fromIso(input.startsAt) ?? null,
    endsAt: input.endsAt === undefined ? existing.endsAt : fromIso(input.endsAt) ?? null,
    validFrom: input.validFrom === undefined ? existing.validFrom : fromIso(input.validFrom) ?? null,
    validUntil: input.validUntil === undefined ? existing.validUntil : fromIso(input.validUntil) ?? null,
    lastVerifiedAt: input.lastVerifiedAt === undefined
      ? existing.lastVerifiedAt
      : fromIso(input.lastVerifiedAt) ?? null
  }
  assertDateRanges(nextRow)
  assertRelationReferences(client, {
    departmentId: nextRow.departmentId,
    guideId: nextRow.guideId,
    placeIds: nextPlaceIds,
    steps: nextSteps,
    materials: nextMaterials
  }, existing.status === 'published')
  if (existing.status === 'published') {
    assertProcedurePublishable(client, nextRow, {
      sourceIds: nextSourceIds,
      placeIds: nextPlaceIds,
      steps: nextSteps,
      materials: nextMaterials
    }, Date.now())
  }

  const now = Date.now()
  try {
    client.db.transaction((transaction) => {
      transaction.update(procedures).set({
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        body: input.body,
        category: input.category,
        audienceJson: input.audience === undefined ? undefined : JSON.stringify(input.audience),
        method: input.method,
        informationState: input.informationState,
        statusText: input.statusText,
        processingTime: input.processingTime,
        deadlineText: input.deadlineText,
        startsAt: input.startsAt === undefined ? undefined : fromIso(input.startsAt),
        endsAt: input.endsAt === undefined ? undefined : fromIso(input.endsAt),
        validFrom: input.validFrom === undefined ? undefined : fromIso(input.validFrom),
        validUntil: input.validUntil === undefined ? undefined : fromIso(input.validUntil),
        departmentId: input.departmentId,
        guideId: input.guideId,
        lastVerifiedAt: input.lastVerifiedAt === undefined ? undefined : fromIso(input.lastVerifiedAt),
        updatedAt: now
      }).where(eq(procedures.id, id)).run()

      if (input.steps !== undefined) {
        transaction.delete(procedureSteps).where(eq(procedureSteps.procedureId, id)).run()
        if (input.steps.length > 0) {
          transaction.insert(procedureSteps).values(input.steps.map((step, index) => ({
            id: randomUUID(),
            procedureId: id,
            stepOrder: index + 1,
            title: step.title,
            description: step.description,
            audienceJson: JSON.stringify(step.audience),
            informationState: step.informationState,
            timeText: step.timeText ?? null,
            placeId: step.placeId ?? null,
            departmentId: step.departmentId ?? null,
            actionUrl: step.actionUrl === '' ? null : step.actionUrl ?? null,
            createdAt: now,
            updatedAt: now
          }))).run()
        }
      }
      if (input.materials !== undefined) {
        transaction.delete(procedureMaterials).where(eq(procedureMaterials.procedureId, id)).run()
        if (input.materials.length > 0) {
          transaction.insert(procedureMaterials).values(input.materials.map((material, index) => ({
            id: randomUUID(),
            procedureId: id,
            itemOrder: index + 1,
            name: material.name,
            description: material.description,
            audienceJson: JSON.stringify(material.audience),
            isRequired: material.isRequired,
            informationState: material.informationState,
            placeId: material.placeId ?? null,
            departmentId: material.departmentId ?? null,
            createdAt: now,
            updatedAt: now
          }))).run()
        }
      }
      if (input.placeIds !== undefined) {
        transaction.delete(procedurePlaces).where(eq(procedurePlaces.procedureId, id)).run()
        if (input.placeIds.length > 0) {
          transaction.insert(procedurePlaces).values(input.placeIds.map((placeId, index) => ({
            procedureId: id,
            placeId,
            sortOrder: index + 1,
            createdAt: now
          }))).run()
        }
      }
      if (input.sourceIds !== undefined) {
        transaction.delete(procedureSources).where(eq(procedureSources.procedureId, id)).run()
        if (nextSourceIds.length > 0) {
          transaction.insert(procedureSources).values(nextSourceLinks.map((source, index) => ({
            procedureId: id,
            sourceId: source.sourceId,
            claimScope: source.claimScope,
            isPrimary: source.isPrimary,
            sortOrder: index + 1,
            createdAt: now
          }))).run()
        }
      }
    })
  } catch (error) {
    rethrowDatabaseError(error)
  }
  return getAdminProcedure(client, id)
}

export function publishProcedure(client: DatabaseClient, id: string): ApiProcedure {
  const row = getProcedureByIdRow(client, id)
  if (!row) throwNotFound('procedure')
  const relationState = existingRelations(client, id)
  assertProcedurePublishable(client, row, relationState, Date.now())
  const now = Date.now()
  client.db.update(procedures).set({
    status: 'published',
    publishedAt: now,
    updatedAt: now
  }).where(eq(procedures.id, id)).run()
  return getAdminProcedure(client, id)
}

export function archiveProcedure(client: DatabaseClient, id: string): ApiProcedure {
  const row = getProcedureByIdRow(client, id)
  if (!row) throwNotFound('procedure')
  client.db.update(procedures).set({
    status: 'archived',
    updatedAt: Date.now()
  }).where(eq(procedures.id, id)).run()
  return getAdminProcedure(client, id)
}
