/**
 * Batch AMap rating seed for the two student-street areas (新区学生街 / 旧区学生街).
 * Run on the production server (needs AMAP_WEB_SERVICE_KEY + prod DB):
 *   npx tsx scripts/seed-amap-student-street-ratings.ts
 *
 * Scans the two street areas with typed PlaceSearch around queries, keeps only
 * POIs INSIDE the street polygons (ray-casting point-in-polygon), then fetches
 * each merchant's aggregate rating via /v3/place/detail and upserts into
 * place_amap_ratings. Existing rows are refreshed.
 */
import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { fetchAmapRatingByPoiId } from '../server/modules/place-reviews/amap'
import { upsertAmapRating } from '../server/modules/place-reviews/service'
import { amapImportedAreas } from '../data/seeds/amap-imported-areas'

interface Point { lng: number, lat: number }

// POIs within this many metres of a street polygon edge still count as inside
// (高德 POI 坐标与多边形边界有微小偏差，30m 容差避免漏录街边店).
const POLYGON_TOLERANCE_METRES = 30

function haversineMetres(from: Point, to: Point): number {
  const rad = Math.PI / 180
  const dLat = (to.lat - from.lat) * rad
  const dLng = (to.lng - from.lng) * rad
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]!.lng
    const yi = polygon[i]!.lat
    const xj = polygon[j]!.lng
    const yj = polygon[j]!.lat
    const intersects = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function inAnyStreetArea(point: Point): string | null {
  for (let index = 0; index < STREET_POLYGONS.length; index += 1) {
    const polygon = STREET_POLYGONS[index]!
    if (pointInPolygon(point, polygon)) return STREET_AREAS[index]!.name
    // Tolerance: accept points just outside the polygon edge.
    let edgeMin = Number.POSITIVE_INFINITY
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i]!
      const b = polygon[j]!
      // Distance from point to segment ab.
      const abx = b.lng - a.lng
      const aby = b.lat - a.lat
      const lenSq = abx * abx + aby * aby
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((point.lng - a.lng) * abx + (point.lat - a.lat) * aby) / lenSq)) : 0
      const cx = a.lng + t * abx
      const cy = a.lat + t * aby
      const d = haversineMetres(point, { lng: cx, lat: cy })
      if (d < edgeMin) edgeMin = d
    }
    if (edgeMin <= POLYGON_TOLERANCE_METRES) return STREET_AREAS[index]!.name
  }
  return null
}

const STREET_AREAS = amapImportedAreas
  .filter(area => area.name === '新区学生街' || area.name === '旧区学生街')

if (STREET_AREAS.length !== 2) {
  throw new Error(`Expected 2 street areas, found ${STREET_AREAS.length}`)
}

const STREET_POLYGONS = STREET_AREAS.map(area => area.paths[0] ?? [])
const STREET_CENTERS: Array<{ label: string, lng: number, lat: number, radius: number }> = [
  { label: '新区学生街', lng: 118.6012, lat: 25.1059, radius: 900 },
  { label: '旧区学生街', lng: 118.6153, lat: 25.1094, radius: 700 },
  // Edge extensions so POIs just outside the polygon still get scanned and
  // the polygon-inclusion test below (with tolerance) decides membership.
  { label: '新区延伸', lng: 118.6018, lat: 25.1052, radius: 500 },
  { label: '旧区延伸', lng: 118.6150, lat: 25.1088, radius: 400 }
]

const KEYWORDS = [
  '餐饮', '美食', '餐厅', '小吃', '面馆', '面', '粉', '粥', '快餐', '早餐', '夜宵',
  '奶茶', '咖啡', '面包', '蛋糕', '甜品', '烧烤', '火锅', '烤鱼', '麻辣烫', '卤味',
  '超市', '便利店', '水果', '零食', '文具', '杂货', '五金',
  '药店', '诊所', '美容', '美发', '理发', '美甲', '洗浴', '足疗',
  '快递', '物流', '驿站', '电信', '移动', '联通', '银行', '照相', '摄影',
  '维修', '洗衣', '干洗', '打印', '复印', '眼镜', '服装', '鞋', '饰品', '手机'
] as const

const PAGE_SIZE = 20
const MAX_PAGES = 10
const REQUEST_DELAY_MS = 200

