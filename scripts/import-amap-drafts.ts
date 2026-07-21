import './load-env'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'

const RAW_FILE_NAME = 'amap-workmap-2026-07-13.raw.json'
const DEFAULT_INPUT_PATH = `data/imports/${RAW_FILE_NAME}`
const TARGET_SHEET_NAME = '标记位置'
const EXPECTED_MARKER_COUNT = 76
const EXPECTED_WORKBOOK_SHA256 = '3335cae28d18581f8e0164a22768dbfd00b5391e28a6043e0815087f7132ff98'
const EXPECTED_MARKER_DATA_SHA256 = '5541e39729518a4ee3979256f7fa6b383cfa7f8ee2a326e2a6dbe959a7e82367'
const IMPORTER_ID = 'amap-workmap-draft-v1'
const LOCATION_CODE_RE = /^WIA-\d+\.\d+,\d+\.\d+$/

const TARGET_HEADERS = [
  '名称',
  '颜色',
  '图标(外轮廓)',
  '图标(填充物)',
  '描述',
  '文件夹',
  '位置编码(导出的内容若需再次导入，请不要修改此列)',
  '地址',
  '所属商圈',
  '*创建人',
  '*创建时间',
  '照片[照片间以逗号分隔，复制链接至浏览器下载/查看]',
  '审核结果',
  '不通过原因'
] as const

const PLACE_COLUMNS = {
  id: 'TEXT',
  slug: 'TEXT',
  name: 'TEXT',
  summary: 'TEXT',
  body: 'TEXT',
  scope: 'TEXT',
  type: 'TEXT',
  category: 'TEXT',
  address: 'TEXT',
  campus_area: 'TEXT',
  floor: 'TEXT',
  room: 'TEXT',
  longitude: 'REAL',
  latitude: 'REAL',
  coordinate_system: 'TEXT',
  coordinate_verification: 'TEXT',
  coordinate_verified_at: 'INTEGER',
  source_raw_ref: 'TEXT',
  opening_hours: 'TEXT',
  phone: 'TEXT',
  website: 'TEXT',
  external_map_url: 'TEXT',
  is_official: 'INTEGER',
  is_featured: 'INTEGER',
  status: 'TEXT',
  last_verified_at: 'INTEGER',
  published_at: 'INTEGER',
  created_at: 'INTEGER',
  updated_at: 'INTEGER'
} as const

interface AmapMarker {
  sourceRow: number
  name: string
  description: string | null
  locationCode: string
  address: string | null
}

interface RawReference {
  importer: typeof IMPORTER_ID
  file: typeof RAW_FILE_NAME
  sheet: typeof TARGET_SHEET_NAME
  sourceRow: number
  locationCode: string
}

interface ExistingPlace {
  id: string
  slug: string
  name: string
  sourceRawRef: string | null
}

interface DraftPlace {
  id: string
  slug: string
  name: string
  summary: string
  body: string
  scope: 'campus'
  type: string
  category: string | null
  address: string | null
  sourceRawRef: string
}

export interface ImportConflict {
  sourceRow: number | null
  locationCode: string | null
  name: string | null
  reason: string
  existingPlaceId?: string
}

export interface ImportResult {
  mode: 'dry-run' | 'apply'
  inputPath: string
  databasePath: string
  markerCount: number
  created: number
  wouldCreate: number
  skipped: number
  conflicts: number
  applied: boolean
  conflictDetails: ImportConflict[]
}

export interface ImportOptions {
  apply?: boolean
  inputPath?: string
  databasePath?: string
  now?: number
}

interface DatabaseColumn {
  name: string
  type: string
  notnull: number
  pk: number
}

interface IndexListRow {
  name: string
  unique: number
}

interface IndexColumnRow {
  name: string
}

interface ImportPlan {
  create: DraftPlace[]
  skipped: number
  conflicts: ImportConflict[]
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export class AmapDraftImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmapDraftImportError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertImport(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new AmapDraftImportError(message)
  }
}

