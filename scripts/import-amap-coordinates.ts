import './load-env'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { isPointWithinBounds, YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS } from '../map/core/campus'
import { parseAmapMarkers } from './import-amap-drafts'

const RAW_FILE_NAME = 'amap-workmap-2026-07-13.raw.json'
const TEMPLATE_FILE_NAME = 'amap-workmap-2026-07-13.coordinates.template.json'
const DEFAULT_RAW_PATH = `data/imports/${RAW_FILE_NAME}`
const DEFAULT_TEMPLATE_PATH = `data/imports/${TEMPLATE_FILE_NAME}`
const TARGET_SHEET_NAME = '标记位置'
const EXPECTED_MARKER_COUNT = 76
const DRAFT_IMPORTER_ID = 'amap-workmap-draft-v1'
const COORDINATE_IMPORTER_ID = 'amap-coordinate-review-v1'
const LOCATION_CODE_RE = /^WIA-\d+\.\d+,\d+\.\d+$/
const ISO_WITH_TIMEZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

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
  coordinateSource: null
  verificationStatus: 'pending-authorized-coordinate-export'
}

export interface ReviewedCoordinate {
  sourceRow: number
  name: string
  locationCode: string
  lng: number
  lat: number
  crs: 'WGS84'
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

interface StoredCoordinateReview {
  importer: typeof COORDINATE_IMPORTER_ID
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

interface ExistingPlace {
  id: string
  slug: string
  name: string
  longitude: number | null
  latitude: number | null
  coordinateSystem: string | null
  coordinateVerification: string
  coordinateVerifiedAt: number | null
  sourceRawRef: string | null
  isOfficial: number
  isFeatured: number
  status: string
  lastVerifiedAt: number | null
  publishedAt: number | null
  createdAt: number
  updatedAt: number
  sourceCount: number
}

interface ParsedReference {
  base: DraftRawReference
  review: StoredCoordinateReview | null
  canonical: string
}

interface CoordinateUpdate {
  place: ExistingPlace
  coordinate: ReviewedCoordinate
  verifiedAtMs: number
  nextRawReference: string
}

interface ImportPlan {
  updates: CoordinateUpdate[]
  skipped: number
  conflicts: CoordinateImportConflict[]
}

interface DatabaseColumn {
  name: string
  type: string
  notnull: number
  pk: number
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
}

export interface CoordinateImportResult {
  mode: 'dry-run' | 'apply'
  inputPath: string
  databasePath: string
  coordinateCount: number
  updated: number
  wouldUpdate: number
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

function expectedDraftReference(marker: AmapMarker): DraftRawReference {
  return {
    importer: DRAFT_IMPORTER_ID,
    file: RAW_FILE_NAME,
    sheet: TARGET_SHEET_NAME,
    sourceRow: marker.sourceRow,
    locationCode: marker.locationCode
  }
}

function deterministicDraftId(marker: AmapMarker): string {
  const bytes = createHash('sha256')
    .update(`${DRAFT_IMPORTER_ID}\0${marker.sourceRow}\0${marker.locationCode}`, 'utf8')
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isVerifierCategory(value: unknown): value is VerifierCategory {
  return typeof value === 'string' && (VERIFIER_CATEGORIES as readonly string[]).includes(value)
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

    assertImport(
      typeof itemValue.coordinateSource === 'string'
      && itemValue.coordinateSource === itemValue.coordinateSource.trim()
      && itemValue.coordinateSource.length > 0
      && itemValue.coordinateSource.length <= 1_000
      && !itemValue.coordinateSource.includes('\0'),
      `${context}: coordinateSource must be a non-blank evidence description of at most 1000 characters`
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
  const expectedKeys = ['sourceRow', 'name', 'locationCode', 'lng', 'lat', 'crs', 'coordinateSource', 'verificationStatus'] as const
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
    assertImport(itemValue.coordinateSource === null, `${context}: committed template provenance must remain null`)
    assertImport(itemValue.verificationStatus === 'pending-authorized-coordinate-export', `${context}: template verificationStatus changed`)
    return itemValue as unknown as TemplateItem
  })
}

function loadAuthoritativeMarkers(rawPath: string, templatePath: string): AmapMarker[] {
  const markers = parseAmapMarkers(loadJson(rawPath, 'Reviewed raw AMap import')) as AmapMarker[]
  assertImport(markers.length === EXPECTED_MARKER_COUNT, `Reviewed raw import must contain exactly ${EXPECTED_MARKER_COUNT} markers`)
  validateCoordinateTemplate(loadJson(templatePath, 'Coordinate template'), markers)
  return markers
}

function isStoredReview(value: unknown): value is StoredCoordinateReview {
  if (!isRecord(value)) return false
  const keys = [
    'importer', 'schemaVersion', 'longitude', 'latitude', 'coordinateSystem', 'coordinateSource',
    'coordinateSourceUrl', 'verificationStatus', 'verifiedAt', 'verifierCategory', 'inputSha256', 'importedAt'
  ]
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys.sort())) return false
  return value.importer === COORDINATE_IMPORTER_ID
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
  const hasReview = Object.hasOwn(parsed, 'coordinateReview')
  const expectedKeys = hasReview
    ? ['importer', 'file', 'sheet', 'sourceRow', 'locationCode', 'coordinateReview']
    : ['importer', 'file', 'sheet', 'sourceRow', 'locationCode']
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(expectedKeys.sort())) return null
  if (parsed.importer !== DRAFT_IMPORTER_ID
    || parsed.file !== RAW_FILE_NAME
    || parsed.sheet !== TARGET_SHEET_NAME
    || !Number.isInteger(parsed.sourceRow)
    || typeof parsed.locationCode !== 'string'
    || !LOCATION_CODE_RE.test(parsed.locationCode)) return null
  if (hasReview && !isStoredReview(parsed.coordinateReview)) return null
  const base: DraftRawReference = {
    importer: DRAFT_IMPORTER_ID,
    file: RAW_FILE_NAME,
    sheet: TARGET_SHEET_NAME,
    sourceRow: Number(parsed.sourceRow),
    locationCode: parsed.locationCode
  }
  const review = hasReview ? parsed.coordinateReview as StoredCoordinateReview : null
  const canonical = JSON.stringify(review ? { ...base, coordinateReview: review } : base)
  return { base, review, canonical }
}

