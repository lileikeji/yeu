import './load-env'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import {
  COORDINATE_POINT_ROLES,
  MAX_APPROVABLE_COORDINATE_ACCURACY_METERS,
  type CoordinatePointRole
} from '../shared/constants/server'
import { createCoordinateObservationSchema } from '../shared/schemas/server'
import { isPointWithinBounds, YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS } from '../map/core/campus'
import { parseAmapMarkers } from './import-amap-drafts'

const RAW_FILE_NAME = 'amap-workmap-2026-07-13.raw.json'
const TEMPLATE_FILE_NAME = 'amap-workmap-2026-07-13.coordinates.template.json'
const DEFAULT_RAW_PATH = `data/imports/${RAW_FILE_NAME}`
const DEFAULT_TEMPLATE_PATH = `data/imports/${TEMPLATE_FILE_NAME}`
const TARGET_SHEET_NAME = '标记位置'
const EXPECTED_MARKER_COUNT = 76
const DRAFT_IMPORTER_ID = 'amap-workmap-draft-v1'
const LEGACY_COORDINATE_IMPORTER_ID = 'amap-coordinate-review-v1'
const OBSERVATION_IMPORTER_ID = 'amap-coordinate-observation-v1'
const LOCATION_CODE_RE = /^WIA-\d+\.\d+,\d+\.\d+$/
const ISO_WITH_TIMEZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const MAX_EVIDENCE_NOTE_LENGTH = 2_000

export const VERIFIER_CATEGORIES = [
  'authorized-map-owner',
  'campus-staff',
  'field-reviewer',
  'project-maintainer',
  'student-team'
] as const

type VerifierCategory = typeof VERIFIER_CATEGORIES[number]

interface AmapMarker {
  sourceRow: number
  name: string
  locationCode: string
}

interface TemplateItem {
  sourceRow: number
  name: string
  locationCode: string
  lng: null
  lat: null
  crs: 'GCJ-02'
  pointRole: null
  accuracyMeters: null
  coordinateSource: null
  coordinateSourceUrl: null
  verificationStatus: 'pending-authorized-coordinate-export'
  verifiedAt: null
  verifierCategory: null
}

export interface ReviewedCoordinate {
  sourceRow: number
  name: string
  locationCode: string
  lng: number
  lat: number
  crs: 'WGS84'
  pointRole: CoordinatePointRole
  accuracyMeters: number
  coordinateSource: string
  coordinateSourceUrl: string | null
  verificationStatus: 'human-verified'
  verifiedAt: string
  verifierCategory: VerifierCategory
}

interface DraftRawReference {
  importer: typeof DRAFT_IMPORTER_ID
  file: typeof RAW_FILE_NAME
  sheet: typeof TARGET_SHEET_NAME
  sourceRow: number
  locationCode: string
}

interface LegacyStoredCoordinateReview {
  importer: typeof LEGACY_COORDINATE_IMPORTER_ID
  schemaVersion: 1
  longitude: number
  latitude: number
  coordinateSystem: 'WGS84'
  coordinateSource: string
  coordinateSourceUrl: string | null
  verificationStatus: 'human-verified'
  verifiedAt: string
  verifierCategory: VerifierCategory
  inputSha256: string
  importedAt: number
}

interface ParsedReference {
  base: DraftRawReference
  legacyReview: LegacyStoredCoordinateReview | null
  canonical: string
}

interface ExistingPlace {
  id: string
  slug: string
  name: string
  sourceRawRef: string | null
}

interface ExistingObservation {
  id: string
  clientObservationId: string | null
  placeId: string
  longitude: number
  latitude: number
  coordinateSystem: string
  accuracyMeters: number
  sampleCount: number
  samplesJson: string
  captureMethod: string
  pointRole: string
  capturedAt: number
  evidenceNote: string
}

interface PlannedObservation {
  id: string
  clientObservationId: string
  place: ExistingPlace
  coordinate: ReviewedCoordinate
  samplesJson: string
  evidenceNote: string
  capturedAt: number
}

interface ImportPlan {
  inserts: PlannedObservation[]
  skipped: number
  conflicts: CoordinateImportConflict[]
}

interface DatabaseColumn {
  name: string
  type: string
  pk: number
}

