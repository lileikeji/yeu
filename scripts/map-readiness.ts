import './load-env'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import {
  COORDINATE_OBSERVATION_STATUSES,
  COORDINATE_POINT_ROLES,
  COORDINATE_VERIFICATION_STATES,
  MAX_APPROVABLE_COORDINATE_ACCURACY_METERS,
  MAX_DUAL_VERIFICATION_DISTANCE_METERS,
  MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS,
  PLACE_SCOPES,
  PUBLICATION_STATUSES
} from '../shared/constants/server'
import {
  isPointWithinBounds,
  YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
} from '../map/core/campus'

type SqliteDatabase = InstanceType<typeof BetterSqlite3>
type Counts<T extends string> = Record<T | 'other', number>

interface PlaceRow {
  id: string
  slug: string
  name: string
  scope: string
  status: string
  longitude: number | null
  latitude: number | null
  coordinateSystem: string | null
  coordinateVerification: string
  coordinateVerifiedAt: number | null
  coordinatePointRole: string | null
  externalMapUrl: string | null
  lastVerifiedAt: number | null
  publishedAt: number | null
}

interface ObservationRow {
  placeId: string
  longitude: number
  latitude: number
  coordinateSystem: string
  accuracyMeters: number
  captureMethod: string
  pointRole: string
  capturedAt: number
  reviewStatus: string
}

interface SourceLinkRow {
  placeId: string
  sourceId: string | null
  sourceStatus: string | null
  sourceLevel: string | null
  isOfficial: number | null
}

export interface CoverageCounts {
  totalPlaces: number
  withAnyLinkedSource: number
  withActiveSource: number
  withActiveOfficialSource: number
  withPublishableSource: number
  withoutPublishableSource: number
}

export interface ReadinessBlocker {
  code: string
  affectedPlaces: number | null
  message: string
}

export interface MapReadinessReport {
  formatVersion: 1
  generatedAt: string
  database: string
  schemaCapabilities: {
    coordinateVerification: boolean
    coordinatePointRole: boolean
    coordinateObservations: boolean
    dualVerificationEvidence: boolean
  }
  places: {
    total: number
    releaseScopeTotal: number
    byScope: Counts<(typeof PLACE_SCOPES)[number]>
    byStatus: Counts<(typeof PUBLICATION_STATUSES)[number]>
    byCoordinateState: Counts<(typeof COORDINATE_VERIFICATION_STATES)[number]>
    coordinateStorage: {
      empty: number
      complete: number
      partial: number
    }
    releaseReadyCoordinates: number
    releaseScopeWithoutReadyCoordinates: number
  }
  observations: {
    supported: boolean
    total: number | null
    byReviewStatus: Counts<(typeof COORDINATE_OBSERVATION_STATUSES)[number]> | null
    placesWithAnyObservation: number | null
    releaseScopeWithoutObservation: number | null
  }
  formalSourceCoverage: {
    totalSources: number
    placeSourceLinks: number
    allPlaces: CoverageCounts
    releaseScope: CoverageCounts
  }
  publicNavigationPoints: {
    total: number
    byScope: Counts<(typeof PLACE_SCOPES)[number]>
  }
  coordinatePointRoles: {
    supported: boolean
    assigned: number | null
    missing: number | null
    byRole: Counts<(typeof COORDINATE_POINT_ROLES)[number]> | null
    releaseScopeMissing: number | null
  }
  dualVerificationEvidence: {
    supported: boolean
    rule: {
      maximumAccuracyMeters: number
      maximumPairDistanceMeters: number
      minimumSameMethodIntervalMs: number
      trustedMethods: string[]
    }
    eligiblePairCount: number | null
    placesWithEligiblePair: number | null
    verifiedPlacesWithEligiblePair: number | null
    verifiedPlacesWithCurrentCoordinatePair: number | null
    verifiedPlacesWithoutCurrentCoordinatePair: number | null
    releaseScopeWithoutCurrentCoordinatePair: number | null
  }
  releaseReadiness: {
    enforced: boolean
    ready: boolean
    blockerCount: number
    blockers: ReadinessBlocker[]
  }
}

