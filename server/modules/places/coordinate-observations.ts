import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import {
  MAX_APPROVABLE_COORDINATE_ACCURACY_METERS,
  MAX_DUAL_VERIFICATION_DISTANCE_METERS,
  MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS
} from '../../../shared/constants/server'
import type {
  coordinateObservationsQuerySchema,
  createCoordinateObservationSchema
} from '../../../shared/schemas/server'
import type {
  ApiCoordinateObservation,
  ApiCoordinateSample
} from '../../../shared/types/server'
import { evaluateCoordinateCapture } from '../../../shared/utils/coordinate-sampling'
import {
  isPointWithinBounds,
  YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
} from '../../../map/core/campus'
import type { DatabaseClient } from '../../database/client'
import {
  placeCoordinateObservations,
  places
} from '../../database/schema'
import { throwNotFound } from '../../utils/errors'
import { cleanSearchTerm } from '../../../shared/utils/like-search'

type CreateObservationInput = z.infer<typeof createCoordinateObservationSchema>
type ObservationQuery = z.infer<typeof coordinateObservationsQuerySchema>
type ObservationRow = typeof placeCoordinateObservations.$inferSelect

export interface CreateCoordinateObservationResult {
  observation: ApiCoordinateObservation
  created: boolean
}

const MAX_CAPTURE_SESSION_MS = 30 * 60 * 1000
const TRUSTED_OBSERVATION_METHODS = new Set<ObservationRow['captureMethod']>([
  'browser-geolocation',
  'authorized-import'
])

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function distanceMeters(
  left: { longitude: number, latitude: number },
  right: { longitude: number, latitude: number }
): number {
  const earthRadius = 6_371_000
  const toRadians = (value: number) => value * Math.PI / 180
  const latitudeDelta = toRadians(right.latitude - left.latitude)
  const longitudeDelta = toRadians(right.longitude - left.longitude)
  const leftLatitude = toRadians(left.latitude)
  const rightLatitude = toRadians(right.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

interface EvidencePairAssessment {
  eligible: boolean
  distanceMeters: number
}

function assessEvidencePair(
  left: ObservationRow,
  right: ObservationRow
): EvidencePairAssessment {
  const separation = distanceMeters(left, right)
  const hasTrustedEvidence = TRUSTED_OBSERVATION_METHODS.has(left.captureMethod)
    || TRUSTED_OBSERVATION_METHODS.has(right.captureMethod)
  const hasIndependentCapture = left.captureMethod !== right.captureMethod
    || Math.abs(left.capturedAt - right.capturedAt) >= MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS
  const individuallyApprovable = left.coordinateSystem === 'WGS84'
    && right.coordinateSystem === 'WGS84'
    && left.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS
    && right.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS

  return {
    eligible: individuallyApprovable
      && left.pointRole === right.pointRole
      && separation <= MAX_DUAL_VERIFICATION_DISTANCE_METERS
      && hasTrustedEvidence
      && hasIndependentCapture,
    distanceMeters: separation
  }
}

function selectBestEvidencePartner(
  candidate: ObservationRow,
  observations: ObservationRow[]
): ObservationRow | null {
  return observations
    .map(observation => ({
      observation,
      assessment: assessEvidencePair(candidate, observation)
    }))
    .filter(item => item.assessment.eligible)
    .sort((left, right) => left.assessment.distanceMeters - right.assessment.distanceMeters
      || left.observation.accuracyMeters - right.observation.accuracyMeters
      || right.observation.capturedAt - left.observation.capturedAt)[0]?.observation ?? null
}

function selectFallbackEvidence(
  candidate: ObservationRow,
  observations: ObservationRow[]
): ObservationRow | null {
  return observations
    .map(observation => ({
      observation,
      distance: distanceMeters(candidate, observation)
    }))
    .sort((left, right) => left.distance - right.distance
      || left.observation.accuracyMeters - right.observation.accuracyMeters
      || right.observation.capturedAt - left.observation.capturedAt)[0]?.observation ?? null
}

function parseSamples(value: string): ApiCoordinateSample[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed as ApiCoordinateSample[] : []
  } catch {
    return []
  }
}

function serializeObservation(
  row: ObservationRow,
  placeName: string,
  placeScope: 'campus' | 'nearby'
): ApiCoordinateObservation {
  return {
    id: row.id,
    clientObservationId: row.clientObservationId,
    placeId: row.placeId,
    placeName,
    placeScope,
    longitude: row.longitude,
    latitude: row.latitude,
    coordinateSystem: row.coordinateSystem,
    accuracyMeters: row.accuracyMeters,
    sampleCount: row.sampleCount,
    samples: parseSamples(row.samplesJson),
    captureMethod: row.captureMethod,
    pointRole: row.pointRole,
    capturedAt: new Date(row.capturedAt).toISOString(),
    evidenceNote: row.evidenceNote,
    outsideCampusReviewBounds: placeScope === 'campus' && !isPointWithinBounds(
      { lng: row.longitude, lat: row.latitude },
      YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
    ),
    reviewStatus: row.reviewStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt === null ? null : new Date(row.reviewedAt).toISOString(),
    reviewNote: row.reviewNote,
    supersededByObservationId: row.supersededByObservationId,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

function getObservationRow(client: DatabaseClient, id: string) {
  return client.db.select({
    observation: placeCoordinateObservations,
    placeName: places.name,
    placeScope: places.scope
  }).from(placeCoordinateObservations)
    .innerJoin(places, eq(placeCoordinateObservations.placeId, places.id))
    .where(eq(placeCoordinateObservations.id, id))
    .get()
}

function getObservationByClientId(client: DatabaseClient, clientObservationId: string) {
  return client.db.select({
    observation: placeCoordinateObservations,
    placeName: places.name,
    placeScope: places.scope
  }).from(placeCoordinateObservations)
    .innerJoin(places, eq(placeCoordinateObservations.placeId, places.id))
    .where(eq(placeCoordinateObservations.clientObservationId, clientObservationId))
    .get()
}

function observationMatchesInput(row: ObservationRow, input: CreateObservationInput): boolean {
  const storedSamples = parseSamples(row.samplesJson)
  return row.placeId === input.placeId
    && row.coordinateSystem === input.coordinateSystem
    && row.captureMethod === input.captureMethod
    && row.pointRole === input.pointRole
    && row.evidenceNote === input.evidenceNote
    && storedSamples.length === input.samples.length
    && storedSamples.every((sample, index) => {
      const candidate = input.samples[index]
      return candidate !== undefined
        && sample.longitude === candidate.longitude
        && sample.latitude === candidate.latitude
        && sample.accuracyMeters === candidate.accuracyMeters
        && Date.parse(sample.capturedAt) === Date.parse(candidate.capturedAt)
    })
}

function resolveIdempotentObservation(
  selected: NonNullable<ReturnType<typeof getObservationByClientId>>,
  input: CreateObservationInput
): CreateCoordinateObservationResult {
  if (!observationMatchesInput(selected.observation, input)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Client observation ID was already used with a different payload',
      data: { code: 'COORDINATE_OBSERVATION_IDEMPOTENCY_CONFLICT' }
    })
  }

  return {
    observation: serializeObservation(
      selected.observation,
      selected.placeName,
      selected.placeScope
    ),
    created: false
  }
}

function throwObservationAlreadyReviewed(): never {
  throw createError({
    statusCode: 409,
    statusMessage: 'Coordinate observation has already been reviewed',
    data: { code: 'COORDINATE_OBSERVATION_ALREADY_REVIEWED' }
  })
}

function assertBrowserGeolocationQuality(input: CreateObservationInput): void {
  if (input.captureMethod !== 'browser-geolocation') return
  const quality = evaluateCoordinateCapture(input.samples)
  if (quality.canSubmit) return

  const code = quality.state === 'collecting' || quality.state === 'invalid'
    ? 'BROWSER_GEOLOCATION_SAMPLE_COUNT_INVALID'
    : quality.state === 'too-short'
      ? 'BROWSER_GEOLOCATION_CAPTURE_TIMING_INVALID'
      : 'BROWSER_GEOLOCATION_CAPTURE_UNSTABLE'
  throw createError({
    statusCode: 422,
    statusMessage: 'Browser geolocation samples do not meet the field capture quality gate',
    data: { code }
  })
}

export function listCoordinateObservations(client: DatabaseClient, query: ObservationQuery) {
  const conditions: SQL[] = []
  if (query.placeId) conditions.push(eq(placeCoordinateObservations.placeId, query.placeId))
  if (query.status) conditions.push(eq(placeCoordinateObservations.reviewStatus, query.status))
  if (query.q) {
    const search = cleanSearchTerm(query.q)
    if (search) conditions.push(like(places.name, `%${search}%`))
  }
  const where = conditions.length ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select({
    observation: placeCoordinateObservations,
    placeName: places.name,
    placeScope: places.scope
  }).from(placeCoordinateObservations)
    .innerJoin(places, eq(placeCoordinateObservations.placeId, places.id))
    .where(where)
    .orderBy(desc(placeCoordinateObservations.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() })
    .from(placeCoordinateObservations)
    .innerJoin(places, eq(placeCoordinateObservations.placeId, places.id))
    .where(where)
    .get()?.value ?? 0

  return {
    items: rows.map(row => serializeObservation(row.observation, row.placeName, row.placeScope)),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export function createCoordinateObservation(
  client: DatabaseClient,
  input: CreateObservationInput
): CreateCoordinateObservationResult {
  assertBrowserGeolocationQuality(input)
  const existing = getObservationByClientId(client, input.clientObservationId)
  if (existing) return resolveIdempotentObservation(existing, input)

  const place = client.db.select().from(places).where(eq(places.id, input.placeId)).get()
  if (!place) throwNotFound('place')

  const now = Date.now()
  const samples = input.samples.map(sample => ({
    ...sample,
    capturedAtMs: Date.parse(sample.capturedAt)
  }))
  const firstCapturedAt = Math.min(...samples.map(sample => sample.capturedAtMs))
  const lastCapturedAt = Math.max(...samples.map(sample => sample.capturedAtMs))
  if (lastCapturedAt > now || lastCapturedAt - firstCapturedAt > MAX_CAPTURE_SESSION_MS) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Coordinate sample timestamps are invalid',
      data: { code: 'INVALID_COORDINATE_CAPTURE_SESSION' }
    })
  }

  const longitude = median(samples.map(sample => sample.longitude))
  const latitude = median(samples.map(sample => sample.latitude))
  const medianAccuracy = median(samples.map(sample => sample.accuracyMeters))
  const sampleSpread = Math.max(...samples.map(sample => distanceMeters(
    { longitude, latitude },
    sample
  )))
  const accuracyMeters = Math.max(medianAccuracy, sampleSpread)
  const id = randomUUID()

  const insertion = client.db.insert(placeCoordinateObservations).values({
    id,
    clientObservationId: input.clientObservationId,
    placeId: input.placeId,
    longitude,
    latitude,
    coordinateSystem: input.coordinateSystem,
    accuracyMeters,
    sampleCount: samples.length,
    samplesJson: JSON.stringify(input.samples),
    captureMethod: input.captureMethod,
    pointRole: input.pointRole,
    capturedAt: lastCapturedAt,
    evidenceNote: input.evidenceNote,
    reviewStatus: 'pending',
    createdAt: now,
    updatedAt: now
  }).onConflictDoNothing({
    target: placeCoordinateObservations.clientObservationId
  }).run()

  if (insertion.changes === 0) {
    const raced = getObservationByClientId(client, input.clientObservationId)
    if (raced) return resolveIdempotentObservation(raced, input)
    throw createError({
      statusCode: 409,
      statusMessage: 'Coordinate observation could not be created',
      data: { code: 'COORDINATE_OBSERVATION_CREATE_CONFLICT' }
    })
  }

  return {
    observation: serializeObservation(
      client.db.select().from(placeCoordinateObservations)
        .where(eq(placeCoordinateObservations.id, id)).get()!,
      place.name,
      place.scope
    ),
    created: true
  }
}

