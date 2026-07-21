import './load-env'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import { classifyMarker } from './import-amap-drafts'

const RAW_FILE_NAME = 'amap-workmap-2026-07-13.raw.json'
const DRAFT_IMPORTER_ID = 'amap-workmap-draft-v1'
const TARGET_SHEET_NAME = '标记位置'
const EXPECTED_COUNT = 76
const LOCATION_CODE_RE = /^WIA-\d+\.\d+,\d+\.\d+$/
const REVIEWED_CATEGORIES = new Set([
  'campus-building',
  'dorm',
  'food',
  'service',
  'express',
  'gate',
  'nearby'
])

interface ManagedPlace {
  id: string
  name: string
  category: string | null
  status: string
  sourceRawRef: string | null
}

interface DraftReference {
  sourceRow: number
  locationCode: string
}

interface ReviewedClassification {
  sourceRow: number
  locationCode: string
  name: string
  category: string
  legacyCategory: string | null
}

export interface SyncOwnerClassificationConflict {
  sourceRow: number | null
  locationCode: string | null
  name: string | null
  reason: string
  existingPlaceId?: string
}

export interface SyncOwnerClassificationResult {
  mode: 'dry-run' | 'apply'
  databasePath: string
  classificationCount: number
  updated: number
  wouldUpdate: number
  skipped: number
  conflicts: number
  applied: boolean
  conflictDetails: SyncOwnerClassificationConflict[]
}

interface SyncOptions {
  apply?: boolean
  databasePath?: string
  now?: number
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export class SyncOwnerClassificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncOwnerClassificationError'
  }
}

