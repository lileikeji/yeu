import './load-env'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import {
  freshmanGuides,
  freshmanGuideBody,
  officialClubBody,
  officialClubs,
  officialDepartmentBody,
  officialDepartments,
  officialSources,
  researchSources,
  type FreshmanGuide,
  type OfficialClub,
  type OfficialDepartment,
  type PublicSource
} from '../data/seeds/public-content'

const IMPORTER_ID = 'public-catalog-seed'
const IMPORT_VERSION = 1
const SOURCE_MARKER = `[${IMPORTER_ID}:v${IMPORT_VERSION}]`
const CONTENT_MARKER_KEY = 'catalogSeed'
const EXPECTED_GUIDE_SLUGS = [
  'arrival',
  'fees-aid',
  'find-campus',
  'campus-card-network',
  'study-library',
  'safety-health',
  'express-delivery',
  'clubs',
  'nearby'
] as const
const SOURCE_FREE_DRAFT_GUIDES = new Set<string>()

const DEPARTMENT_SLUGS: Record<string, string> = {
  '经济学院': 'school-of-economics',
  '管理学院': 'school-of-management',
  '会计学院': 'school-of-accounting',
  '计算机科学与工程学院': 'school-of-computer-science-and-engineering',
  '人文学院': 'school-of-humanities',
  '外国语学院': 'school-of-foreign-languages',
  '法学院': 'school-of-law',
  '艺术与教育学院': 'school-of-arts-and-education',
  '马克思主义学院': 'school-of-marxism',
  '继续教育学院': 'school-of-continuing-education',
  '体育教研部': 'physical-education-department',
  '军事理论教研部（党委武装部）': 'military-theory-department',
  '人工智能与数据科学学院': 'school-of-ai-and-data-science',
  '电气工程与自动化学院': 'school-of-electrical-engineering-and-automation',
  '教务部': 'teaching-affairs-office',
  '学校办公室': 'university-office',
  '招生办公室': 'admissions-office',
  '学生事务部': 'student-affairs',
  '实验室与信息化管理处': 'information-office',
  '学生资助中心': 'financial-aid-center',
  '心理健康教育与咨询中心': 'mental-health-center',
  '财务处': 'finance-office',
  '总务处': 'general-affairs-office',
  '保卫处': 'security-office',
  '医务室': 'campus-clinic',
  '校团委': 'youth-league',
  '图书馆': 'library'
}

type ContentKind = 'guide' | 'department' | 'club'
type PublicationStatus = 'draft' | 'published'

interface CatalogSource {
  title: string
  url: string
  platform: string
  publisherName: string
  sourceLevel: 'A' | 'D'
  isOfficial: boolean
  publishedAt: null
  accessedAt: number
  notes: string
  status: 'active' | 'unavailable' | 'disputed'
}

interface CatalogContent {
  kind: ContentKind
  slug: string
  title: string
  summary: string
  body: string
  category: string | null
  audience: string | null
  metadata: Record<string, unknown>
  isFeatured: false
  status: PublicationStatus
  lastVerifiedAt: number | null
  sourceUrls: string[]
}

interface ExistingSource {
  id: string
  url: string
  notes: string | null
  sourceLevel: string
  isOfficial: number
  accessedAt: number
  status: string
}

interface ExistingContent {
  id: string
  kind: string
  slug: string
  metadataJson: string
  status: string
  lastVerifiedAt: number | null
}

interface ExistingContentSource {
  contentId: string
  url: string
  isPrimary: number
}

interface ParsedSeedMarker {
  state: 'current' | 'related' | 'none'
  identity: string | null
}

interface PlannedSource extends CatalogSource {
  id: string
}

interface PlannedContent extends CatalogContent {
  id: string
}