interface DatabaseIndex {
  name: string
  unique: number
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export interface CoordinateImportConflict {
  sourceRow: number
  locationCode: string
  name: string
  reason: string
  existingPlaceId?: string
  existingObservationId?: string
}

export interface CoordinateImportResult {
  mode: 'dry-run' | 'apply'
  inputPath: string
  databasePath: string
  coordinateCount: number
  created: number
  wouldCreate: number
  skipped: number
  conflicts: number
  applied: boolean
  conflictDetails: CoordinateImportConflict[]
}

export interface CoordinateImportOptions {
  apply?: boolean
  inputPath: string
  databasePath?: string
  rawPath?: string
  templatePath?: string
  now?: number
}

export class AmapCoordinateImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmapCoordinateImportError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertImport(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AmapCoordinateImportError(message)
}

function absolutePath(path: string): string {
  if (path === ':memory:') return path
  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  assertImport(JSON.stringify(actual) === JSON.stringify(wanted), `${context}: fields changed; expected ${wanted.join(', ')}`)
}

function loadJson(path: string, label: string): unknown {
  assertImport(existsSync(path), `${label} does not exist: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AmapCoordinateImportError(`${label} is not valid JSON: ${message}`)
  }
}

function deterministicUuid(namespace: string, identity: string): string {
  const bytes = createHash('sha256')
    .update(`${namespace}\0${identity}`, 'utf8')
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function deterministicDraftId(marker: AmapMarker): string {
  return deterministicUuid(DRAFT_IMPORTER_ID, `${marker.sourceRow}\0${marker.locationCode}`)
}

function observationIdentity(coordinate: ReviewedCoordinate): string {
  return `${coordinate.sourceRow}\0${coordinate.locationCode}`
}

function deterministicClientObservationId(coordinate: ReviewedCoordinate): string {
  return deterministicUuid(`${OBSERVATION_IMPORTER_ID}:client`, observationIdentity(coordinate))
}

function deterministicObservationId(coordinate: ReviewedCoordinate): string {
  return deterministicUuid(`${OBSERVATION_IMPORTER_ID}:row`, observationIdentity(coordinate))
}

function isVerifierCategory(value: unknown): value is VerifierCategory {
  return typeof value === 'string' && (VERIFIER_CATEGORIES as readonly string[]).includes(value)
}

function isPointRole(value: unknown): value is CoordinatePointRole {
  return typeof value === 'string' && (COORDINATE_POINT_ROLES as readonly string[]).includes(value)
}

function parseEvidenceUrl(value: unknown, context: string): string | null {
  assertImport(value === null || typeof value === 'string', `${context}: coordinateSourceUrl must be an HTTP(S) URL or null`)
  if (value === null) return null
  assertImport(value === value.trim() && value.length > 0 && value.length <= 2_000, `${context}: coordinateSourceUrl is blank, too long, or has outer whitespace`)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new AmapCoordinateImportError(`${context}: coordinateSourceUrl is not a valid URL`)
  }
  assertImport(parsed.protocol === 'https:' || parsed.protocol === 'http:', `${context}: coordinateSourceUrl must use HTTP(S)`)
  assertImport(parsed.username === '' && parsed.password === '', `${context}: coordinateSourceUrl must not contain credentials`)
  return value
}

function normalizedVerificationTime(value: unknown, context: string, now: number): { iso: string, milliseconds: number } {
  assertImport(typeof value === 'string' && ISO_WITH_TIMEZONE_RE.test(value), `${context}: verifiedAt must be an ISO 8601 timestamp with an explicit timezone`)
  const milliseconds = Date.parse(value)
  assertImport(Number.isFinite(milliseconds), `${context}: verifiedAt is invalid`)
  assertImport(milliseconds <= now, `${context}: verifiedAt cannot be in the future`)
  return { iso: new Date(milliseconds).toISOString(), milliseconds }
}

function coordinateFingerprint(value: ReviewedCoordinate): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}

function validateReviewedCoordinates(value: unknown, markers: AmapMarker[], now: number): ReviewedCoordinate[] {
  assertImport(Array.isArray(value), 'Reviewed coordinate input must be a JSON array')
  assertImport(value.length > 0, 'Reviewed coordinate input must contain at least one item')
  assertImport(value.length <= EXPECTED_MARKER_COUNT, `Reviewed coordinate input cannot exceed ${EXPECTED_MARKER_COUNT} items`)
  const markerByRow = new Map(markers.map(marker => [marker.sourceRow, marker]))
  const rows = new Set<number>()
  const codes = new Set<string>()
  const points = new Set<string>()
  const expectedKeys = [
    'sourceRow',
    'name',
    'locationCode',
    'lng',
    'lat',
    'crs',
    'pointRole',
    'accuracyMeters',
    'coordinateSource',
    'coordinateSourceUrl',
    'verificationStatus',
    'verifiedAt',
    'verifierCategory'
  ] as const

  return value.map((itemValue, index): ReviewedCoordinate => {
    const context = `Coordinate item ${index + 1}`
    assertImport(isRecord(itemValue), `${context} must be an object`)
    exactKeys(itemValue, expectedKeys, context)
    assertImport(Number.isInteger(itemValue.sourceRow), `${context}: sourceRow must be an integer`)
    const sourceRow = Number(itemValue.sourceRow)
    const marker = markerByRow.get(sourceRow)
    assertImport(marker, `${context}: sourceRow ${sourceRow} is not in the reviewed 76-marker export`)
    assertImport(typeof itemValue.name === 'string' && itemValue.name === marker.name, `${context}: name does not match source row ${sourceRow}`)
    assertImport(typeof itemValue.locationCode === 'string' && LOCATION_CODE_RE.test(itemValue.locationCode), `${context}: locationCode is invalid`)
    assertImport(itemValue.locationCode === marker.locationCode, `${context}: WIA locationCode does not match source row ${sourceRow}`)
    assertImport(!rows.has(sourceRow), `${context}: duplicate sourceRow ${sourceRow}`)
    assertImport(!codes.has(itemValue.locationCode), `${context}: duplicate WIA locationCode ${itemValue.locationCode}`)

    assertImport(typeof itemValue.lng === 'number' && Number.isFinite(itemValue.lng), `${context}: lng must be a finite number`)
    assertImport(typeof itemValue.lat === 'number' && Number.isFinite(itemValue.lat), `${context}: lat must be a finite number`)
    assertImport(
      isPointWithinBounds({ lng: itemValue.lng, lat: itemValue.lat }, YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS),
      `${context}: WGS84 coordinate is outside the campus validation bounds`
    )
    assertImport(typeof itemValue.crs === 'string', `${context}: crs is required`)
    if (itemValue.crs === 'GCJ-02' || itemValue.crs === 'BD-09') {
      throw new AmapCoordinateImportError(
        `${context}: ${itemValue.crs} input is not accepted; convert it outside this project with a reviewed, reliable tool, re-verify the WGS84 result, and submit that WGS84 coordinate without relabelling raw values`
      )
    }
    assertImport(itemValue.crs === 'WGS84', `${context}: crs must be WGS84`)
    const pointKey = `${itemValue.lng},${itemValue.lat}`
    assertImport(!points.has(pointKey), `${context}: duplicate coordinate ${pointKey} in this batch`)

    assertImport(isPointRole(itemValue.pointRole), `${context}: pointRole must be one of ${COORDINATE_POINT_ROLES.join(', ')}`)
    assertImport(
      typeof itemValue.accuracyMeters === 'number'
      && Number.isFinite(itemValue.accuracyMeters)
      && itemValue.accuracyMeters > 0
      && itemValue.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS,
      `${context}: accuracyMeters must be greater than 0 and at most ${MAX_APPROVABLE_COORDINATE_ACCURACY_METERS}`
    )
    assertImport(
      typeof itemValue.coordinateSource === 'string'
      && itemValue.coordinateSource === itemValue.coordinateSource.trim()
      && itemValue.coordinateSource.length >= 5
      && itemValue.coordinateSource.length <= 1_000
      && !itemValue.coordinateSource.includes('\0'),
      `${context}: coordinateSource must be an evidence description of 5 to 1000 characters`
    )
    const coordinateSourceUrl = parseEvidenceUrl(itemValue.coordinateSourceUrl, context)
    assertImport(itemValue.verificationStatus === 'human-verified', `${context}: verificationStatus must be human-verified`)
    assertImport(isVerifierCategory(itemValue.verifierCategory), `${context}: verifierCategory must be one of ${VERIFIER_CATEGORIES.join(', ')}; do not put a person's name here`)
    const verified = normalizedVerificationTime(itemValue.verifiedAt, context, now)

    rows.add(sourceRow)
    codes.add(itemValue.locationCode)
    points.add(pointKey)
    return {
      sourceRow,
      name: itemValue.name,
      locationCode: itemValue.locationCode,
      lng: itemValue.lng,
      lat: itemValue.lat,
      crs: 'WGS84',
      pointRole: itemValue.pointRole,
      accuracyMeters: itemValue.accuracyMeters,
      coordinateSource: itemValue.coordinateSource,
      coordinateSourceUrl,
      verificationStatus: 'human-verified',
      verifiedAt: verified.iso,
      verifierCategory: itemValue.verifierCategory
    }
  })
}

