import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import { procedureSeeds } from '../data/seeds/procedures'
import { verifyPassword } from '../server/utils/password'
import { buildCatalogSeed } from './seed-public-catalog'

export interface LiveDataParityOptions {
  databasePath: string
  adminUsername?: string
  adminPassword?: string
}

export interface LiveDataParityFailure {
  scope: string
  message: string
}

export interface LiveDataParityResult {
  databasePath: string
  ok: boolean
  counts?: {
    sources: number
    activeSources: number
    unavailableSources: number
    publishedContents: number
    procedures: number
    procedureSteps: number
    amapDraftPlaces: number
  }
  admin?: {
    username: string
    passwordVerified: boolean | null
  }
  failures: LiveDataParityFailure[]
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

function parseArgs(argv: string[]): LiveDataParityOptions & { help: boolean } {
  const options: LiveDataParityOptions & { help: boolean } = {
    help: false,
    databasePath: process.env.NUXT_DATABASE_PATH || '.data/codex-map-content-20260713.sqlite'
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--database') {
      const value = argv[index + 1]
      if (!value) throw new Error('--database requires a path')
      options.databasePath = value
      index += 1
    } else if (argument === '--admin-user') {
      const value = argv[index + 1]
      if (!value) throw new Error('--admin-user requires a value')
      options.adminUsername = value
      index += 1
    } else if (argument === '--admin-password') {
      const value = argv[index + 1]
      if (!value) throw new Error('--admin-password requires a value')
      options.adminPassword = value
      index += 1
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  return options
}

function fail(failures: LiveDataParityFailure[], scope: string, message: string): void {
  failures.push({ scope, message })
}

function sameNumber(left: number | null, right: number, epsilon = 0.00000001): boolean {
  return left !== null && Math.abs(left - right) < epsilon
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

function sourceUrlList(database: InstanceType<typeof Database>, contentId: string): string[] {
  return database.prepare(`
    SELECT source.url
    FROM content_sources AS relation
    INNER JOIN sources AS source ON source.id = relation.source_id
    WHERE relation.content_id = ?
    ORDER BY relation.is_primary DESC, source.url
  `).all(contentId)
    .map(row => canonicalUrl((row as { url: string }).url))
    .filter((value): value is string => value !== null)
}

function sourceReference(value: string | null): { sourceRow?: number, locationCode?: string } | null {
  if (!value) return null
  try {
    return JSON.parse(value) as { sourceRow?: number, locationCode?: string }
  } catch {
    return null
  }
}

export async function verifyLiveDataParity(options: LiveDataParityOptions): Promise<LiveDataParityResult> {
  const databasePath = resolve(options.databasePath)
  const failures: LiveDataParityFailure[] = []

  if (!existsSync(databasePath)) {
    fail(failures, 'database', `Database does not exist: ${databasePath}`)
    return { databasePath, ok: false, failures }
  }

  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    database.pragma('query_only = ON')

    const catalog = buildCatalogSeed()
    const sourceRows = database.prepare(`
      SELECT title, url, status
      FROM sources
      ORDER BY url
    `).all() as Array<{ title: string, url: string, status: string }>
    const expectedSourcesByUrl = new Map(catalog.sources.map(source => [canonicalUrl(source.url), source]))
    const sourceRowsByUrl = new Map(sourceRows.map(row => [canonicalUrl(row.url), row]))
    if (sourceRows.length !== catalog.sources.length) {
      fail(failures, 'sources', `Expected ${catalog.sources.length} source records, found ${sourceRows.length}`)
    }
    for (const source of catalog.sources) {
      const key = canonicalUrl(source.url)
      if (!key) {
        fail(failures, 'sources', `Seed source has invalid URL: ${source.title}`)
        continue
      }
      const row = sourceRowsByUrl.get(key)
      if (!row) {
        fail(failures, 'sources', `Missing source ${source.title}`)
        continue
      }
      if (!row.title.trim()) fail(failures, 'sources', `Source ${source.url} has empty title`)
      if (row.title !== source.title) fail(failures, 'sources', `Source ${source.url} title drifted`)
      if (row.status !== source.status) fail(failures, 'sources', `Source ${source.url} status drifted: ${row.status} != ${source.status}`)
    }
    for (const row of sourceRows) {
      const key = canonicalUrl(row.url)
      if (!key) fail(failures, 'sources', `Source ${row.title || '(untitled)'} has invalid URL`)
      else if (!expectedSourcesByUrl.has(key)) fail(failures, 'sources', `Unexpected source URL in database: ${row.url}`)
      if (!row.title.trim()) fail(failures, 'sources', `Source ${row.url} has empty title`)
      if (row.status !== 'active' && row.status !== 'unavailable') fail(failures, 'sources', `Source ${row.url} has unsupported status ${row.status}`)
    }

    const expectedContents = catalog.contents.filter(content => (
      content.status === 'published'
      && (content.kind === 'guide' || content.kind === 'department' || content.kind === 'club')
    ))
    const contentRows = database.prepare(`
      SELECT id, kind, slug, title, summary, body, status, metadata_json AS metadataJson
      FROM contents
      WHERE kind IN ('guide', 'department', 'club')
      ORDER BY kind, slug
    `).all() as Array<{
      id: string
      kind: string
      slug: string
      title: string
      summary: string
      body: string
      status: string
      metadataJson: string | null
    }>
    const contentByKey = new Map(contentRows.map(row => [`${row.kind}:${row.slug}`, row]))
    const publishedContents = contentRows.filter(row => row.status === 'published')
    if (publishedContents.length !== expectedContents.length) {
      fail(failures, 'contents', `Expected ${expectedContents.length} published guide/department/club records, found ${publishedContents.length}`)
    }
    for (const expected of expectedContents) {
      const key = `${expected.kind}:${expected.slug}`
      const row = contentByKey.get(key)
      if (!row) {
        fail(failures, 'contents', `Missing content ${key}`)
        continue
      }
      if (row.status !== 'published') fail(failures, 'contents', `${key} is ${row.status}, expected published`)
      if (row.title !== expected.title) fail(failures, 'contents', `${key} title drifted`)
      if (row.summary !== expected.summary) fail(failures, 'contents', `${key} summary drifted`)
      if (row.body !== expected.body) fail(failures, 'contents', `${key} body drifted`)
      if (row.summary.trim().length < 25) fail(failures, 'contents', `${key} summary is too short for public search/list cards`)
      if (row.body.trim().length < 120) fail(failures, 'contents', `${key} body is too short for public detail page`)
      const actualSourceUrls = sourceUrlList(database, row.id).sort()
      const expectedSourceUrls = expected.sourceUrls
        .map(url => canonicalUrl(url))
        .filter((value): value is string => value !== null)
        .sort()
      if (actualSourceUrls.length < 1) fail(failures, 'contents', `${key} has no source links`)
      if (JSON.stringify(actualSourceUrls) !== JSON.stringify(expectedSourceUrls)) {
        fail(failures, 'contents', `${key} source links drifted`)
      }
    }

    const procedureRows = database.prepare(`
      SELECT id, slug, title, summary, body, status, status_text AS statusText
      FROM procedures
      ORDER BY slug
    `).all() as Array<{ id: string, slug: string, title: string, summary: string, body: string, status: string, statusText: string }>
    const procedureBySlug = new Map(procedureRows.map(row => [row.slug, row]))
    if (procedureRows.filter(row => row.status === 'published').length !== procedureSeeds.length) {
      fail(failures, 'procedures', `Expected ${procedureSeeds.length} published procedures`)
    }
    for (const expected of procedureSeeds) {
      const row = procedureBySlug.get(expected.slug)
      if (!row) {
        fail(failures, 'procedures', `Missing procedure ${expected.slug}`)
        continue
      }
      if (row.status !== 'published') fail(failures, 'procedures', `${expected.slug} is ${row.status}, expected published`)
      if (row.title !== expected.title) fail(failures, 'procedures', `${expected.slug} title drifted`)
      if (row.summary !== expected.summary) fail(failures, 'procedures', `${expected.slug} summary drifted`)
      if (row.body !== expected.body) fail(failures, 'procedures', `${expected.slug} body drifted`)
      if (row.statusText !== expected.statusText) fail(failures, 'procedures', `${expected.slug} status text drifted`)
      const stepCount = database.prepare('SELECT COUNT(*) AS count FROM procedure_steps WHERE procedure_id = ?').get(row.id) as { count: number }
      const materialCount = database.prepare('SELECT COUNT(*) AS count FROM procedure_materials WHERE procedure_id = ?').get(row.id) as { count: number }
      if (stepCount.count !== expected.steps.length) fail(failures, 'procedures', `${expected.slug} step count drifted: ${stepCount.count} != ${expected.steps.length}`)
      if (materialCount.count !== expected.materials.length) fail(failures, 'procedures', `${expected.slug} material count drifted: ${materialCount.count} != ${expected.materials.length}`)
      const actualSources = database.prepare(`
        SELECT source.url, relation.claim_scope AS claimScope, relation.is_primary AS isPrimary
        FROM procedure_sources AS relation
        INNER JOIN sources AS source ON source.id = relation.source_id
        WHERE relation.procedure_id = ?
        ORDER BY relation.sort_order
      `).all(row.id) as Array<{ url: string, claimScope: string, isPrimary: number }>
      const expectedSources = expected.sources.map(source => ({
        url: canonicalUrl(source.url),
        claimScope: source.claimScope,
        isPrimary: source.isPrimary ? 1 : 0
      }))
      const normalizedActualSources = actualSources.map(source => ({
        url: canonicalUrl(source.url),
        claimScope: source.claimScope,
        isPrimary: source.isPrimary
      }))
      if (JSON.stringify(normalizedActualSources) !== JSON.stringify(expectedSources)) {
        fail(failures, 'procedures', `${expected.slug} source links drifted`)
      }
    }

    const draftRows = database.prepare(`
      SELECT name, category, longitude, latitude, coordinate_system AS coordinateSystem,
             coordinate_verification AS coordinateVerification, status, source_raw_ref AS sourceRawRef
      FROM places
      WHERE source_raw_ref LIKE '%amap-workmap-draft-v1%'
      ORDER BY name
    `).all() as Array<{
      name: string
      category: string | null
      longitude: number | null
      latitude: number | null
      coordinateSystem: string | null
      coordinateVerification: string
      status: string
      sourceRawRef: string | null
    }>
    const frontendBySourceRow = new Map(amapImportedPlaces.map(place => [place.sourceRow, place]))
    if (draftRows.length !== amapImportedPlaces.length) {
      fail(failures, 'places', `Expected ${amapImportedPlaces.length} AMap draft places, found ${draftRows.length}`)
    }
    for (const row of draftRows) {
      const ref = sourceReference(row.sourceRawRef)
      const expected = ref?.sourceRow ? frontendBySourceRow.get(ref.sourceRow) : undefined
      if (!expected) {
        fail(failures, 'places', `${row.name} has invalid AMap source reference`)
        continue
      }
      if (row.name !== expected.name) fail(failures, 'places', `AMap row ${expected.sourceRow} name drifted: ${row.name} != ${expected.name}`)
      if (ref?.locationCode !== expected.locationCode) fail(failures, 'places', `AMap row ${expected.sourceRow} location code drifted`)
      if (row.category !== expected.category) fail(failures, 'places', `${expected.name} category drifted: ${row.category ?? 'null'} != ${expected.category}`)
      if (!sameNumber(row.longitude, expected.sourcePoint.lng)) fail(failures, 'places', `${expected.name} longitude drifted`)
      if (!sameNumber(row.latitude, expected.sourcePoint.lat)) fail(failures, 'places', `${expected.name} latitude drifted`)
      if (row.coordinateSystem !== 'GCJ-02') fail(failures, 'places', `${expected.name} coordinate system must stay GCJ-02`)
      if (row.coordinateVerification !== 'unverified') fail(failures, 'places', `${expected.name} must stay unverified until independent field verification`)
      if (row.status !== 'draft') fail(failures, 'places', `${expected.name} must stay draft until publish gates are met`)
    }

    let adminVerified: boolean | null = null
    if (options.adminUsername || options.adminPassword) {
      if (!options.adminUsername || !options.adminPassword) {
        fail(failures, 'admin', 'Both --admin-user and --admin-password are required to verify login credentials')
      } else {
        const row = database.prepare(`
          SELECT username, password_hash AS passwordHash, is_active AS isActive
          FROM admin_users
          WHERE username = ?
        `).get(options.adminUsername) as { username: string, passwordHash: string, isActive: number } | undefined
        if (!row) {
          fail(failures, 'admin', `Admin user ${options.adminUsername} does not exist`)
        } else if (!row.isActive) {
          fail(failures, 'admin', `Admin user ${options.adminUsername} is inactive`)
        } else {
          adminVerified = await verifyPassword(options.adminPassword, row.passwordHash)
          if (!adminVerified) fail(failures, 'admin', `Admin user ${options.adminUsername} password verification failed`)
        }
      }
    }

    const result = {
      databasePath,
      ok: failures.length === 0,
      counts: {
        sources: sourceRows.length,
        activeSources: sourceRows.filter(row => row.status === 'active').length,
        unavailableSources: sourceRows.filter(row => row.status === 'unavailable').length,
        publishedContents: publishedContents.length,
        procedures: procedureRows.filter(row => row.status === 'published').length,
        procedureSteps: (database.prepare('SELECT COUNT(*) AS count FROM procedure_steps').get() as { count: number }).count,
        amapDraftPlaces: draftRows.length
      },
      admin: options.adminUsername
        ? {
            username: options.adminUsername,
            passwordVerified: adminVerified
          }
        : undefined,
      failures
    }
    return result
  } finally {
    database.close()
  }
}

export async function runCli(argv: string[], io: CliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
}): Promise<number> {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      io.stdout('Usage: pnpm data:verify [--database PATH] [--admin-user USER --admin-password PASSWORD]\n')
      return 0
    }
    const result = await verifyLiveDataParity(options)
    io.stdout(`${JSON.stringify(result, null, 2)}\n`)
    return result.ok ? 0 : 1
  } catch (error) {
    io.stderr(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`)
    return 2
  }
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectRun) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
