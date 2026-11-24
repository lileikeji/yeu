import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DEFAULT_COMPETITION_DIMENSIONS } from '../shared/utils/competition'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { contents } from '../server/database/schema'
import {
  clearFinalPairs,
  commitAccompanimentKey,
  confirmAdvanceRoster,
  createJudgeAccounts,
  createSinger,
  drawFinalPairs,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  listAdvanceRows,
  listRoundEntryRows,
  setEntryAccompaniment,
  setEntryAdvanced,
  setEntryCheckIn,
  submitJudgeScore,
  updateCompetitionEvent,
  updateRound
} from '../server/modules/competition/service'

type TestClient = DatabaseClient
type RoundKey = 'prelim' | 'semi' | 'final' | 'final2'

const PINNED_EDITION = '2031 第六届'

function scoresForAll(value: number): Record<string, number> {
  return Object.fromEntries(DEFAULT_COMPETITION_DIMENSIONS.map(dimension => [dimension.key, value]))
}

function codeOf(error: unknown): string {
  return (error as { data?: { code?: string } }).data?.code ?? ''
}

function temporaryDatabase(): { client: TestClient, path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-duel-test-'))
  const path = join(directory, 'test.sqlite')
  return { client: getDatabase(path), path }
}

function createContent(client: TestClient, slug: string): string {
  const contentId = randomUUID()
  client.db.insert(contents).values({
    id: contentId,
    kind: 'club',
    slug,
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()
  return contentId
}

function setupEvent(client: TestClient, contentId: string) {
  const created = ensureCompetitionEvent(client, contentId)
  if (created.edition === '') {
    updateCompetitionEvent(client, created, {
      title: created.title,
      edition: PINNED_EDITION,
      registrationOpen: created.registrationOpen !== false,
      dimensions: DEFAULT_COMPETITION_DIMENSIONS
    })
  }
  return ensureCompetitionEvent(client, contentId)
}

function roundView(payload: ReturnType<typeof getAdminCompetitionPayload>, key: RoundKey) {
  return payload.rounds.find(round => round.key === key)!
}

function checkInRound(client: TestClient, contentId: string, key: RoundKey): void {
  const payload = getAdminCompetitionPayload(client, contentId)
  const round = getRoundByKey(client, payload.event.id, key)
  if (round.status === 'closed') return
  for (const entry of roundView(payload, key).entries) setEntryCheckIn(client, round, entry.id, true)
}

async function advanceFour(client: TestClient, contentId: string, singers: Array<{ id: string }>): Promise<void> {
  let prelim = updateRound(client, getRoundByKey(client, getAdminCompetitionPayload(client, contentId).event.id, 'prelim'), {
    status: 'open',
    advanceCount: singers.length
  })
  checkInRound(client, contentId, 'prelim')
  let judges = await createJudgeAccounts(client, prelim, 1)
  for (const singer of singers) {
    submitJudgeScore(client, { ...judges[0]!, eventId: prelim.eventId, roundId: prelim.id }, singer.id, { scores: scoresForAll(10) })
  }
  prelim = updateRound(client, getRoundByKey(client, prelim.eventId, 'prelim'), { status: 'closed' })
  assert.equal(confirmAdvanceRoster(client, prelim).advanced, singers.length)

  let semi = updateRound(client, getRoundByKey(client, prelim.eventId, 'semi'), {
    status: 'open',
    advanceCount: singers.length
  })
  checkInRound(client, contentId, 'semi')
  judges = await createJudgeAccounts(client, semi, 1)
  for (const singer of singers) {
    submitJudgeScore(client, { ...judges[0]!, eventId: semi.eventId, roundId: semi.id }, singer.id, { scores: scoresForAll(10) })
  }
  semi = updateRound(client, getRoundByKey(client, semi.eventId, 'semi'), { status: 'closed' })
  assert.equal(confirmAdvanceRoster(client, semi).advanced, singers.length)
}

test('迁移 0082：轮次表有 advance_mode，名单有 pair_no/pair_slot 且同组位置唯一', () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)

  const roundColumns = client.sqlite.prepare('PRAGMA table_info(competition_rounds)').all() as Array<{ name: string, dflt_value: string | null }>
  const advanceMode = roundColumns.find(column => column.name === 'advance_mode')
  assert.ok(advanceMode)
  assert.equal(advanceMode.dflt_value, `'rank'`)

  const entryColumns = client.sqlite.prepare('PRAGMA table_info(competition_round_entries)').all() as Array<{ name: string }>
  assert.ok(entryColumns.some(column => column.name === 'pair_no'))
  assert.ok(entryColumns.some(column => column.name === 'pair_slot'))

  const contentId = randomUUID()
  const eventId = randomUUID()
  const roundId = randomUUID()
  const singerId = randomUUID()
  client.sqlite.prepare('INSERT INTO contents (id, kind, slug, title, summary) VALUES (?, ?, ?, ?, ?)')
    .run(contentId, 'club', 'duel-migration', '音乐协会', 'test')
  client.sqlite.prepare('INSERT INTO competition_events (id, content_id, title, edition) VALUES (?, ?, ?, ?)')
    .run(eventId, contentId, '新声歌手大赛', PINNED_EDITION)
  client.sqlite.prepare('INSERT INTO competition_rounds (id, event_id, key, title, position, status, advance_mode) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(roundId, eventId, 'final', '决赛', 3, 'draft', 'duel')
  client.sqlite.prepare('INSERT INTO competition_singers (id, event_id, name, song) VALUES (?, ?, ?, ?)')
    .run(singerId, eventId, '张三', '晴天')
  const insertEntry = client.sqlite.prepare('INSERT INTO competition_round_entries (id, round_id, singer_id, sort_order, pair_no, pair_slot) VALUES (?, ?, ?, ?, ?, ?)')
  insertEntry.run(randomUUID(), roundId, singerId, 1, 1, 1)
  assert.throws(() => insertEntry.run(randomUUID(), roundId, singerId, 2, 1, 1))

  closeDatabase(path)
  rmSync(join(path, '..'), { recursive: true, force: true })
})

test('抽签 1v1：12 人 6 组、自动胜者、确认 6 人进 final2，且不能手动勾选', async () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const contentId = createContent(client, 'duel-e2e')
  const event = setupEvent(client, contentId)
  const singers = Array.from({ length: 12 }, (_, index) => createSinger(client, event.id, {
    name: `对决选手${index + 1}`,
    song: `初赛曲${index + 1}`,
    className: '26音乐学1班',
    studentNo: `2026${String(index + 1).padStart(4, '0')}`,
    qq: `300001${String(index + 1).padStart(2, '0')}`
  }))
  await advanceFour(client, contentId, singers)

  let finalRound = updateRound(client, getRoundByKey(client, event.id, 'final'), {
    status: 'open',
    advanceMode: 'duel'
  })
  assert.equal(finalRound.advanceMode, 'duel')
  checkInRound(client, contentId, 'final')

  // 开唱前抽签：12 人 6 组，每组两个位置。
  drawFinalPairs(client, finalRound)
  let view = roundView(getAdminCompetitionPayload(client, contentId), 'final')
  assert.equal(view.duelPairs.length, 6)
  assert.ok(view.duelPairs.every(pair => pair.entries.length === 2))
  const pairNos = new Set(view.duelPairs.flatMap(pair => pair.entries.map(entry => entry.pairNo)))
  assert.deepEqual([...pairNos].sort((left, right) => Number(left) - Number(right)), [1, 2, 3, 4, 5, 6])

  // 清除对阵后再抽一次，验证 pair 字段可重置。
  clearFinalPairs(client, finalRound)
  view = roundView(getAdminCompetitionPayload(client, contentId), 'final')
  assert.equal(view.duelPairs.length, 0)
  drawFinalPairs(client, finalRound)

  const finalEntries = listRoundEntryRows(client, finalRound.id)
  const finalView = roundView(getAdminCompetitionPayload(client, contentId), 'final')
  const judges = await createJudgeAccounts(client, finalRound, 1)
  const judge = { ...judges[0]!, eventId: event.id, roundId: finalRound.id }
  const winners = new Set<string>()
  for (const pair of finalView.duelPairs) {
    const [first, second] = pair.entries
    assert.ok(first && second)
    const firstWins = (first.pairSlot ?? 1) === 1
    const high = firstWins ? first : second
    const low = firstWins ? second : first
    submitJudgeScore(client, judge, high.singer.id, { scores: scoresForAll(10) })
    submitJudgeScore(client, judge, low.singer.id, { scores: scoresForAll(8) })
    winners.add(high.id)
  }
  assert.equal(finalEntries.length, 12)

  // 有评分后不能再抽签。
  assert.throws(() => drawFinalPairs(client, finalRound), (error: unknown) => codeOf(error) === 'ROUND_HAS_SCORES')

  finalRound = updateRound(client, getRoundByKey(client, event.id, 'final'), { status: 'closed' })
  const closedView = roundView(getAdminCompetitionPayload(client, contentId), 'final')
  assert.equal(closedView.duelPairs.filter(pair => pair.ready).length, 6)
  assert.ok(closedView.duelPairs.every(pair => pair.winnerEntryId && winners.has(pair.winnerEntryId)))

  const rows = listAdvanceRows(client, finalRound)
  assert.equal(rows.filter(row => row.advanced).length, 6)
  assert.ok(rows.filter(row => row.advanced).every(row => winners.has(row.entryId)))
  assert.throws(
    () => setEntryAdvanced(client, finalRound, rows.find(row => !row.advanced)!.entryId, true),
    (error: unknown) => codeOf(error) === 'DUEL_AUTO_ADVANCE'
  )

  const confirmed = confirmAdvanceRoster(client, finalRound)
  assert.equal(confirmed.advanced, 6)
  const final2Entries = listRoundEntryRows(client, getRoundByKey(client, event.id, 'final2').id)
  assert.equal(final2Entries.length, 6)
  assert.deepEqual(
    final2Entries.map(entry => entry.singerId).sort(),
    [...winners].map(entryId => finalEntries.find(entry => entry.id === entryId)!.singerId).sort()
  )

  // 已确认后不能再切回整轮前六。
  assert.throws(
    () => updateRound(client, getRoundByKey(client, event.id, 'final'), { advanceMode: 'rank' }),
    (error: unknown) => ['ROUND_ROSTER_CONFIRMED', 'ROUND_ADVANCE_LOCKED', 'ROUND_HAS_SCORES'].includes(codeOf(error))
  )

  closeDatabase(path)
  rmSync(join(path, '..'), { recursive: true, force: true })
})