function validateCoordinateTemplate(value: unknown, markers: AmapMarker[]): TemplateItem[] {
  assertImport(Array.isArray(value), 'Coordinate template must be a JSON array')
  assertImport(value.length === EXPECTED_MARKER_COUNT, `Coordinate template must contain exactly ${EXPECTED_MARKER_COUNT} items`)
  const expectedKeys = [
    'sourceRow', 'name', 'locationCode', 'lng', 'lat', 'crs', 'pointRole', 'accuracyMeters',
    'coordinateSource', 'coordinateSourceUrl', 'verificationStatus', 'verifiedAt', 'verifierCategory'
  ] as const
  return value.map((itemValue, index): TemplateItem => {
    const context = `Coordinate template item ${index + 1}`
    const marker = markers[index]!
    assertImport(isRecord(itemValue), `${context} must be an object`)
    exactKeys(itemValue, expectedKeys, context)
    assertImport(itemValue.sourceRow === marker.sourceRow, `${context}: sourceRow drifted from the reviewed export`)
    assertImport(itemValue.name === marker.name, `${context}: name drifted from the reviewed export`)
    assertImport(itemValue.locationCode === marker.locationCode, `${context}: WIA locationCode drifted from the reviewed export`)
    assertImport(itemValue.lng === null && itemValue.lat === null, `${context}: committed template coordinates must remain null`)
    assertImport(itemValue.crs === 'GCJ-02', `${context}: template crs changed`)
    assertImport(itemValue.pointRole === null, `${context}: committed template pointRole must remain null`)
    assertImport(itemValue.accuracyMeters === null, `${context}: committed template accuracyMeters must remain null`)
    assertImport(itemValue.coordinateSource === null && itemValue.coordinateSourceUrl === null, `${context}: committed template provenance must remain null`)
    assertImport(itemValue.verificationStatus === 'pending-authorized-coordinate-export', `${context}: template verificationStatus changed`)
    assertImport(itemValue.verifiedAt === null && itemValue.verifierCategory === null, `${context}: committed template review fields must remain null`)
    return itemValue as unknown as TemplateItem
  })
}