interface ImportPlan {
  createSources: PlannedSource[]
  createContents: PlannedContent[]
  sourceIdsByUrl: Map<string, string>
  skippedSources: number
  skippedContents: number
  conflicts: CatalogSeedConflict[]
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export interface CatalogSeedConflict {
  entityType: 'source' | 'content'
  key: string
  reason: string
  existingId?: string
}

export interface CatalogSeedResult {
  mode: 'dry-run' | 'apply'
  databasePath: string
  sourceCount: number
  contentCount: number
  createdSources: number
  wouldCreateSources: number
  skippedSources: number
  createdContents: number
  wouldCreateContents: number
  skippedContents: number
  publishedContents: number
  draftContents: number
  conflicts: number
  applied: boolean
  conflictDetails: CatalogSeedConflict[]
}

export interface CatalogSeedOptions {
  apply?: boolean
  databasePath?: string
  now?: number
}

export interface CatalogSeedData {
  sources: CatalogSource[]
  contents: CatalogContent[]
}

export class CatalogSeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogSeedError'
  }
}

function assertSeed(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CatalogSeedError(message)
}

function absolutePath(path: string): string {
  if (path === ':memory:') return path
  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

function canonicalUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new CatalogSeedError(`Invalid catalog source URL: ${value}`)
  }
  assertSeed(url.protocol === 'https:' || url.protocol === 'http:', `Unsupported catalog source URL: ${value}`)
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

function contentKey(kind: string, slug: string): string {
  return `${kind.trim().toLowerCase()}:${slug.trim().toLowerCase()}`
}

function dateOnlyToTimestamp(value: string, label: string): number {
  assertSeed(/^\d{4}-\d{2}-\d{2}$/.test(value), `${label} must use YYYY-MM-DD`)
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  assertSeed(Number.isFinite(timestamp), `${label} is not a valid date`)
  return timestamp
}

function isOfficialUniversityUrl(value: string): boolean {
  const url = new URL(value)
  const hostname = url.hostname.toLowerCase()
  return url.protocol === 'https:' && (hostname === 'yeu.edu.cn' || hostname.endsWith('.yeu.edu.cn'))
}

function sourceMarkerNotes(url: string, context?: string): string {
  return [
    `${SOURCE_MARKER} identity=${encodeURIComponent(canonicalUrl(url))}`,
    'Imported from data/seeds/public-content.ts; keep this marker for idempotent reruns.',
    context ? `Context: ${context}` : ''
  ].filter(Boolean).join(' ')
}

function seedMetadata(identity: string, metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    ...metadata,
    [CONTENT_MARKER_KEY]: {
      importer: IMPORTER_ID,
      version: IMPORT_VERSION,
      identity
    }
  }
}

function publicSourceToCatalog(source: PublicSource): CatalogSource {
  const url = canonicalUrl(source.url)
  const isOfficial = isOfficialUniversityUrl(url)
  return {
    title: source.title,
    url: source.url,
    platform: isOfficial ? '仰恩大学官网' : source.publisher,
    publisherName: source.publisher,
    sourceLevel: isOfficial ? 'A' : 'D',
    isOfficial,
    publishedAt: null,
    accessedAt: dateOnlyToTimestamp(source.accessedAt, `Source ${source.url} accessedAt`),
    notes: sourceMarkerNotes(source.url, source.context),
    status: source.status ?? 'active'
  }
}

function departmentSources(department: OfficialDepartment, accessedAt: string): CatalogSource[] {
  const verifiedAt = department.verifiedAt ?? accessedAt
  const candidates: PublicSource[] = [
    {
      title: `${department.name}官网入口`,
      publisher: `仰恩大学${department.name}`,
      url: department.website,
      accessedAt: verifiedAt
    },
    ...(department.profileUrl
      ? [{
          title: `${department.name}简介`,
          publisher: `仰恩大学${department.name}`,
          url: department.profileUrl,
          accessedAt: verifiedAt
        }]
      : []),
    ...(department.contactUrl
      ? [{
          title: `${department.name}公开联系方式`,
          publisher: `仰恩大学${department.name}`,
          url: department.contactUrl,
          accessedAt: verifiedAt
        }]
      : [])
  ]
  const seenUrls = new Set<string>()
  return candidates
    .filter((source) => {
      const key = canonicalUrl(source.url)
      if (seenUrls.has(key)) return false
      seenUrls.add(key)
      return true
    })
    .map(publicSourceToCatalog)
}