test('抽签 1v1 平分且评委多数相同：不静默晋级，提示加赛', async () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const contentId = createContent(client, 'duel-tie')
  const event = setupEvent(client, contentId)
  const singers = Array.from({ length: 2 }, (_, index) => createSinger(client, event.id, {
    name: `平分选手${index + 1}`,
    song: `初赛曲${index + 1}`,
    className: '26音乐学1班',
    studentNo: `2026${String(index + 1).padStart(4, '0')}`,
    qq: `300002${String(index + 1).padStart(2, '0')}`
  }))
  await advanceFour(client, contentId, singers)

  let finalRound = updateRound(client, getRoundByKey(client, event.id, 'final'), { status: 'open', advanceMode: 'duel' })
  checkInRound(client, contentId, 'final')
  drawFinalPairs(client, finalRound)
  const judges = await createJudgeAccounts(client, finalRound, 3)
  const entries = listRoundEntryRows(client, finalRound.id)
  assert.equal(entries.length, 2)
  for (const judge of judges) {
    for (const entry of entries) {
      submitJudgeScore(client, { ...judge, eventId: event.id, roundId: finalRound.id }, entry.singerId, { scores: scoresForAll(10) })
    }
  }
  finalRound = updateRound(client, getRoundByKey(client, event.id, 'final'), { status: 'closed' })
  const pair = roundView(getAdminCompetitionPayload(client, contentId), 'final').duelPairs[0]
  assert.ok(pair)
  assert.equal(pair.ready, false)
  assert.match(pair.note, /同分/)
  assert.throws(
    () => confirmAdvanceRoster(client, finalRound),
    (error: unknown) => codeOf(error) === 'VALIDATION_ERROR'
  )

  closeDatabase(path)
  rmSync(join(path, '..'), { recursive: true, force: true })
})

