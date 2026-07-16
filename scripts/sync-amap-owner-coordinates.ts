import './load-env'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { parseAmapMarkers } from './import-amap-drafts'

const RAW_FILE_NAME = 'amap-workmap-2026-07-13.raw.json'
const DEFAULT_RAW_PATH = `data/imports/${RAW_FILE_NAME}`
const DEFAULT_COORDINATE_PATH = 'data/imports/amap-workmap-2026-07-13.coordinates.owner-map.json'
const DRAFT_IMPORTER_ID = 'amap-workmap-draft-v1'
const TARGET_SHEET_NAME = '标记位置'
const EXPECTED_COUNT = 76
const LOCATION_CODE_RE = /^WIA-\d+\.\d+,\d+\.\d+$/

interface Marker {
  sourceRow: number
  name: string
  locationCode: string
}

interface OwnerCoordinate {
  sourceRow: number
  name: string
  locationCode: string
  resourceId: string
  lng: number
  lat: number
  crs: 'GCJ-02'
  coordinateSource: string
  coordinateSourceUrl: string
  verificationStatus: 'owner-map-only'
}

interface ManagedPlace {
  id: string
  slug: string
  name: string
  status: string
  sourceRawRef: string | null
  longitude: number | null
  latitude: number | null
  coordinateSystem: string | null
  coordinateVerification: string
  externalMapUrl: string | null
}

export interface SyncOwnerCoordinateConflict {
  sourceRow: number | null
  locationCode: string | null
  name: string | null
  reason: string
  existingPlaceId?: string
}

export interface SyncOwnerCoordinateResult {
  mode: 'dry-run' | 'apply'
  databasePath: string
  coordinatePath: string
  coordinateCount: number
  updated: number
  wouldUpdate: number
  skipped: number
  conflicts: number
  applied: boolean
  conflictDetails: SyncOwnerCoordinateConflict[]
}

interface SyncOptions {
  apply?: boolean
  databasePath?: string
  rawPath?: string
  coordinatePath?: string
  now?: number
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export class SyncOwnerCoordinateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncOwnerCoordinateError'
  }
}

