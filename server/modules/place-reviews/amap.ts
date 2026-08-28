/**
 * AMap Web Service POI rating lookups (seed data for the map rating popup).
 *
 * Only the platform's aggregate score is referenced — never third-party review
 * text — consistent with the project policy of not copying reviews, scores,
 * menus or user photos from other platforms.
 */

export interface AmapRatingLookup {
  poiId?: string
  name: string
  /** GCJ-02 coordinates, as AMap returns and expects them. */
  location: { lng: number, lat: number }
}

export interface AmapPoiRating {
  poiId: string
  poiName: string
  /** Aggregate score from `biz_ext.rating`, 0..5, or null when absent. */
  score: number | null
  /** Average cost per person from `biz_ext.cost` (yuan), or null. */
  cost: number | null
}

interface AmapPoiPayload {
  id?: string
  name?: string
  location?: string
  biz_ext?: { rating?: string, cost?: string }
}

interface AmapAroundResponse {
  status?: string
  info?: string
  pois?: AmapPoiPayload[]
}

interface AmapDetailResponse {
  status?: string
  info?: string
  pois?: AmapPoiPayload[]
}

/**
 * Node global fetch works both inside nitro request handlers and in standalone
 * `tsx` scripts (unlike `$fetch`, which nitro auto-imports only in the server
 * runtime). AbortSignal.timeout mirrors the previous `$fetch` timeout.
 */
async function amapGet<T>(url: string, query: Record<string, string | number>): Promise<T> {
  const target = new URL(url)
  for (const [name, value] of Object.entries(query)) {
    target.searchParams.set(name, String(value))
  }
  const response = await fetch(target, {
    signal: AbortSignal.timeout(8_000)
  })
  if (!response.ok) {
    throw new Error(`AMap HTTP ${response.status}`)
  }
  return await response.json() as T
}

function parseFiniteScore(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) return null
  return Math.round(parsed * 100) / 100
}

function parseFiniteCost(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000) return null
  return Math.round(parsed * 100) / 100
}

export function parsePoiRating(poi: AmapPoiPayload): AmapPoiRating | null {
  const poiId = poi.id?.trim()
  const poiName = poi.name?.trim()
  if (!poiId || !poiName) return null
  return {
    poiId,
    poiName,
    score: parseFiniteScore(poi.biz_ext?.rating),
    cost: parseFiniteCost(poi.biz_ext?.cost)
  }
}

function assertAmapSuccess(payload: { status?: string, info?: string }): void {
  if (payload.status !== '1') {
    throw new Error(`AMap request failed: ${payload.info || 'unknown error'}`)
  }
}

/**
 * Look up the rating of a POI by its AMap id (`/v3/place/detail`). Prefer this
 * when the catalog already carries an `amapPoiId` — exact match, no name
 * matching risk.
 */
export async function fetchAmapRatingByPoiId(
  key: string,
  poiId: string
): Promise<AmapPoiRating | null> {
  const payload = await amapGet<AmapDetailResponse>('https://restapi.amap.com/v3/place/detail', {
    key,
    id: poiId
  })
  assertAmapSuccess(payload)
  const poi = payload.pois?.[0]
  return poi ? parsePoiRating(poi) : null
}

/**
 * Look up the closest POI by name + GCJ-02 location (`/v3/place/around`).
 * Used for catalog places without an `amapPoiId`. The closest hit within the
 * search radius is taken; a mismatch risk exists, so the result records which
 * POI name was matched for later review.
 */
export async function fetchAmapRatingByLocation(
  key: string,
  lookup: AmapRatingLookup
): Promise<AmapPoiRating | null> {
  const payload = await amapGet<AmapAroundResponse>('https://restapi.amap.com/v3/place/around', {
    key,
    location: `${lookup.location.lng},${lookup.location.lat}`,
    keywords: lookup.name,
    radius: 800,
    offset: 1,
    page: 1,
    extensions: 'all'
  })
  assertAmapSuccess(payload)
  const poi = payload.pois?.[0]
  return poi ? parsePoiRating(poi) : null
}
