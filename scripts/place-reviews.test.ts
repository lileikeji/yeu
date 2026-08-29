import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { parsePoiRating } from '../server/modules/place-reviews/amap'
import { resolveSeedCardScore } from '../scripts/seed-dianping-review-cards'
import {
  adminListAmapRatings,
  adminListPlaceReviews,
  adminReviewPlace,
  createPlaceReview,
  listPublicPlaceReviews,
  normalizePlaceId,
  setReviewLike,
  upsertAmapRating
} from '../server/modules/place-reviews/service'
import type { AppUserIdentity } from '../server/utils/user-auth'

interface TestHttpError extends Error {
  statusCode?: number
  data?: { code?: string }
}

Object.defineProperty(globalThis, 'createError', {
  configurable: true,
  value: (input: { statusCode?: number, statusMessage?: string, data?: { code?: string } }) => {
    const error = new Error(input.statusMessage) as TestHttpError
    error.statusCode = input.statusCode
    error.data = input.data
    return error
  }
})

const PLACE_ID = 'amap-import-row-030'

const USER_A: AppUserIdentity = {
  id: '0b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  username: 'student-a',
  displayName: '学生甲',
  major: null,
  dormBuilding: null,
  chatDormBuilding: null,
  status: 'active'
}

const USER_B: AppUserIdentity = {
  id: '1c2d3e4f-5a6b-4c7d-8e9f-1a2b3c4d5e6f',
  username: 'student-b',
  displayName: '学生乙',
  major: null,
  dormBuilding: null,
  chatDormBuilding: null,
  status: 'active'
}

const ADMIN_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-place-reviews-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()
  client.sqlite.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, status, created_at, updated_at)
    VALUES (?, ?, 'x', ?, 'active', ?, ?)
  `).run(USER_A.id, USER_A.username, USER_A.displayName, now, now)
  client.sqlite.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, status, created_at, updated_at)
    VALUES (?, ?, 'x', ?, 'active', ?, ?)
  `).run(USER_B.id, USER_B.username, USER_B.displayName, now, now)
  client.sqlite.prepare(`
    INSERT INTO admin_users (id, username, password_hash, display_name, created_at, updated_at)
    VALUES (?, 'reviewer', 'x', '审核员', ?, ?)
  `).run(ADMIN_ID, now, now)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('createPlaceReview creates a pending review and blocks duplicates per user', () => {
  const { client, cleanup } = createFixture()
  try {
    const created = createPlaceReview(client, {
      placeId: PLACE_ID,
      score: 4,
      content: '味道不错，价格实惠。'
    }, { userId: USER_A.id })
    assert.equal(created.status, 'pending')
    assert.equal(created.placeId, PLACE_ID)

    assert.throws(
      () => createPlaceReview(client, {
        placeId: PLACE_ID,
        score: 2,
        content: '第二次提交应该被拒绝。'
      }, { userId: USER_A.id }),
      (error: TestHttpError) => error.statusCode === 409 && error.data?.code === 'REVIEW_ALREADY_EXISTS'
    )
  } finally {
    cleanup()
  }
})

