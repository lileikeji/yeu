import './load-env'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { procedureSeeds, type ProcedureSeed } from '../data/seeds/procedures'

const SEED_OWNER_PREFIX = 'public-procedure-seed:v1'

interface SeedOptions {
  apply?: boolean
  databasePath?: string
  now?: number
}

export interface ProcedureSeedResult {
  mode: 'dry-run' | 'apply'
  databasePath: string
  wouldCreate: number
  wouldUpdate: number
  created: number
  updated: number
  procedureCount: number
  stepCount: number
  materialCount: number
  applied: boolean
}

interface ExistingProcedure {
  id: string
  slug: string
  seedOwner: string | null
  publishedAt: number | null
}

interface ResolvedProcedureSeed {
  sourceLinks: Array<ProcedureSeed['sources'][number] & { id: string }>
  departmentId: string | null
  guideId: string | null
  stepRelations: Array<ProcedureSeed['steps'][number] & {
    departmentId: string | null
    placeId: string | null
  }>
  materialRelations: Array<ProcedureSeed['materials'][number] & {
    departmentId: string | null
    placeId: string | null
  }>
}

function absolutePath(path: string): string {
  if (path === ':memory:') return path
  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

function timestamp(value: string | null): number | null {
  if (value === null) return null
  const result = Date.parse(value)
  if (!Number.isFinite(result)) throw new Error(`Invalid procedure seed date: ${value}`)
  return result
}

function seedOwner(seed: ProcedureSeed): string {
  return `${SEED_OWNER_PREFIX}:${seed.slug}`
}

function requireSchema(database: InstanceType<typeof BetterSqlite3>): void {
  for (const table of [
    'procedures',
    'procedure_steps',
    'procedure_materials',
    'procedure_places',
    'procedure_sources'
  ]) {
    const exists = database.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(table)
    if (!exists) throw new Error(`Missing ${table}; run pnpm db:migrate first`)
  }
}

function resolveContentId(
  database: InstanceType<typeof BetterSqlite3>,
  kind: 'department' | 'guide',
  slug: string | null
): string | null {
  if (!slug) return null
  const rows = database.prepare(`
    SELECT id FROM contents WHERE kind = ? AND slug = ? AND status = 'published'
  `).all(kind, slug) as Array<{ id: string }>
  if (rows.length !== 1) {
    throw new Error(`Missing managed ${kind}:${slug}; run pnpm db:seed:catalog --apply first`)
  }
  return rows[0]!.id
}

function resolvePlaceId(
  database: InstanceType<typeof BetterSqlite3>,
  slug: string | null
): string | null {
  if (!slug) return null
  const rows = database.prepare(`
    SELECT id FROM places WHERE slug = ? AND status != 'archived'
  `).all(slug) as Array<{ id: string }>
  if (rows.length !== 1) throw new Error(`Missing procedure place:${slug}`)
  return rows[0]!.id
}

function resolveSourceIds(database: InstanceType<typeof BetterSqlite3>, seed: ProcedureSeed) {
  return seed.sources.map((source) => {
    const rows = database.prepare(`
      SELECT id FROM sources
      WHERE url = ? AND status = 'active'
        AND ((source_level IN ('A', 'B') AND is_official = 1) OR source_level = 'C')
    `).all(source.url) as Array<{ id: string }>
    if (rows.length !== 1) {
      throw new Error(`Missing procedure source ${source.url}; run pnpm db:seed:catalog --apply first`)
    }
    return { ...source, id: rows[0]!.id }
  })
}

function findExisting(database: InstanceType<typeof BetterSqlite3>, seed: ProcedureSeed): ExistingProcedure | null {
  const owner = seedOwner(seed)
  const bySlug = database.prepare(`
    SELECT id, slug, seed_owner AS seedOwner, published_at AS publishedAt
    FROM procedures WHERE slug = ?
  `).get(seed.slug) as ExistingProcedure | undefined
  const owned = database.prepare(`
    SELECT id, slug, seed_owner AS seedOwner, published_at AS publishedAt
    FROM procedures WHERE seed_owner = ?
  `).all(owner) as ExistingProcedure[]
  const wrongIdentity = owned.find(item => item.slug !== seed.slug)
  if (wrongIdentity) throw new Error(`Seed-owned procedure identity drifted to ${wrongIdentity.slug}`)
  if (!bySlug) return null
  if (bySlug.seedOwner !== owner) {
    throw new Error(`Procedure slug ${seed.slug} is maintained manually; seed stopped without changes`)
  }
  return bySlug
}

function resolveSeedRelations(
  database: InstanceType<typeof BetterSqlite3>,
  seed: ProcedureSeed
): ResolvedProcedureSeed {
  const sourceLinks = resolveSourceIds(database, seed)
  const departmentId = resolveContentId(database, 'department', seed.departmentSlug)
  const guideId = resolveContentId(database, 'guide', seed.guideSlug)
  const stepRelations = seed.steps.map(step => ({
    ...step,
    departmentId: resolveContentId(database, 'department', step.departmentSlug),
    placeId: resolvePlaceId(database, step.placeSlug)
  }))
  const materialRelations = seed.materials.map(material => ({
    ...material,
    departmentId: resolveContentId(database, 'department', material.departmentSlug),
    placeId: resolvePlaceId(database, material.placeSlug)
  }))

  return { sourceLinks, departmentId, guideId, stepRelations, materialRelations }
}

function normalizeForCompare(value: unknown): string {
  return JSON.stringify(value)
}

function seedNeedsUpdate(
  database: InstanceType<typeof BetterSqlite3>,
  seed: ProcedureSeed,
  existing: ExistingProcedure | null,
  resolved: ResolvedProcedureSeed
): boolean {
  if (!existing) return false

  const procedure = database.prepare(`
    SELECT title, summary, body, category, audience_json AS audienceJson,
      method, information_state AS informationState, status_text AS statusText,
      processing_time AS processingTime, deadline_text AS deadlineText,
      starts_at AS startsAt, ends_at AS endsAt, valid_from AS validFrom,
      valid_until AS validUntil, department_id AS departmentId, guide_id AS guideId,
      status, last_verified_at AS lastVerifiedAt
    FROM procedures WHERE id = ?
  `).get(existing.id) as Record<string, unknown> | undefined
  if (!procedure) return true

  const expectedProcedure = {
    title: seed.title,
    summary: seed.summary,
    body: seed.body,
    category: seed.category,
    audienceJson: JSON.stringify(seed.audience),
    method: seed.method,
    informationState: seed.informationState,
    statusText: seed.statusText,
    processingTime: seed.processingTime,
    deadlineText: seed.deadlineText,
    startsAt: timestamp(seed.startsAt),
    endsAt: timestamp(seed.endsAt),
    validFrom: timestamp(seed.validFrom),
    validUntil: timestamp(seed.validUntil),
    departmentId: resolved.departmentId,
    guideId: resolved.guideId,
    status: 'published',
    lastVerifiedAt: timestamp(seed.lastVerifiedAt)
  }
  if (normalizeForCompare(procedure) !== normalizeForCompare(expectedProcedure)) return true

  const steps = database.prepare(`
    SELECT id, step_order AS stepOrder, title, description,
      audience_json AS audienceJson, information_state AS informationState,
      time_text AS timeText, place_id AS placeId, department_id AS departmentId,
      action_url AS actionUrl
    FROM procedure_steps WHERE procedure_id = ? ORDER BY step_order
  `).all(existing.id)
  const expectedSteps = resolved.stepRelations.map((step, index) => ({
    id: step.id,
    stepOrder: index + 1,
    title: step.title,
    description: step.description,
    audienceJson: JSON.stringify(step.audience),
    informationState: step.informationState,
    timeText: step.timeText,
    placeId: step.placeId,
    departmentId: step.departmentId,
    actionUrl: step.actionUrl
  }))
  if (normalizeForCompare(steps) !== normalizeForCompare(expectedSteps)) return true

  const materials = database.prepare(`
    SELECT id, item_order AS itemOrder, name, description,
      audience_json AS audienceJson, is_required AS isRequired,
      information_state AS informationState, place_id AS placeId,
      department_id AS departmentId
    FROM procedure_materials WHERE procedure_id = ? ORDER BY item_order
  `).all(existing.id)
  const expectedMaterials = resolved.materialRelations.map((material, index) => ({
    id: material.id,
    itemOrder: index + 1,
    name: material.name,
    description: material.description,
    audienceJson: JSON.stringify(material.audience),
    isRequired: material.isRequired === null ? null : material.isRequired ? 1 : 0,
    informationState: material.informationState,
    placeId: material.placeId,
    departmentId: material.departmentId
  }))
  if (normalizeForCompare(materials) !== normalizeForCompare(expectedMaterials)) return true

  const sources = database.prepare(`
    SELECT source_id AS sourceId, claim_scope AS claimScope,
      is_primary AS isPrimary, sort_order AS sortOrder
    FROM procedure_sources WHERE procedure_id = ? ORDER BY sort_order
  `).all(existing.id)
  const expectedSources = resolved.sourceLinks.map((source, index) => ({
    sourceId: source.id,
    claimScope: source.claimScope,
    isPrimary: source.isPrimary ? 1 : 0,
    sortOrder: index + 1
  }))
  return normalizeForCompare(sources) !== normalizeForCompare(expectedSources)
}

function applySeed(
  database: InstanceType<typeof BetterSqlite3>,
  seed: ProcedureSeed,
  existing: ExistingProcedure | null,
  resolved: ResolvedProcedureSeed,
  now: number
): void {
  const procedureId = existing?.id ?? seed.id
  const { sourceLinks, departmentId, guideId, stepRelations, materialRelations } = resolved

  database.transaction(() => {
    if (existing) {
      database.prepare(`
        UPDATE procedures SET
          title = ?, summary = ?, body = ?, category = ?, audience_json = ?, method = ?,
          information_state = ?, status_text = ?, processing_time = ?, deadline_text = ?,
          starts_at = ?, ends_at = ?, valid_from = ?, valid_until = ?, department_id = ?,
          guide_id = ?, status = 'published', last_verified_at = ?,
          published_at = coalesce(published_at, ?), updated_at = ?
        WHERE id = ?
      `).run(
        seed.title,
        seed.summary,
        seed.body,
        seed.category,
        JSON.stringify(seed.audience),
        seed.method,
        seed.informationState,
        seed.statusText,
        seed.processingTime,
        seed.deadlineText,
        timestamp(seed.startsAt),
        timestamp(seed.endsAt),
        timestamp(seed.validFrom),
        timestamp(seed.validUntil),
        departmentId,
        guideId,
        timestamp(seed.lastVerifiedAt),
        now,
        now,
        procedureId
      )
    } else {
      database.prepare(`
        INSERT INTO procedures (
          id, slug, title, summary, body, category, audience_json, method,
          information_state, status_text, processing_time, deadline_text,
          starts_at, ends_at, valid_from, valid_until, department_id, guide_id,
          seed_owner, status, last_verified_at, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)
      `).run(
        procedureId,
        seed.slug,
        seed.title,
        seed.summary,
        seed.body,
        seed.category,
        JSON.stringify(seed.audience),
        seed.method,
        seed.informationState,
        seed.statusText,
        seed.processingTime,
        seed.deadlineText,
        timestamp(seed.startsAt),
        timestamp(seed.endsAt),
        timestamp(seed.validFrom),
        timestamp(seed.validUntil),
        departmentId,
        guideId,
        seedOwner(seed),
        timestamp(seed.lastVerifiedAt),
        now,
        now,
        now
      )
    }

    for (const table of ['procedure_steps', 'procedure_materials', 'procedure_places', 'procedure_sources']) {
      database.prepare(`DELETE FROM ${table} WHERE procedure_id = ?`).run(procedureId)
    }
    const insertStep = database.prepare(`
      INSERT INTO procedure_steps (
        id, procedure_id, step_order, title, description, audience_json,
        information_state, time_text, place_id, department_id, action_url,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stepRelations.forEach((step, index) => insertStep.run(
      step.id,
      procedureId,
      index + 1,
      step.title,
      step.description,
      JSON.stringify(step.audience),
      step.informationState,
      step.timeText,
      step.placeId,
      step.departmentId,
      step.actionUrl,
      now,
      now
    ))
    const insertMaterial = database.prepare(`
      INSERT INTO procedure_materials (
        id, procedure_id, item_order, name, description, audience_json,
        is_required, information_state, place_id, department_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    materialRelations.forEach((material, index) => insertMaterial.run(
      material.id,
      procedureId,
      index + 1,
      material.name,
      material.description,
      JSON.stringify(material.audience),
      material.isRequired === null ? null : material.isRequired ? 1 : 0,
      material.informationState,
      material.placeId,
      material.departmentId,
      now,
      now
    ))
    const insertSource = database.prepare(`
      INSERT INTO procedure_sources (
        procedure_id, source_id, claim_scope, is_primary, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    sourceLinks.forEach((source, index) => insertSource.run(
      procedureId,
      source.id,
      source.claimScope,
      source.isPrimary ? 1 : 0,
      index + 1,
      now
    ))
  })()
}

export function seedProcedures(options: SeedOptions = {}): ProcedureSeedResult {
  const databasePath = absolutePath(options.databasePath || process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite')
  if (databasePath !== ':memory:' && !existsSync(databasePath)) {
    throw new Error(`Database does not exist: ${databasePath}; run pnpm db:migrate first`)
  }
  const database = new BetterSqlite3(databasePath)
  database.pragma('foreign_keys = ON')
  try {
    requireSchema(database)
    const existing = procedureSeeds.map(seed => findExisting(database, seed))
    const resolved = procedureSeeds.map(seed => resolveSeedRelations(database, seed))
    const changedExisting = procedureSeeds.filter((seed, index) =>
      existing[index] !== null && seedNeedsUpdate(database, seed, existing[index], resolved[index]!)
    )
    const result: ProcedureSeedResult = {
      mode: options.apply ? 'apply' : 'dry-run',
      databasePath,
      wouldCreate: existing.filter(item => item === null).length,
      wouldUpdate: changedExisting.length,
      created: 0,
      updated: 0,
      procedureCount: procedureSeeds.length,
      stepCount: procedureSeeds.reduce((total, seed) => total + seed.steps.length, 0),
      materialCount: procedureSeeds.reduce((total, seed) => total + seed.materials.length, 0),
      applied: Boolean(options.apply)
    }
    if (!options.apply) return result
    procedureSeeds.forEach((seed, index) => {
      const existingProcedure = existing[index] ?? null
      if (existingProcedure && !seedNeedsUpdate(database, seed, existingProcedure, resolved[index]!)) return
      applySeed(database, seed, existingProcedure, resolved[index]!, options.now ?? Date.now())
    })
    result.created = result.wouldCreate
    result.updated = result.wouldUpdate
    const foreignKeyErrors = database.pragma('foreign_key_check') as unknown[]
    if (foreignKeyErrors.length > 0) throw new Error('Procedure seed left foreign-key violations')
    return result
  } finally {
    database.close()
  }
}

function parseArgs(argv: string[]): SeedOptions & { help: boolean } {
  const options: SeedOptions & { help: boolean } = { help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--apply') options.apply = true
    else if (value === '--help' || value === '-h') options.help = true
    else if (value === '--database') {
      const path = argv[index + 1]
      if (!path) throw new Error('--database requires a path')
      options.databasePath = path
      index += 1
    } else throw new Error(`Unknown argument: ${value}`)
  }
  return options
}

export function runCli(argv: string[]): number {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write('Usage: pnpm db:seed:procedures [--apply] [--database PATH]\n')
    return 0
  }
  const result = seedProcedures(options)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirectRun) process.exitCode = runCli(process.argv.slice(2))
