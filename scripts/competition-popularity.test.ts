import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import fc from 'fast-check'
import type { CompetitionPopularityCandidate } from '../shared/types'
import {
  computePopularityStandingMap,
  formatChineseGroupTitle,
  groupPopularityCandidates,
  resolvePopularityStandingMap,
  toPopularityStandingHints
} from '../shared/utils/competition'
import {
  POPULARITY_FIRST_VOTE_POW_BITS,
  solvePopularityVotePow,
  verifyPopularityVotePow
} from '../shared/utils/popularity-pow'
import {
  closeDatabase,
  getDatabase,
  type DatabaseClient
} from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { contents } from '../server/database/schema'
import {
  applyPopularityAction,
  clearFinalPairs,
  createSinger,
  drawFinalPairs,
  ensureCompetitionEvent,
  ensurePopularitySettings,
  getAdminCompetitionPayload,
  getPopularityAdminState,
  getPopularityPublicState,
  getRoundByKey,
  listPopularityCandidates,
  recordPopularityBallot,
  updatePopularitySettings,
  updateRound
} from '../server/modules/competition/service'
import {
  issuePopularityDeviceToken,
  issuePopularityToken,
  popularityIpHash,
  verifyPopularityDeviceToken,
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
    votesPerVoter: number
    wechatBonusVotes: number
    allowRepeatVote: boolean
    showResults: boolean
    showRankGap: boolean
    authMode: 'wechat_mp' | 'device_strict' | 'hybrid'
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
    votesPerVoter: overrides.votesPerVoter ?? 1,
    ...(overrides.wechatBonusVotes !== undefined ? { wechatBonusVotes: overrides.wechatBonusVotes } : {}),
    allowRepeatVote: overrides.allowRepeatVote ?? true,
    qrRotateSeconds: 30,
    showResults: overrides.showResults ?? true,
    ...(overrides.showRankGap !== undefined ? { showRankGap: overrides.showRankGap } : {}),
    ...(overrides.authMode !== undefined ? { authMode: overrides.authMode } : {})
  })
}

test('迁移 0081/0083：人气奖设置表、投票表与风险列可用，默认设置和决赛候选正确', () => {
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

  const ballotColumns = client.sqlite.prepare('PRAGMA table_info(competition_popularity_ballots)').all() as Array<{ name: string }>
  assert.ok(ballotColumns.some(column => column.name === 'ip_hash'))
  assert.ok(ballotColumns.some(column => column.name === 'risk'))
  const ballotIndexes = client.sqlite.prepare('PRAGMA index_list(competition_popularity_ballots)').all() as Array<{ name: string }>
  assert.ok(ballotIndexes.some(index => index.name === 'competition_popularity_ballots_event_ip_idx'))

  const settings = ensurePopularitySettings(client, event.id)
  assert.equal(settings.enabled, false)
  assert.equal(settings.title, '人气奖投票')
  assert.equal(settings.allowChange, false)
  assert.equal(settings.maxChanges, 1)
  assert.equal(settings.votesPerVoter, 1)
  assert.equal(settings.allowRepeatVote, true)
  assert.equal(settings.qrRotateSeconds, 30)
  assert.equal(settings.showResults, true)
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
  // 投票页候选固定按出场顺序排列，不因票数变化乱序。
  assert.deepEqual(publicState.candidates.map(item => item.name), ['人气选手1', '人气选手2', '人气选手3'])

  // 默认锁死设备：关闭改票后同一设备不能再投给别人。
  openWindow(client, event.id, { allowChange: false })
  const locked = recordPopularityBallot(client, event.id, 'device-locked', singers[0]!.id, 0)
  assert.equal(locked.canChange, false)
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-locked', singers[1]!.id, 1), error => (
    codeOf(error) === 'POPULARITY_CHANGE_LIMIT'
  ))

  // 同 IP 第 5 个不同浏览器只标记风险，不拦截投票。
  const sharedIp = popularityIpHash('popularity-test-secret', '203.0.113.7')
  for (let index = 0; index < 5; index += 1) {
    recordPopularityBallot(client, event.id, `risk-device-${index}`, singers[0]!.id, 0, sharedIp)
  }
  assert.equal(getPopularityAdminState(client, event.id).riskVotes, 1)

  // final2 不参与人气奖候选，候选仍只有决赛第一轮三人。
  assert.equal(listPopularityCandidates(client, event.id).length, 3)
  assert.equal(getRoundByKey(client, event.id, 'final2').id.length > 0, true)
  assert.equal(finalRound.id.length > 0, true)

  cleanup(client, path)
})

