import './load-env'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  fetchAmapRatingByLocation,
  fetchAmapRatingByPoiId
} from '../server/modules/place-reviews/amap'
import { upsertAmapRating } from '../server/modules/place-reviews/service'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'

/**
 * Seed AMap aggregate ratings for map places that carry ratings (food /
 * nearby merchants). Two lookup sources:
 *
 * 1. Owner-map imported places (categories food / nearby) — matched by name +
 *    GCJ-02 coordinates via `/v3/place/around`, keyed by the public map place
 *    id (`amap-import-row-XXX`) that the map popup uses.
 * 2. Nearby merchant candidates (data/imports/amap-nearby-poi-candidates-*.json)
 *    — matched exactly by `amapPoiId` via `/v3/place/detail`, keyed by the
 *    AMap POI id (the same id native map search results carry).
 *
 * Only aggregate scores are stored (score / average cost), never review text.
 */

const MERCHANT_CATEGORIES = new Set(['food', 'nearby'])
const CANDIDATES_PATH = 'data/imports/amap-nearby-poi-candidates-2026-07-15.json'
const REQUEST_DELAY_MS = 350

interface NearbyCandidate {
  centerId: string
  name: string
  category: string
  location: { lng: number, lat: number, crs: string }
  amapPoiId: string
}

interface Summary {
  attempted: number
  stored: number
  withScore: number
  withCost: number
  failed: number
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

  const summary: Summary = { attempted: 0, stored: 0, withScore: 0, withCost: 0, failed: 0 }

  const importedTargets = amapImportedPlaces
    .filter(place => MERCHANT_CATEGORIES.has(place.category))
    .map(place => ({
      key: place.id,
      name: place.name,
      location: place.sourcePoint
    }))

  for (const target of importedTargets) {
    summary.attempted += 1
    try {
      const rating = await fetchAmapRatingByLocation(key, {
        name: target.name,
        location: { lng: target.location.lng, lat: target.location.lat }
      })
      if (rating) {
        upsertAmapRating(client, target.key, rating)
        summary.stored += 1
        if (rating.score !== null) summary.withScore += 1
        if (rating.cost !== null) summary.withCost += 1
        process.stdout.write(`imported ${target.key} (${target.name}) -> ${rating.poiName} score=${rating.score ?? '-'} cost=${rating.cost ?? '-'}\n`)
      } else {
        process.stdout.write(`imported ${target.key} (${target.name}) -> no POI matched\n`)
      }
    } catch (error) {
      summary.failed += 1
      process.stdout.write(`imported ${target.key} (${target.name}) FAILED: ${error instanceof Error ? error.message : String(error)}\n`)
    }
    await sleep(REQUEST_DELAY_MS)
  }

  let candidates: NearbyCandidate[] = []
  try {
    const raw = readFileSync(resolve(process.cwd(), CANDIDATES_PATH), 'utf8')
    const parsed = JSON.parse(raw) as { candidates?: NearbyCandidate[] }
    candidates = parsed.candidates ?? []
  } catch (error) {
    process.stdout.write(`candidates file unreadable: ${error instanceof Error ? error.message : String(error)}\n`)
  }

  for (const candidate of candidates) {
    summary.attempted += 1
    try {
      const rating = await fetchAmapRatingByPoiId(key, candidate.amapPoiId)
      if (rating) {
        upsertAmapRating(client, candidate.amapPoiId, rating)
        summary.stored += 1
        if (rating.score !== null) summary.withScore += 1
        if (rating.cost !== null) summary.withCost += 1
        process.stdout.write(`candidate ${candidate.amapPoiId} (${candidate.name}) -> score=${rating.score ?? '-'} cost=${rating.cost ?? '-'}\n`)
      } else {
        process.stdout.write(`candidate ${candidate.amapPoiId} (${candidate.name}) -> POI not found\n`)
      }
    } catch (error) {
      summary.failed += 1
      process.stdout.write(`candidate ${candidate.amapPoiId} (${candidate.name}) FAILED: ${error instanceof Error ? error.message : String(error)}\n`)
    }
    await sleep(REQUEST_DELAY_MS)
  }

  process.stdout.write(`\nDone: attempted=${summary.attempted} stored=${summary.stored} withScore=${summary.withScore} withCost=${summary.withCost} failed=${summary.failed}\n`)
  closeDatabase(databasePath)
}

main().catch((error) => {
  process.stderr.write(`seed-amap-ratings failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
