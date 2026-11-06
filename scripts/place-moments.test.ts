import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  createPlaceMoment,
  listPlaceMoments,
  momentDayKey,
  normalizeMomentPlaceId,
  sanitizeMomentImages
} from '../server/modules/place-moments/service'

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
const ANON = 'anon-key-1'
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

function createFixture(): { client: DatabaseClient, dispose: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-moments-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  return {
    client,
    dispose: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('留言按最新在前返回，打卡人数只算打卡', () => {
  const fixture = createFixture()
  try {
    createPlaceMoment(fixture.client, { placeId: PLACE_ID, kind: 'comment', body: '晚上十点关', images: [] }, { anonymousKey: ANON })
    createPlaceMoment(fixture.client, { placeId: PLACE_ID, kind: 'checkin', body: '', images: [] }, { anonymousKey: ANON })

    const payload = listPlaceMoments(fixture.client, PLACE_ID, { anonymousKey: ANON })
    assert.equal(payload.moments.length, 2)
    assert.equal(payload.checkins, 1)
    assert.equal(payload.checkedInToday, true)
    assert.equal(payload.moments[0]!.kind, 'checkin')
  } finally {
    fixture.dispose()
  }
})

test('同一天同一地点同一身份只能打卡一次', () => {
  const fixture = createFixture()
  try {
    createPlaceMoment(fixture.client, { placeId: PLACE_ID, kind: 'checkin', body: '', images: [] }, { anonymousKey: ANON })
    assert.throws(
      () => createPlaceMoment(fixture.client, { placeId: PLACE_ID, kind: 'checkin', body: '', images: [] }, { anonymousKey: ANON }),
      (error: TestHttpError) => error.data?.code === 'MOMENT_ALREADY_CHECKED_IN'
    )
    // 换一个身份可以打
    createPlaceMoment(fixture.client, { placeId: PLACE_ID, kind: 'checkin', body: '', images: [] }, { anonymousKey: 'anon-key-2' })
    assert.equal(listPlaceMoments(fixture.client, PLACE_ID, { anonymousKey: ANON }).checkins, 2)
  } finally {
    fixture.dispose()
  }
})

test('空留言被拒绝，带图可以不写字', () => {
  const fixture = createFixture()
  try {
    assert.throws(
      () => createPlaceMoment(fixture.client, { placeId: PLACE_ID, kind: 'comment', body: '   ', images: [] }, { anonymousKey: ANON }),
      (error: TestHttpError) => error.data?.code === 'MOMENT_EMPTY'
    )
    const created = createPlaceMoment(fixture.client, {
      placeId: PLACE_ID,
      kind: 'comment',
      body: '',
      images: [`/uploads/${UUID_A}.jpg`]
    }, { anonymousKey: ANON })
    assert.deepEqual(created.images, [`/uploads/${UUID_A}.jpg`])
  } finally {
    fixture.dispose()
  }
})

test('图片只接受本地上传路径，最多三张', () => {
  assert.deepEqual(
    sanitizeMomentImages([
      'https://evil.example/x.jpg',
      `/uploads/${UUID_A}.png`,
      `/uploads/${UUID_A}.png`,
      `/uploads/${UUID_B}.webp`,
      '/uploads/not-a-uuid.jpg'
    ]),
    [`/uploads/${UUID_A}.png`, `/uploads/${UUID_B}.webp`]
  )
  assert.deepEqual(
    sanitizeMomentImages([
      `/uploads/${UUID_A}.png`,
      `/uploads/${UUID_B}.png`,
      `/uploads/33333333-3333-4333-8333-333333333333.png`,
      `/uploads/44444444-4444-4444-8444-444444444444.png`
    ]).length,
    3
  )
})

test('地点 id 归一化与日期键', () => {
  assert.equal(normalizeMomentPlaceId('amap-native-B0M6VHJ12T'), 'B0M6VHJ12T')
  assert.equal(normalizeMomentPlaceId(' amap-import-row-030 '), 'amap-import-row-030')
  // 2026-11-06T16:30:00Z = 2026-11-07 00:30 上海时间
  assert.equal(momentDayKey(Date.parse('2026-11-06T16:30:00Z')), '2026-11-07')
})