test('人气奖：每人可投 3 票，可重复投同一选手，投满后拒绝', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const { event, singers } = createFinalEvent(client)
  const opened = openWindow(client, event.id, { votesPerVoter: 3 })
  assert.equal(opened.settings.votesPerVoter, 3)

  const first = recordPopularityBallot(client, event.id, 'device-multi', singers[0]!.id, 0)
  assert.equal(first.votesUsed, 1)
  assert.equal(first.votesRemaining, 2)
  assert.equal(first.revision, 1)
  assert.equal(first.myBallots.length, 1)
  assert.equal(first.myBallots[0]?.voteIndex, 0)

  // 多票模式的 revision 等于已投数，旧 revision 被拒绝。
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-multi', singers[1]!.id, 0), error => (
    codeOf(error) === 'POPULARITY_CONFLICT'
  ))

  const second = recordPopularityBallot(client, event.id, 'device-multi', singers[0]!.id, 1)
  assert.equal(second.votesUsed, 2)
  assert.equal(second.totalVotes, 2)
  assert.equal(second.myBallots.filter(row => row.singerId === singers[0]!.id).length, 2)

  const third = recordPopularityBallot(client, event.id, 'device-multi', singers[1]!.id, 2)
  assert.equal(third.votesUsed, 3)
  assert.equal(third.votesRemaining, 0)
  assert.equal(third.totalVotes, 3)

  assert.throws(() => recordPopularityBallot(client, event.id, 'device-multi', singers[2]!.id, 3), error => (
    codeOf(error) === 'POPULARITY_VOTE_LIMIT'
  ))

  const admin = getPopularityAdminState(client, event.id)
  assert.equal(admin.settings.votesPerVoter, 3)
  assert.equal(admin.totalVotes, 3)
  assert.deepEqual(admin.results.map(row => row.count).sort((left, right) => right - left), [2, 1, 0])

  // 另一台设备仍有独立配额。
  const other = recordPopularityBallot(client, event.id, 'device-other', singers[2]!.id, 0)
  assert.equal(other.votesUsed, 1)
  assert.equal(other.totalVotes, 4)

  cleanup(client, path)
})