function validateDatabaseSchema(database: InstanceType<typeof BetterSqlite3>): void {
  const columns = database.prepare(`PRAGMA table_info('places')`).all() as DatabaseColumn[]
  assertImport(columns.length > 0, 'Target database has no places table; run pnpm db:migrate first')
  const byName = new Map(columns.map(column => [column.name, column]))
  const expected: Record<string, string> = {
    id: 'TEXT', slug: 'TEXT', name: 'TEXT', longitude: 'REAL', latitude: 'REAL',
    coordinate_system: 'TEXT', coordinate_verification: 'TEXT', coordinate_verified_at: 'INTEGER',
    source_raw_ref: 'TEXT', is_official: 'INTEGER', is_featured: 'INTEGER', status: 'TEXT',
    last_verified_at: 'INTEGER', published_at: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER'
  }
  for (const [name, type] of Object.entries(expected)) {
    const column = byName.get(name)
    assertImport(column && column.type.toUpperCase() === type, `Target places.${name} must exist with SQLite type ${type}`)
  }
  assertImport(byName.get('id')?.pk === 1, 'Target places.id must be the primary key')
  const sourceColumns = database.prepare(`PRAGMA table_info('sources')`).all() as DatabaseColumn[]
  const relationColumns = database.prepare(`PRAGMA table_info('place_sources')`).all() as DatabaseColumn[]
  assertImport(sourceColumns.length > 0 && relationColumns.length > 0, 'Target database has no compatible source tables')
}

function expectedStoredReview(coordinate: ReviewedCoordinate, importedAt: number): StoredCoordinateReview {
  return {
    importer: COORDINATE_IMPORTER_ID,
    schemaVersion: 1,
    longitude: coordinate.lng,
    latitude: coordinate.lat,
    coordinateSystem: 'WGS84',
    coordinateSource: coordinate.coordinateSource,
    coordinateSourceUrl: coordinate.coordinateSourceUrl,
    verificationStatus: 'human-verified',
    verifiedAt: coordinate.verifiedAt,
    verifierCategory: coordinate.verifierCategory,
    inputSha256: coordinateFingerprint(coordinate),
    importedAt
  }
}

function sameStoredReview(review: StoredCoordinateReview, coordinate: ReviewedCoordinate): boolean {
  const expected = expectedStoredReview(coordinate, review.importedAt)
  return JSON.stringify(review) === JSON.stringify(expected)
}

function conflictFor(coordinate: ReviewedCoordinate, reason: string, existingPlaceId?: string): CoordinateImportConflict {
  return {
    sourceRow: coordinate.sourceRow,
    locationCode: coordinate.locationCode,
    name: coordinate.name,
    reason,
    ...(existingPlaceId ? { existingPlaceId } : {})
  }
}