export interface MapReadinessOptions {
  databasePath?: string
  now?: number
  requireReleaseReady?: boolean
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

const TRUSTED_OBSERVATION_METHODS = new Set([
  'browser-geolocation',
  'authorized-import'
])

function absolutePath(value: string): string {
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function tableExists(database: SqliteDatabase, table: string): boolean {
  return database.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(table) !== undefined
}

function tableColumns(database: SqliteDatabase, table: string): Set<string> {
  if (!tableExists(database, table)) return new Set()
  const rows = database.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>
  return new Set(rows.map(row => row.name))
}

function requireColumns(table: string, columns: Set<string>, required: string[]): void {
  const missing = required.filter(column => !columns.has(column))
  if (missing.length > 0) {
    throw new Error(`Database table ${table} is missing required columns: ${missing.join(', ')}`)
  }
}

function optionalColumn(columns: Set<string>, name: string, fallback: string): string {
  return columns.has(name) ? `"${name}"` : fallback
}

function countValues<const T extends readonly string[]>(values: string[], known: T): Counts<T[number]> {
  const result = Object.fromEntries([
    ...known.map(value => [value, 0]),
    ['other', 0]
  ]) as Counts<T[number]>
  const knownValues = new Set<string>(known)

  for (const value of values) {
    result[knownValues.has(value) ? value as T[number] : 'other'] += 1
  }
  return result
}

function hasCompleteCoordinates(place: PlaceRow): boolean {
  return Number.isFinite(place.longitude)
    && Number.isFinite(place.latitude)
    && place.coordinateSystem !== null
}

function coordinateStorageState(place: PlaceRow): 'empty' | 'complete' | 'partial' {
  const present = [place.longitude, place.latitude, place.coordinateSystem]
    .filter(value => value !== null).length
  if (present === 0) return 'empty'
  return present === 3 && hasCompleteCoordinates(place) ? 'complete' : 'partial'
}

function hasReleaseReadyCoordinates(place: PlaceRow, now: number): boolean {
  if (place.status !== 'published'
    || place.coordinateVerification !== 'verified'
    || place.coordinateVerifiedAt === null
    || place.coordinateVerifiedAt > now
    || place.coordinateSystem !== 'WGS84'
    || !COORDINATE_POINT_ROLES.includes(place.coordinatePointRole as (typeof COORDINATE_POINT_ROLES)[number])
    || !hasValidExternalMapUrl(place.externalMapUrl)
    || !hasCompleteCoordinates(place)) {
    return false
  }

  return place.scope !== 'campus' || isPointWithinBounds({
    lng: place.longitude!,
    lat: place.latitude!
  }, YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS)
}

function hasValidExternalMapUrl(value: string | null): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && url.hostname.length > 0
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

function isPublicNavigationPoint(place: PlaceRow, now: number): boolean {
  return hasReleaseReadyCoordinates(place, now)
}

function isPublishableSource(source: SourceLinkRow): boolean {
  return source.sourceStatus === 'active'
    && (source.sourceLevel === 'C'
      || ((source.sourceLevel === 'A' || source.sourceLevel === 'B') && source.isOfficial === 1))
}

function coverageForPlaces(
  targetPlaces: PlaceRow[],
  linksByPlace: Map<string, SourceLinkRow[]>
): CoverageCounts {
  let withAnyLinkedSource = 0
  let withActiveSource = 0
  let withActiveOfficialSource = 0
  let withPublishableSource = 0

  for (const place of targetPlaces) {
    const links = linksByPlace.get(place.id) ?? []
    if (links.length > 0) withAnyLinkedSource += 1
    if (links.some(link => link.sourceStatus === 'active')) withActiveSource += 1
    if (links.some(link => link.sourceStatus === 'active' && link.isOfficial === 1)) {
      withActiveOfficialSource += 1
    }
    if (links.some(isPublishableSource)) withPublishableSource += 1
  }

  return {
    totalPlaces: targetPlaces.length,
    withAnyLinkedSource,
    withActiveSource,
    withActiveOfficialSource,
    withPublishableSource,
    withoutPublishableSource: targetPlaces.length - withPublishableSource
  }
}

function distanceMeters(left: ObservationRow, right: ObservationRow): number {
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

function isEligibleEvidencePair(left: ObservationRow, right: ObservationRow): boolean {
  const hasTrustedEvidence = TRUSTED_OBSERVATION_METHODS.has(left.captureMethod)
    || TRUSTED_OBSERVATION_METHODS.has(right.captureMethod)
  const hasIndependentCapture = left.captureMethod !== right.captureMethod
    || Math.abs(left.capturedAt - right.capturedAt) >= MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS

  return left.coordinateSystem === 'WGS84'
    && right.coordinateSystem === 'WGS84'
    && left.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS
    && right.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS
    && left.pointRole === right.pointRole
    && distanceMeters(left, right) <= MAX_DUAL_VERIFICATION_DISTANCE_METERS
    && hasTrustedEvidence
    && hasIndependentCapture
}

function observationMatchesCurrentCoordinate(observation: ObservationRow, place: PlaceRow): boolean {
  return place.coordinateSystem === observation.coordinateSystem
    && place.coordinatePointRole === observation.pointRole
    && place.longitude !== null
    && place.latitude !== null
    && Math.abs(place.longitude - observation.longitude) <= 1e-10
    && Math.abs(place.latitude - observation.latitude) <= 1e-10
}

function dualEvidenceCoverage(
  places: PlaceRow[],
  observations: ObservationRow[]
): {
  eligiblePairCount: number
  placesWithEligiblePair: Set<string>
  placesWithCurrentCoordinatePair: Set<string>
} {
  const placesById = new Map(places.map(place => [place.id, place]))
  const approvedByPlace = new Map<string, ObservationRow[]>()
  for (const observation of observations) {
    if (observation.reviewStatus !== 'approved') continue
    const values = approvedByPlace.get(observation.placeId) ?? []
    values.push(observation)
    approvedByPlace.set(observation.placeId, values)
  }

  let eligiblePairCount = 0
  const placesWithEligiblePair = new Set<string>()
  const placesWithCurrentCoordinatePair = new Set<string>()
  for (const [placeId, approved] of approvedByPlace) {
    const place = placesById.get(placeId)
    for (let leftIndex = 0; leftIndex < approved.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < approved.length; rightIndex += 1) {
        const left = approved[leftIndex]!
        const right = approved[rightIndex]!
        if (!isEligibleEvidencePair(left, right)) continue
        eligiblePairCount += 1
        placesWithEligiblePair.add(placeId)
        if (place && (observationMatchesCurrentCoordinate(left, place)
          || observationMatchesCurrentCoordinate(right, place))) {
          placesWithCurrentCoordinatePair.add(placeId)
        }
      }
    }
  }

  return { eligiblePairCount, placesWithEligiblePair, placesWithCurrentCoordinatePair }
}

function blocker(
  blockers: ReadinessBlocker[],
  code: string,
  affectedPlaces: number,
  message: string
): void {
  if (affectedPlaces > 0) blockers.push({ code, affectedPlaces, message })
}

function buildReport(
  database: SqliteDatabase,
  databasePath: string,
  now: number,
  enforced: boolean
): MapReadinessReport {
  const placeColumns = tableColumns(database, 'places')
  requireColumns('places', placeColumns, [
    'id', 'slug', 'name', 'scope', 'status', 'longitude', 'latitude',
    'coordinate_system', 'last_verified_at', 'published_at'
  ])
  const sourceColumns = tableColumns(database, 'sources')
  requireColumns('sources', sourceColumns, ['id', 'status', 'source_level', 'is_official'])
  const placeSourceColumns = tableColumns(database, 'place_sources')
  requireColumns('place_sources', placeSourceColumns, ['place_id', 'source_id'])

  const hasCoordinateVerification = placeColumns.has('coordinate_verification')
  const hasCoordinatePointRole = placeColumns.has('coordinate_point_role')
  const places = database.prepare(`
    SELECT
      "id", "slug", "name", "scope", "status", "longitude", "latitude",
      "coordinate_system" AS coordinateSystem,
      ${optionalColumn(placeColumns, 'coordinate_verification', `CASE
        WHEN "longitude" IS NULL AND "latitude" IS NULL AND "coordinate_system" IS NULL
          THEN 'missing'
        ELSE 'unverified'
      END`)} AS coordinateVerification,
      ${optionalColumn(placeColumns, 'coordinate_verified_at', 'NULL')} AS coordinateVerifiedAt,
      ${optionalColumn(placeColumns, 'coordinate_point_role', 'NULL')} AS coordinatePointRole,
      ${optionalColumn(placeColumns, 'external_map_url', 'NULL')} AS externalMapUrl,
      "last_verified_at" AS lastVerifiedAt,
      "published_at" AS publishedAt
    FROM "places"
    ORDER BY "id"
  `).all() as PlaceRow[]

  const releasePlaces = places.filter(place => place.status !== 'archived')
  const coordinateStorage = { empty: 0, complete: 0, partial: 0 }
  for (const place of places) coordinateStorage[coordinateStorageState(place)] += 1
  const releaseReadyCoordinateIds = new Set(
    releasePlaces.filter(place => hasReleaseReadyCoordinates(place, now)).map(place => place.id)
  )

  const observationColumns = tableColumns(database, 'place_coordinate_observations')
  const observationSummarySupported = ['place_id', 'review_status']
    .every(column => observationColumns.has(column))
  const dualEvidenceSupported = [
    'place_id', 'longitude', 'latitude', 'coordinate_system', 'accuracy_meters',
    'capture_method', 'point_role', 'captured_at', 'review_status'
  ].every(column => observationColumns.has(column))
  const observationStatusRows = observationSummarySupported
    ? database.prepare(`
        SELECT "place_id" AS placeId, "review_status" AS reviewStatus
        FROM "place_coordinate_observations"
      `).all() as Array<{ placeId: string, reviewStatus: string }>
    : []
  const observations = dualEvidenceSupported
    ? database.prepare(`
        SELECT
          "place_id" AS placeId,
          "longitude", "latitude", "coordinate_system" AS coordinateSystem,
          "accuracy_meters" AS accuracyMeters, "capture_method" AS captureMethod,
          "point_role" AS pointRole, "captured_at" AS capturedAt,
          "review_status" AS reviewStatus
        FROM "place_coordinate_observations"
      `).all() as ObservationRow[]
    : []
  const placesWithObservation = new Set(observationStatusRows.map(row => row.placeId))

  const sourceCount = (database.prepare('SELECT count(*) AS count FROM "sources"').get() as {
    count: number
  }).count
  const sourceLinks = database.prepare(`
    SELECT
      ps."place_id" AS placeId,
      s."id" AS sourceId,
      s."status" AS sourceStatus,
      s."source_level" AS sourceLevel,
      s."is_official" AS isOfficial
    FROM "place_sources" ps
    LEFT JOIN "sources" s ON s."id" = ps."source_id"
  `).all() as SourceLinkRow[]
  const linksByPlace = new Map<string, SourceLinkRow[]>()
  for (const link of sourceLinks) {
    const values = linksByPlace.get(link.placeId) ?? []
    values.push(link)
    linksByPlace.set(link.placeId, values)
  }
  const allSourceCoverage = coverageForPlaces(places, linksByPlace)
  const releaseSourceCoverage = coverageForPlaces(releasePlaces, linksByPlace)

  const publicNavigationPlaces = places.filter(place => isPublicNavigationPoint(place, now))
  const assignedRoles = hasCoordinatePointRole
    ? places.filter(place => place.coordinatePointRole !== null)
    : []
  const dualCoverage = dualEvidenceSupported
    ? dualEvidenceCoverage(places, observations)
    : null
  const verifiedPlaces = places.filter(place => place.coordinateVerification === 'verified')
  const verifiedWithPair = dualCoverage
    ? verifiedPlaces.filter(place => dualCoverage.placesWithEligiblePair.has(place.id)).length
    : null
  const verifiedWithCurrentPair = dualCoverage
    ? verifiedPlaces.filter(place => dualCoverage.placesWithCurrentCoordinatePair.has(place.id)).length
    : null
  const releaseWithoutCurrentPair = dualCoverage
    ? releasePlaces.filter(place => !dualCoverage.placesWithCurrentCoordinatePair.has(place.id)).length
    : null

  const blockers: ReadinessBlocker[] = []
  if (releasePlaces.length === 0) {
    blockers.push({
      code: 'NO_RELEASE_SCOPE_PLACES',
      affectedPlaces: null,
      message: 'At least one non-archived place is required for a map release.'
    })
  }
  blocker(
    blockers,
    'RELEASE_SCOPE_PLACES_NOT_PUBLISHED',
    releasePlaces.filter(place => place.status !== 'published').length,
    'Every non-archived place must be published before declaring the complete map ready.'
  )
  blocker(
    blockers,
    'RELEASE_SCOPE_PLACES_WITHOUT_READY_COORDINATES',
    releasePlaces.filter(place => !releaseReadyCoordinateIds.has(place.id)).length,
    'Every non-archived place needs a published, current verified WGS84 point with a point role and valid external navigation URL.'
  )
  blocker(
    blockers,
    'RELEASE_SCOPE_PLACES_WITHOUT_VALID_EXTERNAL_NAVIGATION_URL',
    releasePlaces.filter(place => !hasValidExternalMapUrl(place.externalMapUrl)).length,
    'Every non-archived place needs a valid HTTP(S) external navigation URL without embedded credentials.'
  )
  blocker(
    blockers,
    'RELEASE_SCOPE_PLACES_WITHOUT_PUBLISHABLE_SOURCE',
    releaseSourceCoverage.withoutPublishableSource,
    'Every non-archived place needs an active official A/B source or an active C source.'
  )
  blocker(
    blockers,
    'RELEASE_SCOPE_PLACES_WITHOUT_CURRENT_FACT_VERIFICATION',
    releasePlaces.filter(place => place.lastVerifiedAt === null || place.lastVerifiedAt > now).length,
    'Every non-archived place needs a non-future fact verification timestamp.'
  )
  blocker(
    blockers,
    'RELEASE_SCOPE_PLACES_WITHOUT_PUBLICATION_TIMESTAMP',
    releasePlaces.filter(place => place.publishedAt === null || place.publishedAt > now).length,
    'Every non-archived place needs a non-future publication timestamp.'
  )
  blocker(
    blockers,
    'PLACES_WITH_PARTIAL_COORDINATE_STORAGE',
    coordinateStorage.partial,
    'Coordinate longitude, latitude, and CRS must be stored together.'
  )
  if (!hasCoordinateVerification && releasePlaces.length > 0) {
    blockers.push({
      code: 'COORDINATE_VERIFICATION_SCHEMA_UNAVAILABLE',
      affectedPlaces: releasePlaces.length,
      message: 'The database schema cannot prove coordinate verification state.'
    })
  }
  if (!hasCoordinatePointRole && releasePlaces.length > 0) {
    blockers.push({
      code: 'COORDINATE_POINT_ROLE_SCHEMA_UNAVAILABLE',
      affectedPlaces: releasePlaces.length,
      message: 'The database schema cannot record the approved coordinate point role.'
    })
  } else {
    blocker(
      blockers,
      'RELEASE_SCOPE_PLACES_WITHOUT_COORDINATE_POINT_ROLE',
      releasePlaces.filter(place => place.coordinatePointRole === null).length,
      'Every non-archived place needs an approved site-point or main-entrance role.'
    )
  }
  if (!dualEvidenceSupported && releasePlaces.length > 0) {
    blockers.push({
      code: 'DUAL_VERIFICATION_EVIDENCE_SCHEMA_UNAVAILABLE',
      affectedPlaces: releasePlaces.length,
      message: 'The database schema cannot prove dual coordinate verification evidence.'
    })
  } else if (releaseWithoutCurrentPair !== null) {
    blocker(
      blockers,
      'RELEASE_SCOPE_PLACES_WITHOUT_CURRENT_DUAL_VERIFICATION_EVIDENCE',
      releaseWithoutCurrentPair,
      'Every non-archived place needs an eligible approved observation pair that supports its current coordinate and point role.'
    )
  }

  return {
    formatVersion: 1,
    generatedAt: new Date(now).toISOString(),
    database: databasePath,
    schemaCapabilities: {
      coordinateVerification: hasCoordinateVerification,
      coordinatePointRole: hasCoordinatePointRole,
      coordinateObservations: observationSummarySupported,
      dualVerificationEvidence: dualEvidenceSupported
    },
    places: {
      total: places.length,
      releaseScopeTotal: releasePlaces.length,
      byScope: countValues(places.map(place => place.scope), PLACE_SCOPES),
      byStatus: countValues(places.map(place => place.status), PUBLICATION_STATUSES),
      byCoordinateState: countValues(
        places.map(place => place.coordinateVerification),
        COORDINATE_VERIFICATION_STATES
      ),
      coordinateStorage,
      releaseReadyCoordinates: releaseReadyCoordinateIds.size,
      releaseScopeWithoutReadyCoordinates: releasePlaces
        .filter(place => !releaseReadyCoordinateIds.has(place.id)).length
    },
    observations: {
      supported: observationSummarySupported,
      total: observationSummarySupported ? observationStatusRows.length : null,
      byReviewStatus: observationSummarySupported
        ? countValues(
            observationStatusRows.map(observation => observation.reviewStatus),
            COORDINATE_OBSERVATION_STATUSES
          )
        : null,
      placesWithAnyObservation: observationSummarySupported ? placesWithObservation.size : null,
      releaseScopeWithoutObservation: observationSummarySupported
        ? releasePlaces.filter(place => !placesWithObservation.has(place.id)).length
        : null
    },
    formalSourceCoverage: {
      totalSources: sourceCount,
      placeSourceLinks: sourceLinks.length,
      allPlaces: allSourceCoverage,
      releaseScope: releaseSourceCoverage
    },
    publicNavigationPoints: {
      total: publicNavigationPlaces.length,
      byScope: countValues(publicNavigationPlaces.map(place => place.scope), PLACE_SCOPES)
    },
    coordinatePointRoles: {
      supported: hasCoordinatePointRole,
      assigned: hasCoordinatePointRole ? assignedRoles.length : null,
      missing: hasCoordinatePointRole ? places.length - assignedRoles.length : null,
      byRole: hasCoordinatePointRole
        ? countValues(assignedRoles.map(place => place.coordinatePointRole!), COORDINATE_POINT_ROLES)
        : null,
      releaseScopeMissing: hasCoordinatePointRole
        ? releasePlaces.filter(place => place.coordinatePointRole === null).length
        : null
    },
    dualVerificationEvidence: {
      supported: dualEvidenceSupported,
      rule: {
        maximumAccuracyMeters: MAX_APPROVABLE_COORDINATE_ACCURACY_METERS,
        maximumPairDistanceMeters: MAX_DUAL_VERIFICATION_DISTANCE_METERS,
        minimumSameMethodIntervalMs: MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS,
        trustedMethods: [...TRUSTED_OBSERVATION_METHODS]
      },
      eligiblePairCount: dualCoverage?.eligiblePairCount ?? null,
      placesWithEligiblePair: dualCoverage?.placesWithEligiblePair.size ?? null,
      verifiedPlacesWithEligiblePair: verifiedWithPair,
      verifiedPlacesWithCurrentCoordinatePair: verifiedWithCurrentPair,
      verifiedPlacesWithoutCurrentCoordinatePair: verifiedWithCurrentPair === null
        ? null
        : verifiedPlaces.length - verifiedWithCurrentPair,
      releaseScopeWithoutCurrentCoordinatePair: releaseWithoutCurrentPair
    },
    releaseReadiness: {
      enforced,
      ready: blockers.length === 0,
      blockerCount: blockers.length,
      blockers
    }
  }
}

export function inspectMapReadiness(options: MapReadinessOptions = {}): MapReadinessReport {
  const databasePath = absolutePath(
    options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite'
  )
  const now = options.now ?? Date.now()
  if (!Number.isInteger(now) || now < 0) throw new Error('now must be a non-negative integer timestamp')
  if (!existsSync(databasePath)) {
    throw new Error(`Target database does not exist: ${databasePath}; run pnpm db:migrate first`)
  }

  const database = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true })
  try {
    database.pragma('query_only = ON')
    return buildReport(database, databasePath, now, options.requireReleaseReady === true)
  } finally {
    database.close()
  }
}

