import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import * as XLSX from '@e965/xlsx'
import {
  calculateCompetitionTotal,
  competitionMaxTotal,
  DEFAULT_COMPETITION_DIMENSIONS
} from '../shared/utils/competition'
import {
  competitionEmailBodyToHtml,
  createJudgeAccounts,
  createSinger,
  ensureCompetitionEvent,
  findMusicAssociationContent,
  generateNextRound,
  getAdminCompetitionPayload,
  getEmailTemplate,
  getJudgePayload,
  getRoundByKey,
  importSingers,
  isMusicAssociationContent,
  parseSingerWorkbook,
  registerSingerFromForm,
  reorderRoundEntries,
  renderCompetitionEmailTemplate,
  submitJudgeScore,
  updateCompetitionEvent,
  updateEmailTemplate,
  updateRound
} from '../server/modules/competition/service'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { contents } from '../server/database/schema'

function scoresForAll(value: number): Record<string, number> {
  return Object.fromEntries(DEFAULT_COMPETITION_DIMENSIONS.map(dimension => [dimension.key, value]))
}

function roundView(payload: ReturnType<typeof getAdminCompetitionPayload>, key: 'prelim' | 'semi' | 'final') {
  return payload.rounds.find(round => round.key === key)!
}

test('等权五维时总分等于各维度累加，满分 100（每维 20）', () => {
  assert.equal(competitionMaxTotal(DEFAULT_COMPETITION_DIMENSIONS), 100)
  assert.equal(calculateCompetitionTotal(DEFAULT_COMPETITION_DIMENSIONS, scoresForAll(20)), 100)
  assert.equal(calculateCompetitionTotal(DEFAULT_COMPETITION_DIMENSIONS, {
    pitch: 9,
    rhythm: 8,
    emotion: 7,
    timbre: 6,
    stage: 5
  }), 35)
})

test('权重不等时按加权平均 × 维度数折算，仍保持满分 100', () => {
  const dimensions = [
    { key: 'a', label: 'A', weight: 2 },
    { key: 'b', label: 'B', weight: 1 },
    { key: 'c', label: 'C', weight: 1 },
    { key: 'd', label: 'D', weight: 1 },
    { key: 'e', label: 'E', weight: 1 }
  ]
  assert.equal(calculateCompetitionTotal(dimensions, { a: 20, b: 0, c: 0, d: 0, e: 0 }), 33.33)
  assert.equal(calculateCompetitionTotal(dimensions, { a: 20, b: 20, c: 20, d: 20, e: 20 }), 100)
})

test('结果邮件模板渲染：占位符替换、未识别保留、正文转 HTML', () => {
  const rendered = renderCompetitionEmailTemplate(
    '{{姓名}} 同学：初赛 {{平均分}} 分（第{{名次}}名，{{结果}}）',
    { 姓名: '张三', 平均分: '88.88', 名次: '3', 结果: '晋级' }
  )
  assert.equal(rendered, '张三 同学：初赛 88.88 分（第3名，晋级）')
  assert.equal(renderCompetitionEmailTemplate('你好 {{名字}}', { 姓名: '张三' }), '你好 {{名字}}')

  const html = competitionEmailBodyToHtml('第一行\n<b>注意</b>')
  assert.equal(html.includes('<br>'), true)
  assert.equal(html.includes('<b>'), false)
})

test('名单导入识别姓名/歌曲/班级表头并跳过空行', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['姓名', '歌曲', '班级'],
    ['张三', '晴天', '26音乐学1班'],
    ['', '', ''],
    ['李四', '后来', ''],
    ['王五', '如愿']
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, '名单')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  assert.deepEqual(parseSingerWorkbook(new Uint8Array(bytes)), [
    { name: '张三', song: '晴天', className: '26音乐学1班' },
    { name: '李四', song: '后来', className: null },
    { name: '王五', song: '如愿', className: null }
  ])
})