test('人气奖：多票可限制同一选手最多 1 票', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const { event, singers } = createFinalEvent(client)
  const opened = openWindow(client, event.id, { votesPerVoter: 3, allowRepeatVote: false })
  assert.equal(opened.settings.votesPerVoter, 3)
  assert.equal(opened.settings.allowRepeatVote, false)

  const first = recordPopularityBallot(client, event.id, 'device-distinct', singers[0]!.id, 0)
  assert.equal(first.votesUsed, 1)
  assert.throws(() => recordPopularityBallot(client, event.id, 'device-distinct', singers[0]!.id, 1), error => (
    codeOf(error) === 'POPULARITY_VOTE_DUPLICATE'
  ))

  const second = recordPopularityBallot(client, event.id, 'device-distinct', singers[1]!.id, 1)
  assert.equal(second.votesUsed, 2)
  const third = recordPopularityBallot(client, event.id, 'device-distinct', singers[2]!.id, 2)
  assert.equal(third.votesUsed, 3)
  assert.equal(third.votesRemaining, 0)
  assert.deepEqual(third.myBallots.map(row => row.singerId), [singers[0]!.id, singers[1]!.id, singers[2]!.id])

  const admin = getPopularityAdminState(client, event.id)
  assert.deepEqual(admin.results.map(row => row.count), [1, 1, 1])

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
    votesPerVoter: 1,
    allowRepeatVote: true,
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
    votesPerVoter: 1,
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

test('人气奖设备令牌：签发可验证、跨赛事被拒、篡改被拒', () => {
  const secret = 'popularity-device-secret'
  const eventId = randomUUID()
  const deviceId = 'd'.repeat(32)
  const token = issuePopularityDeviceToken(secret, eventId, deviceId)
  assert.ok(token.length > 40)

  const verified = verifyPopularityDeviceToken(secret, token)
  assert.equal(verified?.eventId, eventId)
  assert.equal(verified?.deviceId, deviceId)
  assert.equal(verifyPopularityDeviceToken('another-secret', token), null)
  assert.equal(verifyPopularityDeviceToken(secret, `${token.slice(0, -2)}aa`), null)
  assert.equal(verifyPopularityDeviceToken(secret, null), null)

  const crossEvent = issuePopularityDeviceToken(secret, randomUUID(), deviceId)
  assert.notEqual(verifyPopularityDeviceToken(secret, crossEvent)?.eventId, eventId)
})

test('人气奖候选按出场顺序返回且携带 1v1 分组；旧库迁移默认开启 showResults 并支持后台关闭', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
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
  const singers = Array.from({ length: 4 }, (_, index) => createSinger(client, event.id, {
    name: `决赛歌手${index + 1}`,
    song: `曲目${index + 1}`,
    className: '26音乐学1班',
    studentNo: `202610${String(index + 1).padStart(2, '0')}`,
    qq: `310100${String(index + 1).padStart(2, '0')}`
  }))
  const finalRound = getRoundByKey(client, event.id, 'final')
  const insertEntry = client.sqlite.prepare(
    'INSERT INTO competition_round_entries (id, round_id, singer_id, sort_order, song) VALUES (?, ?, ?, ?, ?)'
  )
  singers.forEach((singer, index) => {
    insertEntry.run(randomUUID(), finalRound.id, singer.id, index + 1, `决赛曲${index + 1}`)
  })

  // 非 duel 模式时 pairNo/pairSlot 为 null，按出场顺序排列。
  const rankModeCandidates = listPopularityCandidates(client, event.id)
  assert.deepEqual(rankModeCandidates.map(item => item.number), [1, 2, 3, 4])
  assert.deepEqual(rankModeCandidates.map(item => item.pairNo), [null, null, null, null])
  assert.deepEqual(rankModeCandidates.map(item => item.pairSlot), [null, null, null, null])

  // 切到 duel 并抽签后，返回真实 pairNo/pairSlot，且投票后顺序仍严格保持出场顺序。
  const duelRound = updateRound(client, finalRound, { advanceMode: 'duel' })
  drawFinalPairs(client, duelRound)
  const pairedCandidates = listPopularityCandidates(client, event.id)
  assert.deepEqual(pairedCandidates.map(item => item.number), [1, 2, 3, 4])
  assert.deepEqual(pairedCandidates.map(item => item.pairNo), [1, 1, 2, 2])
  assert.deepEqual(pairedCandidates.map(item => item.pairSlot), [1, 2, 1, 2])

  const opened = openWindow(client, event.id, { showResults: true })
  assert.equal(opened.settings.showResults, true)
  const lastSingerId = pairedCandidates[3]!.singerId
  recordPopularityBallot(client, event.id, 'dev-1', lastSingerId, 0)
  recordPopularityBallot(client, event.id, 'dev-2', lastSingerId, 0)
  const stateAfterVote = getPopularityPublicState(client, event.id, 'viewer')
  assert.deepEqual(stateAfterVote.candidates.map(item => item.number), [1, 2, 3, 4])
  assert.deepEqual(stateAfterVote.candidates.map(item => item.pairNo), [1, 1, 2, 2])
  assert.equal(stateAfterVote.candidates[3]?.singerId, lastSingerId)

  // 清除对阵后 pairNo 回到 null。
  clearFinalPairs(client, getRoundByKey(client, event.id, 'final'))
  const clearedCandidates = listPopularityCandidates(client, event.id)
  assert.deepEqual(clearedCandidates.map(item => item.pairNo), [null, null, null, null])

  // 手动切换 showResults=false 后公开页 results 为 null，不影响后台配置切换。
  openWindow(client, event.id, { showResults: false })
  const hiddenState = getPopularityPublicState(client, event.id, 'viewer')
  assert.equal(hiddenState.showResults, false)
  assert.equal(hiddenState.results, null)

  cleanup(client, path)
})