function loadPlaces(database: InstanceType<typeof BetterSqlite3>): ExistingPlace[] {
  return database.prepare(`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.longitude,
      p.latitude,
      p.coordinate_system AS coordinateSystem,
      p.coordinate_verification AS coordinateVerification,
      p.coordinate_verified_at AS coordinateVerifiedAt,
      p.source_raw_ref AS sourceRawRef,
      p.is_official AS isOfficial,
      p.is_featured AS isFeatured,
      p.status,
      p.last_verified_at AS lastVerifiedAt,
      p.published_at AS publishedAt,
      p.created_at AS createdAt,
      p.updated_at AS updatedAt,
      (SELECT count(*) FROM place_sources ps WHERE ps.place_id = p.id) AS sourceCount
    FROM places p
  `).all() as ExistingPlace[]
}

function initialStateConflict(place: ExistingPlace, marker: AmapMarker, parsed: ParsedReference): string | null {
  if (place.id !== deterministicDraftId(marker)) return 'Target place ID drifted from the deterministic draft identity'
  if (place.slug !== `amap-workmap-20260713-r${String(marker.sourceRow).padStart(3, '0')}`) return 'Target place slug was manually changed'
  if (place.name !== marker.name) return 'Target place name was manually changed'
  if (place.status !== 'draft' || place.publishedAt !== null) return 'Published or non-draft places cannot receive batch coordinates'
  if (place.longitude !== null || place.latitude !== null || place.coordinateSystem !== null
    || place.coordinateVerification !== 'missing' || place.coordinateVerifiedAt !== null) {
    return 'Coordinate fields were already changed outside this coordinate importer'
  }
  if (place.createdAt !== place.updatedAt) return 'Target place was manually edited after draft import'
  if (place.isOfficial !== 0 || place.isFeatured !== 0 || place.lastVerifiedAt !== null || place.sourceCount !== 0) {
    return 'Target place metadata or source links were manually changed after draft import'
  }
  if (place.sourceRawRef !== parsed.canonical) return 'source_raw_ref formatting or fields drifted from the draft importer output'
  return null
}

function managedStateConflict(place: ExistingPlace, coordinate: ReviewedCoordinate, parsed: ParsedReference): string | null {
  const review = parsed.review!
  if (place.id !== deterministicDraftId(coordinate)) return 'Target place ID drifted from the deterministic draft identity'
  if (place.slug !== `amap-workmap-20260713-r${String(coordinate.sourceRow).padStart(3, '0')}`) return 'Target place slug was manually changed after coordinate import'
  if (place.name !== coordinate.name) return 'Target place name was manually changed after coordinate import'
  if (place.status !== 'draft' || place.publishedAt !== null) return 'Published or non-draft places cannot be treated as an idempotent coordinate rerun'
  if (!sameStoredReview(review, coordinate)) return 'Reviewed coordinate or evidence differs from the previously imported review'
  if (place.longitude !== coordinate.lng || place.latitude !== coordinate.lat || place.coordinateSystem !== 'WGS84'
    || place.coordinateVerification !== 'verified' || place.coordinateVerifiedAt !== Date.parse(coordinate.verifiedAt)) {
    return 'Stored coordinate fields drifted from the previously imported review'
  }
  if (place.updatedAt !== review.importedAt) return 'Target place was manually edited after coordinate import'
  if (place.isOfficial !== 0 || place.isFeatured !== 0 || place.lastVerifiedAt !== null || place.sourceCount !== 0) {
    return 'Target place metadata or source links were manually changed after coordinate import'
  }
  if (place.sourceRawRef !== parsed.canonical) return 'source_raw_ref formatting or fields drifted after coordinate import'
  return null
}