function guideContent(guide: FreshmanGuide): CatalogContent {
  const sourceUrls = guide.sources.map(source => source.url)
  const mustRemainDraft = SOURCE_FREE_DRAFT_GUIDES.has(guide.slug)
  assertSeed(
    mustRemainDraft === (sourceUrls.length === 0),
    `Guide ${guide.slug} source policy changed; review publication status before seeding`
  )
  const lastVerifiedAt = mustRemainDraft
    ? null
    : dateOnlyToTimestamp(guide.updatedAt, `Guide ${guide.slug} updatedAt`)

  if (!mustRemainDraft) {
    const sourceAccessDates = new Set(guide.sources.map(source => source.accessedAt))
    assertSeed(
      sourceAccessDates.has(guide.updatedAt),
      `Guide ${guide.slug} verification date is not traceable to an accessed official source`
    )
  }

  return {
    kind: 'guide',
    slug: guide.slug,
    title: guide.title,
    summary: guide.summary,
    body: freshmanGuideBody(guide),
    category: guide.category,
    audience: guide.audience.join('、'),
    metadata: seedMetadata(contentKey('guide', guide.slug), {
      sections: guide.sections,
      shortTitle: guide.shortTitle,
      icon: guide.icon,
      readMinutes: guide.readMinutes,
      statusText: guide.statusText,
      leadNotice: guide.leadNotice,
      verificationState: guide.status
    }),
    isFeatured: false,
    status: mustRemainDraft ? 'draft' : 'published',
    lastVerifiedAt,
    sourceUrls
  }
}

function clubContent(club: OfficialClub): CatalogContent {
  const active = club.source === officialSources.clubShowcase2026
  return {
    kind: 'club',
    slug: club.slug,
    title: club.name,
    summary: club.summary,
    body: officialClubBody(club),
    category: active ? `${club.group} · 近期活动可确认` : `${club.group} · 名称线索待确认`,
    audience: '本科新生、专升本新生',
    metadata: seedMetadata(contentKey('club', club.slug), {
      recruitmentPeriod: null,
      activitySchedule: null,
      contactMethod: null,
      group: club.group,
      direction: club.direction,
      verificationState: 'partial'
    }),
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: dateOnlyToTimestamp(club.source.accessedAt, `Club ${club.slug} source accessedAt`),
    sourceUrls: [club.source.url]
  }
}

function departmentContent(department: OfficialDepartment, sources: CatalogSource[]): CatalogContent {
  const slug = DEPARTMENT_SLUGS[department.name]
  assertSeed(slug, `Department slug is not reviewed: ${department.name}`)
  assertSeed(sources.length > 0, `Department ${department.name} has no official source`)
  return {
    kind: 'department',
    slug,
    title: department.name,
    summary: department.summary,
    body: officialDepartmentBody(department),
    category: 'official-department',
    audience: '本科新生、专升本新生',
    metadata: seedMetadata(contentKey('department', slug), {
      website: department.website,
      profileUrl: department.profileUrl ?? null,
      contactUrl: department.contactUrl ?? null,
      phone: department.phone ?? null,
      email: department.email ?? null,
      address: department.address ?? null,
      verificationState: department.verificationState ?? null
    }),
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: Math.max(...sources.map(source => source.accessedAt)),
    sourceUrls: sources.map(source => source.url)
  }
}

