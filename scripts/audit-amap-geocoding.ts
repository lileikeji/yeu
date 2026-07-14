import './load-env'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS } from '../map/core/campus'

const DEFAULT_INPUT = resolve('data/imports/amap-workmap-2026-07-13.raw.json')
const DEFAULT_OUTPUT = resolve('.data/amap-geocode-audit.json')
const LOCATION_CODE_HEADER = '位置编码(导出的内容若需再次导入，请不要修改此列)'

interface WorkMapRow {
  _sourceRow: number
  名称: string
  地址?: string | null
  [LOCATION_CODE_HEADER]?: string | null
}

interface WorkMapExport {
  sheets: Array<{ name: string, rows: WorkMapRow[] }>
}

interface AMapGeocode {
  formatted_address?: string
  location?: string
  level?: string
}

interface AMapResponse {
  status?: string
  info?: string
  infocode?: string
  geocodes?: AMapGeocode[]
}

export type CandidateStatus = 'named-poi' | 'generic-match' | 'outside-review-bounds' | 'no-match'

export interface GeocodeCandidate {
  sourceRow: number
  name: string
  address: string | null
  wiaCode: string | null
  query: string
  status: CandidateStatus
  location: string | null
  lng: number | null
  lat: number | null
  crs: 'GCJ02' | null
  formattedAddress: string | null
  level: string | null
}

function normalizedName(value: string): string {
  return value.replace(/[（）()\s·-]/g, '')
}

export function classifyCandidate(name: string, geocode?: AMapGeocode): Omit<GeocodeCandidate, 'sourceRow' | 'name' | 'address' | 'wiaCode' | 'query'> {
  const location = geocode?.location?.trim() || ''
  const [lngText, latText] = location.split(',')
  const lng = Number(lngText)
  const lat = Number(latText)

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return {
      status: 'no-match', location: null, lng: null, lat: null, crs: null,
      formattedAddress: geocode?.formatted_address || null,
      level: geocode?.level || null
    }
  }

  const bounds = YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
  const inBounds = lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north
  const formattedAddress = geocode?.formatted_address || ''
  const named = normalizedName(formattedAddress).includes(normalizedName(name))

  return {
    status: named && geocode?.level === '兴趣点' ? 'named-poi' : !inBounds ? 'outside-review-bounds' : 'generic-match',
    location,
    lng,
    lat,
    crs: 'GCJ02',
    formattedAddress: formattedAddress || null,
    level: geocode?.level || null
  }
}

async function requestGeocode(key: string, address: string, fetchImpl: typeof fetch): Promise<AMapGeocode | undefined> {
  const url = new URL('https://restapi.amap.com/v3/geocode/geo')
  url.searchParams.set('key', key)
  url.searchParams.set('address', address)
  url.searchParams.set('city', '泉州市')
  url.searchParams.set('output', 'JSON')
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'YEU-Freshman-Guide/0.1' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(`AMap geocoding HTTP ${response.status}`)
    const body = await response.json() as AMapResponse
    if (body.status === '1') return body.geocodes?.[0]
    if (body.infocode !== '10021' || attempt === 3) {
      throw new Error(`AMap geocoding failed: ${body.infocode || body.info || 'unknown'}`)
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1000 * (attempt + 1)))
  }
  return undefined
}

export async function auditRows(rows: WorkMapRow[], key: string, fetchImpl: typeof fetch = fetch): Promise<GeocodeCandidate[]> {
  const candidates: GeocodeCandidate[] = []
  for (const row of rows) {
    const query = `福建省泉州市洛江区马甲镇仰恩大学${row.名称}`
    const geocode = await requestGeocode(key, query, fetchImpl)
    candidates.push({
      sourceRow: row._sourceRow,
      name: row.名称,
      address: row.地址?.trim() || null,
      wiaCode: row[LOCATION_CODE_HEADER]?.trim() || null,
      query,
      ...classifyCandidate(row.名称, geocode)
    })
    await new Promise(resolveDelay => setTimeout(resolveDelay, 350))
  }
  return candidates
}

function summarize(candidates: GeocodeCandidate[]) {
  const statusCounts = Object.fromEntries(
    (['named-poi', 'generic-match', 'outside-review-bounds', 'no-match'] as CandidateStatus[])
      .map(status => [status, candidates.filter(candidate => candidate.status === status).length])
  )
  const coordinateGroups = new Map<string, string[]>()
  for (const candidate of candidates) {
    if (!candidate.location) continue
    coordinateGroups.set(candidate.location, [...(coordinateGroups.get(candidate.location) || []), candidate.name])
  }
  const duplicateCoordinates = [...coordinateGroups.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([location, names]) => ({ location, names }))
  return { total: candidates.length, statusCounts, duplicateCoordinates }
}

async function main() {
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim()
  if (!key) throw new Error('AMAP_WEB_SERVICE_KEY is required')
  const inputPath = resolve(process.argv[2] || DEFAULT_INPUT)
  const outputPath = resolve(process.argv[3] || DEFAULT_OUTPUT)
  const inputBytes = await readFile(inputPath)
  const workMap = JSON.parse(inputBytes.toString('utf8')) as WorkMapExport
  const markerSheet = workMap.sheets.find(sheet => sheet.name === '标记位置')
  if (!markerSheet) throw new Error('标记位置 sheet is missing')

  const candidates = await auditRows(markerSheet.rows, key)
  const report = {
    generatedAt: new Date().toISOString(),
    provider: 'AMap Web Service geocoding v3',
    input: { path: inputPath, sha256: createHash('sha256').update(inputBytes).digest('hex') },
    policy: {
      coordinateSystem: 'GCJ02', databaseWrites: false, publishableEvidence: false,
      note: 'Geocoding results are candidates only; they do not recover original WIA marker coordinates.'
    },
    summary: summarize(candidates),
    candidates
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ outputPath, ...report.summary }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