function loadAuthoritativeMarkers(rawPath: string, templatePath: string): AmapMarker[] {
  const markers = parseAmapMarkers(loadJson(rawPath, 'Reviewed raw AMap import')) as AmapMarker[]
  assertImport(markers.length === EXPECTED_MARKER_COUNT, `Reviewed raw import must contain exactly ${EXPECTED_MARKER_COUNT} markers`)
  validateCoordinateTemplate(loadJson(templatePath, 'Coordinate template'), markers)
  return markers
}

function isLegacyStoredReview(value: unknown): value is LegacyStoredCoordinateReview {
  if (!isRecord(value)) return false
  const keys = [
    'importer', 'schemaVersion', 'longitude', 'latitude', 'coordinateSystem', 'coordinateSource',
    'coordinateSourceUrl', 'verificationStatus', 'verifiedAt', 'verifierCategory', 'inputSha256', 'importedAt'
  ]
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.sort())
    && value.importer === LEGACY_COORDINATE_IMPORTER_ID
    && value.schemaVersion === 1
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.coordinateSystem === 'WGS84'
    && typeof value.coordinateSource === 'string'
    && (value.coordinateSourceUrl === null || typeof value.coordinateSourceUrl === 'string')
    && value.verificationStatus === 'human-verified'
    && typeof value.verifiedAt === 'string'
    && isVerifierCategory(value.verifierCategory)
    && typeof value.inputSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(value.inputSha256)
    && Number.isInteger(value.importedAt)
    && Number(value.importedAt) >= 0
}