function validateCatalog(catalog: CatalogSeedData): void {
  const sourceUrls = new Set<string>()
  for (const source of catalog.sources) {
    const key = canonicalUrl(source.url)
    assertSeed(!sourceUrls.has(key), `Duplicate catalog source URL: ${source.url}`)
    sourceUrls.add(key)
    assertSeed(source.title.trim().length > 0 && source.title.length <= 300, `Source title is invalid: ${source.url}`)
    assertSeed(source.url.length <= 2048, `Source URL is too long: ${source.url}`)
    assertSeed(source.platform.trim().length > 0 && source.platform.length <= 80, `Source platform is invalid: ${source.url}`)
    assertSeed(source.publisherName.trim().length > 0 && source.publisherName.length <= 160, `Source publisher is invalid: ${source.url}`)
    assertSeed(source.notes.length <= 4000, `Source notes are too long: ${source.url}`)
    assertSeed(
      source.status === 'active' || source.status === 'unavailable' || source.status === 'disputed',
      `Source status is invalid: ${source.url}`
    )
    assertSeed(
      source.isOfficial === isOfficialUniversityUrl(key),
      `Source official flag does not match URL domain: ${source.url}`
    )
    assertSeed(
      source.sourceLevel === (source.isOfficial ? 'A' : 'D'),
      `Source level does not match source policy: ${source.url}`
    )
    assertSeed(Number.isFinite(source.accessedAt), `Source has no traceable accessedAt: ${source.url}`)
  }

  const contentKeys = new Set<string>()
  for (const content of catalog.contents) {
    const key = contentKey(content.kind, content.slug)
    assertSeed(!contentKeys.has(key), `Duplicate catalog content identity: ${key}`)
    contentKeys.add(key)
    assertSeed(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(content.slug) && content.slug.length <= 120, `Content slug is invalid: ${key}`)
    assertSeed(content.title.trim().length > 0 && content.title.length <= 180, `Content title is invalid: ${key}`)
    assertSeed(content.summary.trim().length > 0 && content.summary.length <= 800, `Content summary is invalid: ${key}`)
    assertSeed(content.body.length <= 100_000, `Content body is too long: ${key}`)
    assertSeed(content.category === null || content.category.length <= 80, `Content category is too long: ${key}`)
    assertSeed(content.audience === null || content.audience.length <= 120, `Content audience is too long: ${key}`)
    assertSeed(content.sourceUrls.length <= 50, `Content has too many sources: ${key}`)
    for (const sourceUrl of content.sourceUrls) {
      assertSeed(sourceUrls.has(canonicalUrl(sourceUrl)), `Content ${key} references a source outside the catalog`)
    }
    if (content.status === 'published') {
      assertSeed(content.sourceUrls.length > 0, `Published content ${key} must have a traceable source`)
      assertSeed(content.lastVerifiedAt !== null, `Published content ${key} must have lastVerifiedAt`)
    } else {
      assertSeed(content.lastVerifiedAt === null, `Unverified draft ${key} must not claim lastVerifiedAt`)
    }
  }
}

export function buildCatalogSeed(): CatalogSeedData {
  assertSeed(
    freshmanGuides.length === EXPECTED_GUIDE_SLUGS.length
    && EXPECTED_GUIDE_SLUGS.every((slug, index) => freshmanGuides[index]?.slug === slug),
    'Freshman guide list changed; review the catalog seed publication policy'
  )
  assertSeed(
    officialDepartments.length === Object.keys(DEPARTMENT_SLUGS).length
    && officialDepartments.every(department => DEPARTMENT_SLUGS[department.name]),
    'Official department list changed; assign reviewed slugs before seeding'
  )

  const sourcesByUrl = new Map<string, CatalogSource>()
  for (const source of Object.values(officialSources)) {
    const catalogSource = publicSourceToCatalog(source)
    const key = canonicalUrl(catalogSource.url)
    assertSeed(!sourcesByUrl.has(key), `Duplicate official source URL: ${catalogSource.url}`)
    sourcesByUrl.set(key, catalogSource)
  }
  for (const source of Object.values(researchSources)) {
    const catalogSource = publicSourceToCatalog(source)
    const key = canonicalUrl(catalogSource.url)
    assertSeed(!sourcesByUrl.has(key), `Duplicate research source URL: ${catalogSource.url}`)
    sourcesByUrl.set(key, catalogSource)
  }

  const departmentSourcesByName = new Map<string, CatalogSource[]>()
  const departmentAccessedAt = officialSources.university.accessedAt
  for (const department of officialDepartments) {
    const resolvedSources = departmentSources(department, departmentAccessedAt).map((source) => {
      const key = canonicalUrl(source.url)
      const existing = sourcesByUrl.get(key)
      if (existing) return existing
      sourcesByUrl.set(key, source)
      return source
    })
    departmentSourcesByName.set(department.name, resolvedSources)
  }

  const contents: CatalogContent[] = [
    ...freshmanGuides.map(guideContent),
    ...officialClubs.map(clubContent),
    ...officialDepartments.map((department) => {
      const sources = departmentSourcesByName.get(department.name)
      assertSeed(sources, `Missing sources for department ${department.name}`)
      return departmentContent(department, sources)
    })
  ]
  const catalog = { sources: [...sourcesByUrl.values()], contents }
  validateCatalog(catalog)
  return catalog
}

