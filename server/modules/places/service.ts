import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, or, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import type {
  adminPlacesQuerySchema,
  createPlaceSchema,
  publicPlacesQuerySchema,
  updatePlaceSchema
} from '../../../shared/schemas/server'
import {
  isPointWithinBounds,
  YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
} from '../../../map/core/campus'
import type { DatabaseClient } from '../../database/client'
import { places, placeSources } from '../../database/schema'
import { rethrowDatabaseError, throwNotFound } from '../../utils/errors'
import { fromIso, serializePlace } from '../../utils/serializers'
import {
  assertSourceIds,
  countPublishablePlaceSources,
  countPublishableSourcesByIds,
  getPlaceSourceMap
} from '../verification/service'

type CreatePlaceInput = z.infer<typeof createPlaceSchema>
type UpdatePlaceInput = z.infer<typeof updatePlaceSchema>
type PublicPlacesQuery = z.infer<typeof publicPlacesQuerySchema>
type AdminPlacesQuery = z.infer<typeof adminPlacesQuerySchema>

function cleanSearchTerm(value: string): string {
  return value.replace(/[%_]/g, '').trim()
}

function getPlaceByIdRow(client: DatabaseClient, id: string) {
  return client.db.select().from(places).where(eq(places.id, id)).get()
}

function serializePlaceRows(
  client: DatabaseClient,
  rows: Array<typeof places.$inferSelect>,
  includeInternalCoordinates = false
) {
  const sourceMap = getPlaceSourceMap(client, rows.map(row => row.id))
  return rows.map(row => serializePlace(row, sourceMap.get(row.id) ?? [], includeInternalCoordinates))
}

interface CoordinateState {
  longitude: number | null
  latitude: number | null
  coordinateSystem: 'WGS84' | 'GCJ-02' | 'BD-09' | null
  coordinateVerification: 'missing' | 'unverified' | 'verified' | 'rejected'
  coordinateVerifiedAt: number | null
}

function assertCoordinateState(value: CoordinateState): void {
  const coordinateCount = [value.longitude, value.latitude, value.coordinateSystem]
    .filter(item => item !== null).length

  if ((coordinateCount !== 0 && coordinateCount !== 3)
    || (value.coordinateVerification === 'verified'
      && (coordinateCount !== 3 || value.coordinateVerifiedAt === null))
    || (value.coordinateVerification === 'missing' && coordinateCount !== 0)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Coordinate values and verification state are inconsistent',
      data: { code: 'INVALID_COORDINATE_STATE' }
    })
  }
}

function assertPlacePublishableState(
  value: CoordinateState & {
    scope: 'campus' | 'nearby'
    lastVerifiedAt: number | null
  },
  publishableSourceCount: number,
  now: number
): void {
  const hasPublishableCoordinate = value.coordinateVerification === 'verified'
    && value.coordinateVerifiedAt !== null
    && value.coordinateVerifiedAt <= now
    && value.coordinateSystem === 'WGS84'
    && value.longitude !== null
    && value.latitude !== null
    && (value.scope !== 'campus' || isPointWithinBounds(
      { lng: value.longitude, lat: value.latitude },
      YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
    ))

  if (!value.lastVerifiedAt
    || value.lastVerifiedAt > now
    || !hasPublishableCoordinate
    || publishableSourceCount === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Verified WGS84 coordinates and at least one active A/B/C source are required before publishing',
      data: { code: 'PUBLISH_REQUIREMENTS_NOT_MET' }
    })
  }
}

