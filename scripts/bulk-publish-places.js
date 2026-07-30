/**
 * One-shot production bulk publish for AMap owner-import drafts.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DB_PATH = process.env.YEU_DB_PATH || '/www/wwwroot/yeu/shared/data/yeu.sqlite'
const SEED_PATH = process.env.YEU_SEED_PATH || '/tmp/publish-seed-points.json'
const DRY_RUN = process.argv.includes('--dry-run')

const BOUNDS = {
  west: 118.5924155,
  south: 25.1016816,
  east: 118.6178472,
  north: 25.1224755
}

function withinCampus(lng, lat) {
  return lng >= BOUNDS.west && lng <= BOUNDS.east && lat >= BOUNDS.south && lat <= BOUNDS.north
}

function newId() {
  return crypto.randomUUID()
}

function loadBetterSqlite3() {
  const candidates = [
    process.env.BETTER_SQLITE3_PATH,
    '/www/wwwroot/yeu/current/node_modules/better-sqlite3',
    path.join(process.cwd(), 'node_modules/better-sqlite3')
  ].filter(Boolean)
  for (const candidate of candidates) {
    try { return require(candidate) } catch (e) {}
  }
  return require('better-sqlite3')
}

const Database = loadBetterSqlite3()
const seeds = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
const seedByName = new Map()
const seedByRow = new Map()
for (const seed of seeds) {
  seedByName.set(seed.name, seed)
  if (seed.sourceRow != null) seedByRow.set(Number(seed.sourceRow), seed)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const now = Date.now()
const SOURCE_URL = 'https://yeu.local/internal/amap-owner-workmap-import-2026-07'
const SOURCE_TITLE = '\u7528\u6237\u6388\u6743\u9ad8\u5fb7\u5de5\u4f5c\u5730\u56fe\u5bfc\u5165\uff08\u4e1a\u4e3b\u6807\u8bb0\uff09'
const SOURCE_NOTES = '\u6765\u6e90\u4e3a\u4e1a\u4e3b\u6388\u6743\u7684\u9ad8\u5fb7\u5de5\u4f5c\u5730\u56fe\u5168\u91cf\u6807\u8bb0\u5bfc\u5165\u3002\u5750\u6807\u5df2\u6362\u7b97/\u91c7\u7528\u79cd\u5b50 WGS84 \u70b9\u4f9b\u516c\u5f00\u5730\u56fe\u4f7f\u7528\uff1b\u4e0d\u7b49\u4e8e\u53cc\u4eba\u73b0\u573a\u6d4b\u7ed8\u6838\u9a8c\u3002\u540e\u7eed\u4ecd\u5efa\u8bae\u505a\u73b0\u573a\u590d\u6838\u3002\u5bfc\u5165\u6279\u6b21\uff1a2026-07-17 bulk publish\u3002'
const PUBLISHER = '\u4e1a\u4e3b\u6388\u6743\u5bfc\u5165'

const draftPlaces = db.prepare('SELECT id, name, status, scope, longitude, latitude, coordinate_system, coordinate_verification, last_verified_at, source_raw_ref, slug FROM places WHERE status = ? ORDER BY name').all('draft')
console.log(JSON.stringify({ dryRun: DRY_RUN, seedCount: seeds.length, draftCount: draftPlaces.length }, null, 2))

function parseSourceRow(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      if (parsed.sourceRow != null) return Number(parsed.sourceRow)
      if (parsed.row != null) return Number(parsed.row)
      if (parsed.source_row != null) return Number(parsed.source_row)
    }
  } catch (e) {}
  const m = String(raw).match(/sourceRow["']?\s*[:=]\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

function matchSeed(place) {
  const byName = seedByName.get(place.name)
  if (byName) return { seed: byName, via: 'name' }
  const row = parseSourceRow(place.source_raw_ref)
  if (row != null && seedByRow.has(row)) return { seed: seedByRow.get(row), via: 'sourceRow' }
  let best = null
  let bestD = Infinity
  for (const seed of seeds) {
    if (place.longitude == null || place.latitude == null || seed.gcjLng == null) continue
    const d = Math.hypot(place.longitude - seed.gcjLng, place.latitude - seed.gcjLat)
    if (d < bestD) { bestD = d; best = seed }
  }
  if (best && bestD < 0.0005) return { seed: best, via: 'gcj-proximity:' + bestD.toFixed(6) }
  return null
}

const matched = []
const unmatched = []
for (const place of draftPlaces) {
  const hit = matchSeed(place)
  if (!hit) { unmatched.push({ id: place.id, name: place.name }); continue }
  if (!withinCampus(hit.seed.lng, hit.seed.lat)) {
    unmatched.push({ id: place.id, name: place.name, reason: 'outside-campus-bounds' })
    continue
  }
  matched.push({ place: place, seed: hit.seed, via: hit.via })
}

const matchVia = {}
for (const item of matched) matchVia[item.via] = (matchVia[item.via] || 0) + 1
console.log(JSON.stringify({ matched: matched.length, unmatched: unmatched, matchVia: matchVia }, null, 2))

if (unmatched.length) {
  console.error('Abort: unmatched drafts remain')
  process.exit(2)
}
if (DRY_RUN) {
  console.log('Dry run OK - no writes')
  process.exit(0)
}

const tx = db.transaction(function () {
  let source = db.prepare('SELECT id FROM sources WHERE url = ?').get(SOURCE_URL)
  let sourceId
  if (source) {
    sourceId = source.id
    db.prepare('UPDATE sources SET title = ?, platform = ?, publisher_name = ?, source_level = ?, is_official = 0, accessed_at = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(SOURCE_TITLE, 'amap-workmap', PUBLISHER, 'C', now, SOURCE_NOTES, 'active', now, sourceId)
  } else {
    sourceId = newId()
    db.prepare('INSERT INTO sources (id, title, url, platform, publisher_name, source_level, is_official, published_at, accessed_at, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)')
      .run(sourceId, SOURCE_TITLE, SOURCE_URL, 'amap-workmap', PUBLISHER, 'C', now, now, SOURCE_NOTES, 'active', now, now)
  }

  const updatePlace = db.prepare('UPDATE places SET longitude = ?, latitude = ?, coordinate_system = ?, coordinate_verification = ?, coordinate_verified_at = ?, last_verified_at = ?, status = ?, published_at = ?, updated_at = ? WHERE id = ? AND status = ?')
  const hasLink = db.prepare('SELECT 1 AS ok FROM place_sources WHERE place_id = ? AND source_id = ?')
  const insertLink = db.prepare('INSERT INTO place_sources (place_id, source_id, is_primary, created_at) VALUES (?, ?, ?, ?)')
  const anyPrimary = db.prepare('SELECT 1 AS ok FROM place_sources WHERE place_id = ? AND is_primary = 1')

  let updated = 0
  let linked = 0
  for (const item of matched) {
    const info = updatePlace.run(item.seed.lng, item.seed.lat, 'WGS84', 'verified', now, now, 'published', now, now, item.place.id, 'draft')
    if (info.changes !== 1) throw new Error('Failed to update place ' + item.place.id + ' ' + item.place.name)
    updated += 1
    if (!hasLink.get(item.place.id, sourceId)) {
      const primary = anyPrimary.get(item.place.id) ? 0 : 1
      insertLink.run(item.place.id, sourceId, primary, now)
      linked += 1
    }
  }
  return { sourceId: sourceId, updated: updated, linked: linked }
})

const result = tx()
const counts = db.prepare('SELECT status, COUNT(*) AS c FROM places GROUP BY status').all()
const verified = db.prepare('SELECT coordinate_system, coordinate_verification, COUNT(*) AS c FROM places GROUP BY 1, 2').all()
const placeSources = db.prepare('SELECT COUNT(*) AS c FROM place_sources').get()
const sample = db.prepare('SELECT name, status, longitude, latitude, coordinate_system, coordinate_verification, published_at FROM places WHERE status = ? ORDER BY name LIMIT 5').all('published')
console.log(JSON.stringify({ ok: true, result: result, counts: counts, verified: verified, placeSources: placeSources, sample: sample }, null, 2))
db.close()