function sourceMarkerState(notes: string | null): ParsedSeedMarker {
  if (!notes?.includes(`[${IMPORTER_ID}:`)) return { state: 'none', identity: null }
  const identityPrefix = `${SOURCE_MARKER} identity=`
  const identityStart = notes.indexOf(identityPrefix)
  if (identityStart < 0) return { state: 'related', identity: null }
  const encodedIdentity = notes.slice(identityStart + identityPrefix.length).split(/\s/, 1)[0]
  if (!encodedIdentity) return { state: 'related', identity: null }
  try {
    return { state: 'current', identity: canonicalUrl(decodeURIComponent(encodedIdentity)) }
  } catch {
    return { state: 'related', identity: null }
  }
}

function contentMarkerState(metadataJson: string): ParsedSeedMarker {
  let metadata: unknown
  try {
    metadata = JSON.parse(metadataJson)
  } catch {
    return { state: 'none', identity: null }
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { state: 'none', identity: null }
  const marker = (metadata as Record<string, unknown>)[CONTENT_MARKER_KEY]
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return { state: 'none', identity: null }
  const record = marker as Record<string, unknown>
  if (record.importer !== IMPORTER_ID) return { state: 'none', identity: null }
  if (record.version !== IMPORT_VERSION || typeof record.identity !== 'string') {
    return { state: 'related', identity: null }
  }
  const [kind, slug, ...extra] = record.identity.split(':')
  if (extra.length > 0 || (kind !== 'guide' && kind !== 'department' && kind !== 'club') || !slug) {
    return { state: 'related', identity: null }
  }
  return { state: 'current', identity: contentKey(kind, slug) }
}

function validateDatabaseSchema(database: InstanceType<typeof BetterSqlite3>): void {
  assertSeed(database.pragma('foreign_keys', { simple: true }) === 1, 'SQLite foreign_keys must be enabled')
  const requiredColumns: Record<string, string[]> = {
    sources: ['id', 'url', 'notes', 'is_official', 'accessed_at', 'status'],
    contents: ['id', 'kind', 'slug', 'metadata_json', 'status', 'last_verified_at', 'published_at'],
    content_sources: ['content_id', 'source_id', 'is_primary']
  }
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    assertSeed(rows.length > 0, `Target database is missing table ${table}; run pnpm db:migrate first`)
    const actual = new Set(rows.map(row => row.name))
    for (const column of columns) {
      assertSeed(actual.has(column), `Target database is missing ${table}.${column}; run pnpm db:migrate first`)
    }
  }
}