export function listPlaces(
  client: DatabaseClient,
  query: PublicPlacesQuery | AdminPlacesQuery,
  publicOnly: boolean
) {
  const baseConditions: SQL[] = []
  const search = query.q ? cleanSearchTerm(query.q) : ''

  if (publicOnly) {
    baseConditions.push(eq(places.status, 'published'))
  } else if ('status' in query && query.status) {
    baseConditions.push(eq(places.status, query.status))
  }
  if (query.scope) {
    baseConditions.push(eq(places.scope, query.scope))
  }
  if (query.type) {
    baseConditions.push(eq(places.type, query.type))
  }
  if (query.category) {
    baseConditions.push(eq(places.category, query.category))
  }
  if (query.featured) {
    baseConditions.push(eq(places.isFeatured, query.featured === 'true'))
  }
  if (search) {
    baseConditions.push(or(
      like(places.name, `%${search}%`),
      like(places.summary, `%${search}%`),
      like(places.address, `%${search}%`)
    )!)
  }

  const conditions = [...baseConditions]
  if (!publicOnly && 'coordinateVerification' in query && query.coordinateVerification) {
    conditions.push(eq(places.coordinateVerification, query.coordinateVerification))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select().from(places)
    .where(where)
    .orderBy(desc(places.isFeatured), places.name)
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(places).where(where).get()?.value ?? 0
  const coordinateStats = publicOnly
    ? null
    : client.db.select({
        total: count(),
        missing: count(sql`case when ${places.coordinateVerification} = 'missing' then 1 end`),
        unverified: count(sql`case when ${places.coordinateVerification} = 'unverified' then 1 end`),
        verified: count(sql`case when ${places.coordinateVerification} = 'verified' then 1 end`),
        rejected: count(sql`case when ${places.coordinateVerification} = 'rejected' then 1 end`)
      }).from(places).where(baseWhere).get()

  return {
    items: serializePlaceRows(client, rows, !publicOnly),
    total,
    page: query.page,
    pageSize: query.pageSize,
    ...(!publicOnly && {
      coordinateStats: coordinateStats ?? {
        total: 0,
        missing: 0,
        unverified: 0,
        verified: 0,
        rejected: 0
      }
    })
  }
}

export function getPublicPlace(client: DatabaseClient, slug: string) {
  const row = client.db.select().from(places).where(and(
    eq(places.slug, slug),
    eq(places.status, 'published')
  )).get()

  if (!row) {
    throwNotFound('place')
  }

  return serializePlaceRows(client, [row])[0]!
}

export function getAdminPlace(client: DatabaseClient, id: string) {
  const row = getPlaceByIdRow(client, id)

  if (!row) {
    throwNotFound('place')
  }

  return serializePlaceRows(client, [row], true)[0]!
}

export function createPlace(client: DatabaseClient, input: CreatePlaceInput) {
  if (input.coordinateVerification === 'verified') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Create a coordinate observation and approve it separately',
      data: { code: 'COORDINATE_OBSERVATION_REQUIRED' }
    })
  }
  const sourceIds = assertSourceIds(client, input.sourceIds)
  const id = randomUUID()
  const now = Date.now()

  try {
    client.db.transaction((transaction) => {
      transaction.insert(places).values({
        id,
        slug: input.slug,
        name: input.name,
        summary: input.summary,
        body: input.body,
        scope: input.scope,
        type: input.type,
        category: input.category ?? null,
        address: input.address ?? null,
        campusArea: input.campusArea ?? null,
        floor: input.floor ?? null,
        room: input.room ?? null,
        longitude: input.longitude,
        latitude: input.latitude,
        coordinateSystem: input.coordinateSystem,
        coordinateVerification: input.coordinateVerification,
        coordinateVerifiedAt: fromIso(input.coordinateVerifiedAt) ?? null,
        sourceRawRef: input.sourceRawRef ?? null,
        openingHours: input.openingHours ?? null,
        phone: input.phone ?? null,
        website: input.website || null,
        externalMapUrl: input.externalMapUrl || null,
        isOfficial: input.isOfficial,
        isFeatured: input.isFeatured,
        status: 'draft',
        lastVerifiedAt: fromIso(input.lastVerifiedAt) ?? null,
        createdAt: now,
        updatedAt: now
      }).run()

      if (sourceIds.length > 0) {
        transaction.insert(placeSources).values(sourceIds.map((sourceId, index) => ({
          placeId: id,
          sourceId,
          isPrimary: index === 0,
          createdAt: now
        }))).run()
      }
    })
  } catch (error) {
    rethrowDatabaseError(error)
  }

  return getAdminPlace(client, id)
}