function assertSync(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SyncOwnerCoordinateError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function absolutePath(path: string): string {
  if (path === ':memory:') return path
  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

function loadJson(path: string, label: string): unknown {
  assertSync(existsSync(path), `${label} does not exist: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new SyncOwnerCoordinateError(`${label} is not valid JSON: ${message}`)
  }
}

function parseDraftReference(value: string | null): { sourceRow: number, locationCode: string } | null {
  if (!value) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed.importer !== DRAFT_IMPORTER_ID
    || parsed.file !== RAW_FILE_NAME
    || parsed.sheet !== TARGET_SHEET_NAME
    || !Number.isInteger(parsed.sourceRow)
    || typeof parsed.locationCode !== 'string'
    || !LOCATION_CODE_RE.test(parsed.locationCode)) return null
  return { sourceRow: Number(parsed.sourceRow), locationCode: parsed.locationCode }
}

function validateOwnerCoordinates(value: unknown, markers: Marker[]): OwnerCoordinate[] {
  assertSync(Array.isArray(value), 'Owner coordinate input must be a JSON array')
  assertSync(value.length === EXPECTED_COUNT, `Owner coordinate input must contain exactly ${EXPECTED_COUNT} items`)
  const markerByRow = new Map(markers.map(marker => [marker.sourceRow, marker]))
  const seenRows = new Set<number>()
  const seenCodes = new Set<string>()
  const seenPoints = new Set<string>()

  return value.map((item, index): OwnerCoordinate => {
    const context = `Owner coordinate item ${index + 1}`
    assertSync(isRecord(item), `${context} must be an object`)
    const expectedKeys = [
      'sourceRow',
      'name',
      'locationCode',
      'resourceId',
      'lng',
      'lat',
      'crs',
      'coordinateSource',
      'coordinateSourceUrl',
      'verificationStatus'
    ]
    assertSync(
      JSON.stringify(Object.keys(item).sort()) === JSON.stringify(expectedKeys.sort()),
      `${context}: fields changed`
    )
    assertSync(Number.isInteger(item.sourceRow), `${context}: sourceRow must be an integer`)
    const sourceRow = Number(item.sourceRow)
    const marker = markerByRow.get(sourceRow)
    assertSync(marker, `${context}: sourceRow ${sourceRow} is not in the reviewed raw export`)
    assertSync(item.name === marker.name, `${context}: name does not match source row ${sourceRow}`)
    assertSync(item.locationCode === marker.locationCode, `${context}: locationCode does not match source row ${sourceRow}`)
    assertSync(typeof item.resourceId === 'string' && /^\d+$/.test(item.resourceId), `${context}: resourceId must be a numeric string`)
    assertSync(typeof item.lng === 'number' && Number.isFinite(item.lng), `${context}: lng must be a finite number`)
    assertSync(typeof item.lat === 'number' && Number.isFinite(item.lat), `${context}: lat must be a finite number`)
    assertSync(item.crs === 'GCJ-02', `${context}: crs must remain GCJ-02`)
    assertSync(typeof item.coordinateSource === 'string' && item.coordinateSource.includes(item.resourceId), `${context}: coordinateSource must reference the resourceId`)
    assertSync(typeof item.coordinateSourceUrl === 'string' && item.coordinateSourceUrl.startsWith('https://wia.amap.com/'), `${context}: coordinateSourceUrl must be the authorized AMap work map URL`)
    assertSync(item.verificationStatus === 'owner-map-only', `${context}: verificationStatus must be owner-map-only`)
    assertSync(!seenRows.has(sourceRow), `${context}: duplicate sourceRow`)
    assertSync(!seenCodes.has(item.locationCode), `${context}: duplicate locationCode`)
    const point = `${item.lng},${item.lat}`
    assertSync(!seenPoints.has(point), `${context}: duplicate coordinate`)
    seenRows.add(sourceRow)
    seenCodes.add(item.locationCode)
    seenPoints.add(point)
    return item as unknown as OwnerCoordinate
  })
}

function markerUrl(coordinate: OwnerCoordinate): string {
  const url = new URL('https://uri.amap.com/marker')
  url.searchParams.set('position', `${coordinate.lng},${coordinate.lat}`)
  url.searchParams.set('name', coordinate.name)
  url.searchParams.set('coordinate', 'gaode')
  url.searchParams.set('callnative', '0')
  return url.toString()
}

function friendlySummary(name: string): string {
  return `${name} 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护，具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。`
}

function loadManagedPlaces(database: BetterSqlite3.Database): ManagedPlace[] {
  return database.prepare(`
    SELECT id, slug, name, status, source_raw_ref AS sourceRawRef,
           longitude, latitude, coordinate_system AS coordinateSystem,
           coordinate_verification AS coordinateVerification,
           external_map_url AS externalMapUrl
    FROM places
  `).all() as ManagedPlace[]
}

function buildPlan(database: BetterSqlite3.Database, coordinates: OwnerCoordinate[]) {
  const places = loadManagedPlaces(database)
  const parsed = places.map(place => ({ place, ref: parseDraftReference(place.sourceRawRef) }))
  const updates: Array<{ place: ManagedPlace, coordinate: OwnerCoordinate }> = []
  const conflicts: SyncOwnerCoordinateConflict[] = []
  let skipped = 0

  for (const coordinate of coordinates) {
    const matches = parsed.filter(item => item.ref?.sourceRow === coordinate.sourceRow
      && item.ref.locationCode === coordinate.locationCode)
    const rowMatches = parsed.filter(item => item.ref?.sourceRow === coordinate.sourceRow)
    const codeMatches = parsed.filter(item => item.ref?.locationCode === coordinate.locationCode)
    const base = {
      sourceRow: coordinate.sourceRow,
      locationCode: coordinate.locationCode,
      name: coordinate.name
    }

    if (matches.length !== 1 || rowMatches.length !== 1 || codeMatches.length !== 1) {
      conflicts.push({
        ...base,
        reason: matches.length > 1 || rowMatches.length > 1 || codeMatches.length > 1
          ? 'More than one backend place matches this AMap source row or location code'
          : 'No uniquely bound backend draft exists; run pnpm amap:drafts --apply first',
        existingPlaceId: matches[0]?.place.id ?? rowMatches[0]?.place.id ?? codeMatches[0]?.place.id
      })
      continue
    }

    const place = matches[0]!.place
    if (place.name !== coordinate.name) {
      conflicts.push({ ...base, reason: 'Backend place name no longer matches the reviewed AMap coordinate input', existingPlaceId: place.id })
      continue
    }
    if (place.status === 'published' || place.coordinateVerification === 'verified') {
      conflicts.push({ ...base, reason: 'Refusing to overwrite a published or verified place coordinate', existingPlaceId: place.id })
      continue
    }
    const alreadySynced = place.longitude === coordinate.lng
      && place.latitude === coordinate.lat
      && place.coordinateSystem === 'GCJ-02'
      && place.coordinateVerification === 'unverified'
      && place.externalMapUrl === markerUrl(coordinate)
    const hasConflictingCoordinate = place.longitude !== null
      && place.latitude !== null
      && (place.longitude !== coordinate.lng
        || place.latitude !== coordinate.lat
        || place.coordinateSystem !== 'GCJ-02')
    if (hasConflictingCoordinate) {
      conflicts.push({ ...base, reason: 'Backend place already has a different non-empty coordinate', existingPlaceId: place.id })
      continue
    }
    if (alreadySynced) {
      skipped += 1
      continue
    }
    updates.push({ place, coordinate })
  }

  return { updates, skipped, conflicts }
}

export function syncAmapOwnerCoordinates(options: SyncOptions = {}): SyncOwnerCoordinateResult {
  const apply = options.apply === true
  const databasePath = absolutePath(options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite')
  const rawPath = absolutePath(options.rawPath ?? DEFAULT_RAW_PATH)
  const coordinatePath = absolutePath(options.coordinatePath ?? DEFAULT_COORDINATE_PATH)
  const now = options.now ?? Date.now()
  assertSync(Number.isInteger(now) && now >= 0, 'now must be a non-negative integer timestamp')
  assertSync(databasePath !== ':memory:', 'Owner coordinate sync requires a file-backed SQLite database')
  assertSync(existsSync(databasePath), `Target database does not exist: ${databasePath}`)
  const markers = parseAmapMarkers(loadJson(rawPath, 'Reviewed raw AMap import')) as Marker[]
  const coordinates = validateOwnerCoordinates(loadJson(coordinatePath, 'Owner AMap coordinate input'), markers)

  const database = new BetterSqlite3(databasePath, { readonly: !apply, fileMustExist: true })
  try {
    database.pragma('foreign_keys = ON')
    const plan = buildPlan(database, coordinates)
    if (!apply || plan.conflicts.length) {
      return {
        mode: apply ? 'apply' : 'dry-run',
        databasePath,
        coordinatePath,
        coordinateCount: coordinates.length,
        updated: 0,
        wouldUpdate: plan.updates.length,
        skipped: plan.skipped,
        conflicts: plan.conflicts.length,
        applied: false,
        conflictDetails: plan.conflicts
      }
    }

    const update = database.prepare(`
      UPDATE places
      SET longitude = @longitude,
          latitude = @latitude,
          coordinate_system = 'GCJ-02',
          coordinate_verification = 'unverified',
          coordinate_verified_at = NULL,
          coordinate_point_role = NULL,
          external_map_url = @externalMapUrl,
          summary = @summary,
          body = @body,
          updated_at = @now
      WHERE id = @id
    `)
    database.exec('BEGIN IMMEDIATE')
    let updated = 0
    try {
      for (const item of plan.updates) {
        const result = update.run({
          id: item.place.id,
          longitude: item.coordinate.lng,
          latitude: item.coordinate.lat,
          externalMapUrl: markerUrl(item.coordinate),
          summary: friendlySummary(item.coordinate.name),
          body: [
            friendlySummary(item.coordinate.name),
            '',
            `高德 resourceId：${item.coordinate.resourceId}`,
            `坐标来源：${item.coordinate.coordinateSource}`,
            '发布提醒：该坐标为高德 GCJ-02 原坐标，后台可维护和定位；正式公开发布仍需要按项目规则补充有效来源和独立核验。'
          ].join('\n'),
          now
        })
        assertSync(result.changes === 1, `Failed to update ${item.coordinate.name}`)
        updated += result.changes
      }
      database.exec('COMMIT')
    } catch (error) {
      if (database.inTransaction) database.exec('ROLLBACK')
      throw error
    }

    return {
      mode: 'apply',
      databasePath,
      coordinatePath,
      coordinateCount: coordinates.length,
      updated,
      wouldUpdate: plan.updates.length,
      skipped: plan.skipped,
      conflicts: 0,
      applied: true,
      conflictDetails: []
    }
  } finally {
    database.close()
  }
}

function usage(): string {
  return [
    'Usage: pnpm tsx scripts/sync-amap-owner-coordinates.ts [--dry-run] [--apply] [--database PATH] [--coordinates PATH]',
    '',
    'Default mode is read-only dry-run.',
    'This sync writes owner-authorized AMap GCJ-02 coordinates to matching backend draft places as unverified coordinates.',
    'It never publishes a place and refuses to overwrite published, verified, or conflicting coordinates.'
  ].join('\n')
}

function parseCliArgs(argv: string[]): SyncOptions & { help: boolean } {
  const options: SyncOptions & { help: boolean } = { apply: false, help: false }
  let dryRunExplicit = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument === '--apply') {
      assertSync(!dryRunExplicit, '--apply cannot be combined with --dry-run')
      options.apply = true
    } else if (argument === '--dry-run') {
      assertSync(options.apply !== true, '--dry-run cannot be combined with --apply')
      dryRunExplicit = true
    } else if (argument === '--database' || argument === '--coordinates' || argument === '--raw') {
      const value = argv[index + 1]
      assertSync(value && !value.startsWith('-'), `${argument} requires a path`)
      if (argument === '--database') options.databasePath = value
      else if (argument === '--coordinates') options.coordinatePath = value
      else options.rawPath = value
      index += 1
    } else {
      throw new SyncOwnerCoordinateError(`Unknown argument: ${argument}`)
    }
  }
  return options
}

export function runCli(argv: string[], io: CliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
}): number {
  try {
    const options = parseCliArgs(argv)
    if (options.help) {
      io.stdout(`${usage()}\n`)
      return 0
    }
    const result = syncAmapOwnerCoordinates(options)
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

if (executedDirectly) process.exitCode = runCli(process.argv.slice(2))