test('中文组名、出场顺序分组与实时排名/差票纯函数', () => {
  assert.equal(formatChineseGroupTitle(1), '第一组')
  assert.equal(formatChineseGroupTitle(10), '第十组')
  assert.equal(formatChineseGroupTitle(11), '第十一组')
  assert.equal(formatChineseGroupTitle(20), '第二十组')
  assert.equal(formatChineseGroupTitle(23), '第二十三组')

  const makeCandidate = (
    singerId: string,
    number: number,
    pairNo: number | null = null,
    pairSlot: number | null = null
  ): CompetitionPopularityCandidate => ({
    singerId,
    number,
    name: `选手${number}`,
    className: '26音乐学1班',
    photoUrl: null,
    song: `曲目${number}`,
    sortOrder: number,
    pairNo,
    pairSlot
  })

  // 未抽签 5 位选手按出场顺序两两切分，奇数尾组单人一组。
  const unorderedInput = [
    makeCandidate('s3', 3),
    makeCandidate('s1', 1),
    makeCandidate('s5', 5),
    makeCandidate('s2', 2),
    makeCandidate('s4', 4)
  ]
  const fallbackGroups = groupPopularityCandidates(unorderedInput)
  assert.deepEqual(
    fallbackGroups.map(group => ({
      title: group.title,
      numbers: group.candidates.map(item => item.number)
    })),
    [
      { title: '第一组', numbers: [1, 2] },
      { title: '第二组', numbers: [3, 4] },
      { title: '第三组', numbers: [5] }
    ]
  )

  // 已抽签时沿用 pairNo。
  const pairedInput = [
    makeCandidate('s1', 1, 1, 1),
    makeCandidate('s2', 2, 1, 2),
    makeCandidate('s3', 3, 2, 1),
    makeCandidate('s4', 4, 2, 2)
  ]
  const pairedGroups = groupPopularityCandidates(pairedInput)
  assert.deepEqual(
    pairedGroups.map(group => ({ title: group.title, numbers: group.candidates.map(item => item.number) })),
    [
      { title: '第一组', numbers: [1, 2] },
      { title: '第二组', numbers: [3, 4] }
    ]
  )

  // 梯度票 + 并列第 2 + 0 票追赶。
  const standing = computePopularityStandingMap(pairedInput, [
    { singerId: 's1', name: '选手1', count: 30, percent: 30.6 },
    { singerId: 's2', name: '选手2', count: 28, percent: 28.6 },
    { singerId: 's3', name: '选手3', count: 28, percent: 28.6 },
    { singerId: 's4', name: '选手4', count: 12, percent: 12.2 }
  ])
  assert.ok(standing)
  assert.deepEqual(standing.get('s1'), {
    singerId: 's1',
    count: 30,
    rank: 1,
    tiedCount: 1,
    prevRank: null,
    gapToPrev: null,
    leadOverNext: 2
  })
  assert.deepEqual(standing.get('s2'), {
    singerId: 's2',
    count: 28,
    rank: 2,
    tiedCount: 2,
    prevRank: 1,
    gapToPrev: 2,
    leadOverNext: null
  })
  assert.deepEqual(standing.get('s3'), {
    singerId: 's3',
    count: 28,
    rank: 2,
    tiedCount: 2,
    prevRank: 1,
    gapToPrev: 2,
    leadOverNext: null
  })
  assert.deepEqual(standing.get('s4'), {
    singerId: 's4',
    count: 12,
    rank: 4,
    tiedCount: 1,
    prevRank: 2,
    gapToPrev: 16,
    leadOverNext: null
  })

  // 并列第 1：leadOverNext 为 null，第 3 名追赶第 1 名。
  const tieTop = computePopularityStandingMap(pairedInput.slice(0, 3), [
    { singerId: 's1', name: '选手1', count: 10, percent: 40 },
    { singerId: 's2', name: '选手2', count: 10, percent: 40 },
    { singerId: 's3', name: '选手3', count: 5, percent: 20 }
  ])
  assert.equal(tieTop?.get('s1')?.rank, 1)
  assert.equal(tieTop?.get('s1')?.tiedCount, 2)
  assert.equal(tieTop?.get('s1')?.leadOverNext, null)
  assert.equal(tieTop?.get('s3')?.rank, 3)
  assert.equal(tieTop?.get('s3')?.prevRank, 1)
  assert.equal(tieTop?.get('s3')?.gapToPrev, 5)

  // 全员 0 票时 rank 为 null，results 为 null 时整体返回 null。
  const zeroStanding = computePopularityStandingMap(pairedInput, [
    { singerId: 's1', name: '选手1', count: 0, percent: 0 }
  ])
  assert.equal(zeroStanding?.get('s1')?.rank, null)
  assert.equal(zeroStanding?.get('s4')?.rank, null)
  assert.equal(computePopularityStandingMap(pairedInput, null), null)
})