function parseManagedReference(value: string | null): ParsedReference | null {
  if (!value) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const hasLegacyReview = Object.hasOwn(parsed, 'coordinateReview')
  const expectedKeys = hasLegacyReview
    ? ['importer', 'file', 'sheet', 'sourceRow', 'locationCode', 'coordinateReview']
    : ['importer', 'file', 'sheet', 'sourceRow', 'locationCode']
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(expectedKeys.sort())) return null
  if (parsed.importer !== DRAFT_IMPORTER_ID
    || parsed.file !== RAW_FILE_NAME
    || parsed.sheet !== TARGET_SHEET_NAME
    || !Number.isInteger(parsed.sourceRow)
    || typeof parsed.locationCode !== 'string'
    || !LOCATION_CODE_RE.test(parsed.locationCode)) return null
  if (hasLegacyReview && !isLegacyStoredReview(parsed.coordinateReview)) return null
  const base: DraftRawReference = {
    importer: DRAFT_IMPORTER_ID,
    file: RAW_FILE_NAME,
    sheet: TARGET_SHEET_NAME,
    sourceRow: Number(parsed.sourceRow),
    locationCode: parsed.locationCode
  }
  const legacyReview = hasLegacyReview ? parsed.coordinateReview as LegacyStoredCoordinateReview : null
  const canonical = JSON.stringify(legacyReview ? { ...base, coordinateReview: legacyReview } : base)
  return { base, legacyReview, canonical }
}

function assertColumns(
  database: InstanceType<typeof BetterSqlite3>,
  table: string,
  expected: Record<string, string>
): void {
  const columns = database.prepare(`PRAGMA table_info('${table}')`).all() as DatabaseColumn[]
  assertImport(columns.length > 0, `Target database has no ${table} table; run pnpm db:migrate first`)
  const byName = new Map(columns.map(column => [column.name, column]))
  for (const [name, type] of Object.entries(expected)) {
    const column = byName.get(name)
    assertImport(column && column.type.toUpperCase() === type, `Target ${table}.${name} must exist with SQLite type ${type}`)
  }
}

function validateDatabaseSchema(database: InstanceType<typeof BetterSqlite3>): void {
  assertColumns(database, 'places', {
    id: 'TEXT', slug: 'TEXT', name: 'TEXT', source_raw_ref: 'TEXT'
  })
  assertColumns(database, 'place_coordinate_observations', {
    id: 'TEXT', client_observation_id: 'TEXT', place_id: 'TEXT', longitude: 'REAL', latitude: 'REAL',
    coordinate_system: 'TEXT', accuracy_meters: 'REAL', sample_count: 'INTEGER', samples_json: 'TEXT',
    capture_method: 'TEXT', point_role: 'TEXT', captured_at: 'INTEGER', evidence_note: 'TEXT',
    review_status: 'TEXT', reviewed_by: 'TEXT', reviewed_at: 'INTEGER', review_note: 'TEXT',
    created_at: 'INTEGER', updated_at: 'INTEGER'
  })
  const observationIndexes = database.prepare(`PRAGMA index_list('place_coordinate_observations')`).all() as DatabaseIndex[]
  assertImport(
    observationIndexes.some(index => index.name === 'coordinate_observations_client_id_unique' && index.unique === 1),
    'Target database is missing the unique coordinate observation idempotency index; run pnpm db:migrate first'
  )
}

function conflictFor(
  coordinate: ReviewedCoordinate,
  reason: string,
  placeId?: string,
  observationId?: string
): CoordinateImportConflict {
  return {
    sourceRow: coordinate.sourceRow,
    locationCode: coordinate.locationCode,
    name: coordinate.name,
    reason,
    ...(placeId ? { existingPlaceId: placeId } : {}),
    ...(observationId ? { existingObservationId: observationId } : {})
  }
}

function loadPlaces(database: InstanceType<typeof BetterSqlite3>): ExistingPlace[] {
  return database.prepare(`
    SELECT id, slug, name, source_raw_ref AS sourceRawRef
    FROM places
  `).all() as ExistingPlace[]
}

function makeEvidenceNote(coordinate: ReviewedCoordinate, sourceRawRef: string): string {
  const note = JSON.stringify({
    importer: OBSERVATION_IMPORTER_ID,
    schemaVersion: 1,
    coordinateSource: coordinate.coordinateSource,
    coordinateSourceUrl: coordinate.coordinateSourceUrl,
    inputVerificationStatus: coordinate.verificationStatus,
    inputVerifiedAt: coordinate.verifiedAt,
    inputVerifierCategory: coordinate.verifierCategory,
    sourceRawRef,
    inputSha256: coordinateFingerprint(coordinate)
  })
  assertImport(
    note.length <= MAX_EVIDENCE_NOTE_LENGTH,
    `Coordinate item for source row ${coordinate.sourceRow}: serialized evidence exceeds ${MAX_EVIDENCE_NOTE_LENGTH} characters`
  )
  return note
}