test('listPublicPlaceReviews hides pending reviews and aggregates approved ones', () => {
  const { client, cleanup } = createFixture()
  try {
    createPlaceReview(client, { placeId: PLACE_ID, score: 5, content: '很好' }, { userId: USER_A.id })
    createPlaceReview(client, { placeId: PLACE_ID, score: 3, content: '一般' }, { userId: USER_B.id })

    const before = listPublicPlaceReviews(client, PLACE_ID)
    assert.equal(before.aggregate, null)
    assert.equal(before.reviews.length, 0)
    assert.equal(before.mine.submitted, false)

    const all = adminListPlaceReviews(client, { page: 1, pageSize: 20 })
    assert.equal(all.total, 2)

    // Locate reviews by score instead of list position: the admin list orders
    // by createdAt DESC, and two reviews created in the same millisecond tie
    // on that sort — positional indexing would be flaky across runs.
    const highScore = all.items.find(item => item.score === 5)!
    const lowScore = all.items.find(item => item.score === 3)!
    assert.ok(highScore, 'expected the 5-star review')
    assert.ok(lowScore, 'expected the 3-star review')
    adminReviewPlace(client, highScore.id, { status: 'approved' }, ADMIN_ID)
    adminReviewPlace(client, lowScore.id, { status: 'rejected', note: '无实质内容' }, ADMIN_ID)

    const after = listPublicPlaceReviews(client, PLACE_ID, { userId: USER_A.id })
    assert.equal(after.reviews.length, 1)
    assert.equal(after.aggregate?.count, 1)
    assert.equal(after.aggregate?.score, 5)
    assert.equal(after.reviews[0]!.displayName, '学生甲')
    assert.equal(after.reviews[0]!.mine, true)

    const mine = listPublicPlaceReviews(client, PLACE_ID, { userId: USER_B.id })
    assert.deepEqual(mine.mine, { submitted: true, status: 'rejected' })
  } finally {
    cleanup()
  }
})

test('adminReviewPlace rejects unknown ids', () => {
  const { client, cleanup } = createFixture()
  try {
    assert.throws(
      () => adminReviewPlace(client, '00000000-0000-4000-8000-000000000000', { status: 'approved' }, ADMIN_ID),
      (error: TestHttpError) => error.statusCode === 404
    )
  } finally {
    cleanup()
  }
})

test('amap rating cache is served fresh and ignored when expired', () => {
  const { client, cleanup } = createFixture()
  try {
    const before = listPublicPlaceReviews(client, PLACE_ID)
    assert.equal(before.amap, null)

    upsertAmapRating(client, PLACE_ID, {
      poiId: 'B0FFGK62L3',
      poiName: '银环便利店',
      score: 4.5,
      cost: 12
    })

    const after = listPublicPlaceReviews(client, PLACE_ID)
    assert.equal(after.amap?.poiId, 'B0FFGK62L3')
    assert.equal(after.amap?.score, 4.5)
    assert.equal(after.amap?.cost, 12)

    // Expire the row manually; the public endpoint then reports no amap rating.
    client.sqlite.prepare('UPDATE place_amap_ratings SET expires_at = 1').run()
    const expired = listPublicPlaceReviews(client, PLACE_ID)
    assert.equal(expired.amap, null)
  } finally {
    cleanup()
  }
})

test('adminListAmapRatings lists cached seed ratings with expiry state', () => {
  const { client, cleanup } = createFixture()
  try {
    upsertAmapRating(client, PLACE_ID, { poiId: 'B0X1', poiName: '测试店', score: 4.2, cost: 30 })

    const all = adminListAmapRatings(client)
    assert.equal(all.length, 1)
    assert.equal(all[0]!.poiName, '测试店')
    assert.equal(all[0]!.score, 4.2)
    assert.equal(all[0]!.cost, 30)
    assert.equal(all[0]!.expired, false)

    client.sqlite.prepare('UPDATE place_amap_ratings SET expires_at = 1').run()
    const expired = adminListAmapRatings(client)
    assert.equal(expired[0]!.expired, true)
  } finally {
    cleanup()
  }
})

test('parsePoiRating tolerates missing or malformed biz_ext', () => {
  assert.equal(
    parsePoiRating({ id: 'B0X', name: '店', biz_ext: { rating: '4.5', cost: '35' } })?.score,
    4.5
  )
  assert.equal(
    parsePoiRating({ id: 'B0X', name: '店', biz_ext: { rating: '4.5', cost: '35' } })?.cost,
    35
  )
  const noExt = parsePoiRating({ id: 'B0X', name: '店' })
  assert.equal(noExt?.score, null)
  assert.equal(noExt?.cost, null)
  const bad = parsePoiRating({ id: 'B0X', name: '店', biz_ext: { rating: '10', cost: '-1' } })
  assert.equal(bad?.score, null)
  assert.equal(bad?.cost, null)
  assert.equal(parsePoiRating({ id: '  ', name: '' }), null)
})