test('名单导入缺少姓名或歌曲时给出行号错误', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['姓名', '歌曲'],
    ['只有姓名', '']
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, '名单')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  assert.throws(
    () => parseSingerWorkbook(new Uint8Array(bytes)),
    (error: unknown) => (error as { data?: { message?: string } }).data?.message === '第 2 行缺少歌曲'
  )
})

test('数据库：三轮独立评委、初赛前 N 晋级、随机抽签、手动改序、弃权与决赛排行', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  const otherClubId = randomUUID()
  client.db.insert(contents).values([
    {
      id: musicId,
      kind: 'club',
      slug: 'music-association',
      title: '音乐协会',
      summary: 'test',
      status: 'published'
    },
    {
      id: otherClubId,
      kind: 'club',
      slug: 'dance-association',
      title: '舞蹈协会',
      summary: 'test',
      status: 'published'
    }
  ]).run()

  assert.equal(findMusicAssociationContent(client).id, musicId)
  assert.equal(isMusicAssociationContent(client, musicId), true)
  assert.equal(isMusicAssociationContent(client, otherClubId), false)

  const event = ensureCompetitionEvent(client, musicId)
  const rounds = getAdminCompetitionPayload(client, musicId).rounds
  assert.deepEqual(rounds.map(round => round.key), ['prelim', 'semi', 'final'])
  assert.equal(rounds[0]!.advanceCount, 30)
  assert.equal(rounds[1]!.advanceCount, null)
  assert.equal(rounds[2]!.advanceCount, null)

  // 再次 ensure 不会重复建轮次。
  ensureCompetitionEvent(client, musicId)
  assert.equal(getAdminCompetitionPayload(client, musicId).rounds.length, 3)

  const singerA = createSinger(client, event.id, { name: '张三', song: '晴天' })
  const singerB = createSinger(client, event.id, { name: '李四', song: '后来' })
  const singerC = createSinger(client, event.id, { name: '王五', song: '如愿' })

  const imported = importSingers(client, event.id, [
    { name: '张三', song: '晴天', className: null },
    { name: '赵六', song: '小幸运', className: '26音乐学1班' }
  ])
  assert.deepEqual(imported, { imported: 1, skipped: 1 })

  // 现场扫码登记：进选手库 + 初赛名单，按学号去重，歌曲可待定。
  const registered = registerSingerFromForm(client, musicId, {
    className: '26工商管理1班',
    name: '陈七',
    studentNo: '20260099',
    phone: '13800001234',
    email: 'chen7@example.com',
    song: ''
  })
  assert.ok(registered.sortOrder > 0)
  assert.throws(
    () => registerSingerFromForm(client, musicId, {
      className: '26工商管理1班',
      name: '陈七二',
      studentNo: '20260099',
      phone: '13800001235',
      email: 'chen72@example.com'
    }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'SINGER_ALREADY_REGISTERED'
  )
  const payloadAfterRegister = getAdminCompetitionPayload(client, musicId)
  const registeredSinger = payloadAfterRegister.singers.find(singer => singer.studentNo === '20260099')!
  assert.equal(registeredSinger.source, 'form')
  assert.equal(registeredSinger.song, '')
  assert.equal(registeredSinger.email, 'chen7@example.com')
  assert.equal(payloadAfterRegister.rounds[0]!.entries.some(entry => entry.singer.id === registeredSinger.id), true)

  // 邮件模板：默认模板可直接用，更新后生效。
  assert.equal(getEmailTemplate(client, event.id, 'prelim').body.includes('{{姓名}}'), true)
  const updatedTemplate = updateEmailTemplate(client, event.id, 'prelim', {
    subject: '初赛结果',
    body: '{{姓名}} 你好，成绩 {{平均分}}'
  })
  assert.equal(updatedTemplate.body, '{{姓名}} 你好，成绩 {{平均分}}')

  let prelim = getRoundByKey(client, event.id, 'prelim')
  updateRound(client, prelim, { status: 'open', advanceCount: 2 })

  const prelimJudges = await createJudgeAccounts(client, prelim, 2)
  assert.equal(prelimJudges.length, 2)
  assert.match(prelimJudges[0]!.username, /^judge\d+$/)
  assert.equal(prelimJudges[0]!.displayName.startsWith('初赛评委'), true)

  const prelimJudgeOne = { ...prelimJudges[0]!, eventId: event.id, roundId: prelim.id }
  const prelimJudgeTwo = { ...prelimJudges[1]!, eventId: event.id, roundId: prelim.id }

  submitJudgeScore(client, prelimJudgeOne, singerA.id, { scores: scoresForAll(10), comment: '很好' })
  submitJudgeScore(client, prelimJudgeTwo, singerA.id, { scores: scoresForAll(10) })
  submitJudgeScore(client, prelimJudgeOne, singerB.id, { scores: scoresForAll(9) })
  submitJudgeScore(client, prelimJudgeTwo, singerB.id, { scores: scoresForAll(9) })
  // 王五不评分 → 初赛弃权

  // 已有评分后锁定维度/占比，避免不同快照的总分不可比。
  assert.throws(
    () => updateCompetitionEvent(client, event, {
      title: event.title,
      dimensions: DEFAULT_COMPETITION_DIMENSIONS.map(dimension =>
        dimension.key === 'pitch' ? { ...dimension, weight: 30 } : dimension)
    }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'COMPETITION_HAS_SCORES'
  )

  prelim = getRoundByKey(client, event.id, 'prelim')
  updateRound(client, prelim, { status: 'closed' })

  let payload = getAdminCompetitionPayload(client, musicId)
  const prelimView = roundView(payload, 'prelim')
  assert.equal(prelimView.entries.length, 5)
  assert.equal(prelimView.entries[0]!.singer.id, singerA.id)
  assert.equal(prelimView.entries[0]!.average, 50)
  assert.equal(prelimView.entries[0]!.qualified, true)
  assert.equal(prelimView.entries[0]!.forfeited, false)
  assert.equal(prelimView.entries[1]!.singer.id, singerB.id)
  assert.equal(prelimView.entries[1]!.average, 45)
  assert.equal(prelimView.entries[1]!.qualified, true)
  const forfeited = prelimView.entries.find(entry => entry.singer.id === singerC.id)!
  assert.equal(forfeited.average, null)
  assert.equal(forfeited.forfeited, true)
  assert.equal(forfeited.rank, null)

  // 初赛结束后不能再改分。
  assert.throws(
    () => submitJudgeScore(client, prelimJudgeOne, singerC.id, { scores: scoresForAll(7) }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'COMPETITION_SCORING_CLOSED'
  )

  // 生成复赛：取前 2 名，随机抽签。
  const advanced = generateNextRound(client, getRoundByKey(client, event.id, 'prelim'))
  assert.equal(advanced.advanced, 2)
  payload = getAdminCompetitionPayload(client, musicId)
  const semiInitial = roundView(payload, 'semi')
  assert.equal(semiInitial.entries.length, 2)
  assert.deepEqual(new Set(semiInitial.entries.map(entry => entry.singer.id)), new Set([singerA.id, singerB.id]))
  assert.ok(semiInitial.entries.every(entry => entry.advancedFromRank !== null))

  // 手动调整出场顺序。
  const reversedIds = [...semiInitial.entries]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .reverse()
    .map(entry => entry.id)
  let semi = getRoundByKey(client, event.id, 'semi')
  reorderRoundEntries(client, semi, reversedIds)
  payload = getAdminCompetitionPayload(client, musicId)
  assert.deepEqual(
    roundView(payload, 'semi').entries
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(entry => entry.id),
    reversedIds
  )

  // 复赛取第 1 名进决赛。
  semi = getRoundByKey(client, event.id, 'semi')
  updateRound(client, semi, { status: 'open', advanceCount: 1 })
  const semiJudges = await createJudgeAccounts(client, semi, 1)
  // 用户名全局唯一（judge1 已被初赛占用），但展示名仍按本轮从 1 开始。
  assert.equal(semiJudges[0]!.displayName, '复赛评委1')
  const semiJudge = { ...semiJudges[0]!, eventId: event.id, roundId: semi.id }
  submitJudgeScore(client, semiJudge, singerA.id, { scores: scoresForAll(8) })
  submitJudgeScore(client, semiJudge, singerB.id, { scores: scoresForAll(9.5) })
  semi = getRoundByKey(client, event.id, 'semi')
  updateRound(client, semi, { status: 'closed' })

  payload = getAdminCompetitionPayload(client, musicId)
  const semiView = roundView(payload, 'semi')
  assert.equal(semiView.entries[0]!.singer.id, singerB.id)
  assert.equal(semiView.entries[0]!.qualified, true)
  assert.equal(semiView.entries[1]!.singer.id, singerA.id)
  assert.equal(semiView.entries[1]!.qualified, false)

  const finalAdvanced = generateNextRound(client, getRoundByKey(client, event.id, 'semi'))
  assert.equal(finalAdvanced.advanced, 1)
  payload = getAdminCompetitionPayload(client, musicId)
  const finalView = roundView(payload, 'final')
  assert.equal(finalView.entries.length, 1)
  assert.equal(finalView.entries[0]!.singer.id, singerB.id)

  // 下一轮名单已生成后，不能重新打开上一轮。
  assert.throws(
    () => updateRound(client, getRoundByKey(client, event.id, 'semi'), { status: 'open' }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'ROUND_DOWNSTREAM_LOCKED'
  )

  // 决赛评分并结束。
  let finalRound = getRoundByKey(client, event.id, 'final')
  updateRound(client, finalRound, { status: 'open' })
  const finalJudges = await createJudgeAccounts(client, finalRound, 1)
  const finalJudge = { ...finalJudges[0]!, eventId: event.id, roundId: finalRound.id }
  submitJudgeScore(client, finalJudge, singerB.id, { scores: scoresForAll(9.8) })
  finalRound = getRoundByKey(client, event.id, 'final')
  updateRound(client, finalRound, { status: 'closed' })

  payload = getAdminCompetitionPayload(client, musicId)
  const finalResult = roundView(payload, 'final')
  assert.equal(finalResult.entries.length, 1)
  assert.equal(finalResult.entries[0]!.average, 49)
  assert.equal(finalResult.entries[0]!.rank, 1)
  assert.equal(finalResult.entries[0]!.qualified, false)

  // 初赛评委也能在决赛结束后看到决赛总结果；评委端不暴露联系方式。
  const prelimJudgePayload = getJudgePayload(client, prelimJudgeOne)
  assert.equal(prelimJudgePayload.round.key, 'prelim')
  assert.equal(prelimJudgePayload.roundResults?.length, 5)
  assert.equal(prelimJudgePayload.finalResults?.length, 1)
  assert.equal(prelimJudgePayload.finalResults?.[0]?.singer.id, singerB.id)
  assert.equal('email' in prelimJudgePayload.singers[0]!, false)
  assert.equal('phone' in prelimJudgePayload.singers[0]!, false)

  // 已结束的轮次不能手动改序。
  assert.throws(
    () => reorderRoundEntries(client, getRoundByKey(client, event.id, 'final'), [finalResult.entries[0]!.id]),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'ROUND_CLOSED'
  )

  // 登记开关关闭后拒绝现场登记。
  updateCompetitionEvent(client, event, {
    title: event.title,
    registrationOpen: false,
    dimensions: DEFAULT_COMPETITION_DIMENSIONS
  })
  assert.throws(
    () => registerSingerFromForm(client, musicId, {
      className: '26工商管理2班',
      name: '周八',
      studentNo: '20260088',
      phone: '13800004321',
      email: 'zhou8@example.com'
    }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'COMPETITION_REGISTRATION_CLOSED'
  )

  closeDatabase(':memory:')
})
