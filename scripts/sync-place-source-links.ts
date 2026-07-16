import './load-env'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import {
  expectedPlaceSourceLinkCount,
  placeSourceLinkSeeds
} from '../data/seeds/place-source-links'

interface SyncOptions {
  apply?: boolean
  databasePath?: string
  now?: number
}

interface Conflict {
  sourceUrl: string
  placeName?: string
  reason: string
}

export interface SyncPlaceSourceLinksResult {
  mode: 'dry-run' | 'apply'
  databasePath: string
  seedLinks: number
  inserted: number
  wouldInsert: number
  skipped: number
  conflicts: number
  coveredPlaces: number
  applied: boolean
  conflictDetails: Conflict[]
}

interface SourceRow {
  id: string
  url: string
  sourceLevel: string
  isOfficial: number
  status: string
}

interface PlaceRow {
  id: string
  name: string
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export class SyncPlaceSourceLinksError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncPlaceSourceLinksError'
  }
}

function assertSync(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SyncPlaceSourceLinksError(message)
}

function absolutePath(value: string): string {
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function requireColumns(database: BetterSqlite3.Database, table: string, required: string[]): void {
  const columns = new Set((database.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>)
    .map(column => column.name))
  const missing = required.filter(column => !columns.has(column))
  assertSync(missing.length === 0, `Database table ${table} is missing required columns: ${missing.join(', ')}`)
}

export function syncPlaceSourceLinks(options: SyncOptions = {}): SyncPlaceSourceLinksResult {
  const databasePath = absolutePath(options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite')
  const apply = options.apply === true
  const now = options.now ?? Date.now()
  assertSync(existsSync(databasePath), `Target database does not exist: ${databasePath}; initialize it first`)
  assertSync(Number.isInteger(now) && now >= 0, 'now must be a non-negative integer timestamp')

  const database = new BetterSqlite3(databasePath, {
    readonly: !apply,
    fileMustExist: true
  })
  try {
    if (!apply) database.pragma('query_only = ON')
    requireColumns(database, 'sources', ['id', 'url', 'source_level', 'is_official', 'status'])
    requireColumns(database, 'places', ['id', 'name'])
    requireColumns(database, 'place_sources', ['place_id', 'source_id', 'is_primary', 'created_at'])

    const sources = database.prepare(`
      SELECT id, url, source_level AS sourceLevel,
             is_official AS isOfficial, status
      FROM sources
    `).all() as SourceRow[]
    const places = database.prepare('SELECT id, name FROM places').all() as PlaceRow[]
    const sourceByUrl = new Map(sources.map(source => [source.url, source]))
    const placesByName = new Map<string, PlaceRow[]>()
    for (const place of places) {
      const matches = placesByName.get(place.name) ?? []
      matches.push(place)
      placesByName.set(place.name, matches)
    }

    const conflicts: Conflict[] = []
    const planned: Array<{ placeId: string, sourceId: string }> = []
    const coveredPlaceIds = new Set<string>()
    const seenPairs = new Set<string>()

    for (const seed of placeSourceLinkSeeds) {
      const source = sourceByUrl.get(seed.sourceUrl)
      if (!source) {
        conflicts.push({ sourceUrl: seed.sourceUrl, reason: 'Source URL is missing from the catalog' })
        continue
      }
      if (source.status !== 'active' || source.isOfficial !== 1 || !['A', 'B'].includes(source.sourceLevel)) {
        conflicts.push({ sourceUrl: seed.sourceUrl, reason: 'Source is not an active official A/B source' })
        continue
      }
      for (const placeName of seed.placeNames) {
        const matches = placesByName.get(placeName) ?? []
        if (matches.length !== 1) {
          conflicts.push({
            sourceUrl: seed.sourceUrl,
            placeName,
            reason: matches.length === 0 ? 'Place name is missing' : 'Place name is not unique'
          })
          continue
        }
        const place = matches[0]!
        const pair = `${place.id}\0${source.id}`
        assertSync(!seenPairs.has(pair), `Duplicate place/source seed pair: ${placeName} / ${seed.sourceUrl}`)
        seenPairs.add(pair)
        coveredPlaceIds.add(place.id)
        planned.push({ placeId: place.id, sourceId: source.id })
      }
    }

    const exists = database.prepare('SELECT 1 FROM place_sources WHERE place_id = ? AND source_id = ?')
    const pending = planned.filter(link => !exists.get(link.placeId, link.sourceId))
    const skipped = planned.length - pending.length

    if (conflicts.length > 0 || !apply) {
      return {
        mode: apply ? 'apply' : 'dry-run',
        databasePath,
        seedLinks: expectedPlaceSourceLinkCount,
        inserted: 0,
        wouldInsert: pending.length,
        skipped,
        conflicts: conflicts.length,
        coveredPlaces: coveredPlaceIds.size,
        applied: false,
        conflictDetails: conflicts
      }
    }

    const insert = database.prepare(`
      INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
      VALUES (?, ?, 0, ?)
    `)
    database.exec('BEGIN IMMEDIATE')
    try {
      for (const link of pending) insert.run(link.placeId, link.sourceId, now)
      database.exec('COMMIT')
    } catch (error) {
      if (database.inTransaction) database.exec('ROLLBACK')
      throw error
    }

    return {
      mode: 'apply',
      databasePath,
      seedLinks: expectedPlaceSourceLinkCount,
      inserted: pending.length,
      wouldInsert: pending.length,
      skipped,
      conflicts: 0,
      coveredPlaces: coveredPlaceIds.size,
      applied: true,
      conflictDetails: []
    }
  } finally {
    database.close()
  }
}

function usage(): string {
  return [
    'Usage: pnpm map:sources:sync [--dry-run] [--apply] [--database PATH]',
    '',
    'Default mode is read-only dry-run. The script only adds reviewed official source links.',
    'It never changes place facts, coordinates, verification timestamps, or publication status.'
  ].join('\n')
}

function parseCliArgs(argv: string[]): SyncOptions & { help: boolean } {
  const options: SyncOptions & { help: boolean } = { apply: false, help: false }
  let dryRunExplicit = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--apply') {
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
    } else throw new SyncPlaceSourceLinksError(`Unknown argument: ${argument}`)
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
    const result = syncPlaceSourceLinks(options)
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
