import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { eq } from 'drizzle-orm'
import { DEFAULT_COMPETITION_DIMENSIONS } from '../shared/utils/competition'
import { computeCompetitionAnalytics } from '../shared/utils/competition-analytics'
import {
  closeDatabase,
  getDatabase,
  type DatabaseClient
} from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { competitionRoundEntries, contents } from '../server/database/schema'
import {
  confirmAdvanceRoster,
  createJudgeAccounts,
  createSinger,
  drawFinalPairs,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  listRoundEntryRows,
  reopenAdvanceRoster,
  setEntryCheckIn,
  submitJudgeScore,
  updateCompetitionEvent,
  updateRound
} from '../server/modules/competition/service'

type TestClient = DatabaseClient
type RoundKey = 'prelim' | 'semi' | 'final' | 'final2'

const TEST_EDITION = '2031 第七届'

function scoresForAll(value: number): Record<string, number> {
  return Object.fromEntries(DEFAULT_COMPETITION_DIMENSIONS.map(dimension => [dimension.key, value]))
}

function temporaryDatabase(): { client: TestClient, path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-revival-test-'))
  const path = join(directory, 'test.sqlite')
  return { client: getDatabase(path), path }
}

function roundView(payload: ReturnType<typeof getAdminCompetitionPayload>, key: RoundKey) {
  return payload.rounds.find(round => round.key === key)!
}

function checkInRound(client: TestClient, contentId: string, key: RoundKey): void {
  const payload = getAdminCompetitionPayload(client, contentId)
  const round = getRoundByKey(client, payload.event.id, key)
  for (const entry of roundView(payload, key).entries) setEntryCheckIn(client, round, entry.id, true)
}

/** updateCompetitionEvent 要完整字段；维度必须与当前一致，否则会被「已有评分」拦下。 */
function eventInput(patch: Record<string, unknown> = {}) {
  return {
    title: '新声歌手大赛',
    edition: TEST_EDITION,
    registrationOpen: true,
    dimensions: DEFAULT_COMPETITION_DIMENSIONS,
    ...patch
  }
}

/**
 * 一路推进到决赛 1v1 都打完：count 人 → 初赛/复赛全进 → 决赛 count/2 组。
 * 每组胜者都拿 10 分，败者按组号递减（9/8/7/6…），这样败者排序是确定的。
 */
async function reachFinalDuels(client: TestClient, contentId: string, count = 8) {
  const event = ensureCompetitionEvent(client, contentId)
  if (event.edition !== TEST_EDITION) {
    updateCompetitionEvent(client, event, eventInput())
  }

  const singers = Array.from({ length: count }, (_, index) => createSinger(client, event.id, {
    name: `选手${index + 1}`,
    song: `曲目${index + 1}`,
    className: '26音乐学1班',
    studentNo: `2031${String(index + 1).padStart(4, '0')}`,
    qq: `310000${String(index + 1).padStart(2, '0')}`
  }))

  for (const key of ['prelim', 'semi'] as const) {
    let round = getRoundByKey(client, event.id, key)
    round = updateRound(client, round, { status: 'open', advanceCount: count })
    checkInRound(client, contentId, key)
    const judges = await createJudgeAccounts(client, round, 1)
    const judge = { ...judges[0]!, eventId: event.id, roundId: round.id }
    for (const singer of singers) submitJudgeScore(client, judge, singer.id, { scores: scoresForAll(10) })
    round = getRoundByKey(client, event.id, key)
    round = updateRound(client, round, { status: 'closed' })
    assert.equal(confirmAdvanceRoster(client, round).advanced, count)
  }

  let finalRound = getRoundByKey(client, event.id, 'final')
  finalRound = updateRound(client, finalRound, { status: 'open', advanceMode: 'duel' })
  checkInRound(client, contentId, 'final')
  drawFinalPairs(client, finalRound)
  finalRound = getRoundByKey(client, event.id, 'final')

  const pairs = roundView(getAdminCompetitionPayload(client, contentId), 'final').duelPairs
  assert.equal(pairs.length, count / 2)
  const judges = await createJudgeAccounts(client, finalRound, 1)
  const judge = { ...judges[0]!, eventId: event.id, roundId: finalRound.id }
  const loserNames: string[] = []
  for (const pair of pairs) {
    const [left, right] = pair.entries
    assert.ok(left && right)
    submitJudgeScore(client, judge, left!.singer.id, { scores: scoresForAll(10) })
    submitJudgeScore(client, judge, right!.singer.id, { scores: scoresForAll(10 - pair.pairNo) })
    loserNames.push(right!.singer.name)
  }

  finalRound = getRoundByKey(client, event.id, 'final')
  finalRound = updateRound(client, finalRound, { status: 'closed' })
  return { event, contentId, finalRound, loserNames }
}