function observationMatchesPlan(existing: ExistingObservation, planned: PlannedObservation): boolean {
  return existing.placeId === planned.place.id
    && existing.longitude === planned.coordinate.lng
    && existing.latitude === planned.coordinate.lat
    && existing.coordinateSystem === 'WGS84'
    && existing.accuracyMeters === planned.coordinate.accuracyMeters
    && existing.sampleCount === 1
    && existing.samplesJson === planned.samplesJson
    && existing.captureMethod === 'authorized-import'
    && existing.pointRole === planned.coordinate.pointRole
    && existing.capturedAt === planned.capturedAt
    && existing.evidenceNote === planned.evidenceNote
}

function validateObservationContract(planned: PlannedObservation): void {
  const parsed = createCoordinateObservationSchema.safeParse({
    clientObservationId: planned.clientObservationId,
    placeId: planned.place.id,
    coordinateSystem: 'WGS84',
    captureMethod: 'authorized-import',
    pointRole: planned.coordinate.pointRole,
    evidenceNote: planned.evidenceNote,
    samples: JSON.parse(planned.samplesJson) as unknown
  })
  assertImport(
    parsed.success,
    `Coordinate item for source row ${planned.coordinate.sourceRow} no longer matches the server observation contract`
  )
}

function buildPlan(
  database: InstanceType<typeof BetterSqlite3>,
  markers: AmapMarker[],
  coordinates: ReviewedCoordinate[]
): ImportPlan {
  const places = loadPlaces(database)
  const parsedPlaces = places.map(place => ({ place, parsed: parseManagedReference(place.sourceRawRef) }))
  const markerByRow = new Map(markers.map(marker => [marker.sourceRow, marker]))
  const byClientId = database.prepare(`
    SELECT id, client_observation_id AS clientObservationId, place_id AS placeId,
           longitude, latitude, coordinate_system AS coordinateSystem,
           accuracy_meters AS accuracyMeters, sample_count AS sampleCount,
           samples_json AS samplesJson, capture_method AS captureMethod,
           point_role AS pointRole, captured_at AS capturedAt, evidence_note AS evidenceNote
    FROM place_coordinate_observations WHERE client_observation_id = ?
  `)
  const byId = database.prepare(`
    SELECT id, client_observation_id AS clientObservationId, place_id AS placeId,
           longitude, latitude, coordinate_system AS coordinateSystem,
           accuracy_meters AS accuracyMeters, sample_count AS sampleCount,
           samples_json AS samplesJson, capture_method AS captureMethod,
           point_role AS pointRole, captured_at AS capturedAt, evidence_note AS evidenceNote
    FROM place_coordinate_observations WHERE id = ?
  `)
  const inserts: PlannedObservation[] = []
  const conflicts: CoordinateImportConflict[] = []
  let skipped = 0

  const malformedRelated = parsedPlaces.find(({ place, parsed }) => !parsed
    && place.sourceRawRef !== null
    && (place.sourceRawRef.includes(DRAFT_IMPORTER_ID)
      || place.sourceRawRef.includes(LEGACY_COORDINATE_IMPORTER_ID)
      || place.sourceRawRef.includes(RAW_FILE_NAME)))
  if (malformedRelated) {
    return {
      inserts,
      skipped,
      conflicts: [conflictFor(
        coordinates[0]!,
        'A place has a malformed source_raw_ref related to this import; repair it through a reviewed workflow before importing observations',
        malformedRelated.place.id
      )]
    }
  }

  for (const coordinate of coordinates) {
    const marker = markerByRow.get(coordinate.sourceRow)!
    const exactMatches = parsedPlaces.filter(item => item.parsed?.base.sourceRow === coordinate.sourceRow
      && item.parsed.base.locationCode === coordinate.locationCode)
    const rowMatches = parsedPlaces.filter(item => item.parsed?.base.sourceRow === coordinate.sourceRow)
    const codeMatches = parsedPlaces.filter(item => item.parsed?.base.locationCode === coordinate.locationCode)
    const expectedId = deterministicDraftId(marker)
    const idMatch = places.find(place => place.id === expectedId)

    if (exactMatches.length !== 1 || rowMatches.length !== 1 || codeMatches.length !== 1) {
      const malformedExpectedReference = idMatch?.sourceRawRef !== null && parseManagedReference(idMatch?.sourceRawRef ?? null) === null
      const reason = malformedExpectedReference
        ? 'The deterministically bound place has a malformed source_raw_ref; repair it through a reviewed workflow before importing observations'
        : exactMatches.length > 1 || rowMatches.length > 1 || codeMatches.length > 1
          ? 'More than one place uses this source row or WIA locationCode'
          : 'No uniquely bound draft identity exists for this source row and WIA locationCode; run the draft importer first'
      conflicts.push(conflictFor(coordinate, reason, idMatch?.id ?? exactMatches[0]?.place.id))
      continue
    }

    const target = exactMatches[0]!
    if (target.place.id !== expectedId) {
      conflicts.push(conflictFor(coordinate, 'Source row and WIA locationCode are bound to an unexpected place ID', target.place.id))
      continue
    }
    if (target.place.slug !== `amap-workmap-20260713-r${String(marker.sourceRow).padStart(3, '0')}`
      || target.place.name !== marker.name
      || target.place.sourceRawRef !== target.parsed!.canonical) {
      conflicts.push(conflictFor(coordinate, 'The bound place identity or source_raw_ref was changed after draft import', target.place.id))
      continue
    }

    const capturedAt = Date.parse(coordinate.verifiedAt)
    const samplesJson = JSON.stringify([{
      longitude: coordinate.lng,
      latitude: coordinate.lat,
      accuracyMeters: coordinate.accuracyMeters,
      capturedAt: coordinate.verifiedAt
    }])
    const planned: PlannedObservation = {
      id: deterministicObservationId(coordinate),
      clientObservationId: deterministicClientObservationId(coordinate),
      place: target.place,
      coordinate,
      samplesJson,
      evidenceNote: makeEvidenceNote(coordinate, target.place.sourceRawRef!),
      capturedAt
    }
    validateObservationContract(planned)
    const existingByClient = byClientId.get(planned.clientObservationId) as ExistingObservation | undefined
    if (existingByClient) {
      if (observationMatchesPlan(existingByClient, planned)) skipped += 1
      else conflicts.push(conflictFor(
        coordinate,
        'The deterministic import identity already exists with a different coordinate, role, accuracy, evidence, or target',
        target.place.id,
        existingByClient.id
      ))
      continue
    }
    const existingById = byId.get(planned.id) as ExistingObservation | undefined
    if (existingById) {
      conflicts.push(conflictFor(
        coordinate,
        'The deterministic observation row ID is already occupied by another record',
        target.place.id,
        existingById.id
      ))
      continue
    }
    inserts.push(planned)
  }

  return { inserts, skipped, conflicts }
}