export function updatePlace(client: DatabaseClient, id: string, input: UpdatePlaceInput) {
  const existing = getPlaceByIdRow(client, id)

  if (!existing) {
    throwNotFound('place')
  }

  if (input.coordinateVerification === 'verified'
    && existing.coordinateVerification !== 'verified') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Create a coordinate observation and approve it separately',
      data: { code: 'COORDINATE_OBSERVATION_REQUIRED' }
    })
  }

  const { sourceIds: requestedSourceIds, ...fields } = input
  const sourceIds = requestedSourceIds === undefined
    ? undefined
    : assertSourceIds(client, requestedSourceIds)
  const coordinatesChanged = (fields.longitude !== undefined && fields.longitude !== existing.longitude)
    || (fields.latitude !== undefined && fields.latitude !== existing.latitude)
    || (fields.coordinateSystem !== undefined && fields.coordinateSystem !== existing.coordinateSystem)

  if (coordinatesChanged) {
    if (fields.coordinateVerification === 'verified'
      || (fields.coordinateVerifiedAt !== undefined && fields.coordinateVerifiedAt !== null)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Save changed coordinates as unverified, then verify them in a separate review step',
        data: { code: 'COORDINATE_REVERIFICATION_REQUIRED' }
      })
    }
    const nextCoordinates = [
      fields.longitude === undefined ? existing.longitude : fields.longitude,
      fields.latitude === undefined ? existing.latitude : fields.latitude,
      fields.coordinateSystem === undefined ? existing.coordinateSystem : fields.coordinateSystem
    ]
    fields.coordinateVerification = nextCoordinates.every(value => value === null)
      ? 'missing'
      : 'unverified'
    fields.coordinateVerifiedAt = null
  }
  const coordinateState: CoordinateState = {
    longitude: fields.longitude === undefined ? existing.longitude : fields.longitude,
    latitude: fields.latitude === undefined ? existing.latitude : fields.latitude,
    coordinateSystem: fields.coordinateSystem === undefined
      ? existing.coordinateSystem
      : fields.coordinateSystem,
    coordinateVerification: fields.coordinateVerification ?? existing.coordinateVerification,
    coordinateVerifiedAt: fields.coordinateVerifiedAt === undefined
      ? existing.coordinateVerifiedAt
      : fromIso(fields.coordinateVerifiedAt) ?? null
  }
  assertCoordinateState(coordinateState)

  if (existing.status === 'published') {
    const publishableSourceCount = sourceIds === undefined
      ? countPublishablePlaceSources(client, id)
      : countPublishableSourcesByIds(client, sourceIds)
    const nextLastVerifiedAt = fields.lastVerifiedAt === undefined
      ? existing.lastVerifiedAt
      : fromIso(fields.lastVerifiedAt) ?? null
    assertPlacePublishableState(
      {
        ...coordinateState,
        scope: fields.scope ?? existing.scope,
        lastVerifiedAt: nextLastVerifiedAt
      },
      publishableSourceCount,
      Date.now()
    )
  }

  try {
    client.db.transaction((transaction) => {
      transaction.update(places).set({
        ...fields,
        category: fields.category,
        address: fields.address,
        campusArea: fields.campusArea,
        floor: fields.floor,
        room: fields.room,
        website: fields.website === '' ? null : fields.website,
        externalMapUrl: fields.externalMapUrl === '' ? null : fields.externalMapUrl,
        lastVerifiedAt: fromIso(fields.lastVerifiedAt),
        coordinateVerifiedAt: fromIso(fields.coordinateVerifiedAt),
        updatedAt: Date.now()
      }).where(eq(places.id, id)).run()

      if (sourceIds !== undefined) {
        transaction.delete(placeSources).where(eq(placeSources.placeId, id)).run()
        if (sourceIds.length > 0) {
          transaction.insert(placeSources).values(sourceIds.map((sourceId, index) => ({
            placeId: id,
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

  return getAdminPlace(client, id)
}

export function publishPlace(client: DatabaseClient, id: string) {
  const row = getPlaceByIdRow(client, id)

  if (!row) {
    throwNotFound('place')
  }

  const now = Date.now()
  assertPlacePublishableState(row, countPublishablePlaceSources(client, id), now)

  client.db.update(places).set({
    status: 'published',
    publishedAt: now,
    updatedAt: now
  }).where(eq(places.id, id)).run()
  return getAdminPlace(client, id)
}

export function archivePlace(client: DatabaseClient, id: string) {
  const row = getPlaceByIdRow(client, id)

  if (!row) {
    throwNotFound('place')
  }

  client.db.update(places).set({
    status: 'archived',
    updatedAt: Date.now()
  }).where(eq(places.id, id)).run()
  return getAdminPlace(client, id)
}