test('迁移 0091：旧库升级后原 show_results = 0 自动开启为 1', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-popularity-0091-'))
  const dbPath = join(directory, 'upgrade.sqlite')
  const client = getDatabase(dbPath)
  try {
    const migrationsSrc = resolve('server/database/migrations')
    const journal = JSON.parse(readFileSync(join(migrationsSrc, 'meta/_journal.json'), 'utf8')) as {
      version: string
      dialect: string
      entries: Array<{ idx: number, version: string, when: number, tag: string, breakpoints: boolean }>
    }
    const before0091 = journal.entries.filter(entry => entry.idx < 91)
    const preFolder = join(directory, 'pre-0091')
    mkdirSync(join(preFolder, 'meta'), { recursive: true })
    for (const entry of before0091) {
      copyFileSync(join(migrationsSrc, `${entry.tag}.sql`), join(preFolder, `${entry.tag}.sql`))
    }
    writeFileSync(
      join(preFolder, 'meta/_journal.json'),
      `${JSON.stringify({ ...journal, entries: before0091 }, null, 2)}\n`,
      'utf8'
    )
    migrate(client.db, { migrationsFolder: preFolder })

    const contentId = randomUUID()
    const eventId = randomUUID()
    client.sqlite.prepare(
      `INSERT INTO contents (id, kind, slug, title, summary, status) VALUES (?, 'club', 'music-association', '音乐协会', 'test', 'published')`
    ).run(contentId)
    client.sqlite.prepare(
      `INSERT INTO competition_events (id, content_id) VALUES (?, ?)`
    ).run(eventId, contentId)
    client.sqlite.prepare(
      `INSERT INTO competition_popularity_settings (id, event_id, show_results, display_key) VALUES (?, ?, 0, ?)`
    ).run(randomUUID(), eventId, 'legacy-display-key-123456')

    const beforeRow = client.sqlite.prepare(
      'SELECT show_results AS showResults FROM competition_popularity_settings WHERE event_id = ?'
    ).get(eventId) as { showResults: number }
    assert.equal(beforeRow.showResults, 0)

    runMigrations(client)

    const afterRow = client.sqlite.prepare(
      'SELECT show_results AS showResults FROM competition_popularity_settings WHERE event_id = ?'
    ).get(eventId) as { showResults: number }
    assert.equal(afterRow.showResults, 1)
  } finally {
    closeDatabase(dbPath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('性质测试：groupPopularityCandidates 与 computePopularityStandingMap 在随机输入下满足不变量', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 1, maxLength: 24 }),
      (voteCounts) => {
        const candidates: CompetitionPopularityCandidate[] = voteCounts.map((_, index) => ({
          singerId: `singer-${index + 1}`,
          number: index + 1,
          name: `选手${index + 1}`,
          className: null,
          photoUrl: null,
          song: `歌${index + 1}`,
          sortOrder: index + 1,
          pairNo: null,
          pairSlot: null
        }))
        const shuffled = [...candidates].reverse()
        const groups = groupPopularityCandidates(shuffled)
        const flattened = groups.flatMap(group => group.candidates)
        assert.deepEqual(
          flattened.map(item => item.number),
          candidates.map(item => item.number)
        )
        assert.ok(groups.every((group, idx) => idx === groups.length - 1 ? group.candidates.length >= 1 : group.candidates.length === 2))

        const total = voteCounts.reduce((sum, count) => sum + count, 0)
        const results = candidates.map((candidate, index) => ({
          singerId: candidate.singerId,
          name: candidate.name,
          count: voteCounts[index]!,
          percent: total > 0 ? Math.round((voteCounts[index]! / total) * 1000) / 10 : 0
        }))
        const standing = computePopularityStandingMap(candidates, results)
        assert.ok(standing)
        assert.equal(standing.size, candidates.length)
        for (const entry of standing.values()) {
          if (total === 0) {
            assert.equal(entry.rank, null)
            assert.equal(entry.gapToPrev, null)
          } else {
            assert.ok(entry.rank !== null && entry.rank >= 1 && entry.rank <= candidates.length)
            if (entry.rank > 1) {
              assert.ok(entry.prevRank !== null && entry.prevRank < entry.rank)
              assert.ok(entry.gapToPrev !== null && entry.gapToPrev >= 1)
            } else {
              assert.equal(entry.prevRank, null)
              assert.equal(entry.gapToPrev, null)
            }
          }
        }
      }
    ),
    { numRuns: 200 }
  )
})

