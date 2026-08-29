/**
 * Seed rewritten Dianping user reviews into place_reviews as initial seed
 * content (source='seed'). Content is REWRITTEN/SUMMARISED — never verbatim
 * review text — and each card carries an attribution line.
 *
 * Run on the production server:
 *   npx tsx scripts/seed-dianping-review-cards.ts <rewritten-cards.json>
 *
 * Input shape (rewritten-cards.json):
 *   [{ amapPoiId, name, dpName?, sourceTotal?, grabbed?, avgStar?, thin?,
 *      cards: [{ score, tag, content }] }]
 */
import './load-env'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { placeReviews } from '../server/database/schema'
import { and, eq } from 'drizzle-orm'

interface Card { score: number, tag: string, content: string }
interface ShopCards {
  amapPoiId: string
  name?: string
  dpName?: string
  sourceTotal?: number
  grabbed?: number
  avgStar?: number
  thin?: boolean
  cards: Card[]
}

const INPUT = process.argv[2]
if (!INPUT) {
  console.error('usage: npx tsx scripts/seed-dianping-review-cards.ts <rewritten-cards.json>')
  process.exit(1)
}

const ATTRIBUTION = '（整理自大众点评用户评价，非原文）'
const THIN_NOTE = '（该店点评评价较少，以上仅供参考）'

async function main(): Promise<void> {
  const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
  const client = getDatabase(databasePath)
  runMigrations(client)
  const shops = JSON.parse(readFileSync(INPUT, 'utf8')) as ShopCards[]
  let inserted = 0
  let skipped = 0
  for (const shop of shops) {
    const placeId = shop.amapPoiId?.trim()
    if (!placeId || shop.cards.length === 0) {
      skipped += 1
      continue
    }
    const now = Date.now()
    for (let i = 0; i < shop.cards.length; i += 1) {
      const card = shop.cards[i]!
      const anonKey = `seed-dp-${placeId}-${i}`
      const existing = client.db.select({ id: placeReviews.id })
        .from(placeReviews)
        .where(and(
          eq(placeReviews.anonymousKey, anonKey),
          eq(placeReviews.placeId, placeId)
        ))
        .get()
      if (existing) {
        skipped += 1
        continue
      }
      const noteBits = [
        '来源：大众点评用户评价整理',
        shop.dpName ? `点评名：${shop.dpName}` : null,
        typeof shop.sourceTotal === 'number' ? `点评${shop.sourceTotal}条` : null,
        shop.thin ? '评价较少' : null
      ].filter(Boolean)
      const content = `${card.content}\n${ATTRIBUTION}${shop.thin ? THIN_NOTE : ''}`
      // Card score keeps real star precision: base each card on the shop's
      // average star (avgStar) with a small per-tag offset, rounded to 0.1 so
      // the front-end can render partial stars instead of uniform 4/5s.
      const base = typeof shop.avgStar === 'number' ? shop.avgStar : card.score
      const tagOffset = card.tag === '需要注意' ? -0.4
        : card.tag === '学生常点' ? 0.2
          : 0
      const rawScore = base + tagOffset
      const score = Math.round(Math.max(1, Math.min(5, rawScore)) * 10) / 10
      client.db.insert(placeReviews).values({
        id: randomUUID(),
        placeId,
        userId: null,
        anonymousKey: anonKey,
        score,
        content,
        status: 'approved',
        reviewNote: noteBits.join('｜'),
        reviewedByAdminId: null,
        reviewedAt: now,
        source: 'seed',
        sourcePlatform: 'dianping',
        collectedAt: now,
        createdAt: now,
        updatedAt: now
      }).run()
      inserted += 1
    }
  }
  console.log(`done: inserted ${inserted}, skipped ${skipped} (missing placeId / already present)`)
  closeDatabase(databasePath)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