interface AmapPoiRow {
  id?: string
  name?: string
  type?: string
  location?: string
}

interface AroundResponse {
  status?: string
  info?: string
  count?: string
  pois?: AmapPoiRow[]
}

async function aroundSearch(key: string, center: { lng: number, lat: number }, keyword: string, page: number): Promise<AmapPoiRow[]> {
  const url = new URL('https://restapi.amap.com/v3/place/around')
  url.searchParams.set('key', key)
  url.searchParams.set('location', `${center.lng},${center.lat}`)
  url.searchParams.set('keywords', keyword)
  url.searchParams.set('radius', String(center.radius))
  url.searchParams.set('offset', String(PAGE_SIZE))
  url.searchParams.set('page', String(page))
  url.searchParams.set('extensions', 'base')
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new Error(`AMap HTTP ${response.status}`)
  const payload = await response.json() as AroundResponse
  if (payload.status !== '1') throw new Error(`AMap: ${payload.info}`)
  return payload.pois ?? []
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const key = String(process.env.AMAP_WEB_SERVICE_KEY || '').trim()
  const dryRun = process.env.DRY_RUN === '1'
  if (!dryRun && !key) {
    throw new Error('AMAP_WEB_SERVICE_KEY is not configured')
  }
  const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
  const client = getDatabase(databasePath)
  runMigrations(client)

  const seen = new Map<string, { name: string, type: string, inArea: string }>()
  for (const center of STREET_CENTERS) {
    for (const keyword of KEYWORDS) {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        try {
          const pois = dryRun ? [] : await aroundSearch(key, center, keyword, page)
          for (const poi of pois) {
            const id = poi.id?.trim()
            const name = poi.name?.trim()
            if (!id || !name) continue
            const parts = (poi.location ?? '').split(',')
            const lng = Number(parts[0])
            const lat = Number(parts[1])
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
            const point = { lng, lat }
            const area = inAnyStreetArea(point)
            if (!area) continue
            const existing = seen.get(id)
            if (!existing) {
              seen.set(id, { name, type: poi.type ?? '', inArea: area })
            }
          }
          if (pois.length < PAGE_SIZE) break
        } catch (error) {
          process.stdout.write(`scan ${center.label}/${keyword} page ${page} FAILED: ${error instanceof Error ? error.message : String(error)}\n`)
          break
        }
        await sleep(REQUEST_DELAY_MS)
      }
    }
  }

  process.stdout.write(`\nCollected ${seen.size} unique POIs inside the two student streets. Fetching ratings...\n`)
  const ids = [...seen.keys()]
  if (dryRun) {
    for (const id of ids) {
      const meta = seen.get(id)!
      process.stdout.write(`[${meta.inArea}] ${id} ${meta.name}\n`)
    }
    process.stdout.write(`\nDRY RUN: ${seen.size} POIs would be rated. Set DRY_RUN=0 with AMAP_WEB_SERVICE_KEY to fetch.\n`)
    closeDatabase(databasePath)
    return
  }
  let withScore = 0
  let noScore = 0
  let failed = 0
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!
    const meta = seen.get(id)!
    try {
      const rating = await fetchAmapRatingByPoiId(key, id)
      if (rating) {
        upsertAmapRating(client, id, rating)
        if (rating.score !== null) withScore += 1
        else noScore += 1
        process.stdout.write(`${rating.score !== null ? '✓' : '·'} [${meta.inArea}] ${id} ${meta.name} score=${rating.score ?? '-'} cost=${rating.cost ?? '-'}\n`)
      } else {
        noScore += 1
        process.stdout.write(`· [${meta.inArea}] ${id} ${meta.name} (no rating)\n`)
      }
    } catch (error) {
      failed += 1
      process.stdout.write(`✗ [${meta.inArea}] ${id} ${meta.name} FAILED: ${error instanceof Error ? error.message : String(error)}\n`)
    }
    await sleep(REQUEST_DELAY_MS)
  }

  process.stdout.write(`\nDone: insideStreets=${seen.size} withScore=${withScore} noScore=${noScore} failed=${failed}\n`)
  closeDatabase(databasePath)
}

main().catch((error) => {
  process.stderr.write(`seed-amap-street failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