function usage(): string {
  return [
    'Usage: pnpm map:readiness [--database PATH] [--require-release-ready]',
    '',
    'Always opens an existing SQLite database read-only and prints authoritative JSON statistics.',
    'Default mode only reports blockers. --require-release-ready returns exit code 1 when blockers exist.',
    'Default database: NUXT_DATABASE_PATH or ./data/yeu.sqlite'
  ].join('\n')
}

function parseCliArgs(argv: string[]): MapReadinessOptions & { help: boolean } {
  const options: MapReadinessOptions & { help: boolean } = { help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument === '--require-release-ready') {
      options.requireReleaseReady = true
    } else if (argument === '--database') {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) throw new Error('--database requires a path')
      options.databasePath = value
      index += 1
    } else if (argument?.startsWith('--database=')) {
      const value = argument.slice('--database='.length)
      if (!value) throw new Error('--database requires a path')
      options.databasePath = value
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return options
}

export function runMapReadinessCli(argv: string[], io: CliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
}): number {
  try {
    const options = parseCliArgs(argv)
    if (options.help) {
      io.stdout(`${usage()}\n`)
      return 0
    }
    const report = inspectMapReadiness(options)
    io.stdout(`${JSON.stringify(report, null, 2)}\n`)
    return options.requireReleaseReady && !report.releaseReadiness.ready ? 1 : 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    io.stderr(`${JSON.stringify({ error: message }, null, 2)}\n`)
    return 2
  }
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) process.exitCode = runMapReadinessCli(process.argv.slice(2))
