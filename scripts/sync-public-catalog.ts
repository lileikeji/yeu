import './load-env'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { buildCatalogSeed } from './seed-public-catalog'

const IMPORTER_ID = 'public-catalog-seed'
const CONTENT_MARKER_KEY = 'catalogSeed'

type Catalog = ReturnType<typeof buildCatalogSeed>
type CatalogSource = Catalog['sources'][number]
type CatalogContent = Catalog['contents'][number]

interface PlannedSource extends CatalogSource {
  id: string
}

interface PlannedContent extends CatalogContent {
  id: string
  existingPublishedAt: number | null
}

interface SyncPlan {
  createSources: PlannedSource[]
  createContents: PlannedContent[]
  updateContents: PlannedContent[]
  sourceIdsByUrl: Map<string, string>
  skippedContents: number
  conflicts: string[]
}

export interface CatalogSyncOptions {
  databasePath?: string
  applyOwned?: boolean
  now?: number
}

export interface CatalogSyncResult {
  mode: 'dry-run' | 'apply-owned'
  databasePath: string
  wouldCreateSources: number
  wouldCreateContents: number
  wouldUpdateContents: number
  createdSources: number
  createdContents: number
  updatedContents: number
  skippedContents: number
  conflicts: string[]
  applied: boolean
}

export class CatalogSyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogSyncError'
  }
}

function absolutePath(value: string): string {
  if (value === ':memory:') return value
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function canonicalUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

function contentKey(kind: string, slug: string): string {
  return `${kind.trim().toLowerCase()}:${slug.trim().toLowerCase()}`
}

function isSeedOwnedSource(notes: string | null): boolean {
  return Boolean(notes?.includes(`[${IMPORTER_ID}:`))
}

function isSeedOwnedContent(metadataJson: string, expectedIdentity: string): boolean {
  try {
    const metadata = JSON.parse(metadataJson) as Record<string, unknown>
    const marker = metadata[CONTENT_MARKER_KEY]
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return false
    const record = marker as Record<string, unknown>
    return record.importer === IMPORTER_ID && record.identity === expectedIdentity
  } catch {
    return false
  }
}

function validateSchema(database: InstanceType<typeof BetterSqlite3>): void {
  for (const table of ['sources', 'contents', 'content_sources']) {
    const found = database.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)
    if (!found) throw new CatalogSyncError(`Target database is missing ${table}; run pnpm db:migrate first`)
  }
}