test('混合模式与迁移 0097：免关注投基础票、关注公众号加赠 2 票同投一人、跨阶段防刷与不公布票数设置', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const { event, singers } = createFinalEvent(client)

  const settingsCols = client.sqlite.prepare('PRAGMA table_info(competition_popularity_settings)').all() as Array<{ name: string }>
  assert.ok(settingsCols.some(col => col.name === 'wechat_bonus_votes'), '0097 应新增 wechat_bonus_votes 列')

  const defaultSettings = ensurePopularitySettings(client, event.id)
  assert.equal(defaultSettings.wechatBonusVotes, 2)

  // 开启混合模式：基础 1 票 + 关注公众号多 2 票（可全投同一人），且隐藏票数。
  const hybridAdmin = openWindow(client, event.id, {
    authMode: 'hybrid',
    votesPerVoter: 1,
    wechatBonusVotes: 2,
    allowRepeatVote: true,
    showResults: false
  })
  assert.equal(hybridAdmin.settings.authMode, 'hybrid')
  assert.equal(hybridAdmin.settings.wechatBonusVotes, 2)
  assert.equal(hybridAdmin.settings.showResults, false)

  // 1) 未关注用户打开即享 1 票（总配额 1，最大上限 3），且公开页不公布票数（totalVotes 置 0，results 为 null）
  const guestBefore = getPopularityPublicState(client, event.id, 'hybrid-dev-1')
  assert.equal(guestBefore.authMode, 'hybrid')
  assert.equal(guestBefore.requiresWechatTicket, false)
  assert.equal(guestBefore.requiresQrScan, false)
  assert.equal(guestBefore.votesPerVoter, 1)
  assert.equal(guestBefore.wechatBonusVotes, 2)
  assert.equal(guestBefore.maxVotesPerVoter, 3)
  assert.equal(guestBefore.votesRemaining, 1)
  assert.equal(guestBefore.results, null)
  assert.equal(guestBefore.totalVotes, 0)

  // 投出免关注第 1 票给选手 A
  const afterBaseVote = recordPopularityBallot(client, event.id, 'hybrid-dev-1', singers[0]!.id, 0)
  assert.equal(afterBaseVote.votesUsed, 1)
  assert.equal(afterBaseVote.votesPerVoter, 1)
  assert.equal(afterBaseVote.votesRemaining, 0)
  assert.equal(afterBaseVote.totalVotes, 0, '不公布票数时公开 state 的 totalVotes 也应隐藏为 0')
  assert.equal(afterBaseVote.results, null)
  assert.equal(getPopularityAdminState(client, event.id).totalVotes, 1, '后台总票数应真实返回 1')

  // 未关注时继续投第 2 票应被混合模式基础票上限拦截
  assert.throws(() => recordPopularityBallot(client, event.id, 'hybrid-dev-1', singers[0]!.id, 1), error => (
    codeOf(error) === 'POPULARITY_HYBRID_BASE_LIMIT'
  ))

  // 2) 同一浏览器随后关注公众号（带 openIdHash 进入）：已投的首票自动合并，解锁额外 2 票
  const wxUser1 = 'openid-hash-user-1'
  const mergedState = getPopularityPublicState(client, event.id, 'hybrid-dev-1', {
    wechatVerified: true,
    openIdHash: wxUser1
  })
  assert.equal(mergedState.wechatVerified, true)
  assert.equal(mergedState.votesPerVoter, 3)
  assert.equal(mergedState.votesUsed, 1)
  assert.equal(mergedState.votesRemaining, 2)
  assert.equal(mergedState.revision, 1)

  // 把关注多出的 2 票全部投给同一位选手 A（共 3 票）
  const afterBonus1 = recordPopularityBallot(client, event.id, 'hybrid-dev-1', singers[0]!.id, 1, null, {
    voterOpenidHash: wxUser1
  })
  assert.equal(afterBonus1.votesUsed, 2)
  assert.equal(afterBonus1.votesRemaining, 1)

  const afterBonus2 = recordPopularityBallot(client, event.id, 'hybrid-dev-1', singers[0]!.id, 2, null, {
    voterOpenidHash: wxUser1
  })
  assert.equal(afterBonus2.votesUsed, 3)
  assert.equal(afterBonus2.votesRemaining, 0)
  assert.equal(afterBonus2.myBallots.filter(row => row.singerId === singers[0]!.id).length, 3)

  // 投满 3 票后再投第 4 票被拒
  assert.throws(() => recordPopularityBallot(client, event.id, 'hybrid-dev-1', singers[1]!.id, 3, null, {
    voterOpenidHash: wxUser1
  }), error => codeOf(error) === 'POPULARITY_VOTE_LIMIT')

  // 同一台设备清掉 vt 退回免关注，也无法白嫖第 4 票
  const strippedVtState = getPopularityPublicState(client, event.id, 'hybrid-dev-1')
  assert.equal(strippedVtState.votesUsed, 3)
  assert.equal(strippedVtState.votesRemaining, 0)

  // 同一台设备换第二个微信号企图再刷 3 票，因设备已有 3 票而被拦截
  assert.throws(() => recordPopularityBallot(client, event.id, 'hybrid-dev-1', singers[1]!.id, 3, null, {
    voterOpenidHash: 'openid-hash-user-2'
  }), error => codeOf(error) === 'POPULARITY_VOTE_LIMIT')

  // 同一微信号换另一台设备也不得绕过 3 票上限
  assert.throws(() => recordPopularityBallot(client, event.id, 'hybrid-dev-other', singers[1]!.id, 3, null, {
    voterOpenidHash: wxUser1
  }), error => codeOf(error) === 'POPULARITY_VOTE_LIMIT')

  // 3) 直接从公众号进入的新用户可直接连投 3 票给同一位选手
  const wxUser3 = 'openid-hash-user-3'
  recordPopularityBallot(client, event.id, 'hybrid-dev-3', singers[1]!.id, 0, null, { voterOpenidHash: wxUser3 })
  recordPopularityBallot(client, event.id, 'hybrid-dev-3', singers[1]!.id, 1, null, { voterOpenidHash: wxUser3 })
  const direct3 = recordPopularityBallot(client, event.id, 'hybrid-dev-3', singers[1]!.id, 2, null, { voterOpenidHash: wxUser3 })
  assert.equal(direct3.votesUsed, 3)
  assert.equal(direct3.myBallots.filter(row => row.singerId === singers[1]!.id).length, 3)

  // 4) 跨双设备补绑合并：设备 A 用 wxUserCross 投 1 票（slot 0），设备 B 先免关注投 1 票（slot 0），随后在设备 B 带 wxUserCross 投第 3 票不冲突 slot
  const wxUserCross = 'openid-hash-user-cross'
  recordPopularityBallot(client, event.id, 'cross-dev-A', singers[2]!.id, 0, null, { voterOpenidHash: wxUserCross })
  recordPopularityBallot(client, event.id, 'cross-dev-B', singers[2]!.id, 0)
  const mergedCross = getPopularityPublicState(client, event.id, 'cross-dev-B', {
    wechatVerified: true,
    openIdHash: wxUserCross
  })
  assert.equal(mergedCross.votesUsed, 2)
  assert.equal(mergedCross.votesRemaining, 1)
  const crossThird = recordPopularityBallot(client, event.id, 'cross-dev-B', singers[2]!.id, 2, null, {
    voterOpenidHash: wxUserCross
  })
  assert.equal(crossThird.votesUsed, 3)
  assert.equal(crossThird.votesRemaining, 0)
  assert.throws(() => recordPopularityBallot(client, event.id, 'cross-dev-B', singers[2]!.id, 3, null, {
    voterOpenidHash: wxUserCross
  }), error => codeOf(error) === 'POPULARITY_VOTE_LIMIT')

  // 后台核对真实总票数为 9（A=3, B=3, C=3），切回公布票数后公开页即可看见真实票数与排名
  const adminStats = getPopularityAdminState(client, event.id)
  assert.equal(adminStats.totalVotes, 9)
  assert.equal(adminStats.results.find(r => r.singerId === singers[0]!.id)?.count, 3)
  assert.equal(adminStats.results.find(r => r.singerId === singers[1]!.id)?.count, 3)
  assert.equal(adminStats.results.find(r => r.singerId === singers[2]!.id)?.count, 3)

  openWindow(client, event.id, {
    authMode: 'hybrid',
    votesPerVoter: 1,
    wechatBonusVotes: 2,
    allowRepeatVote: true,
    showResults: true
  })
  const revealedState = getPopularityPublicState(client, event.id, 'hybrid-dev-1')
  assert.equal(revealedState.showResults, true)
  assert.equal(revealedState.totalVotes, 9)
  assert.ok(revealedState.results && revealedState.results.length === 3)

  cleanup(client, path)
})

