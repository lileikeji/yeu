import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  closeDatabase,
  getDatabase,
  type DatabaseClient
} from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { contents } from '../server/database/schema'
import {
  applyPopularityAction,
  createSinger,
  ensureCompetitionEvent,
  ensurePopularitySettings,
  getAdminCompetitionPayload,
  getPopularityAdminState,
  getPopularityPublicState,
  getRoundByKey,
  listPopularityCandidates,
  recordPopularityBallot,
  updatePopularitySettings
} from '../server/modules/competition/service'
import {
  issuePopularityToken,
  verifyPopularityToken
} from '../server/utils/competition-popularity'

type TestClient = DatabaseClient

function temporaryDatabase(): { client: TestClient, path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-popularity-test-'))
  const path = join(directory, 'test.sqlite')
  return { client: getDatabase(path), path }
}

function codeOf(error: unknown): string {
  return (error as { data?: { code?: string } }).data?.code ?? ''
}

function cleanup(client: TestClient, path: string): void {
  closeDatabase(path)
  rmSync(join(path, '..'), { recursive: true, force: true })
}

function createFinalEvent(client: TestClient) {
  const contentId = randomUUID()
  client.db.insert(contents).values({
    id: contentId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()
  const event = ensureCompetitionEvent(client, contentId)
  const singers = Array.from({ length: 3 }, (_, index) => createSinger(client, event.id, {
    name: `人气选手${index + 1}`,
    song: `初赛曲${index + 1}`,
    className: '26音乐学1班',
    studentNo: `2026${String(index + 1).padStart(4, '0')}`,
    qq: `300100${String(index + 1).padStart(2, '0')}`
  }))
  const finalRound = getRoundByKey(client, event.id, 'final')
  const insertEntry = client.sqlite.prepare(
    'INSERT INTO competition_round_entries (id, round_id, singer_id, sort_order, song) VALUES (?, ?, ?, ?, ?)'
  )
  singers.forEach((singer, index) => {
    insertEntry.run(randomUUID(), finalRound.id, singer.id, index + 1, `决赛一曲${index + 1}`)
  })
  return { contentId, event, singers, finalRound }
}

function openWindow(
  client: TestClient,
  eventId: string,
  overrides: Partial<{
    allowChange: boolean
    maxChanges: number
    showResults: boolean
    opensAt: number | null
    closesAt: number | null
  }> = {}
) {
  const now = Date.now()
  return updatePopularitySettings(client, eventId, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '为你喜欢的选手投一票',
    opensAt: overrides.opensAt === undefined ? now - 1000 : overrides.opensAt,
    closesAt: overrides.closesAt === undefined ? now + 60_000 : overrides.closesAt,
    allowChange: overrides.allowChange ?? true,
    maxChanges: overrides.maxChanges ?? 2,
    qrRotateSeconds: 30,
    showResults: overrides.showResults ?? true
  })
}

test('迁移 0081：人气奖设置表与投票表可用，默认设置和决赛候选正确', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const { contentId, event, singers } = createFinalEvent(client)

  const tables = client.sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('competition_popularity_settings', 'competition_popularity_ballots') ORDER BY name`
  ).all() as Array<{ name: string }>
  assert.deepEqual(tables.map(row => row.name), [
    'competition_popularity_ballots',
    'competition_popularity_settings'
  ])

  const settings = ensurePopularitySettings(client, event.id)
  assert.equal(settings.enabled, false)
  assert.equal(settings.title, '人气奖投票')
  assert.equal(settings.allowChange, false)
  assert.equal(settings.maxChanges, 1)
  assert.equal(settings.qrRotateSeconds, 30)
  assert.equal(settings.showResults, false)
  assert.ok(settings.displayKey.length >= 16)

  const candidates = listPopularityCandidates(client, event.id)
  assert.deepEqual(candidates.map(item => item.name), ['人气选手1', '人气选手2', '人气选手3'])
  assert.deepEqual(candidates.map(item => item.number), [1, 2, 3])
  assert.deepEqual(candidates.map(item => item.song), ['决赛一曲1', '决赛一曲2', '决赛一曲3'])

  const admin = getPopularityAdminState(client, event.id)
  assert.equal(admin.status, 'disabled')
  assert.equal(admin.totalVotes, 0)
  assert.deepEqual(admin.results.map(row => row.count), [0, 0, 0])

  const payload = getAdminCompetitionPayload(client, contentId)
  assert.equal(payload.popularity.candidates.length, 3)
  assert.equal(payload.popularity.settings.displayKey, settings.displayKey)

  // 同一设备只能有一票；同一选手同一 slot 不能重复。
  const insertBallot = client.sqlite.prepare(
    'INSERT INTO competition_popularity_ballots (id, event_id, singer_id, device_hash, change_count, version) VALUES (?, ?, ?, ?, ?, ?)'
  )
  insertBallot.run(randomUUID(), event.id, singers[0]!.id, 'device-a', 0, 1)
  assert.throws(() => insertBallot.run(randomUUID(), event.id, singers[1]!.id, 'device-a', 0, 1))

  cleanup(client, path)
})

test('人气奖：窗口、设备一票、幂等重投、改票上限、revision 冲突与结果统计', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const { event, singers, finalRound } = createFinalEvent(client)

  const scheduled = openWindow(client, event.id, {
    opensAt: Date.now() + 60_000,
    closesAt: Date.now() + 120_000
  })
  assert.equal(scheduled.status, 'scheduled')
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-a', singers[0]!.id, 0), error => (
    codeOf(error) === 'POPULARITY_NOT_OPEN'
  ))

  const open = openWindow(client, event.id)
  assert.equal(open.status, 'open')
  assert.equal(open.settings.maxChanges, 2)

  const first = recordPopularityBallot(client, event.id, 'device-a', singers[0]!.id, 0)
  assert.equal(first.totalVotes, 1)
  assert.equal(first.myBallot?.singerId, singers[0]!.id)
  assert.equal(first.myBallot?.version, 1)
  assert.equal(first.myBallot?.changeCount, 0)

  // 同一设备重复点同一位选手是幂等操作，不消耗改票次数。
  const same = recordPopularityBallot(client, event.id, 'device-a', singers[0]!.id, 0)
  assert.equal(same.myBallot?.version, 1)
  assert.equal(same.totalVotes, 1)

  const changedOnce = recordPopularityBallot(client, event.id, 'device-a', singers[1]!.id, 1)
  assert.equal(changedOnce.myBallot?.version, 2)
  assert.equal(changedOnce.myBallot?.changeCount, 1)
  assert.equal(changedOnce.totalVotes, 1)

  const changedTwice = recordPopularityBallot(client, event.id, 'device-a', singers[2]!.id, 2)
  assert.equal(changedTwice.myBallot?.version, 3)
  assert.equal(changedTwice.myBallot?.changeCount, 2)

  // 用完两次改票后不能再改。
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-a', singers[0]!.id, 3), error => (
    codeOf(error) === 'POPULARITY_CHANGE_LIMIT'
  ))

  // 另一台设备独立一票；旧 revision 被拒绝，新 revision 可以改。
  const secondDevice = recordPopularityBallot(client, event.id, 'device-b', singers[0]!.id, 0)
  assert.equal(secondDevice.totalVotes, 2)
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-b', singers[1]!.id, 0), error => (
    codeOf(error) === 'POPULARITY_CONFLICT'
  ))
  const secondDeviceChanged = recordPopularityBallot(client, event.id, 'device-b', singers[1]!.id, 1)
  assert.equal(secondDeviceChanged.myBallot?.version, 2)

  // 非候选选手不能投票。
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-c', randomUUID(), 0), error => (
    codeOf(error) === 'POPULARITY_CANDIDATE_INVALID'
  ))

  const publicState = getPopularityPublicState(client, event.id, 'device-a')
  assert.equal(publicState.totalVotes, 2)
  assert.equal(publicState.myBallot?.singerId, singers[2]!.id)
  assert.deepEqual(publicState.results?.map(row => row.count), [1, 1, 0])
  assert.equal(publicState.results?.[0]?.percent, 50)
  // 投票页候选按当前人气降序；同票按出场号。
  assert.deepEqual(publicState.candidates.map(item => item.name), ['人气选手2', '人气选手3', '人气选手1'])

  // 默认锁死设备：关闭改票后同一设备不能再投给别人。
  openWindow(client, event.id, { allowChange: false })
  const locked = recordPopularityBallot(client, event.id, 'device-locked', singers[0]!.id, 0)
  assert.equal(locked.canChange, false)
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-locked', singers[1]!.id, 1), error => (
    codeOf(error) === 'POPULARITY_CHANGE_LIMIT'
  ))

  // final2 不参与人气奖候选，候选仍只有决赛第一轮三人。
  assert.equal(listPopularityCandidates(client, event.id).length, 3)
  assert.equal(getRoundByKey(client, event.id, 'final2').id.length > 0, true)
  assert.equal(finalRound.id.length > 0, true)

  cleanup(client, path)
})

test('人气奖：截止、重置、开关与显示密钥轮换', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const { event, singers } = createFinalEvent(client)
  openWindow(client, event.id, { showResults: false })

  assert.throws(() => updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖',
    subtitle: '',
    opensAt: Date.now() + 10_000,
    closesAt: Date.now() + 5_000,
    allowChange: true,
    maxChanges: 1,
    qrRotateSeconds: 30,
    showResults: false
  }), error => (error as { data?: { code?: string } }).data?.code === 'VALIDATION_ERROR')

  recordPopularityBallot(client, event.id, 'device-a', singers[0]!.id, 0)
  const hidden = getPopularityPublicState(client, event.id, 'device-b')
  assert.equal(hidden.showResults, false)
  assert.equal(hidden.results, null)

  const closed = applyPopularityAction(client, event.id, 'close')
  assert.equal(closed.status, 'closed')
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-b', singers[1]!.id, 0), error => (
    codeOf(error) === 'POPULARITY_CLOSED'
  ))

  const shown = updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '为你喜欢的选手投一票',
    opensAt: null,
    closesAt: null,
    allowChange: true,
    maxChanges: 1,
    qrRotateSeconds: 45,
    showResults: true
  })
  assert.equal(shown.status, 'open')
  assert.equal(shown.totalVotes, 1)
  assert.equal(shown.results[0]?.count, 1)

  const beforeKey = shown.settings.displayKey
  const rotated = applyPopularityAction(client, event.id, 'rotate-display-key')
  assert.notEqual(rotated.settings.displayKey, beforeKey)

  const reset = applyPopularityAction(client, event.id, 'reset-votes')
  assert.equal(reset.totalVotes, 0)
  assert.equal(reset.status, 'open')

  const disabled = applyPopularityAction(client, event.id, 'disable')
  assert.equal(disabled.status, 'disabled')

  cleanup(client, path)
})

test('人气奖令牌：签发可验证、篡改被拒、错误密钥被拒', () => {
  const secret = 'popularity-test-secret'
  const eventId = randomUUID()
  const issued = issuePopularityToken(secret, eventId, 90_000)
  assert.ok(issued.token.length > 20)
  assert.ok(issued.expiresAt > Date.now())

  const verified = verifyPopularityToken(secret, issued.token)
  assert.equal(verified?.eventId, eventId)
  assert.equal(verified?.expiresAt, issued.expiresAt)

  const tampered = `${issued.token.slice(0, -2)}${issued.token.endsWith('aa') ? 'bb' : 'aa'}`
  assert.equal(verifyPopularityToken(secret, tampered), null)
  assert.equal(verifyPopularityToken('another-secret', issued.token), null)
  assert.equal(verifyPopularityToken(secret, 'not-a-token'), null)
})