function assertSync(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SyncOwnerClassificationError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function absolutePath(path: string): string {
  if (path === ':memory:') return path
  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

function parseDraftReference(value: string | null): DraftReference | null {
  if (!value) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    return null
  }
  if (!isRecord(parsed)
    || parsed.importer !== DRAFT_IMPORTER_ID
    || parsed.file !== RAW_FILE_NAME
    || parsed.sheet !== TARGET_SHEET_NAME
    || !Number.isInteger(parsed.sourceRow)
    || typeof parsed.locationCode !== 'string'
    || !LOCATION_CODE_RE.test(parsed.locationCode)) return null
  return {
    sourceRow: Number(parsed.sourceRow),
    locationCode: parsed.locationCode
  }
}

function reviewedClassifications(): ReviewedClassification[] {
  assertSync(amapImportedPlaces.length === EXPECTED_COUNT, `Reviewed map catalog must contain exactly ${EXPECTED_COUNT} places`)
  const sourceRows = new Set<number>()
  const locationCodes = new Set<string>()
  return amapImportedPlaces.map((place) => {
    assertSync(Number.isInteger(place.sourceRow), `${place.name}: sourceRow must be an integer`)
    assertSync(!sourceRows.has(place.sourceRow), `${place.name}: duplicate sourceRow ${place.sourceRow}`)
    assertSync(LOCATION_CODE_RE.test(place.locationCode), `${place.name}: invalid WIA locationCode`)
    assertSync(!locationCodes.has(place.locationCode), `${place.name}: duplicate WIA locationCode`)
    assertSync(REVIEWED_CATEGORIES.has(place.category), `${place.name}: unsupported reviewed category ${place.category}`)
    sourceRows.add(place.sourceRow)
    locationCodes.add(place.locationCode)
    return {
      sourceRow: place.sourceRow,
      locationCode: place.locationCode,
      name: place.name,
      category: place.category,
      legacyCategory: classifyMarker(place.name).category
    }
  })
}

function buildPlan(database: BetterSqlite3.Database, reviewed: ReviewedClassification[]) {
  const places = database.prepare(`
    SELECT id, name, category, status, source_raw_ref AS sourceRawRef
    FROM places
  `).all() as ManagedPlace[]
  const parsed = places.map(place => ({ place, ref: parseDraftReference(place.sourceRawRef) }))
  const updates: Array<{ place: ManagedPlace, reviewed: ReviewedClassification }> = []
  const conflicts: SyncOwnerClassificationConflict[] = []
  let skipped = 0

  for (const item of reviewed) {
    const exactMatches = parsed.filter(candidate =>
      candidate.ref?.sourceRow === item.sourceRow
      && candidate.ref.locationCode === item.locationCode
    )
    const rowMatches = parsed.filter(candidate => candidate.ref?.sourceRow === item.sourceRow)
    const codeMatches = parsed.filter(candidate => candidate.ref?.locationCode === item.locationCode)
    const base = {
      sourceRow: item.sourceRow,
      locationCode: item.locationCode,
      name: item.name
    }

    if (exactMatches.length !== 1 || rowMatches.length !== 1 || codeMatches.length !== 1) {
      conflicts.push({
        ...base,
        reason: exactMatches.length > 1 || rowMatches.length > 1 || codeMatches.length > 1
          ? 'More than one backend place matches this AMap source row or location code'
          : 'No uniquely bound backend draft exists; run pnpm amap:drafts --apply first',
        existingPlaceId: exactMatches[0]?.place.id ?? rowMatches[0]?.place.id ?? codeMatches[0]?.place.id
      })
      continue
    }

    const place = exactMatches[0]!.place
    if (place.name !== item.name) {
      conflicts.push({
        ...base,
        reason: 'Backend place name no longer matches the reviewed AMap catalog',
        existingPlaceId: place.id
      })
      continue
    }
    if (place.category === item.category) {
      skipped += 1
      continue
    }
    if (place.status === 'archived') {
      conflicts.push({
        ...base,
        reason: 'Refusing to change the category of an archived place',
        existingPlaceId: place.id
      })
      continue
    }
    if (place.category !== item.legacyCategory) {
      conflicts.push({
        ...base,
        reason: 'Backend category no longer matches the legacy importer value; review the manual change',
        existingPlaceId: place.id
      })
      continue
    }
    updates.push({ place, reviewed: item })
  }

  return { updates, skipped, conflicts }
}

export function syncAmapOwnerClassifications(options: SyncOptions = {}): SyncOwnerClassificationResult {
  const apply = options.apply === true
  const databasePath = absolutePath(options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite')
  const now = options.now ?? Date.now()
  assertSync(Number.isInteger(now) && now >= 0, 'now must be a non-negative integer timestamp')
  assertSync(databasePath !== ':memory:', 'Owner classification sync requires a file-backed SQLite database')
  assertSync(existsSync(databasePath), `Target database does not exist: ${databasePath}`)
  const reviewed = reviewedClassifications()
  const database = new BetterSqlite3(databasePath, { readonly: !apply, fileMustExist: true })

  try {
    const plan = buildPlan(database, reviewed)
    if (!apply || plan.conflicts.length) {
      return {
        mode: apply ? 'apply' : 'dry-run',
        databasePath,
        classificationCount: reviewed.length,
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
      SET category = @category,
          updated_at = @now
      WHERE id = @id
        AND category IS @legacyCategory
        AND status IN ('draft', 'published')
    `)
    database.exec('BEGIN IMMEDIATE')
    let updated = 0
    try {
      for (const item of plan.updates) {
        const result = update.run({
          id: item.place.id,
          category: item.reviewed.category,
          legacyCategory: item.reviewed.legacyCategory,
          now
        })
        assertSync(result.changes === 1, `Failed to update ${item.reviewed.name}`)
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
      classificationCount: reviewed.length,
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
    'Usage: pnpm map:owner:classifications [--dry-run] [--apply] [--database PATH]',
    '',
    'Default mode is read-only dry-run.',
    'This sync applies the reviewed categories for the 76 owner-map draft places.',
    'It only replaces legacy importer values and stops on archived or manually changed records.'
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
    } else if (argument === '--database') {
      const value = argv[index + 1]
      assertSync(value && !value.startsWith('-'), '--database requires a path')
      options.databasePath = value
      index += 1
    } else {
      throw new SyncOwnerClassificationError(`Unknown argument: ${argument}`)
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
    const result = syncAmapOwnerClassifications(options)
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