function buildPlan(database: InstanceType<typeof BetterSqlite3>, catalog: CatalogSeedData): ImportPlan {
  const existingSources = database.prepare(`
    SELECT
      id,
      url,
      notes,
      source_level AS sourceLevel,
      is_official AS isOfficial,
      accessed_at AS accessedAt,
      status
    FROM sources
  `).all() as ExistingSource[]
  const existingContents = database.prepare(`
    SELECT
      id,
      kind,
      slug,
      metadata_json AS metadataJson,
      status,
      last_verified_at AS lastVerifiedAt
    FROM contents
  `).all() as ExistingContent[]
  const existingContentSources = database.prepare(`
    SELECT
      relation.content_id AS contentId,
      source.url,
      relation.is_primary AS isPrimary
    FROM content_sources AS relation
    JOIN sources AS source ON source.id = relation.source_id
  `).all() as ExistingContentSource[]
  const existingSourcesByUrl = new Map<string, ExistingSource[]>()
  for (const source of existingSources) {
    const key = canonicalUrl(source.url)
    existingSourcesByUrl.set(key, [...(existingSourcesByUrl.get(key) ?? []), source])
  }
  const existingContentsByKey = new Map<string, ExistingContent[]>()
  for (const content of existingContents) {
    const key = contentKey(content.kind, content.slug)
    existingContentsByKey.set(key, [...(existingContentsByKey.get(key) ?? []), content])
  }
  const existingRelationsByContent = new Map<string, ExistingContentSource[]>()
  for (const relation of existingContentSources) {
    existingRelationsByContent.set(
      relation.contentId,
      [...(existingRelationsByContent.get(relation.contentId) ?? []), relation]
    )
  }

  const createSources: PlannedSource[] = []
  const createContents: PlannedContent[] = []
  const sourceIdsByUrl = new Map<string, string>()
  const conflicts: CatalogSeedConflict[] = []
  let skippedSources = 0
  let skippedContents = 0
  const catalogSourceKeys = new Set(catalog.sources.map(source => canonicalUrl(source.url)))
  const catalogContentKeys = new Set(catalog.contents.map(content => contentKey(content.kind, content.slug)))
  const markedSourcesByIdentity = new Map<string, ExistingSource[]>()
  const markedContentsByIdentity = new Map<string, ExistingContent[]>()

  for (const source of existingSources) {
    const actualKey = canonicalUrl(source.url)
    const marker = sourceMarkerState(source.notes)
    if (marker.state === 'related') {
      conflicts.push({
        entityType: 'source',
        key: actualKey,
        reason: 'Source has an outdated or malformed catalog seed marker; migrate it explicitly',
        existingId: source.id
      })
      continue
    }
    if (marker.state !== 'current' || !marker.identity) continue
    markedSourcesByIdentity.set(
      marker.identity,
      [...(markedSourcesByIdentity.get(marker.identity) ?? []), source]
    )
    if (!catalogSourceKeys.has(marker.identity)) {
      conflicts.push({
        entityType: 'source',
        key: marker.identity,
        reason: 'Seed-owned source identity is not present in the current catalog',
        existingId: source.id
      })
    }
    if (actualKey !== marker.identity) {
      conflicts.push({
        entityType: 'source',
        key: marker.identity,
        reason: `Seed-owned source identity drifted to ${actualKey}`,
        existingId: source.id
      })
    }
  }

  for (const [identity, matches] of markedSourcesByIdentity) {
    if (matches.length > 1) {
      conflicts.push({
        entityType: 'source',
        key: identity,
        reason: 'More than one seed-owned source claims this identity'
      })
    }
  }

  for (const content of existingContents) {
    const actualKey = contentKey(content.kind, content.slug)
    const marker = contentMarkerState(content.metadataJson)
    if (marker.state === 'related') {
      conflicts.push({
        entityType: 'content',
        key: actualKey,
        reason: 'Content has an outdated or malformed catalog seed marker; migrate it explicitly',
        existingId: content.id
      })
      continue
    }
    if (marker.state !== 'current' || !marker.identity) continue
    markedContentsByIdentity.set(
      marker.identity,
      [...(markedContentsByIdentity.get(marker.identity) ?? []), content]
    )
    if (!catalogContentKeys.has(marker.identity)) {
      conflicts.push({
        entityType: 'content',
        key: marker.identity,
        reason: 'Seed-owned content identity is not present in the current catalog',
        existingId: content.id
      })
    }
    if (actualKey !== marker.identity) {
      conflicts.push({
        entityType: 'content',
        key: marker.identity,
        reason: `Seed-owned content identity drifted to ${actualKey}`,
        existingId: content.id
      })
    }
  }

  for (const [identity, matches] of markedContentsByIdentity) {
    if (matches.length > 1) {
      conflicts.push({
        entityType: 'content',
        key: identity,
        reason: 'More than one seed-owned content row claims this identity'
      })
    }
  }

  for (const source of catalog.sources) {
    const key = canonicalUrl(source.url)
    const markerMatches = markedSourcesByIdentity.get(key) ?? []
    const matches = existingSourcesByUrl.get(key) ?? []
    if (markerMatches.length > 0) {
      if (markerMatches.length !== 1 || canonicalUrl(markerMatches[0]!.url) !== key) continue
      if (matches.length !== 1 || matches[0]!.id !== markerMatches[0]!.id) {
        conflicts.push({ entityType: 'source', key, reason: 'Canonical source URL is not unique' })
        continue
      }
      const match = markerMatches[0]!
      if (
        match.sourceLevel !== source.sourceLevel
        || Boolean(match.isOfficial) !== source.isOfficial
        || match.status !== source.status
        || !Number.isFinite(match.accessedAt)
      ) {
        conflicts.push({
          entityType: 'source',
          key,
          reason: 'Seed-owned source no longer satisfies catalog source constraints; review it explicitly',
          existingId: match.id
        })
        continue
      }
      skippedSources += 1
      sourceIdsByUrl.set(key, match.id)
      continue
    }
    if (matches.length > 1) {
      conflicts.push({ entityType: 'source', key, reason: 'More than one existing source has this canonical URL' })
      continue
    }
    const match = matches[0]
    if (!match) {
      const planned = { ...source, id: randomUUID() }
      createSources.push(planned)
      sourceIdsByUrl.set(key, planned.id)
      continue
    }
    const marker = sourceMarkerState(match.notes)
    if (marker.state !== 'none') {
      continue
    }
    conflicts.push({
      entityType: 'source',
      key,
      reason: 'Source URL is occupied by a record not owned by this seed',
      existingId: match.id
    })
  }

  for (const content of catalog.contents) {
    const key = contentKey(content.kind, content.slug)
    const markerMatches = markedContentsByIdentity.get(key) ?? []
    const matches = existingContentsByKey.get(key) ?? []
    if (markerMatches.length > 0) {
      if (markerMatches.length !== 1 || contentKey(markerMatches[0]!.kind, markerMatches[0]!.slug) !== key) continue
      if (matches.length !== 1 || matches[0]!.id !== markerMatches[0]!.id) {
        conflicts.push({ entityType: 'content', key, reason: 'Normalized content identity is not unique' })
        continue
      }
      const match = markerMatches[0]!
      if (match.status !== content.status || match.lastVerifiedAt !== content.lastVerifiedAt) {
        conflicts.push({
          entityType: 'content',
          key,
          reason: 'Seed-owned content publication or verification status drifted from the catalog',
          existingId: match.id
        })
        continue
      }
      const expectedRelations = content.sourceUrls
        .map((url, index) => `${canonicalUrl(url)}|${index === 0 ? 1 : 0}`)
        .sort()
      const actualRelations = (existingRelationsByContent.get(match.id) ?? [])
        .map(relation => `${canonicalUrl(relation.url)}|${relation.isPrimary === 1 ? 1 : 0}`)
        .sort()
      if (JSON.stringify(actualRelations) !== JSON.stringify(expectedRelations)) {
        conflicts.push({
          entityType: 'content',
          key,
          reason: 'Seed-owned content source relationships drifted from the catalog',
          existingId: match.id
        })
        continue
      }
      skippedContents += 1
      continue
    }
    if (matches.length > 1) {
      conflicts.push({ entityType: 'content', key, reason: 'More than one existing content row has this normalized identity' })
      continue
    }
    const match = matches[0]
    if (!match) {
      createContents.push({ ...content, id: randomUUID() })
      continue
    }
    const marker = contentMarkerState(match.metadataJson)
    if (marker.state !== 'none') {
      continue
    }
    conflicts.push({
      entityType: 'content',
      key,
      reason: 'Content identity is occupied by a record not owned by this seed',
      existingId: match.id
    })
  }

  return {
    createSources,
    createContents,
    sourceIdsByUrl,
    skippedSources,
    skippedContents,
    conflicts
  }
}