test('复活赛：败者按本轮均分排队，前 N 名跟胜者一起进第二轮', async () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  try {
    const contentId = randomUUID()
    client.db.insert(contents).values({
      id: contentId,
      kind: 'club',
      slug: 'music-association',
      title: '音乐协会',
      summary: 'test',
      status: 'published'
    }).run()

    const { event, finalRound, loserNames } = await reachFinalDuels(client, contentId)

    // 先关着：有候选名单，但一个都不复活。
    let payload = getAdminCompetitionPayload(client, contentId)
    let revival = roundView(payload, 'final').revival
    assert.ok(revival)
    assert.equal(revival!.enabled, false)
    assert.equal(revival!.candidates.length, 0)

    // 打开复活，名额 2。
    const current = ensureCompetitionEvent(client, contentId)
    updateCompetitionEvent(client, current, eventInput({ revivalEnabled: true, revivalSlots: 2 }))

    payload = getAdminCompetitionPayload(client, contentId)
    revival = roundView(payload, 'final').revival
    assert.ok(revival?.enabled)
    assert.equal(revival!.slots, 2)
    assert.equal(revival!.candidates.length, 4)
    // 败者 9/8/7/6 递减 → 排序就是第 1 到第 4 组的败者。
    assert.deepEqual(revival!.candidates.map(candidate => candidate.loserRank), [1, 2, 3, 4])
    assert.equal(revival!.candidates[0]!.name, loserNames[0])
    assert.deepEqual(revival!.candidates.map(candidate => candidate.revived), [true, true, false, false])

    assert.equal(confirmAdvanceRoster(client, finalRound).advanced, 6)
    payload = getAdminCompetitionPayload(client, contentId)
    const final2 = roundView(payload, 'final2')
    assert.equal(final2.entries.length, 6)
    assert.equal(final2.entries.filter(entry => entry.revived).length, 2)
    assert.deepEqual(
      final2.entries.filter(entry => entry.revived).map(entry => entry.singer.name).sort(),
      [loserNames[0]!, loserNames[1]!].sort()
    )
    // 复活标记只落在第二轮名单上，第一轮的败者本身不算「复活进来」。
    assert.equal(roundView(payload, 'final').entries.filter(entry => entry.revived).length, 0)
    assert.equal(computeCompetitionAnalytics(payload).overview.revivedCount, 2)
  } finally {
    closeDatabase(path)
    rmSync(join(path, '..'), { recursive: true, force: true })
  }
})