function buildPlan(
  database: InstanceType<typeof BetterSqlite3>,
  markers: AmapMarker[],
  coordinates: ReviewedCoordinate[],
  now: number
): ImportPlan {
  const places = loadPlaces(database)
  const parsedPlaces = places.map(place => ({ place, parsed: parseManagedReference(place.sourceRawRef) }))
  const markerByRow = new Map(markers.map(marker => [marker.sourceRow, marker]))
  const updates: CoordinateUpdate[] = []
  const conflicts: CoordinateImportConflict[] = []
  let skipped = 0

  const malformedRelated = parsedPlaces.find(({ place, parsed }) => !parsed
    && place.sourceRawRef !== null
    && (place.sourceRawRef.includes(DRAFT_IMPORTER_ID)
      || place.sourceRawRef.includes(COORDINATE_IMPORTER_ID)
      || place.sourceRawRef.includes(RAW_FILE_NAME)))
  if (malformedRelated) {
    return {
      updates,
      skipped,
      conflicts: [conflictFor(
        coordinates[0]!,
        'A place has a malformed source_raw_ref related to this import; repair it through a reviewed workflow before any coordinate batch',
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
      const reason = exactMatches.length > 1 || rowMatches.length > 1 || codeMatches.length > 1
        ? 'More than one place uses this source row or WIA locationCode'
        : 'No uniquely bound draft exists for this source row and WIA locationCode; run the draft importer first'
      conflicts.push(conflictFor(coordinate, reason, idMatch?.id ?? exactMatches[0]?.place.id))
      continue
    }

    const target = exactMatches[0]!
    if (target.place.id !== expectedId) {
      conflicts.push(conflictFor(coordinate, 'Source row and WIA locationCode are bound to an unexpected place ID', target.place.id))
      continue
    }
    const duplicatePoint = places.find(place => place.id !== target.place.id
      && place.longitude === coordinate.lng && place.latitude === coordinate.lat)
    if (duplicatePoint) {
      conflicts.push(conflictFor(coordinate, 'Another database place already uses this exact coordinate', duplicatePoint.id))
      continue
    }

    if (target.parsed!.review) {
      const reason = managedStateConflict(target.place, coordinate, target.parsed!)
      if (reason) conflicts.push(conflictFor(coordinate, reason, target.place.id))
      else skipped += 1
      continue
    }

    const reason = initialStateConflict(target.place, marker, target.parsed!)
    if (reason) {
      conflicts.push(conflictFor(coordinate, reason, target.place.id))
      continue
    }
    const verifiedAtMs = Date.parse(coordinate.verifiedAt)
    const review = expectedStoredReview(coordinate, now)
    updates.push({
      place: target.place,
      coordinate,
      verifiedAtMs,
      nextRawReference: JSON.stringify({ ...expectedDraftReference(marker), coordinateReview: review })
    })
  }

  return { updates, skipped, conflicts }
}

function applyUpdates(database: InstanceType<typeof BetterSqlite3>, updates: CoordinateUpdate[], now: number): number {
  const update = database.prepare(`
    UPDATE places
    SET longitude = @longitude,
        latitude = @latitude,
        coordinate_system = 'WGS84',
        coordinate_verification = 'verified',
        coordinate_verified_at = @verifiedAt,
        source_raw_ref = @nextRawReference,
        updated_at = @now
    WHERE id = @id
      AND source_raw_ref = @previousRawReference
      AND status = 'draft'
      AND published_at IS NULL
      AND longitude IS NULL
      AND latitude IS NULL
      AND coordinate_system IS NULL
      AND coordinate_verification = 'missing'
      AND coordinate_verified_at IS NULL
      AND created_at = @previousUpdatedAt
      AND updated_at = @previousUpdatedAt
  `)
  let updated = 0
  for (const item of updates) {
    const result = update.run({
      id: item.place.id,
      longitude: item.coordinate.lng,
      latitude: item.coordinate.lat,
      verifiedAt: item.verifiedAtMs,
      nextRawReference: item.nextRawReference,
      previousRawReference: item.place.sourceRawRef,
      previousUpdatedAt: item.place.updatedAt,
      now
    })
    assertImport(result.changes === 1, `Atomic coordinate update failed for source row ${item.coordinate.sourceRow}`)
    updated += result.changes
  }
  return updated
}

function makeResult(
  apply: boolean,
  inputPath: string,
  databasePath: string,
  coordinateCount: number,
  plan: ImportPlan,
  updated: number,
  applied: boolean
): CoordinateImportResult {
  return {
    mode: apply ? 'apply' : 'dry-run',
    inputPath,
    databasePath,
    coordinateCount,
    updated,
    wouldUpdate: plan.updates.length,
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
      const plan = buildPlan(database, markers, coordinates, now)
      return makeResult(false, inputPath, databasePath, coordinates.length, plan, 0, false)
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      const plan = buildPlan(database, markers, coordinates, now)
      if (plan.conflicts.length > 0) {
        database.exec('ROLLBACK')
        return makeResult(true, inputPath, databasePath, coordinates.length, plan, 0, false)
      }
      const updated = applyUpdates(database, plan.updates, now)
      database.exec('COMMIT')
      return makeResult(true, inputPath, databasePath, coordinates.length, plan, updated, true)
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
    'Default mode is read-only dry-run. Only --apply writes reviewed WGS84 coordinates.',
    'The input may contain any non-empty, independently reviewed subset of the 76 markers.',
    'GCJ-02 and BD-09 input is rejected; this script performs no coordinate conversion.',
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