function insertPlan(database: InstanceType<typeof BetterSqlite3>, plan: ImportPlan, now: number): { sources: number, contents: number } {
  const insertSource = database.prepare(`
    INSERT INTO sources (
      id, title, url, platform, publisher_name, source_level, is_official,
      published_at, accessed_at, notes, status, created_at, updated_at
    ) VALUES (
      @id, @title, @url, @platform, @publisherName, @sourceLevel, @isOfficial,
      @publishedAt, @accessedAt, @notes, @status, @now, @now
    )
  `)
  let createdSources = 0
  for (const source of plan.createSources) {
    createdSources += insertSource.run({ ...source, isOfficial: source.isOfficial ? 1 : 0, now }).changes
  }

  const insertContent = database.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, category, audience, metadata_json,
      is_featured, status, last_verified_at, published_at, created_at, updated_at
    ) VALUES (
      @id, @kind, @slug, @title, @summary, @body, @category, @audience, @metadataJson,
      0, @status, @lastVerifiedAt, @publishedAt, @now, @now
    )
  `)
  const insertContentSource = database.prepare(`
    INSERT INTO content_sources (content_id, source_id, is_primary, created_at)
    VALUES (?, ?, ?, ?)
  `)
  let createdContents = 0
  for (const content of plan.createContents) {
    const publishedAt = content.status === 'published' ? now : null
    createdContents += insertContent.run({
      ...content,
      metadataJson: JSON.stringify(content.metadata),
      publishedAt,
      now
    }).changes
    content.sourceUrls.forEach((url, index) => {
      const sourceId = plan.sourceIdsByUrl.get(canonicalUrl(url))
      assertSeed(sourceId, `No source ID is available for ${content.kind}:${content.slug} -> ${url}`)
      const result = insertContentSource.run(content.id, sourceId, index === 0 ? 1 : 0, now)
      assertSeed(result.changes === 1, `Failed to link source for ${content.kind}:${content.slug}`)
    })
  }
  return { sources: createdSources, contents: createdContents }
}

function resultForPlan(
  mode: CatalogSeedResult['mode'],
  databasePath: string,
  catalog: CatalogSeedData,
  plan: ImportPlan,
  created: { sources: number, contents: number },
  applied: boolean
): CatalogSeedResult {
  return {
    mode,
    databasePath,
    sourceCount: catalog.sources.length,
    contentCount: catalog.contents.length,
    createdSources: created.sources,
    wouldCreateSources: plan.createSources.length,
    skippedSources: plan.skippedSources,
    createdContents: created.contents,
    wouldCreateContents: plan.createContents.length,
    skippedContents: plan.skippedContents,
    publishedContents: catalog.contents.filter(content => content.status === 'published').length,
    draftContents: catalog.contents.filter(content => content.status === 'draft').length,
    conflicts: plan.conflicts.length,
    applied,
    conflictDetails: plan.conflicts
  }
}

export function seedPublicCatalog(options: CatalogSeedOptions = {}): CatalogSeedResult {
  const apply = options.apply === true
  const databasePath = absolutePath(options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite')
  assertSeed(databasePath !== ':memory:', 'Catalog seed requires a file-backed SQLite database')
  assertSeed(existsSync(databasePath), `Target database does not exist: ${databasePath}; run pnpm db:migrate first`)
  const catalog = buildCatalogSeed()
  const database = new BetterSqlite3(databasePath, { readonly: !apply, fileMustExist: true })

  try {
    database.pragma('foreign_keys = ON')
    validateDatabaseSchema(database)
    if (!apply) {
      const plan = buildPlan(database, catalog)
      return resultForPlan('dry-run', databasePath, catalog, plan, { sources: 0, contents: 0 }, false)
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      const plan = buildPlan(database, catalog)
      if (plan.conflicts.length > 0) {
        database.exec('ROLLBACK')
        return resultForPlan('apply', databasePath, catalog, plan, { sources: 0, contents: 0 }, false)
      }
      const created = insertPlan(database, plan, options.now ?? Date.now())
      database.exec('COMMIT')
      return resultForPlan('apply', databasePath, catalog, plan, created, true)
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
    'Usage: pnpm db:seed:catalog [--dry-run] [--apply] [--database PATH]',
    '',
    'Default mode is read-only dry-run. Only --apply writes sources and content.',
    'Default database: NUXT_DATABASE_PATH or ./data/yeu.sqlite'
  ].join('\n')
}

function parseCliArgs(argv: string[]): CatalogSeedOptions & { help: boolean } {
  const options: CatalogSeedOptions & { help: boolean } = { apply: false, help: false }
  let dryRunExplicit = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument === '--apply') {
      assertSeed(!dryRunExplicit, '--apply cannot be combined with --dry-run')
      options.apply = true
    } else if (argument === '--dry-run') {
      assertSeed(options.apply !== true, '--dry-run cannot be combined with --apply')
      dryRunExplicit = true
    } else if (argument === '--database') {
      const value = argv[index + 1]
      assertSeed(value && !value.startsWith('-'), '--database requires a path')
      options.databasePath = value
      index += 1
    } else {
      throw new CatalogSeedError(`Unknown argument: ${argument}`)
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
    const result = seedPublicCatalog(options)
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

if (executedDirectly) {
  process.exitCode = runCli(process.argv.slice(2))
}