export function approveCoordinateObservation(
  client: DatabaseClient,
  id: string,
  reviewerId: string,
  reviewNote: string
): ApiCoordinateObservation {
  const selected = getObservationRow(client, id)
  if (!selected) throwNotFound('coordinate observation')
  const { observation, placeScope } = selected
  if (observation.reviewStatus !== 'pending') {
    throwObservationAlreadyReviewed()
  }
  if (observation.coordinateSystem !== 'WGS84'
    || observation.accuracyMeters > MAX_APPROVABLE_COORDINATE_ACCURACY_METERS) {
    throw createError({
      statusCode: 422,
      statusMessage: `Coordinate accuracy must be ${MAX_APPROVABLE_COORDINATE_ACCURACY_METERS} meters or better`,
      data: { code: 'COORDINATE_OBSERVATION_ACCURACY_TOO_LOW' }
    })
  }
  if (placeScope === 'campus' && !isPointWithinBounds(
    { lng: observation.longitude, lat: observation.latitude },
    YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
  )) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Campus coordinate is outside the review bounds',
      data: { code: 'COORDINATE_OUTSIDE_REVIEW_BOUNDS' }
    })
  }

  const now = Date.now()
  client.db.transaction((transaction) => {
    const approval = transaction.update(placeCoordinateObservations).set({
      reviewStatus: 'approved',
      reviewedBy: reviewerId,
      reviewedAt: now,
      reviewNote,
      updatedAt: now
    }).where(and(
      eq(placeCoordinateObservations.id, id),
      eq(placeCoordinateObservations.reviewStatus, 'pending')
    )).run()
    if (approval.changes !== 1) throwObservationAlreadyReviewed()

    const existingApproved = transaction.select()
      .from(placeCoordinateObservations)
      .where(and(
        eq(placeCoordinateObservations.placeId, observation.placeId),
        eq(placeCoordinateObservations.reviewStatus, 'approved')
      )).all()
      .filter(item => item.id !== id)
    const partner = selectBestEvidencePartner(observation, existingApproved)
    const retainedFallback = partner ?? selectFallbackEvidence(observation, existingApproved)

    for (const previous of existingApproved) {
      if (previous.id === retainedFallback?.id) continue
      transaction.update(placeCoordinateObservations).set({
        reviewStatus: 'superseded',
        supersededByObservationId: id,
        updatedAt: now
      }).where(and(
        eq(placeCoordinateObservations.id, previous.id),
        eq(placeCoordinateObservations.reviewStatus, 'approved')
      )).run()
    }

    const currentPlace = transaction.select().from(places)
      .where(eq(places.id, observation.placeId)).get()
    if (!currentPlace) throwNotFound('place')
    const coordinatesChanged = currentPlace.longitude !== observation.longitude
      || currentPlace.latitude !== observation.latitude
      || currentPlace.coordinateSystem !== observation.coordinateSystem
    const placeUpdate: Partial<typeof places.$inferInsert> = {
      longitude: observation.longitude,
      latitude: observation.latitude,
      coordinateSystem: observation.coordinateSystem,
      coordinateVerification: partner ? 'verified' : 'unverified',
      coordinateVerifiedAt: partner ? now : null,
      coordinatePointRole: observation.pointRole,
      updatedAt: now
    }
    if (coordinatesChanged) placeUpdate.externalMapUrl = null
    transaction.update(places).set(placeUpdate)
      .where(eq(places.id, observation.placeId)).run()
  })

  const result = getObservationRow(client, id)!
  return serializeObservation(result.observation, result.placeName, result.placeScope)
}

export function rejectCoordinateObservation(
  client: DatabaseClient,
  id: string,
  reviewerId: string,
  reviewNote: string
): ApiCoordinateObservation {
  const selected = getObservationRow(client, id)
  if (!selected) throwNotFound('coordinate observation')
  if (selected.observation.reviewStatus !== 'pending') {
    throwObservationAlreadyReviewed()
  }

  const now = Date.now()
  const rejection = client.db.update(placeCoordinateObservations).set({
    reviewStatus: 'rejected',
    reviewedBy: reviewerId,
    reviewedAt: now,
    reviewNote,
    updatedAt: now
  }).where(and(
    eq(placeCoordinateObservations.id, id),
    eq(placeCoordinateObservations.reviewStatus, 'pending')
  )).run()
  if (rejection.changes !== 1) throwObservationAlreadyReviewed()
  const result = getObservationRow(client, id)!
  return serializeObservation(result.observation, result.placeName, result.placeScope)
}