function applyInserts(database: InstanceType<typeof BetterSqlite3>, inserts: PlannedObservation[], now: number): number {
  const insert = database.prepare(`
    INSERT INTO place_coordinate_observations (
      id, client_observation_id, place_id, longitude, latitude, coordinate_system,
      accuracy_meters, sample_count, samples_json, capture_method, point_role,
      captured_at, evidence_note, review_status, reviewed_by, reviewed_at,
      review_note, created_at, updated_at
    ) VALUES (
      @id, @clientObservationId, @placeId, @longitude, @latitude, 'WGS84',
      @accuracyMeters, 1, @samplesJson, 'authorized-import', @pointRole,
      @capturedAt, @evidenceNote, 'pending', NULL, NULL, NULL, @now, @now
    )
  `)
  let created = 0
  for (const item of inserts) {
    const result = insert.run({
      id: item.id,
      clientObservationId: item.clientObservationId,
      placeId: item.place.id,
      longitude: item.coordinate.lng,
      latitude: item.coordinate.lat,
      accuracyMeters: item.coordinate.accuracyMeters,
      samplesJson: item.samplesJson,
      pointRole: item.coordinate.pointRole,
      capturedAt: item.capturedAt,
      evidenceNote: item.evidenceNote,
      now
    })
    assertImport(result.changes === 1, `Atomic observation insert failed for source row ${item.coordinate.sourceRow}`)
    created += result.changes
  }
  return created
}

function makeResult(
  apply: boolean,
  inputPath: string,
  databasePath: string,
  coordinateCount: number,
  plan: ImportPlan,
  created: number,
  applied: boolean
): CoordinateImportResult {
  return {
    mode: apply ? 'apply' : 'dry-run',
    inputPath,
    databasePath,
    coordinateCount,
    created,
    wouldCreate: plan.inserts.length,
    skipped: plan.skipped,
    conflicts: plan.conflicts.length,
    applied,
    conflictDetails: plan.conflicts
  }
}