test('normalizePlaceId strips the amap-native prefix for rating lookups', () => {
  assert.equal(normalizePlaceId('B0M6VHJ12T'), 'B0M6VHJ12T')
  assert.equal(normalizePlaceId('amap-native-B0M6VHJ12T'), 'B0M6VHJ12T')
  assert.equal(normalizePlaceId('amap-import-row-027'), 'amap-import-row-027')
  assert.equal(normalizePlaceId('amap-hotspot:118.6,25.1'), 'amap-hotspot:118.6,25.1')
  assert.equal(normalizePlaceId('  B0X  '), 'B0X')
})

test('anonymous reviewers are deduplicated by anonymousKey and surfaced as 匿名同学', () => {
  const { client, cleanup } = createFixture()
  try {
    const guestKey = 'anon-guest-hash'
    const created = createPlaceReview(client, {
      placeId: PLACE_ID,
      score: 4,
      content: '游客评价'
    }, { anonymousKey: guestKey })
    assert.equal(created.status, 'pending')

    assert.throws(
      () => createPlaceReview(client, {
        placeId: PLACE_ID,
        score: 2,
        content: '同一游客重复提交'
      }, { anonymousKey: guestKey }),
      (error: TestHttpError) => error.statusCode === 409 && error.data?.code === 'REVIEW_ALREADY_EXISTS'
    )

    // A different anonymous key can still review the same place.
    createPlaceReview(client, {
      placeId: PLACE_ID,
      score: 3,
      content: '另一游客'
    }, { anonymousKey: 'anon-other-guest' })

    const pending = listPublicPlaceReviews(client, PLACE_ID, { anonymousKey: guestKey })
    assert.equal(pending.mine.submitted, true)
    assert.equal(pending.mine.status, 'pending')

    const all = adminListPlaceReviews(client, { page: 1, pageSize: 20 })
    assert.equal(all.total, 2)
    assert.equal(all.items.every(item => item.displayName === '匿名评价'), true)
  } finally {
    cleanup()
  }
})