test('复活赛：12 人决赛 1v1 → 6 胜者 + 2 复活 = 8 人进第二轮（决赛条目 advanced 已落 0）', async () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  try {
    const contentId = randomUUID()
    client.db.insert(contents).values({
      id: contentId,
      kind: 'club',
      slug: 'music-association',
      title: '音乐协会',
      summary: 'test',
      status: 'published'
    }).run()

    const { finalRound } = await reachFinalDuels(client, contentId, 12)
    const current = ensureCompetitionEvent(client, contentId)
    updateCompetitionEvent(client, current, eventInput({ revivalEnabled: true, revivalSlots: 2 }))

    // 生产库现状：决赛 12 条的 advanced 已显式落成 0（不是 null）。
    // 抽签赛制不允许手动勾选，这些 0 不该影响「确认胜者」的可用性。
    client.db.update(competitionRoundEntries).set({ advanced: 0 })
      .where(eq(competitionRoundEntries.roundId, finalRound.id)).run()

    const payload = getAdminCompetitionPayload(client, contentId)
    const advanceRows = payload.advance.final ?? []
    assert.equal(advanceRows.length, 12)
    assert.equal(advanceRows.filter(row => row.advanced).length, 8)
    assert.equal(advanceRows.filter(row => row.revived).length, 2)

    assert.equal(confirmAdvanceRoster(client, getRoundByKey(client, current.id, 'final')).advanced, 8)
    const final2 = roundView(getAdminCompetitionPayload(client, contentId), 'final2')
    assert.equal(final2.entries.length, 8)
    assert.equal(final2.entries.filter(entry => entry.revived).length, 2)
  } finally {
    closeDatabase(path)
    rmSync(join(path, '..'), { recursive: true, force: true })
  }
})

test('复活赛：关掉开关后重算名单，复活者退回败者', async () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  try {
    const contentId = randomUUID()
    client.db.insert(contents).values({
      id: contentId,
      kind: 'club',
      slug: 'music-association',
      title: '音乐协会',
      summary: 'test',
      status: 'published'
    }).run()

    const { finalRound } = await reachFinalDuels(client, contentId)
    let current = ensureCompetitionEvent(client, contentId)
    updateCompetitionEvent(client, current, eventInput({ revivalEnabled: true, revivalSlots: 2 }))
    assert.equal(confirmAdvanceRoster(client, getRoundByKey(client, current.id, 'final')).advanced, 6)

    // 关掉复活再确认一次：本轮仍是 closed，名单按「只有胜者」重算。
    current = ensureCompetitionEvent(client, contentId)
    updateCompetitionEvent(client, current, eventInput({ revivalEnabled: false, revivalSlots: 2 }))
    reopenAdvanceRoster(client, getRoundByKey(client, current.id, 'final'))
    const again = confirmAdvanceRoster(client, getRoundByKey(client, current.id, 'final'))
    assert.equal(again.advanced, 4)

    const final2 = roundView(getAdminCompetitionPayload(client, contentId), 'final2')
    assert.equal(final2.entries.length, 4)
    assert.equal(final2.entries.filter(entry => entry.revived).length, 0)
    assert.equal(listRoundEntryRows(client, getRoundByKey(client, current.id, 'final2').id).length, 4)
    assert.equal(finalRound.key, 'final')
  } finally {
    closeDatabase(path)
    rmSync(join(path, '..'), { recursive: true, force: true })
  }
})

test('复活名额收敛到 1–6，非法值回落默认 2', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  try {
    const contentId = randomUUID()
    client.db.insert(contents).values({
      id: contentId,
      kind: 'club',
      slug: 'music-association',
      title: '音乐协会',
      summary: 'test',
      status: 'published'
    }).run()

    let event = ensureCompetitionEvent(client, contentId)
    updateCompetitionEvent(client, event, eventInput({ revivalEnabled: true, revivalSlots: 99 }))
    event = ensureCompetitionEvent(client, contentId)
    assert.equal(event.revivalSlots, 6)

    updateCompetitionEvent(client, event, eventInput({ revivalEnabled: true, revivalSlots: 0 }))
    event = ensureCompetitionEvent(client, contentId)
    assert.equal(event.revivalSlots, 2)

    updateCompetitionEvent(client, event, eventInput({ revivalEnabled: true, revivalSlots: 1 }))
    event = ensureCompetitionEvent(client, contentId)
    assert.equal(event.revivalEnabled, true)
    assert.equal(event.revivalSlots, 1)
  } finally {
    closeDatabase(path)
    rmSync(join(path, '..'), { recursive: true, force: true })
  }
})