test('决赛单视频入口关闭，统一走两首歌页分别上传', async () => {
  const { client, path } = temporaryDatabase()
  runMigrations(client)
  const contentId = createContent(client, 'duel-video')
  const event = setupEvent(client, contentId)
  const singer = createSinger(client, event.id, {
    name: '视频选手',
    song: '初赛曲',
    className: '26音乐学1班',
    studentNo: '20269999',
    qq: '30000301'
  })
  const prelim = updateRound(client, getRoundByKey(client, event.id, 'prelim'), { status: 'open', advanceCount: 1 })
  checkInRound(client, contentId, 'prelim')
  const judges = await createJudgeAccounts(client, prelim, 1)
  submitJudgeScore(client, { ...judges[0]!, eventId: event.id, roundId: prelim.id }, singer.id, { scores: scoresForAll(10) })
  updateRound(client, getRoundByKey(client, event.id, 'prelim'), { status: 'closed' })
  confirmAdvanceRoster(client, getRoundByKey(client, event.id, 'prelim'))
  let semi = updateRound(client, getRoundByKey(client, event.id, 'semi'), { status: 'open', advanceCount: 1 })
  checkInRound(client, contentId, 'semi')
  const semiJudge = await createJudgeAccounts(client, semi, 1)
  submitJudgeScore(client, { ...semiJudge[0]!, eventId: event.id, roundId: semi.id }, singer.id, { scores: scoresForAll(10) })
  semi = updateRound(client, getRoundByKey(client, event.id, 'semi'), { status: 'closed' })
  confirmAdvanceRoster(client, semi)

  const finalRound = updateRound(client, getRoundByKey(client, event.id, 'final'), { status: 'open' })
  const entry = listRoundEntryRows(client, finalRound.id)[0]!
  await assert.rejects(
    () => setEntryAccompaniment(client, finalRound, entry.id, { filename: '背景.mp3', data: new Uint8Array([1, 2, 3]) }),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_VIDEO_DEDICATED'
  )
  await assert.rejects(
    () => commitAccompanimentKey(client, finalRound, entry.id, { key: 'uploads/背景.mp3', name: '背景.mp3', size: 3 }),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_VIDEO_DEDICATED'
  )
  await assert.rejects(
    () => setEntryAccompaniment(client, finalRound, entry.id, { filename: '背景.mp4', data: new Uint8Array([1, 2, 3]) }),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_VIDEO_DEDICATED'
  )

  closeDatabase(path)
  rmSync(join(path, '..'), { recursive: true, force: true })
})