function buildPlan(database: InstanceType<typeof BetterSqlite3>, catalog: Catalog): SyncPlan {
  const existingSources = database.prepare(`
    SELECT id, url, notes, status FROM sources
  `).all() as Array<{ id: string, url: string, notes: string | null, status: string }>
  const existingContents = database.prepare(`
    SELECT id, kind, slug, title, summary, body, category, audience,
      metadata_json AS metadataJson, is_featured AS isFeatured, status,
      last_verified_at AS lastVerifiedAt, published_at AS publishedAt
    FROM contents
  `).all() as Array<{
    id: string
    kind: string
    slug: string
    title: string
    summary: string
    body: string
    category: string | null
    audience: string | null
    metadataJson: string
    isFeatured: number
    status: string
    lastVerifiedAt: number | null
    publishedAt: number | null
  }>
  const existingRelations = database.prepare(`
    SELECT relation.content_id AS contentId, source.url, relation.is_primary AS isPrimary
    FROM content_sources AS relation
    JOIN sources AS source ON source.id = relation.source_id
  `).all() as Array<{ contentId: string, url: string, isPrimary: number }>

  const sourcesByUrl = new Map(existingSources.map(source => [canonicalUrl(source.url), source]))
  const contentsByKey = new Map(existingContents.map(content => [contentKey(content.kind, content.slug), content]))
  const relationsByContent = new Map<string, Array<{ url: string, isPrimary: number }>>()
  for (const relation of existingRelations) {
    const list = relationsByContent.get(relation.contentId) ?? []
    list.push(relation)
    relationsByContent.set(relation.contentId, list)
  }

  const createSources: PlannedSource[] = []
  const createContents: PlannedContent[] = []
  const updateContents: PlannedContent[] = []
  const sourceIdsByUrl = new Map<string, string>()
  const conflicts: string[] = []
  let skippedContents = 0

  for (const source of catalog.sources) {
    const key = canonicalUrl(source.url)
    const existing = sourcesByUrl.get(key)
    if (!existing) {
      const planned = { ...source, id: randomUUID() }
      createSources.push(planned)
      sourceIdsByUrl.set(key, planned.id)
      continue
    }
    sourceIdsByUrl.set(key, existing.id)
    if (!isSeedOwnedSource(existing.notes)) {
      conflicts.push(`Source URL is not seed-owned: ${source.url}`)
    } else if (existing.status !== 'active') {
      conflicts.push(`Seed-owned source is not active: ${source.url}`)
    }
  }

  for (const content of catalog.contents) {
    const key = contentKey(content.kind, content.slug)
    const existing = contentsByKey.get(key)
    if (!existing) {
      createContents.push({ ...content, id: randomUUID(), existingPublishedAt: null })
      continue
    }
    if (!isSeedOwnedContent(existing.metadataJson, key)) {
      conflicts.push(`Content identity is not seed-owned: ${key}`)
      continue
    }

    const desiredMetadata = JSON.stringify(content.metadata)
    const desiredRelations = content.sourceUrls
      .map((url, index) => `${canonicalUrl(url)}|${index === 0 ? 1 : 0}`)
      .sort()
    const actualRelations = (relationsByContent.get(existing.id) ?? [])
      .map(relation => `${canonicalUrl(relation.url)}|${relation.isPrimary === 1 ? 1 : 0}`)
      .sort()
    const changed = existing.title !== content.title
      || existing.summary !== content.summary
      || existing.body !== content.body
      || existing.category !== content.category
      || existing.audience !== content.audience
      || existing.metadataJson !== desiredMetadata
      || existing.isFeatured !== (content.isFeatured ? 1 : 0)
      || existing.status !== content.status
      || existing.lastVerifiedAt !== content.lastVerifiedAt
      || JSON.stringify(actualRelations) !== JSON.stringify(desiredRelations)

    if (changed) {
      updateContents.push({ ...content, id: existing.id, existingPublishedAt: existing.publishedAt })
    } else {
      skippedContents += 1
    }
  }

  return {
    createSources,
    createContents,
    updateContents,
    sourceIdsByUrl,
    skippedContents,
    conflicts
  }
}