test('混合模式 PoW 纯函数：确定性求解、篡改拒绝与性质不变量', () => {
  const nonce = solvePopularityVotePow('ticket-abc-123', 'singer-001', POPULARITY_FIRST_VOTE_POW_BITS)
  assert.equal(verifyPopularityVotePow('ticket-abc-123', 'singer-001', nonce, POPULARITY_FIRST_VOTE_POW_BITS), true)
  assert.equal(verifyPopularityVotePow('ticket-abc-123', 'singer-002', nonce, POPULARITY_FIRST_VOTE_POW_BITS), false)
  assert.equal(verifyPopularityVotePow('ticket-abc-999', 'singer-001', nonce, POPULARITY_FIRST_VOTE_POW_BITS), false)
  assert.equal(verifyPopularityVotePow('ticket-abc-123', 'singer-001', '', POPULARITY_FIRST_VOTE_POW_BITS), false)

  fc.assert(
    fc.property(
      fc.string({ minLength: 8, maxLength: 64 }),
      fc.string({ minLength: 4, maxLength: 32 }),
      (ticket, singerId) => {
        const solved = solvePopularityVotePow(ticket, singerId, 16)
        assert.equal(verifyPopularityVotePow(ticket, singerId, solved, 16), true)
        assert.equal(verifyPopularityVotePow(ticket, `${singerId}-tampered`, solved, 16), false)
      }
    ),
    { numRuns: 15 }
  )
})

