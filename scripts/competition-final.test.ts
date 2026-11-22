import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { DEFAULT_COMPETITION_DIMENSIONS } from '../shared/utils/competition'
import {
  closeDatabase,
  getDatabase,
  type DatabaseClient
} from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { competitionFinalSongs, contents } from '../server/database/schema'
import {
  confirmAdvanceRoster,
  createJudgeAccounts,
  createSinger,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getFinalSongEditor,
  getRankBoard,
  getRoundByKey,
  listRoundEntryRows,
  setEntryCheckIn,
  submitFinalSongsByThreeFactors,
  submitJudgeScore,
  submitSongByThreeFactors,
  submitAccompanimentByThreeFactors,
  updateCompetitionEvent,
  updateRound
} from '../server/modules/competition/service'

type TestClient = DatabaseClient
type RoundKey = 'prelim' | 'semi' | 'final' | 'final2'

const PINNED_EDITION = '2031 第六届'

function scoresForAll(value: number): Record<string, number> {
  return Object.fromEntries(DEFAULT_COMPETITION_DIMENSIONS.map(dimension => [dimension.key, value]))
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

function codeOf(error: unknown): string {
  return (error as { data?: { code?: string } }).data?.code ?? ''
}

function temporaryDatabase(): { client: TestClient, path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-final-test-'))
  const path = join(directory, 'test.sqlite')
  return { client: getDatabase(path), path }
}

test('迁移 0080：重建轮次表时保留评委、会话、名单、评分，并允许 final2 与两首歌', () => {
  const { client, path } = temporaryDatabase()
  const contentId = randomUUID()
  const eventId = randomUUID()
  const prelimId = randomUUID()
  const finalId = randomUUID()
  const judgeId = randomUUID()
  const sessionId = randomUUID()
  const singerId = randomUUID()
  const entryId = randomUUID()
  const scoreId = randomUUID()

  // 先只跑到 0079，模拟线上旧库，再让 runMigrations 应用 0080。
  const migrationsFolder = join(process.cwd(), 'server/database/migrations')
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as {
    version: string
    dialect: string
    entries: Array<{ idx: number, version: string, when: number, tag: string, breakpoints: boolean }>
  }
  const oldEntries = journal.entries.filter(entry => entry.idx <= 79)
  const partialFolder = mkdtempSync(join(tmpdir(), 'yeu-migrations-0079-'))
  mkdirSync(join(partialFolder, 'meta'), { recursive: true })
  writeFileSync(join(partialFolder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: oldEntries }))
  for (const entry of oldEntries) {
    copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(partialFolder, `${entry.tag}.sql`))
  }
  migrate(client.db, { migrationsFolder: partialFolder })

  client.sqlite.prepare(
    'INSERT INTO contents (id, kind, slug, title, summary) VALUES (?, ?, ?, ?, ?)'
  ).run(contentId, 'club', 'music-association', '音乐协会', 'test')
  client.sqlite.prepare(
    'INSERT INTO competition_events (id, content_id, title, edition) VALUES (?, ?, ?, ?)'
  ).run(eventId, contentId, '新声歌手大赛', PINNED_EDITION)
  const insertRound = client.sqlite.prepare(
    'INSERT INTO competition_rounds (id, event_id, key, title, position, status) VALUES (?, ?, ?, ?, ?, ?)'
  )
  insertRound.run(prelimId, eventId, 'prelim', '初赛', 1, 'closed')
  insertRound.run(finalId, eventId, 'final', '决赛', 3, 'open')
  client.sqlite.prepare(
    'INSERT INTO competition_singers (id, event_id, name, song) VALUES (?, ?, ?, ?)'
  ).run(singerId, eventId, '张三', '晴天')
  client.sqlite.prepare(
    'INSERT INTO competition_judges (id, event_id, round_id, username, password_hash, display_name) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(judgeId, eventId, prelimId, 'judge-old', 'hash', '初赛评委1')
  client.sqlite.prepare(
    'INSERT INTO competition_judge_sessions (id, judge_id, token_hash, csrf_token_hash, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sessionId, judgeId, 'token-old', 'csrf-old', Date.now() + 3600_000, Date.now())
  client.sqlite.prepare(
    'INSERT INTO competition_round_entries (id, round_id, singer_id, sort_order, song) VALUES (?, ?, ?, ?, ?)'
  ).run(entryId, prelimId, singerId, 1, '晴天')
  client.sqlite.prepare(
    'INSERT INTO competition_scores (id, event_id, round_id, singer_id, judge_id, dimensions_json, total_score) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(scoreId, eventId, prelimId, singerId, judgeId, '[]', 42)

  runMigrations(client)

  const counts = {
    judges: Number((client.sqlite.prepare('SELECT count(*) AS n FROM competition_judges').get() as { n: number }).n),
    sessions: Number((client.sqlite.prepare('SELECT count(*) AS n FROM competition_judge_sessions').get() as { n: number }).n),
    entries: Number((client.sqlite.prepare('SELECT count(*) AS n FROM competition_round_entries').get() as { n: number }).n),
    scores: Number((client.sqlite.prepare('SELECT count(*) AS n FROM competition_scores').get() as { n: number }).n)
  }
  assert.deepEqual(counts, { judges: 1, sessions: 1, entries: 1, scores: 1 })
  assert.equal(
    (client.sqlite.prepare('SELECT total_score AS total FROM competition_scores WHERE id = ?').get(scoreId) as { total: number }).total,
    42
  )

  // CHECK 已扩到 final2。
  insertRound.run(randomUUID(), eventId, 'final2', '决赛·第二轮', 4, 'draft')
  assert.equal(
    (client.sqlite.prepare(`SELECT count(*) AS n FROM competition_rounds WHERE event_id = ? AND key = 'final2'`).get(eventId) as { n: number }).n,
    1
  )

  // 两首歌表可用，slot 只允许 1/2。
  const insertSong = client.sqlite.prepare(
    'INSERT INTO competition_final_songs (id, event_id, singer_id, slot, song, version) VALUES (?, ?, ?, ?, ?, ?)'
  )
  insertSong.run(randomUUID(), eventId, singerId, 1, '后来', 1)
  insertSong.run(randomUUID(), eventId, singerId, 2, '如愿', 1)
  assert.equal(
    (client.sqlite.prepare('SELECT count(*) AS n FROM competition_final_songs').get() as { n: number }).n,
    2
  )
  assert.throws(() => insertSong.run(randomUUID(), eventId, singerId, 3, '越界', 1))

  closeDatabase(path)
  rmSync(partialFolder, { recursive: true, force: true })
  rmSync(join(path, '..'), { recursive: true, force: true })
})

test('决赛两轮：两首歌提交、版本冲突、第一轮前六、第二轮排行、后六按第一轮', async () => {
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
  const event = setupEvent(client, contentId)

  const singers = Array.from({ length: 12 }, (_, index) => createSinger(client, event.id, {
    name: `选手${index + 1}`,
    song: `初赛曲${index + 1}`,
    className: '26音乐学1班',
    studentNo: `2026${String(index + 1).padStart(4, '0')}`,
    qq: `300000${String(index + 1).padStart(2, '0')}`
  }))

  // 初赛 12 人全进复赛，复赛 12 人全进决赛。
  let prelim = getRoundByKey(client, event.id, 'prelim')
  prelim = updateRound(client, prelim, { status: 'open', advanceCount: 12 })
  checkInRound(client, contentId, 'prelim')
  let judges = await createJudgeAccounts(client, prelim, 1)
  let judge = { ...judges[0]!, eventId: event.id, roundId: prelim.id }
  for (const singer of singers) submitJudgeScore(client, judge, singer.id, { scores: scoresForAll(10) })
  prelim = getRoundByKey(client, event.id, 'prelim')
  prelim = updateRound(client, prelim, { status: 'closed' })
  assert.equal(confirmAdvanceRoster(client, prelim).advanced, 12)

  let semi = getRoundByKey(client, event.id, 'semi')
  semi = updateRound(client, semi, { status: 'open', advanceCount: 12 })
  checkInRound(client, contentId, 'semi')
  judges = await createJudgeAccounts(client, semi, 1)
  judge = { ...judges[0]!, eventId: event.id, roundId: semi.id }
  for (const singer of singers) submitJudgeScore(client, judge, singer.id, { scores: scoresForAll(10) })
  semi = getRoundByKey(client, event.id, 'semi')
  semi = updateRound(client, semi, { status: 'closed' })
  assert.equal(confirmAdvanceRoster(client, semi).advanced, 12)

  // 决赛名单 12 人，两首歌提交页对每个人可写。
  assert.equal(listRoundEntryRows(client, getRoundByKey(client, event.id, 'final').id).length, 12)
  const before = getFinalSongEditor(client, contentId, {
    name: singers[0]!.name,
    studentNo: singers[0]!.studentNo ?? '',
    contact: singers[0]!.qq ?? ''
  })
  assert.equal(before.revision, 0)
  assert.equal(before.editable, true)

  for (const [index, singer] of singers.entries()) {
    const submitted = submitFinalSongsByThreeFactors(
      client,
      contentId,
      { name: singer.name, studentNo: singer.studentNo ?? '', contact: singer.qq ?? '', revision: 0 },
      { firstSong: `决赛一曲${index + 1}`, secondSong: `决赛二曲${index + 1}` }
    )
    assert.equal(submitted.revision, 1)
    assert.equal(submitted.firstSong, `决赛一曲${index + 1}`)
  }

  // 第一首歌同步进决赛名单，叫号台/评委端立刻可见；第二首先留在两首歌表里。
  const finalRows = listRoundEntryRows(client, getRoundByKey(client, event.id, 'final').id)
  for (const [index, singer] of singers.entries()) {
    assert.equal(finalRows.find(row => row.singerId === singer.id)?.song, `决赛一曲${index + 1}`)
  }
  assert.equal(client.db.select().from(competitionFinalSongs).all().length, 24)

  // 同一组歌重提、只换顺序都不算重复，可以正常保存（版本号继续递增）。
  const tweak = { name: singers[11]!.name, studentNo: singers[11]!.studentNo ?? '', contact: singers[11]!.qq ?? '' }
  const sameAgain = submitFinalSongsByThreeFactors(
    client,
    contentId,
    { ...tweak, revision: 1 },
    { firstSong: '决赛一曲12', secondSong: '决赛二曲12' }
  )
  assert.equal(sameAgain.revision, 2)
  const swapped = submitFinalSongsByThreeFactors(
    client,
    contentId,
    { ...tweak, revision: 2 },
    { firstSong: '决赛二曲12', secondSong: '决赛一曲12' }
  )
  assert.equal(swapped.revision, 3)
  assert.equal(swapped.firstSong, '决赛二曲12')
  const restored = submitFinalSongsByThreeFactors(
    client,
    contentId,
    { ...tweak, revision: 3 },
    { firstSong: '决赛一曲12', secondSong: '决赛二曲12' }
  )
  assert.equal(restored.revision, 4)

  // 旧的单曲填歌页不能再改决赛曲目，必须走两首歌接口。
  assert.throws(
    () => submitSongByThreeFactors(
      client,
      contentId,
      { name: singers[0]!.name, studentNo: singers[0]!.studentNo ?? '', contact: singers[0]!.qq ?? '' },
      '旧页面改歌'
    ),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_SONG_DEDICATED'
  )
  // 伴奏接口也不能顺手改决赛歌名。
  await assert.rejects(
    () => submitAccompanimentByThreeFactors(
      client,
      contentId,
      { name: singers[0]!.name, studentNo: singers[0]!.studentNo ?? '', contact: singers[0]!.qq ?? '' },
      { filename: '伴奏.mp3', data: new Uint8Array([1, 2, 3]) },
      '另一首'
    ),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_SONG_DEDICATED'
  )

  assert.equal(
    getFinalSongEditor(client, contentId, {
      name: singers[0]!.name,
      studentNo: singers[0]!.studentNo ?? '',
      contact: singers[0]!.qq ?? ''
    }).revision,
    1
  )

  // 两首相同被拒。
  assert.throws(
    () => submitFinalSongsByThreeFactors(
      client,
      contentId,
      { name: singers[0]!.name, studentNo: singers[0]!.studentNo ?? '', contact: singers[0]!.qq ?? '', revision: 1 },
      { firstSong: '同一首', secondSong: '同一首' }
    ),
    (error: unknown) => (error as { data?: { message?: string } }).data?.message === '两首决赛曲目不能是同一首'
  )

  // 旧 revision 提交被拒，不覆盖别人已经提交的版本。
  assert.throws(
    () => submitFinalSongsByThreeFactors(
      client,
      contentId,
      { name: singers[0]!.name, studentNo: singers[0]!.studentNo ?? '', contact: singers[0]!.qq ?? '', revision: 0 },
      { firstSong: '想覆盖别人', secondSong: '也想覆盖' }
    ),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_SONGS_CONFLICT'
  )
  const afterConflict = getFinalSongEditor(client, contentId, {
    name: singers[0]!.name,
    studentNo: singers[0]!.studentNo ?? '',
    contact: singers[0]!.qq ?? ''
  })
  assert.equal(afterConflict.firstSong, '决赛一曲1')

  // 决赛第一轮：12 人按 20..9 分排，前六进第二轮。
  let finalRound = getRoundByKey(client, event.id, 'final')
  finalRound = updateRound(client, finalRound, { status: 'open' })
  checkInRound(client, contentId, 'final')
  judges = await createJudgeAccounts(client, finalRound, 1)
  judge = { ...judges[0]!, eventId: event.id, roundId: finalRound.id }
  const firstRoundScores = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0.5, 0]
  for (const [index, singer] of singers.entries()) {
    submitJudgeScore(client, judge, singer.id, { scores: scoresForAll(firstRoundScores[index]!) })
  }
  finalRound = getRoundByKey(client, event.id, 'final')
  finalRound = updateRound(client, finalRound, { status: 'closed' })

  // 第一轮结束后两首歌锁定。
  assert.throws(
    () => submitFinalSongsByThreeFactors(
      client,
      contentId,
      { name: singers[0]!.name, studentNo: singers[0]!.studentNo ?? '', contact: singers[0]!.qq ?? '', revision: 1 },
      { firstSong: '锁后改歌', secondSong: '再改一首' }
    ),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_SONGS_LOCKED'
  )

  // 还没确认前六时保持原来的决赛单轮榜，旧赛事的历史决赛榜不受影响。
  const finalOnly = getRankBoard(client, contentId, 'final')
  assert.equal(finalOnly.rows.length, 12)
  assert.equal(finalOnly.rows[0]?.stage, undefined)

  assert.equal(confirmAdvanceRoster(client, finalRound).advanced, 6)
  let final2Round = getRoundByKey(client, event.id, 'final2')
  const final2Rows = listRoundEntryRows(client, final2Round.id)
  assert.equal(final2Rows.length, 6)
  // 晋级第二轮的人带的是自己提交的第二首歌。
  for (const [index, singer] of singers.slice(0, 6).entries()) {
    assert.equal(final2Rows.find(row => row.singerId === singer.id)?.song, `决赛二曲${index + 1}`)
  }

  // 第一轮名次：1..6 是 选手1..选手6。
  const mergedBeforeSecond = getRankBoard(client, contentId, 'final')
  assert.equal(mergedBeforeSecond.rows.length, 12)
  assert.deepEqual(
    mergedBeforeSecond.rows.slice(0, 6).map(row => row.name),
    singers.slice(0, 6).map(singer => singer.name)
  )
  assert.ok(mergedBeforeSecond.rows.slice(0, 6).every(row => row.stage === 'final2' && row.rank === null))
  assert.ok(mergedBeforeSecond.rows.slice(6).every(row => row.stage === 'final1' && row.rank !== null))

  // 第二轮：把第一轮前六的顺序完全倒过来。
  final2Round = updateRound(client, final2Round, { status: 'open' })
  checkInRound(client, contentId, 'final2')
  judges = await createJudgeAccounts(client, final2Round, 1)
  judge = { ...judges[0]!, eventId: event.id, roundId: final2Round.id }
  const secondRoundScores = [5, 6, 7, 8, 9, 10]
  for (const [index, singer] of singers.slice(0, 6).entries()) {
    submitJudgeScore(client, judge, singer.id, { scores: scoresForAll(secondRoundScores[index]!) })
  }
  final2Round = getRoundByKey(client, event.id, 'final2')
  updateRound(client, final2Round, { status: 'closed' })

  // 第二轮已评分后不能再改两首歌。
  assert.throws(
    () => submitFinalSongsByThreeFactors(
      client,
      contentId,
      { name: singers[0]!.name, studentNo: singers[0]!.studentNo ?? '', contact: singers[0]!.qq ?? '', revision: 1 },
      { firstSong: '赛后改歌', secondSong: '赛后改第二首' }
    ),
    (error: unknown) => codeOf(error) === 'COMPETITION_FINAL_SONGS_LOCKED'
  )

  const board = getRankBoard(client, contentId, 'final')
  assert.equal(board.round.key, 'final')
  assert.equal(board.round.title, '决赛')
  assert.equal(board.rows.length, 12)

  // 前六按第二轮倒序：选手6..选手1。
  const front = board.rows.slice(0, 6)
  assert.deepEqual(front.map(row => row.name), singers.slice(0, 6).map(singer => singer.name).reverse())
  assert.deepEqual(front.map(row => row.rank), [1, 2, 3, 4, 5, 6])
  assert.ok(front.every(row => row.stage === 'final2'))
  assert.deepEqual(front.map(row => row.averageSecond), [50, 45, 40, 35, 30, 25])
  assert.deepEqual(front.map(row => row.firstSong), ['决赛一曲6', '决赛一曲5', '决赛一曲4', '决赛一曲3', '决赛一曲2', '决赛一曲1'])
  assert.deepEqual(front.map(row => row.secondSong), ['决赛二曲6', '决赛二曲5', '决赛二曲4', '决赛二曲3', '决赛二曲2', '决赛二曲1'])

  // 后六按第一轮排：选手7..选手12，名次 7..12。
  const back = board.rows.slice(6)
  assert.deepEqual(back.map(row => row.name), singers.slice(6).map(singer => singer.name))
  assert.deepEqual(back.map(row => row.rank), [7, 8, 9, 10, 11, 12])
  assert.ok(back.every(row => row.stage === 'final1' && row.secondSong === null))
  assert.deepEqual(back.map(row => row.averageFirst), [20, 15, 10, 5, 2.5, 0])

  // 第二轮单项榜只列 6 人。
  const secondOnly = getRankBoard(client, contentId, 'final2')
  assert.equal(secondOnly.rows.length, 6)
  assert.equal(secondOnly.round.key, 'final2')

  closeDatabase(path)
  rmSync(join(path, '..'), { recursive: true, force: true })
})