function absolutePath(path: string): string {
  if (path === ':memory:') return path
  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

function textField(row: Record<string, unknown>, header: string, sourceRow: number): string | null {
  const value = row[header]
  assertImport(value === null || typeof value === 'string', `Row ${sourceRow}: ${header} must be text or null`)
  if (value === null || value === '') return null
  assertImport(value === value.trim(), `Row ${sourceRow}: ${header} has outer whitespace`)
  assertImport(!value.includes('\0'), `Row ${sourceRow}: ${header} contains a null byte`)
  return value
}

function markerDataFingerprint(sheet: Record<string, unknown>, rows: Record<string, unknown>[]): string {
  const canonical = JSON.stringify({
    headers: sheet.headers,
    rows: rows.map(row => [row._sourceRow, ...TARGET_HEADERS.map(header => row[header])])
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function parseAmapMarkers(rawValue: unknown): AmapMarker[] {
  assertImport(isRecord(rawValue), 'Raw import root must be an object')
  assertImport(rawValue.schemaVersion === 1, 'Raw import schemaVersion must be 1')
  assertImport(isRecord(rawValue.source), 'Raw import source metadata is missing')
  assertImport(rawValue.source.provider === 'AMap Work Map', 'Raw import provider is not AMap Work Map')
  assertImport(rawValue.source.sha256 === EXPECTED_WORKBOOK_SHA256, 'Raw import workbook SHA-256 does not match the authorized export')
  assertImport(Array.isArray(rawValue.sheets), 'Raw import sheets must be an array')

  const matchingSheets = rawValue.sheets.filter(sheet => isRecord(sheet) && sheet.name === TARGET_SHEET_NAME)
  assertImport(matchingSheets.length === 1, `Raw import must contain exactly one ${TARGET_SHEET_NAME} sheet`)
  assertImport(rawValue.sheets[0] === matchingSheets[0], `${TARGET_SHEET_NAME} must remain the first worksheet`)

  const sheet = matchingSheets[0]!
  assertImport(sheet.state === 'visible', `${TARGET_SHEET_NAME} sheet must be visible`)
  assertImport(sheet.maxRow === EXPECTED_MARKER_COUNT + 1, `${TARGET_SHEET_NAME} maxRow must be ${EXPECTED_MARKER_COUNT + 1}`)
  assertImport(sheet.maxColumn === TARGET_HEADERS.length, `${TARGET_SHEET_NAME} maxColumn must be ${TARGET_HEADERS.length}`)
  assertImport(Array.isArray(sheet.headers), `${TARGET_SHEET_NAME} headers must be an array`)
  assertImport(
    JSON.stringify(sheet.headers) === JSON.stringify(TARGET_HEADERS),
    `${TARGET_SHEET_NAME} headers or their order changed`
  )
  assertImport(Array.isArray(sheet.rows), `${TARGET_SHEET_NAME} rows must be an array`)
  const sheetRows: unknown[] = sheet.rows
  assertImport(sheetRows.length === EXPECTED_MARKER_COUNT, `${TARGET_SHEET_NAME} must contain exactly ${EXPECTED_MARKER_COUNT} markers`)

  const expectedRowKeys = new Set(['_sourceRow', ...TARGET_HEADERS])
  const names = new Set<string>()
  const locationCodes = new Set<string>()
  const rows: Record<string, unknown>[] = []
  const markers = sheetRows.map((rowValue, index): AmapMarker => {
    const expectedSourceRow = index + 2
    assertImport(isRecord(rowValue), `Marker ${index + 1} must be an object`)
    rows.push(rowValue)
    assertImport(rowValue._sourceRow === expectedSourceRow, `Marker ${index + 1} must have source row ${expectedSourceRow}`)

    const actualKeys = Object.keys(rowValue)
    assertImport(
      actualKeys.length === expectedRowKeys.size && actualKeys.every(key => expectedRowKeys.has(key)),
      `Row ${expectedSourceRow}: target columns changed`
    )
    for (const header of TARGET_HEADERS) {
      const value = rowValue[header]
      assertImport(
        value === null || ['string', 'number', 'boolean'].includes(typeof value),
        `Row ${expectedSourceRow}: ${header} must contain a scalar value`
      )
    }

    const name = textField(rowValue, TARGET_HEADERS[0], expectedSourceRow)
    const description = textField(rowValue, TARGET_HEADERS[4], expectedSourceRow)
    const locationCode = textField(rowValue, TARGET_HEADERS[6], expectedSourceRow)
    const address = textField(rowValue, TARGET_HEADERS[7], expectedSourceRow)
    assertImport(name !== null, `Row ${expectedSourceRow}: name is required`)
    assertImport(name.length <= 120, `Row ${expectedSourceRow}: name exceeds 120 characters`)
    assertImport(description === null || description.length <= 59_000, `Row ${expectedSourceRow}: description is too long`)
    assertImport(locationCode !== null && LOCATION_CODE_RE.test(locationCode), `Row ${expectedSourceRow}: location code is invalid`)
    assertImport(address === null || address.length <= 300, `Row ${expectedSourceRow}: address exceeds 300 characters`)
    assertImport(rowValue[TARGET_HEADERS[9]] === null, `Row ${expectedSourceRow}: creator data must remain redacted`)
    assertImport(!names.has(name), `Row ${expectedSourceRow}: duplicate marker name ${name}`)
    assertImport(!locationCodes.has(locationCode), `Row ${expectedSourceRow}: duplicate location code ${locationCode}`)
    names.add(name)
    locationCodes.add(locationCode)

    return {
      sourceRow: expectedSourceRow,
      name,
      description,
      locationCode,
      address
    }
  })

  assertImport(
    markerDataFingerprint(sheet, rows) === EXPECTED_MARKER_DATA_SHA256,
    'Marker data fingerprint does not match the reviewed 76-marker export'
  )
  return markers
}

export function classifyMarker(name: string): { type: string, category: string | null } {
  if (name.includes('宿舍')) return { type: 'dormitory', category: 'dorm' }
  if (name.includes('教学楼')) return { type: 'teaching-building', category: 'campus-building' }
  if (name.includes('餐厅') || name.includes('食堂')) return { type: 'dining', category: 'food' }
  if (name.includes('快递') || name.includes('驿站')) return { type: 'express-service', category: 'express' }
  if (name.includes('医务所') || name.includes('医务室') || name.includes('校医院')) return { type: 'health-service', category: 'service' }
  if (name.includes('公交站') || name.includes('公交车')) return { type: 'transit-stop', category: 'service' }
  if (/^(南|北|东|西|正)?门$/.test(name)) return { type: 'gate', category: 'gate' }
  if (name.includes('图书馆')) return { type: 'library', category: 'campus-building' }
  if (name.includes('体育场') || name.includes('球场') || name.includes('操场')) return { type: 'sports-ground', category: 'service' }
  if (name.includes('礼堂') || name.includes('报告厅')) return { type: 'event-venue', category: 'campus-building' }
  if (name.endsWith('楼')) return { type: 'building', category: null }
  return { type: 'place', category: null }
}

function deterministicId(marker: AmapMarker): string {
  const bytes = createHash('sha256')
    .update(`${IMPORTER_ID}\0${marker.sourceRow}\0${marker.locationCode}`, 'utf8')
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function rawReference(marker: AmapMarker): RawReference {
  return {
    importer: IMPORTER_ID,
    file: RAW_FILE_NAME,
    sheet: TARGET_SHEET_NAME,
    sourceRow: marker.sourceRow,
    locationCode: marker.locationCode
  }
}

function buildDraft(marker: AmapMarker): DraftPlace {
  const reviewed = amapImportedPlaces.find(place => place.sourceRow === marker.sourceRow)
  assertImport(reviewed, `Row ${marker.sourceRow}: reviewed map classification is missing`)
  assertImport(reviewed.name === marker.name, `Row ${marker.sourceRow}: reviewed map classification name does not match`)
  assertImport(reviewed.locationCode === marker.locationCode, `Row ${marker.sourceRow}: reviewed map classification WIA code does not match`)
  const classification = {
    ...classifyMarker(marker.name),
    category: reviewed.category
  }
  const pendingNote = '待核验：本条来自用户授权的高德工作地图导出，当前缺少经纬度；名称、描述和文字地址均未完成独立核验，不能用于导航。'
  const summary = marker.description
    ? `${marker.description}\n（高德工作地图导入草稿，内容待人工核验。）`
    : '高德工作地图导入草稿；名称、文字地址和具体位置均待人工核验。'
  assertImport(summary.length <= 600, `Row ${marker.sourceRow}: generated summary exceeds 600 characters`)

  return {
    id: deterministicId(marker),
    slug: `amap-workmap-20260713-r${String(marker.sourceRow).padStart(3, '0')}`,
    name: marker.name,
    summary,
    body: marker.description ? `${pendingNote}\n\n原始描述：\n\n${marker.description}` : pendingNote,
    scope: 'campus',
    type: classification.type,
    category: classification.category,
    address: marker.address,
    sourceRawRef: JSON.stringify(rawReference(marker))
  }
}

function parseRawReference(value: string | null): RawReference | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) return null
    if (parsed.importer !== IMPORTER_ID || parsed.file !== RAW_FILE_NAME || parsed.sheet !== TARGET_SHEET_NAME) return null
    if (!Number.isInteger(parsed.sourceRow)
      || Number(parsed.sourceRow) < 2
      || Number(parsed.sourceRow) > EXPECTED_MARKER_COUNT + 1
      || typeof parsed.locationCode !== 'string'
      || !LOCATION_CODE_RE.test(parsed.locationCode)) return null
    return parsed as unknown as RawReference
  } catch {
    return null
  }
}

function isRelatedInvalidReference(value: string | null): boolean {
  if (!value) return false
  if (!value.includes(IMPORTER_ID) && !value.includes(RAW_FILE_NAME)) return false
  return parseRawReference(value) === null
}

function validateDatabaseSchema(database: InstanceType<typeof BetterSqlite3>): void {
  const columns = database.prepare(`PRAGMA table_info('places')`).all() as DatabaseColumn[]
  assertImport(columns.length > 0, 'Target database has no places table; run pnpm db:migrate first')
  const byName = new Map(columns.map(column => [column.name, column]))
  for (const [name, type] of Object.entries(PLACE_COLUMNS)) {
    const column = byName.get(name)
    assertImport(column, `Target places table is missing column ${name}`)
    assertImport(column.type.toUpperCase() === type, `Target places.${name} must use SQLite type ${type}`)
  }
  assertImport(byName.get('id')?.pk === 1, 'Target places.id must be the primary key')
  for (const name of ['longitude', 'latitude', 'coordinate_system', 'coordinate_verified_at', 'source_raw_ref', 'last_verified_at', 'published_at']) {
    assertImport(byName.get(name)?.notnull === 0, `Target places.${name} must allow null`)
  }

  const indexRows = database.prepare(`PRAGMA index_list('places')`).all() as IndexListRow[]
  const hasUniqueSlug = indexRows.some((index) => {
    if (index.unique !== 1) return false
    const indexColumns = database.prepare('SELECT name FROM pragma_index_info(?)').all(index.name) as IndexColumnRow[]
    return indexColumns.length === 1 && indexColumns[0]?.name === 'slug'
  })
  assertImport(hasUniqueSlug, 'Target places table must have a unique slug index')

  const sourceColumns = database.prepare(`PRAGMA table_info('place_sources')`).all() as DatabaseColumn[]
  assertImport(sourceColumns.some(column => column.name === 'place_id'), 'Target database has no compatible place_sources table')
}

function buildPlan(database: InstanceType<typeof BetterSqlite3>, markers: AmapMarker[]): ImportPlan {
  const existing = database.prepare(`
    SELECT id, slug, name, source_raw_ref AS sourceRawRef
    FROM places
  `).all() as ExistingPlace[]
  const parsed = existing.map(place => ({ place, ref: parseRawReference(place.sourceRawRef) }))
  const conflicts: ImportConflict[] = existing
    .filter(place => isRelatedInvalidReference(place.sourceRawRef))
    .map(place => ({
      sourceRow: null,
      locationCode: null,
      name: place.name,
      reason: 'Existing place has a malformed reference to this import; review it manually',
      existingPlaceId: place.id
    }))
  const create: DraftPlace[] = []
  let skipped = 0

  for (const marker of markers) {
    const exactMatches = parsed.filter(item => item.ref?.sourceRow === marker.sourceRow && item.ref.locationCode === marker.locationCode)
    const rowMatches = parsed.filter(item => item.ref?.sourceRow === marker.sourceRow)
    const codeMatches = parsed.filter(item => item.ref?.locationCode === marker.locationCode)
    const conflictBase = {
      sourceRow: marker.sourceRow,
      locationCode: marker.locationCode,
      name: marker.name
    }

    if (exactMatches.length === 1 && rowMatches.length === 1 && codeMatches.length === 1) {
      skipped += 1
      continue
    }
    if (exactMatches.length > 1) {
      conflicts.push({ ...conflictBase, reason: 'More than one existing place uses this source row and WIA code' })
      continue
    }
    if (rowMatches.length > 0 || codeMatches.length > 0) {
      const match = rowMatches[0] ?? codeMatches[0]
      conflicts.push({
        ...conflictBase,
        reason: 'Source row or WIA code is already paired with a different import identity',
        existingPlaceId: match?.place.id
      })
      continue
    }

    const draft = buildDraft(marker)
    const idCollision = existing.find(place => place.id === draft.id)
    const slugCollision = existing.find(place => place.slug === draft.slug)
    const nameCollision = existing.find(place => place.name === draft.name)
    const collision = idCollision ?? slugCollision ?? nameCollision
    if (collision) {
      conflicts.push({
        ...conflictBase,
        reason: idCollision
          ? 'Deterministic import ID is already used by another place'
          : slugCollision
            ? 'Import slug is already used by another place'
            : 'A place with the same name exists without the matching source row and WIA code',
        existingPlaceId: collision.id
      })
      continue
    }
    create.push(draft)
  }

  return { create, skipped, conflicts }
}

function insertDrafts(database: InstanceType<typeof BetterSqlite3>, drafts: DraftPlace[], now: number): number {
  const insert = database.prepare(`
    INSERT INTO places (
      id, slug, name, summary, body, scope, type, category, address,
      campus_area, floor, room,
      longitude, latitude, coordinate_system, coordinate_verification, coordinate_verified_at,
      source_raw_ref, opening_hours, phone, website, external_map_url,
      is_official, is_featured, status, last_verified_at, published_at, created_at, updated_at
    ) VALUES (
      @id, @slug, @name, @summary, @body, @scope, @type, @category, @address,
      NULL, NULL, NULL,
      NULL, NULL, NULL, 'missing', NULL,
      @sourceRawRef, NULL, NULL, NULL, NULL,
      0, 0, 'draft', NULL, NULL, @now, @now
    )
  `)
  let created = 0
  for (const draft of drafts) {
    const result = insert.run({ ...draft, now })
    assertImport(result.changes === 1, `Failed to create draft for ${draft.name}`)
    created += result.changes
  }
  return created
}

function loadMarkers(inputPath: string): AmapMarker[] {
  assertImport(existsSync(inputPath), `Raw import file does not exist: ${inputPath}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(inputPath, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AmapDraftImportError(`Raw import JSON is invalid: ${message}`)
  }
  return parseAmapMarkers(parsed)
}

export function importAmapDrafts(options: ImportOptions = {}): ImportResult {
  const apply = options.apply === true
  const inputPath = absolutePath(options.inputPath ?? DEFAULT_INPUT_PATH)
  const databasePath = absolutePath(options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite')
  assertImport(databasePath !== ':memory:', 'CLI imports require a file-backed SQLite database')
  assertImport(existsSync(databasePath), `Target database does not exist: ${databasePath}; run pnpm db:migrate first`)
  const markers = loadMarkers(inputPath)
  const database = new BetterSqlite3(databasePath, { readonly: !apply, fileMustExist: true })

  try {
    database.pragma('foreign_keys = ON')
    validateDatabaseSchema(database)
    if (!apply) {
      const plan = buildPlan(database, markers)
      return {
        mode: 'dry-run',
        inputPath,
        databasePath,
        markerCount: markers.length,
        created: 0,
        wouldCreate: plan.create.length,
        skipped: plan.skipped,
        conflicts: plan.conflicts.length,
        applied: false,
        conflictDetails: plan.conflicts
      }
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      const plan = buildPlan(database, markers)
      if (plan.conflicts.length > 0) {
        database.exec('ROLLBACK')
        return {
          mode: 'apply',
          inputPath,
          databasePath,
          markerCount: markers.length,
          created: 0,
          wouldCreate: plan.create.length,
          skipped: plan.skipped,
          conflicts: plan.conflicts.length,
          applied: false,
          conflictDetails: plan.conflicts
        }
      }
      const created = insertDrafts(database, plan.create, options.now ?? Date.now())
      database.exec('COMMIT')
      return {
        mode: 'apply',
        inputPath,
        databasePath,
        markerCount: markers.length,
        created,
        wouldCreate: plan.create.length,
        skipped: plan.skipped,
        conflicts: 0,
        applied: true,
        conflictDetails: []
      }
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
    'Usage: pnpm amap:drafts [--dry-run] [--apply] [--database PATH] [--input PATH]',
    '',
    'Default mode is read-only dry-run. Only --apply writes to SQLite.',
    `Default input: ${DEFAULT_INPUT_PATH}`,
    'Default database: NUXT_DATABASE_PATH or ./data/yeu.sqlite'
  ].join('\n')
}

function parseCliArgs(argv: string[]): ImportOptions & { help: boolean } {
  const options: ImportOptions & { help: boolean } = { apply: false, help: false }
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
      throw new AmapDraftImportError(`Unknown argument: ${argument}`)
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
    const result = importAmapDrafts(options)
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