test('票数不公布但显示距离前一名差票（showRankGap）：隐藏票数/总票数/百分比，仅下发脱敏名次与差票', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const { event, singers } = createFinalEvent(client)

  const settingsCols = client.sqlite.prepare('PRAGMA table_info(competition_popularity_settings)').all() as Array<{ name: string }>
  assert.ok(settingsCols.some(col => col.name === 'show_rank_gap'), '0097 应新增 show_rank_gap 列')

  const defaultSettings = ensurePopularitySettings(client, event.id)
  assert.equal(defaultSettings.showRankGap, false)

  // 给 3 位选手制造 10 / 7 / 2 票梯度
  openWindow(client, event.id, {
    authMode: 'device_strict',
    votesPerVoter: 1,
    showResults: false,
    showRankGap: true
  })

  for (let i = 0; i < 10; i += 1) {
    recordPopularityBallot(client, event.id, `gap-dev-a-${i}`, singers[0]!.id, 0)
  }
  for (let i = 0; i < 7; i += 1) {
    recordPopularityBallot(client, event.id, `gap-dev-b-${i}`, singers[1]!.id, 0)
  }
  for (let i = 0; i < 2; i += 1) {
    recordPopularityBallot(client, event.id, `gap-dev-c-${i}`, singers[2]!.id, 0)
  }

  const gapOnlyState = getPopularityPublicState(client, event.id, 'viewer-1')
  assert.equal(gapOnlyState.showResults, false)
  assert.equal(gapOnlyState.showRankGap, true)
  assert.equal(gapOnlyState.totalVotes, 0)
  assert.equal(gapOnlyState.results, null)
  assert.ok(Array.isArray(gapOnlyState.standings) && gapOnlyState.standings.length === 3)

  // 绝不能通过 standings 泄露具体票数 count 或百分比 percent
  for (const hint of gapOnlyState.standings!) {
    assert.equal('count' in hint, false)
    assert.equal('percent' in hint, false)
  }

  const byId = new Map(gapOnlyState.standings!.map(item => [item.singerId, item]))
  assert.deepEqual(byId.get(singers[0]!.id), {
    singerId: singers[0]!.id,
    rank: 1,
    tiedCount: 1,
    prevRank: null,
    gapToPrev: null,
    leadOverNext: 3
  })
  assert.deepEqual(byId.get(singers[1]!.id), {
    singerId: singers[1]!.id,
    rank: 2,
    tiedCount: 1,
    prevRank: 1,
    gapToPrev: 3,
    leadOverNext: null
  })
  assert.deepEqual(byId.get(singers[2]!.id), {
    singerId: singers[2]!.id,
    rank: 3,
    tiedCount: 1,
    prevRank: 2,
    gapToPrev: 5,
    leadOverNext: null
  })

  // 纯函数校验：resolvePopularityStandingMap 正确解析脱敏 standings，toPopularityStandingHints 剥离 count
  const resolved = resolvePopularityStandingMap(gapOnlyState.candidates, gapOnlyState.results, gapOnlyState.standings)
  assert.ok(resolved)
  assert.equal(resolved.get(singers[1]!.id)?.gapToPrev, 3)
  assert.equal(resolved.get(singers[2]!.id)?.gapToPrev, 5)
  const adminState = getPopularityAdminState(client, event.id)
  const hintsFromHelper = toPopularityStandingHints(adminState.candidates, adminState.results)
  assert.equal(hintsFromHelper.length, 3)
  assert.equal('count' in hintsFromHelper[0]!, false)

  // 完全关闭 showResults 与 showRankGap 时，results 与 standings 均为 null
  openWindow(client, event.id, {
    authMode: 'device_strict',
    votesPerVoter: 1,
    showResults: false,
    showRankGap: false
  })
  const fullyHidden = getPopularityPublicState(client, event.id, 'viewer-1')
  assert.equal(fullyHidden.showResults, false)
  assert.equal(fullyHidden.showRankGap, false)
  assert.equal(fullyHidden.totalVotes, 0)
  assert.equal(fullyHidden.results, null)
  assert.equal(fullyHidden.standings, null)
  assert.equal(resolvePopularityStandingMap(fullyHidden.candidates, fullyHidden.results, fullyHidden.standings), null)

  cleanup(client, path)
})