export function importAmapCoordinates(options: CoordinateImportOptions): CoordinateImportResult {
  assertImport(typeof options.inputPath === 'string' && options.inputPath.length > 0, 'Reviewed coordinate --input PATH is required')
  const apply = options.apply === true
  const inputPath = absolutePath(options.inputPath)
  const rawPath = absolutePath(options.rawPath ?? DEFAULT_RAW_PATH)
  const templatePath = absolutePath(options.templatePath ?? DEFAULT_TEMPLATE_PATH)
  const databasePath = absolutePath(options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite')
  const now = options.now ?? Date.now()
  assertImport(Number.isInteger(now) && now >= 0, 'now must be a non-negative integer timestamp')
  assertImport(databasePath !== ':memory:', 'CLI imports require a file-backed SQLite database')
  assertImport(existsSync(databasePath), `Target database does not exist: ${databasePath}; run pnpm db:migrate and pnpm amap:drafts -- --apply first`)

  const markers = loadAuthoritativeMarkers(rawPath, templatePath)
  const coordinates = validateReviewedCoordinates(loadJson(inputPath, 'Reviewed coordinate input'), markers, now)
  const database = new BetterSqlite3(databasePath, { readonly: !apply, fileMustExist: true })
  try {
    database.pragma('foreign_keys = ON')
    validateDatabaseSchema(database)
    if (!apply) {
      const plan = buildPlan(database, markers, coordinates)
      return makeResult(false, inputPath, databasePath, coordinates.length, plan, 0, false)
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      const plan = buildPlan(database, markers, coordinates)
      if (plan.conflicts.length > 0) {
        database.exec('ROLLBACK')
        return makeResult(true, inputPath, databasePath, coordinates.length, plan, 0, false)
      }
      const created = applyInserts(database, plan.inserts, now)
      database.exec('COMMIT')
      return makeResult(true, inputPath, databasePath, coordinates.length, plan, created, true)
    } catch (error) {
      if (database.inTransaction) database.exec('ROLLBACK')
      throw error
    }
  } finally {
    database.close()
  }
}

function usage(): string {
  return [
    'Usage: pnpm amap:coordinates -- --input PATH [--dry-run] [--apply] [--database PATH]',
    '',
    'Default mode is read-only dry-run. --apply creates pending authorized-import observations only.',
    'The input may contain any non-empty, independently reviewed subset of the 76 markers.',
    'GCJ-02 and BD-09 input is rejected; this script performs no coordinate conversion.',
    'The importer never changes a place coordinate, verification state, point role, or publication state.',
    'Default database: NUXT_DATABASE_PATH or ./data/yeu.sqlite'
  ].join('\n')
}

function parseCliArgs(argv: string[]): CoordinateImportOptions & { help: boolean } {
  const options: Partial<CoordinateImportOptions> & { help: boolean } = { apply: false, help: false }
  let dryRunExplicit = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument === '--apply') {
      assertImport(!dryRunExplicit, '--apply cannot be combined with --dry-run')
      options.apply = true
    } else if (argument === '--dry-run') {
      assertImport(options.apply !== true, '--dry-run cannot be combined with --apply')
      dryRunExplicit = true
    } else if (argument === '--database' || argument === '--input') {
      const value = argv[index + 1]
      assertImport(value && !value.startsWith('-'), `${argument} requires a path`)
      if (argument === '--database') options.databasePath = value
      else options.inputPath = value
      index += 1
    } else {
      throw new AmapCoordinateImportError(`Unknown argument: ${argument}`)
    }
  }
  if (!options.help) assertImport(typeof options.inputPath === 'string', '--input PATH is required')
  return options as CoordinateImportOptions & { help: boolean }
}

export function runCoordinateCli(argv: string[], io: CliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
}): number {
  try {
    const options = parseCliArgs(argv)
    if (options.help) {
      io.stdout(`${usage()}\n`)
      return 0
    }
    const result = importAmapCoordinates(options)
    io.stdout(`${JSON.stringify(result, null, 2)}\n`)
    return result.conflicts > 0 ? 1 : 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    io.stderr(`${JSON.stringify({ error: message }, null, 2)}\n`)
    return 2
  }
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) process.exitCode = runCoordinateCli(process.argv.slice(2))
