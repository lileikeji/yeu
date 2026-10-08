/**
 * Batch AMap rating seed for campus-area merchants (旧区/新区).
 * Run on the production server (needs AMAP_WEB_SERVICE_KEY + prod DB):
 *   npx tsx scripts/seed-amap-campus-ratings.ts
 *
 * Scans several campus centers with typed PlaceSearch around queries, collects
 * every merchant POI id, then fetches each one's aggregate rating via
 * /v3/place/detail and upserts into place_amap_ratings. Existing rows are
 * refreshed (INSERT OR REPLACE semantics via upsertAmapRating).
 */
import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { fetchAmapRatingByPoiId } from '../server/modules/place-reviews/amap'
import { upsertAmapRating } from '../server/modules/place-reviews/service'

const KEYWORDS = [
  '餐饮', '美食', '餐厅', '小吃', '奶茶', '咖啡', '面包',
  '超市', '便利店', '水果', '药店', '诊所', '医院',
  '快递', '物流', '驿站', '电信', '移动', '联通', '银行',
  '理发', '美发', '维修', '洗衣', '打印', '眼镜'
] as const

const CENTERS: Array<{ label: string, lng: number, lat: number, radius: number }> = [
  { label: '旧区', lng: 118.6165, lat: 25.1129, radius: 900 },
  { label: '新区', lng: 118.6012, lat: 25.1055, radius: 900 },
  { label: '校园中心', lng: 118.608, lat: 25.109, radius: 1200 }
]

const PAGE_SIZE = 20
const MAX_PAGES = 8
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
  if (!key) {
    throw new Error('AMAP_WEB_SERVICE_KEY is not configured')
  }
  const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
  const client = getDatabase(databasePath)
  runMigrations(client)

  const seen = new Map<string, { name: string, type: string }>()
  for (const center of CENTERS) {
    for (const keyword of KEYWORDS) {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        try {
          const pois = await aroundSearch(key, center, keyword, page)
          for (const poi of pois) {
            const id = poi.id?.trim()
            const name = poi.name?.trim()
            if (id && name) seen.set(id, { name, type: poi.type ?? '' })
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

  process.stdout.write(`\nCollected ${seen.size} unique POIs. Fetching ratings...\n`)
  const ids = [...seen.keys()]
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
        withScore += 1
        process.stdout.write(`${rating.score !== null ? '✓' : '·'} ${id} ${meta.name} score=${rating.score ?? '-'} cost=${rating.cost ?? '-'}\n`)
        if (rating.score === null) noScore += 1
      } else {
        noScore += 1
        process.stdout.write(`· ${id} ${meta.name} (no rating)\n`)
      }
    } catch (error) {
      failed += 1
      process.stdout.write(`✗ ${id} ${meta.name} FAILED: ${error instanceof Error ? error.message : String(error)}\n`)
    }
    await sleep(REQUEST_DELAY_MS)
  }

  process.stdout.write(`\nDone: collected=${seen.size} withScore=${withScore} noScore=${noScore} failed=${failed}\n`)
  closeDatabase(databasePath)
}

main().catch((error) => {
  process.stderr.write(`seed-amap-campus failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