function applyPlan(database: InstanceType<typeof BetterSqlite3>, plan: SyncPlan, now: number) {
  const insertSource = database.prepare(`
    INSERT INTO sources (
      id, title, url, platform, publisher_name, source_level, is_official,
      published_at, accessed_at, notes, status, created_at, updated_at
    ) VALUES (
      @id, @title, @url, @platform, @publisherName, @sourceLevel, 1,
      @publishedAt, @accessedAt, @notes, @status, @now, @now
    )
  `)
  const insertContent = database.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, category, audience, metadata_json,
      is_featured, status, last_verified_at, published_at, created_at, updated_at
    ) VALUES (
      @id, @kind, @slug, @title, @summary, @body, @category, @audience, @metadataJson,
      @isFeatured, @status, @lastVerifiedAt, @publishedAt, @now, @now
    )
  `)
  const updateContent = database.prepare(`
    UPDATE contents SET
      title = @title,
      summary = @summary,
      body = @body,
      category = @category,
      audience = @audience,
      metadata_json = @metadataJson,
      is_featured = @isFeatured,
      status = @status,
      last_verified_at = @lastVerifiedAt,
      published_at = @publishedAt,
      updated_at = @now
    WHERE id = @id
  `)
  const deleteRelations = database.prepare('DELETE FROM content_sources WHERE content_id = ?')
  const insertRelation = database.prepare(`
    INSERT INTO content_sources (content_id, source_id, is_primary, created_at)
    VALUES (?, ?, ?, ?)
  `)

  for (const source of plan.createSources) insertSource.run({ ...source, now })

  const writeRelations = (content: PlannedContent) => {
    content.sourceUrls.forEach((url, index) => {
      const sourceId = plan.sourceIdsByUrl.get(canonicalUrl(url))
      if (!sourceId) throw new CatalogSyncError(`No source ID is available for ${content.kind}:${content.slug}`)
      insertRelation.run(content.id, sourceId, index === 0 ? 1 : 0, now)
    })
  }

  for (const content of plan.createContents) {
    insertContent.run({
      ...content,
      metadataJson: JSON.stringify(content.metadata),
      isFeatured: content.isFeatured ? 1 : 0,
      publishedAt: content.status === 'published' ? now : null,
      now
    })
    writeRelations(content)
  }

  for (const content of plan.updateContents) {
    updateContent.run({
      ...content,
      metadataJson: JSON.stringify(content.metadata),
      isFeatured: content.isFeatured ? 1 : 0,
      publishedAt: content.status === 'published' ? content.existingPublishedAt ?? now : null,
      now
    })
    deleteRelations.run(content.id)
    writeRelations(content)
  }

  return {
    createdSources: plan.createSources.length,
    createdContents: plan.createContents.length,
    updatedContents: plan.updateContents.length
  }
}

export function syncPublicCatalog(options: CatalogSyncOptions = {}): CatalogSyncResult {
  const applyOwned = options.applyOwned === true
  const databasePath = absolutePath(options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite')
  if (databasePath === ':memory:' || !existsSync(databasePath)) {
    throw new CatalogSyncError(`Target database does not exist: ${databasePath}`)
  }
  const catalog = buildCatalogSeed()
  const database = new BetterSqlite3(databasePath, { readonly: !applyOwned, fileMustExist: true })
  try {
    database.pragma('foreign_keys = ON')
    validateSchema(database)
    if (!applyOwned) {
      const plan = buildPlan(database, catalog)
      return {
        mode: 'dry-run',
        databasePath,
        wouldCreateSources: plan.createSources.length,
        wouldCreateContents: plan.createContents.length,
        wouldUpdateContents: plan.updateContents.length,
        createdSources: 0,
        createdContents: 0,
        updatedContents: 0,
        skippedContents: plan.skippedContents,
        conflicts: plan.conflicts,
        applied: false
      }
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      const plan = buildPlan(database, catalog)
      if (plan.conflicts.length) {
        database.exec('ROLLBACK')
        return {
          mode: 'apply-owned',
          databasePath,
          wouldCreateSources: plan.createSources.length,
          wouldCreateContents: plan.createContents.length,
          wouldUpdateContents: plan.updateContents.length,
          createdSources: 0,
          createdContents: 0,
          updatedContents: 0,
          skippedContents: plan.skippedContents,
          conflicts: plan.conflicts,
          applied: false
        }
      }
      const changed = applyPlan(database, plan, options.now ?? Date.now())
      database.exec('COMMIT')
      return {
        mode: 'apply-owned',
        databasePath,
        wouldCreateSources: plan.createSources.length,
        wouldCreateContents: plan.createContents.length,
        wouldUpdateContents: plan.updateContents.length,
        ...changed,
        skippedContents: plan.skippedContents,
        conflicts: [],
        applied: true
      }
    } catch (error) {
      if (database.inTransaction) database.exec('ROLLBACK')
      throw error
    }
  } finally {
    database.close()
  }
}

function runCli(argv: string[]): number {
  let applyOwned = false
  let databasePath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply-owned') {
      applyOwned = true
    } else if (argument === '--database') {
      databasePath = argv[index + 1]
      if (!databasePath) throw new CatalogSyncError('--database requires a path')
      index += 1
    } else if (argument !== '--dry-run') {
      throw new CatalogSyncError(`Unknown argument: ${argument}`)
    }
  }
  const result = syncPublicCatalog({ applyOwned, databasePath })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result.conflicts.length ? 1 : 0
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) {
  try {
    process.exitCode = runCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`)
    process.exitCode = 2
  }
}