test('seed reviews are listed separately and excluded from the aggregate score', () => {
  const { client, cleanup } = createFixture()
  try {
    createPlaceReview(client, { placeId: PLACE_ID, score: 5, content: '学生评价' }, { userId: USER_A.id })

    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO place_reviews
        (id, place_id, user_id, anonymous_key, score, content, status, source, source_platform, collected_at, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, 'approved', 'seed', 'dianping', ?, ?, ?)
    `).run('seed-1', PLACE_ID, 'seed-dp-1', 5, '整理评价文案（来自点评）', now, now, now)
    client.sqlite.prepare(`
      INSERT INTO place_reviews
        (id, place_id, user_id, anonymous_key, score, content, status, source, created_at, updated_at)
      VALUES (?, ?, NULL, ?, 2, ?, 'approved', 'seed', ?, ?)
    `).run('seed-2', PLACE_ID, 'seed-dp-2', '另一条整理评价', now, now)

    // Student review approved so it counts in aggregate.
    const all = adminListPlaceReviews(client, { page: 1, pageSize: 20 })
    const studentRow = all.items.find(item => item.content === '学生评价')!
    adminReviewPlace(client, studentRow.id, { status: 'approved' }, ADMIN_ID)

    const payload = listPublicPlaceReviews(client, PLACE_ID, { userId: USER_A.id })
    // Aggregate counts only the student 5-star review.
    assert.equal(payload.aggregate?.count, 1)
    assert.equal(payload.aggregate?.score, 5)
    // Seed reviews are visible with source info and counted separately.
    assert.equal(payload.seedCount, 2)
    const seedViews = payload.reviews.filter(r => r.source === 'seed')
    assert.equal(seedViews.length, 2)
    assert.equal(seedViews.some(r => r.sourcePlatform === 'dianping'), true)
    assert.ok(seedViews.some(r => r.content.includes('来自点评')))
  } finally {
    cleanup()
  }
})

test('resolveSeedCardScore keeps fractional precision and clamps edges', () => {
  // Base avgStar with tag offsets.
  assert.equal(resolveSeedCardScore({ score: 5, tag: '综合口碑', content: '' }, 4.3), 4.3)
  assert.equal(resolveSeedCardScore({ score: 5, tag: '学生常点', content: '' }, 4.3), 4.5)
  assert.equal(resolveSeedCardScore({ score: 5, tag: '需要注意', content: '' }, 4.3), 3.9)
  // 0.1 precision after rounding.
  assert.equal(resolveSeedCardScore({ score: 5, tag: '综合口碑', content: '' }, 4.26), 4.3)
  // Clamp at upper boundary (avgStar 4.9 + 学生常点 0.2 → 5.0, not 5.1).
  assert.equal(resolveSeedCardScore({ score: 5, tag: '学生常点', content: '' }, 4.9), 5)
  assert.equal(resolveSeedCardScore({ score: 5, tag: '综合口碑', content: '' }, 5), 5)
  // Clamp at lower boundary (avgStar 1.2 + 需要注意 -0.4 → 0.8 → 1.0).
  assert.equal(resolveSeedCardScore({ score: 1, tag: '需要注意', content: '' }, 1.2), 1)
  // Falls back to card.score when avgStar is missing.
  assert.equal(resolveSeedCardScore({ score: 4, tag: '综合口碑', content: '' }, undefined), 4)
})

test('review likes: idempotent like, unlike, counts and hot sort', () => {
  const { client, cleanup } = createFixture()
  try {
    const reviewA = createPlaceReview(client, { placeId: PLACE_ID, score: 5, content: '好吃' }, { userId: USER_A.id })
    const reviewB = createPlaceReview(client, { placeId: PLACE_ID, score: 3, content: '一般' }, { userId: USER_B.id })
    adminReviewPlace(client, reviewA.id, { status: 'approved' }, ADMIN_ID)
    adminReviewPlace(client, reviewB.id, { status: 'approved' }, ADMIN_ID)

    // A likes B's review; duplicate like is a no-op.
    const r1 = setReviewLike(client, reviewB.id, USER_A.id, true)
    assert.equal(r1.liked, true)
    assert.equal(r1.likeCount, 1)
    const r2 = setReviewLike(client, reviewB.id, USER_A.id, true)
    assert.equal(r2.likeCount, 1)

    // B likes both reviews -> reviewB has 2, reviewA has 1.
    setReviewLike(client, reviewA.id, USER_B.id, true)
    setReviewLike(client, reviewB.id, USER_B.id, true)

    const newest = listPublicPlaceReviews(client, PLACE_ID, { userId: USER_A.id }, 'newest')
    assert.equal(newest.reviews.length, 2)
    const byId = (id: string) => newest.reviews.find(r => r.id === id)!
    assert.equal(byId(reviewA.id).likeCount, 1)
    assert.equal(byId(reviewB.id).likeCount, 2)
    assert.equal(byId(reviewB.id).likedByMe, true)
    assert.equal(byId(reviewA.id).likedByMe, false)

    const hot = listPublicPlaceReviews(client, PLACE_ID, { userId: USER_A.id }, 'hot')
    assert.equal(hot.reviews[0]!.id, reviewB.id)
    assert.equal(hot.reviews[0]!.likeCount, 2)

    // Unlike.
    const r3 = setReviewLike(client, reviewB.id, USER_B.id, false)
    assert.equal(r3.likeCount, 1)

    // Unknown review id -> 404.
    assert.throws(
      () => setReviewLike(client, '00000000-0000-4000-8000-000000000000', USER_A.id, true),
      (error: TestHttpError) => error.statusCode === 404
    )
  } finally {
    cleanup()
  }
})
