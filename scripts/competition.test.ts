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
  createEmailImage,
  createJudgeAccount,
  createJudgeAccounts,
  deleteEmailImage,
  createSinger,
  ensureCompetitionEvent,
  findMusicAssociationContent,
  generateNextRound,
  getAdminCompetitionPayload,
  getCallBoard,
  getEmailTemplate,
  getJudgePayload,
  getRoundByKey,
  getSingerQueuePosition,
  getCurrentSinger,
  importSingers,
  emailImageAttachments,
  isMusicAssociationContent,
  listEmailImages,
  loadEmailImagesForBody,
  lookupPreRegistrations,
  getRegistrationState,
  listPreRegistrations,
  moveCurrentEntry,
  moveRoundEntry,
  parseSingerWorkbook,
  preRegisterFromForm,
  prelimDayDates,
  resolvePrelimDay,
  registerSingerFromForm,
  reorderRoundEntries,
  renderCompetitionEmailTemplate,
  setEntryDay,
  setEntryCheckIn,
  setRoundDay,
  submitJudgeScore,
  updateCompetitionEvent,
  updateEmailTemplate,
  updateJudge,
  updateRound
} from '../server/modules/competition/service'
import { closeDatabase, getDatabase } from '../server/database/client'
import { verifyPassword } from '../server/utils/password'
import { runMigrations } from '../server/database/migrate'
import { competitionJudges, contents } from '../server/database/schema'

function scoresForAll(value: number): Record<string, number> {
  return Object.fromEntries(DEFAULT_COMPETITION_DIMENSIONS.map(dimension => [dimension.key, value]))
}

function roundView(payload: ReturnType<typeof getAdminCompetitionPayload>, key: 'prelim' | 'semi' | 'final') {
  return payload.rounds.find(round => round.key === key)!
}

/** 测试里用选手库造人，默认没签到；评委看得到、能排队，就得先签到。 */
function checkInEntries(
  client: ReturnType<typeof getDatabase>,
  contentId: string,
  key?: 'prelim' | 'semi' | 'final'
): void {
  const payload = getAdminCompetitionPayload(client, contentId)
  const eventId = payload.event.id
  const keys: ('prelim' | 'semi' | 'final')[] = key ? [key] : ['prelim', 'semi', 'final']
  for (const roundKey of keys) {
    const round = getRoundByKey(client, eventId, roundKey)
    if (round.status === 'closed') continue
    for (const entry of roundView(payload, roundKey).entries) setEntryCheckIn(client, round, entry.id, true)
  }
}

test('等权五维时总分等于各维度累加，满分 100（每维 20）', () => {
  assert.equal(competitionMaxTotal(DEFAULT_COMPETITION_DIMENSIONS), 50)
  assert.equal(calculateCompetitionTotal(DEFAULT_COMPETITION_DIMENSIONS, scoresForAll(10)), 50)
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
  assert.equal(calculateCompetitionTotal(dimensions, { a: 10, b: 0, c: 0, d: 0, e: 0 }), 16.67)
  assert.equal(calculateCompetitionTotal(dimensions, { a: 10, b: 10, c: 10, d: 10, e: 10 }), 50)
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

  // 现场扫码登记：进选手库 + 初赛名单，按学号去重；歌曲必填且不能写「待定」。
  setRoundDay(client, getRoundByKey(client, event.id, 'prelim'), 1)
  const registered = registerSingerFromForm(client, musicId, {
    className: '26工商管理1班',
    name: '陈七',
    studentNo: '20260099',
    phone: '13800001234',
    email: 'chen7@example.com',
    song: '晴天'
  })
  assert.ok(registered.sortOrder > 0)
  assert.throws(
    () => registerSingerFromForm(client, musicId, {
      className: '26工商管理1班',
      name: '陈七空',
      studentNo: '20260098',
      phone: '13800001236',
      email: 'chen7k@example.com',
      song: '   '
    }),
    (error: unknown) => (error as { data?: { field?: string } }).data?.field === 'song'
  )
  assert.throws(
    () => registerSingerFromForm(client, musicId, {
      className: '26工商管理1班',
      name: '陈七待',
      studentNo: '20260097',
      phone: '13800001237',
      email: 'chen7d@example.com',
      song: '待定'
    }),
    (error: unknown) => (error as { data?: { field?: string } }).data?.field === 'song'
  )
  assert.throws(
    () => registerSingerFromForm(client, musicId, {
      className: '26工商管理1班',
      name: '陈七二',
      studentNo: '20260099',
      phone: '13800001235',
      email: 'chen72@example.com',
      song: '后来'
    }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'SINGER_ALREADY_REGISTERED'
  )
  const payloadAfterRegister = getAdminCompetitionPayload(client, musicId)
  const registeredSinger = payloadAfterRegister.singers.find(singer => singer.studentNo === '20260099')!
  assert.equal(registeredSinger.source, 'form')
  assert.equal(registeredSinger.song, '晴天')
  assert.equal(registeredSinger.email, 'chen7@example.com')
  assert.equal(payloadAfterRegister.rounds[0]!.entries.some(entry => entry.singer.id === registeredSinger.id), true)

  // 赛前预报名 → 现场按姓名检索 → 确认后一键带出并标记来源 pre。
  preRegisterFromForm(client, musicId, {
    name: '孙九',
    className: '26汉语言文学2班',
    studentNo: '20260077',
    phone: '13800000777',
    email: 'sun9@example.com',
    song: '起风了',
    preferredDay: 1
  })
  assert.throws(
    () => preRegisterFromForm(client, musicId, {
      name: '孙九二',
      className: '26汉语言文学2班',
      studentNo: '20260077',
      phone: '13800000778',
      email: 'sun92@example.com',
      song: '后来',
      preferredDay: 1
    }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'ALREADY_PRE_REGISTERED'
  )
  // 双因子检索：姓名 + 学号后四位；返回值只带掩码学号，不带手机/邮箱/完整学号。
  const candidates = lookupPreRegistrations(client, musicId, '孙九', '0077')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]!.name, '孙九')
  assert.equal(candidates[0]!.studentNoMasked, '****0077')
  assert.equal(candidates[0]!.hasContact, true)
  assert.equal('email' in candidates[0]!, false)
  assert.equal('phone' in candidates[0]!, false)
  // 后四位不对、或只给姓名（后四位为空）都查不到人。
  assert.equal(lookupPreRegistrations(client, musicId, '孙九', '0078').length, 0)
  assert.equal(lookupPreRegistrations(client, musicId, '孙九', '').length, 0)

  setRoundDay(client, getRoundByKey(client, event.id, 'prelim'), 1)
  const preRegistered = registerSingerFromForm(client, musicId, {
    className: '26汉语言文学2班',
    name: '孙九',
    studentNo: '20260077',
    phone: '13800000777',
    email: 'sun9@example.com',
    song: '起风了',
    preRegistrationId: candidates[0]!.id
  })
  const preSinger = getAdminCompetitionPayload(client, musicId).singers
    .find(singer => singer.id === preRegistered.id)!
  assert.equal(preSinger.source, 'pre')
  assert.equal(preSinger.preRegistrationId, candidates[0]!.id)
  // 已使用的预报名不再出现在检索结果；再登记同预报名会被拒绝。
  assert.equal(lookupPreRegistrations(client, musicId, '孙九', '0077').length, 0)
  assert.throws(
    () => registerSingerFromForm(client, musicId, {
      className: 'x',
      name: '孙九',
      studentNo: '20260078',
      phone: '13800000778',
      email: 'sun92@example.com',
      song: '后来',
      preRegistrationId: candidates[0]!.id
    }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'PRE_REGISTRATION_ALREADY_USED'
  )

  // 邮件模板：默认模板可直接用，更新后生效。
  assert.equal(getEmailTemplate(client, event.id, 'prelim').body.includes('{{姓名}}'), true)
  const updatedTemplate = updateEmailTemplate(client, event.id, 'prelim', {
    subject: '初赛结果',
    body: '{{姓名}} 你好，成绩 {{平均分}}'
  })
  assert.equal(updatedTemplate.body, '{{姓名}} 你好，成绩 {{平均分}}')

  checkInEntries(client, musicId)
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
  assert.equal(prelimView.entries.length, 6)
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
  checkInEntries(client, musicId)
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
  submitJudgeScore(client, semiJudge, singerB.id, { scores: scoresForAll(9) })
  semi = getRoundByKey(client, event.id, 'semi')
  updateRound(client, semi, { status: 'closed' })

  payload = getAdminCompetitionPayload(client, musicId)
  const semiView = roundView(payload, 'semi')
  assert.equal(semiView.entries[0]!.singer.id, singerB.id)
  assert.equal(semiView.entries[0]!.qualified, true)
  assert.equal(semiView.entries[1]!.singer.id, singerA.id)
  assert.equal(semiView.entries[1]!.qualified, false)

  const finalAdvanced = generateNextRound(client, getRoundByKey(client, event.id, 'semi'))
  checkInEntries(client, musicId)
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
  submitJudgeScore(client, finalJudge, singerB.id, { scores: scoresForAll(9) })
  finalRound = getRoundByKey(client, event.id, 'final')
  updateRound(client, finalRound, { status: 'closed' })

  payload = getAdminCompetitionPayload(client, musicId)
  const finalResult = roundView(payload, 'final')
  assert.equal(finalResult.entries.length, 1)
  assert.equal(finalResult.entries[0]!.average, 45)
  assert.equal(finalResult.entries[0]!.rank, 1)
  assert.equal(finalResult.entries[0]!.qualified, false)

  // 初赛评委也能在决赛结束后看到决赛总结果；评委端不暴露联系方式。
  const prelimJudgePayload = getJudgePayload(client, prelimJudgeOne)
  assert.equal(prelimJudgePayload.round.key, 'prelim')
  assert.equal(prelimJudgePayload.roundResults?.length, 6)
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

test('数据库：顺序评分只认当前选手，启用中评委全员提交才自动切下一位', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  createSinger(client, event.id, { name: '张三', song: '晴天' })
  createSinger(client, event.id, { name: '李四', song: '后来' })
  createSinger(client, event.id, { name: '王五', song: '如愿' })
  checkInEntries(client, musicId)

  const reload = () => getRoundByKey(client, event.id, 'prelim')
  updateRound(client, reload(), { status: 'open' })
  const judges = await createJudgeAccounts(client, reload(), 3)
  const actors = judges.map(judge => ({ ...judge, eventId: event.id, roundId: reload().id }))

  const view = roundView(getAdminCompetitionPayload(client, musicId), 'prelim')
  const entries = view.entries
  assert.equal(entries.length, 3)
  // 未开启顺序评分时保持自由打分。
  assert.equal(view.current, null)

  const codeOf = (code: string) => (error: unknown) => (error as { data?: { code?: string } }).data?.code === code

  const started = moveCurrentEntry(client, reload(), 'start')
  assert.equal(started?.singer.id, entries[0]!.singer.id)
  assert.equal(started?.index, 1)
  assert.equal(started?.total, 3)
  assert.equal(started?.judgeTotal, 3)
  assert.equal(started?.submitted.length, 0)
  assert.equal(started?.pending.length, 3)
  assert.equal(started?.allSubmitted, false)
  // 评委进度表：逐评委一行，顺序与评委账号一致，初始全部未提交。
  assert.deepEqual(started?.judges.map(item => item.name), judges.map(judge => judge.displayName))
  assert.ok(started?.judges.every(item => item.submitted === false))

  // 不是当前这位的选手，评分直接被拒。
  assert.throws(
    () => submitJudgeScore(client, actors[0]!, entries[1]!.singer.id, { scores: scoresForAll(9) }),
    codeOf('COMPETITION_NOT_CURRENT_SINGER')
  )

  submitJudgeScore(client, actors[0]!, entries[0]!.singer.id, { scores: scoresForAll(9), comment: '第一个' })
  let current = getCurrentSinger(client, reload())
  assert.equal(current?.submitted.length, 1)
  assert.equal(current?.allSubmitted, false)
  // 进度表里只有第一位变成已提交，其余仍是未提交。
  assert.deepEqual(current?.judges.map(item => item.submitted), [true, false, false])

  // 还差两位时不能手动切下一位。
  assert.throws(() => moveCurrentEntry(client, reload(), 'next'), codeOf('COMPETITION_PENDING_JUDGES'))

  submitJudgeScore(client, actors[1]!, entries[0]!.singer.id, { scores: scoresForAll(9) })
  assert.equal(getCurrentSinger(client, reload())?.allSubmitted, false)
  submitJudgeScore(client, actors[2]!, entries[0]!.singer.id, { scores: scoresForAll(9) })

  // 第三位提交后自动切到下一位，不需要手动点。
  current = getCurrentSinger(client, reload())
  assert.equal(current?.singer.id, entries[1]!.singer.id)
  assert.equal(current?.index, 2)
  assert.equal(current?.submitted.length, 0)

  // 上一位可以回看，回退后再提交不会推进。
  assert.equal(moveCurrentEntry(client, reload(), 'prev')?.singer.id, entries[0]!.singer.id)
  submitJudgeScore(client, actors[0]!, entries[0]!.singer.id, { scores: scoresForAll(8.5) })
  assert.equal(getCurrentSinger(client, reload())?.singer.id, entries[0]!.singer.id)

  // 跳过此人 → 强制下一位，缺人也不拦。
  assert.equal(moveCurrentEntry(client, reload(), 'skip')?.singer.id, entries[1]!.singer.id)

  // 「跳过」后的最后一位也缺人：next 仍然抛，skip 直接结束。
  moveCurrentEntry(client, reload(), 'skip')
  moveCurrentEntry(client, reload(), 'skip')
  assert.equal(getCurrentSinger(client, reload()), null)

  // 退出顺序评分后回到自由打分。
  moveCurrentEntry(client, reload(), 'start')
  assert.ok(getCurrentSinger(client, reload()))
  assert.equal(moveCurrentEntry(client, reload(), 'stop'), null)
  assert.equal(getCurrentSinger(client, reload()), null)
  submitJudgeScore(client, actors[0]!, entries[2]!.singer.id, { scores: scoresForAll(7) })

  // 评委端看到的是同一位当前选手，提交进度也同步。
  moveCurrentEntry(client, reload(), 'start')
  const judgePayload = getJudgePayload(client, { ...actors[0]!, roundId: reload().id })
  assert.equal(judgePayload.current?.singer.id, entries[0]!.singer.id)
  assert.equal(judgePayload.current?.judgeTotal, 3)
  assert.equal(judgePayload.current?.submitted.includes(judges[0]!.displayName), true)

  // 关闭本轮评分时指针自动清空，重开不会卡在旧位置。
  updateRound(client, reload(), { status: 'closed' })
  assert.equal(getCurrentSinger(client, reload()), null)
  closeDatabase(':memory:')
})

test('数据库：邮件插图上传、正文标记转内嵌 cid、附件按引用去重、删除后失效', () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()
  const event = ensureCompetitionEvent(client, musicId)

  // 1×1 PNG，够验证 base64 往返与字节数。
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const image = createEmailImage(client, event.id, { filename: '海报.png', mime: 'image/png', data: png })
  assert.equal(image.mime, 'image/png')
  assert.equal(image.byteSize, Buffer.from(png, 'base64').byteLength)
  assert.equal(image.url, `/media/competition/${image.id}.png`)
  assert.equal(listEmailImages(client, event.id).length, 1)

  const body = `恭喜晋级！\n[[图片:${image.id}]]\n[[图片:${image.id}]]\n证书见下一封`
  const loaded = loadEmailImagesForBody(client, event.id, body)
  assert.equal(loaded.length, 1)
  const html = competitionEmailBodyToHtml(body, loaded)
  assert.equal(html.includes(`src="cid:email-image-${image.id}"`), true)

  // 同一张图引用两次只挂一个附件，避免邮件体积翻倍。
  const attachments = emailImageAttachments(body, loaded)
  assert.equal(attachments.length, 1)
  assert.equal(attachments[0]?.cid, `email-image-${image.id}`)
  assert.equal(Buffer.from(attachments[0]!.data, 'base64').equals(Buffer.from(png, 'base64')), true)
  assert.equal(emailImageAttachments('<p>纯文字</p>', loaded).length, 0)

  // 只收位图；空内容与非图片类型直接拒。
  const messageOf = (fn: () => unknown): string => {
    try {
      fn()
    } catch (error) {
      const data = (error as { data?: { message?: string } }).data
      return String(data?.message || (error as Error).message)
    }
    return ''
  }
  assert.match(messageOf(() => createEmailImage(client, event.id, { mime: 'image/svg+xml', data: png })), /JPG \/ PNG/)
  assert.match(messageOf(() => createEmailImage(client, event.id, { mime: 'image/png', data: '' })), /为空/)

  // 删除后列表与正文取图同时失效。
  assert.equal(deleteEmailImage(client, event.id, image.id), true)
  assert.equal(deleteEmailImage(client, event.id, image.id), false)
  assert.equal(listEmailImages(client, event.id).length, 0)
  assert.equal(loadEmailImagesForBody(client, event.id, body).length, 0)
  closeDatabase(':memory:')
})

test('数据库：没签到的人不进评委名单，签到才进，取消签到后移出并清空当前选手', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  createSinger(client, event.id, { name: '张三', song: '晴天' })
  createSinger(client, event.id, { name: '李四', song: '后来' })

  const reload = () => getRoundByKey(client, event.id, 'prelim')
  updateRound(client, reload(), { status: 'open' })
  const judges = await createJudgeAccounts(client, reload(), 2)
  const actor = { ...judges[0]!, eventId: event.id, roundId: reload().id }

  const entries = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  const [first, second] = [entries[0]!, entries[1]!]

  // 两个人都还没到场：评委端一个都看不到。
  assert.equal(getJudgePayload(client, actor).singers.length, 0)
  assert.throws(
    () => submitJudgeScore(client, actor, first.singer.id, { scores: scoresForAll(10) }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'COMPETITION_NOT_CHECKED_IN'
  )

  // 签到一个，名单里出现一个。
  setEntryCheckIn(client, reload(), first.id, true)
  assert.deepEqual(getJudgePayload(client, actor).singers.map(item => item.name), ['张三'])

  // 顺序评分停在他身上，取消签到后名单清空、当前指针也清掉。
  moveCurrentEntry(client, reload(), 'start')
  assert.equal(getCurrentSinger(client, reload())?.singer.id, first.singer.id)
  setEntryCheckIn(client, reload(), first.id, false)
  assert.equal(getCurrentSinger(client, reload()), null)
  assert.equal(getJudgePayload(client, actor).singers.length, 0)

  // 两个人签到后恢复正常，签到时间落在条目上。
  setEntryCheckIn(client, reload(), first.id, true)
  setEntryCheckIn(client, reload(), second.id, true)
  const payload = getJudgePayload(client, actor)
  assert.deepEqual(payload.singers.map(item => item.name), ['张三', '李四'])
  assert.equal(roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
    .every(entry => typeof entry.checkedInAt === 'number'), true)

  closeDatabase(':memory:')
})

test('数据库：顺序评分按「本场到岗人数」收票，账号多于当天人数也能切人', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  createSinger(client, event.id, { name: '张三', song: '晴天' })
  createSinger(client, event.id, { name: '李四', song: '后来' })
  checkInEntries(client, musicId)

  const reload = () => getRoundByKey(client, event.id, 'prelim')
  updateRound(client, reload(), { status: 'open' })
  // 9 个账号、当天只有 6 人到岗：初赛两天共用 prelim 轮的真实情形。
  const judges = await createJudgeAccounts(client, reload(), 9)
  const actors = judges.map(judge => ({ ...judge, eventId: event.id, roundId: reload().id }))
  updateRound(client, reload(), { judgeCount: 6 })

  const entries = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  const started = moveCurrentEntry(client, reload(), 'start')
  assert.equal(started?.judgeTotal, 6)
  assert.equal(started?.allSubmitted, false)
  // 进度表仍然列出 9 个账号，只是收票门槛是 6。
  assert.equal(started?.judges.length, 9)
  // 还差几位就列几位，不把另外 3 个不值班的也算成缺人。
  assert.equal(started?.pending.length, 6)

  for (let index = 0; index < 6; index += 1) {
    submitJudgeScore(client, actors[index]!, entries[0]!.singer.id, { scores: scoresForAll(8 + index * 0.1) })
  }
  // 第 6 票提交后自动切人，第 7–9 位不需要提交。
  assert.equal(getCurrentSinger(client, reload())?.singer.id, entries[1]!.singer.id)

  // 门槛改成 9（全员到岗）时，再回到自由/严格模式仍按新值生效。
  updateRound(client, reload(), { judgeCount: 9 })
  moveCurrentEntry(client, reload(), 'start')
  assert.equal(getCurrentSinger(client, reload())?.judgeTotal, 9)
  closeDatabase(':memory:')
})

test('数据库：初赛分天——两天各有自己的顺序与到岗评委，排名仍整轮结束才出', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  for (const [name, song] of [['张三', '晴天'], ['李四', '后来'], ['王五', '如愿'], ['赵六', '起风了']] as const) {
    createSinger(client, event.id, { name, song })
    checkInEntries(client, musicId)
  }

  const reload = () => getRoundByKey(client, event.id, 'prelim')
  updateRound(client, reload(), { status: 'open' })
  const judges = await createJudgeAccounts(client, reload(), 9)

  // 3 位两天都在（day = null），3 位只第一天，3 位只第二天。
  for (const [index, judge] of judges.entries()) {
    const day = index < 3 ? null : index < 6 ? 1 : 2
    await updateJudge(client, reload().id, judge.id, { day })
  }

  const view = roundView(getAdminCompetitionPayload(client, musicId), 'prelim')
  const entries = view.entries
  setEntryDay(client, reload(), entries[0]!.id, 1)
  setEntryDay(client, reload(), entries[1]!.id, 1)
  setEntryDay(client, reload(), entries[2]!.id, 2)
  setEntryDay(client, reload(), entries[3]!.id, 2)

  // 第一天：名单只有 2 位，收票 6 位（3 位两天都在 + 3 位第一天的）。
  setRoundDay(client, reload(), 1)
  const day1 = moveCurrentEntry(client, reload(), 'start')
  assert.equal(day1?.day, 1)
  assert.equal(day1?.total, 2)
  assert.equal(day1?.index, 1)
  assert.equal(day1?.judgeTotal, 6)
  assert.equal(day1?.judges.length, 6)
  assert.equal(day1?.singer.id, entries[0]!.singer.id)

  // 不是当天的人不给评；第一天的 6 票齐了自动切到第一天第二位。
  const actors = judges.map(judge => ({ ...judge, eventId: event.id, roundId: reload().id }))
  // 第二天的人（index 6-8）替第一天顶票必须被拒。
  assert.throws(
    () => submitJudgeScore(client, actors[6]!, entries[0]!.singer.id, { scores: scoresForAll(9) }),
    (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'COMPETITION_JUDGE_OFF_DAY'
  )
  // 5 位当天评委投完还不切人（第二天那票不计入）。
  for (let index = 0; index < 5; index += 1) {
    submitJudgeScore(client, actors[index]!, entries[0]!.singer.id, { scores: scoresForAll(9) })
  }
  assert.equal(getCurrentSinger(client, reload())?.singer.id, entries[0]!.singer.id)
  assert.equal(getCurrentSinger(client, reload())?.submitted.length, 5)
  // 第 6 位当天评委投完才自动切到第一位之后。
  submitJudgeScore(client, actors[5]!, entries[0]!.singer.id, { scores: scoresForAll(9) })
  assert.equal(getCurrentSinger(client, reload())?.singer.id, entries[1]!.singer.id)
  assert.equal(getCurrentSinger(client, reload())?.index, 2)

  // 切到第二天：指针清空，从第二天第一位重新开始，收票还是 6 位。
  setRoundDay(client, reload(), 2)
  assert.equal(getCurrentSinger(client, reload()), null)
  const day2 = moveCurrentEntry(client, reload(), 'start')
  assert.equal(day2?.day, 2)
  assert.equal(day2?.total, 2)
  assert.equal(day2?.index, 1)
  assert.equal(day2?.judgeTotal, 6)
  assert.equal(day2?.singer.id, entries[2]!.singer.id)
  // 第一天那位的分数在第二天不算数，进度表 6 行全未提交。
  assert.equal(day2?.submitted.length, 0)
  assert.ok(day2?.judges.every(item => item.submitted === false))

  // 整轮还开着：名次一律不给，只有平均分。
  const openView = roundView(getAdminCompetitionPayload(client, musicId), 'prelim')
  // 进行中就实时给名次，但还没结束谁都不算晋级。
  assert.equal(openView.entries.filter(item => item.rank !== null).length, 1)
  assert.equal(openView.entries.find(item => item.rank !== null)?.rank, 1)
  assert.ok(openView.entries.every(item => item.qualified === false))

  // 结束后才出排名与晋级标记。
  updateRound(client, reload(), { status: 'closed', advanceCount: 2 })
  const closedView = roundView(getAdminCompetitionPayload(client, musicId), 'prelim')
  const ranked = closedView.entries.filter(item => item.rank !== null)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0]!.singer.id, entries[0]!.singer.id)
  assert.equal(ranked[0]!.qualified, true)

  closeDatabase(':memory:')
})

test('数据库：届次/赛程/表单字段可配置，预报名带自选天，现场登记按当天归天', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  // 默认值：赛程 4 行（初赛两天 + 复赛 + 决赛），表单 7 项，姓名与「哪天来」必填。
  const initial = getRegistrationState(client, musicId)
  assert.equal(initial.edition, '')
  assert.equal(initial.schedule.length, 4)
  assert.equal(initial.schedule.filter(item => item.key === 'prelim').length, 2)
  assert.deepEqual(
    initial.formFields.map(field => field.key),
    ['name', 'className', 'studentNo', 'phone', 'email', 'song', 'preferredDay']
  )
  assert.equal(initial.formFields.every(field => field.required), true)

  // 改成自定义届次、两行赛程、三个字段（其余字段不再出现在表单里）。
  updateCompetitionEvent(client, event, {
    title: '新声歌手大赛',
    registrationOpen: true,
    dimensions: DEFAULT_COMPETITION_DIMENSIONS,
    edition: '2026 第六届',
    schedule: [
      { key: 'prelim', dateLabel: '11 月 14 日（周六）', timeLabel: '19:00 开始', venue: '旧区宏船楼 303', note: '' },
      { key: 'final', dateLabel: '12 月 5 日（周六）', timeLabel: '19:00 - 21:30', venue: '旧区普照大礼堂', note: '决赛' }
    ],
    formFields: [
      { key: 'name', label: '姓名', required: true, enabled: true },
      { key: 'song', label: '参赛曲目', required: true, enabled: true },
      { key: 'preferredDay', label: '打算哪天来', required: false, enabled: true }
    ]
  })

  const saved = getRegistrationState(client, musicId)
  assert.equal(saved.edition, '2026 第六届')
  assert.equal(saved.schedule.length, 2)
  assert.equal(saved.schedule[1]?.venue, '旧区普照大礼堂')
  assert.deepEqual(saved.formFields.map(field => field.label), ['姓名', '参赛曲目', '打算哪天来'])
  assert.equal(saved.formFields.find(field => field.key === 'song')?.required, true)

  // 预报名：preferredDay 只收 1 / 2，其他值当没填。
  const fullPre = {
    className: '26音乐学1班',
    phone: '13800000009',
    email: 'pre@example.com'
  }
  preRegisterFromForm(client, musicId, {
    ...fullPre,
    name: '测试甲',
    studentNo: '20260011',
    preferredDay: 2,
    song: '晴天'
  })
  preRegisterFromForm(client, musicId, {
    ...fullPre,
    name: '测试乙',
    studentNo: '20260012',
    preferredDay: 9,
    song: '后来'
  })
  // 必填项缺失时服务端直接拦下。
  assert.throws(
    () => preRegisterFromForm(client, musicId, { name: '测试丙', preferredDay: 1 }),
    (error: unknown) => (error as { data?: { field?: string } }).data?.field === 'song'
  )
  const pres = listPreRegistrations(client, event.id)
  assert.equal(pres.find(item => item.name === '测试甲')?.preferredDay, 2)
  assert.equal(pres.find(item => item.name === '测试乙')?.preferredDay, null)

  // 现场登记直接进当天：rounds.active_day 是第几天就归到哪天。
  const reload = () => getRoundByKey(client, event.id, 'prelim')
  setRoundDay(client, reload(), 2)
  registerSingerFromForm(client, musicId, {
    name: '现场甲',
    song: '起风了',
    studentNo: '2026001',
    phone: '13800000001',
    email: 'live1@example.com'
  })
  const day2Entries = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  assert.equal(day2Entries.find(entry => entry.singer.name === '现场甲')?.contestDay, 2)

  // 换到跟今天无关的日子，才能稳定验证「非初赛日现场不收人」。
  updateCompetitionEvent(client, event, {
    title: '新声歌手大赛',
    registrationOpen: true,
    dimensions: DEFAULT_COMPETITION_DIMENSIONS,
    schedule: [
      { key: 'prelim', dateLabel: '12 月 20 日（周六）', timeLabel: '19:00 开始', venue: '旧区宏船楼 303', note: '' },
      { key: 'prelim', dateLabel: '12 月 21 日（周日）', timeLabel: '19:00 开始', venue: '旧区宏船楼 303', note: '' }
    ]
  })

  // 不分天且今天不在初赛那两天：现场不收人，避免把人排错日期。
  setRoundDay(client, reload(), null)
  assert.throws(
    () => registerSingerFromForm(client, musicId, {
      name: '现场乙',
      song: '如愿',
      studentNo: '2026002',
      phone: '13800000002',
      email: 'live2@example.com'
    }),
    (error: unknown) => (error as { data?: { field?: string } }).data?.field === 'day'
  )

  closeDatabase(':memory:')
})

test('数据库：评委可以自定义账号密码，重名报 409，改账号密码后旧密码失效', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)
  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  const round = getRoundByKey(client, event.id, 'prelim')

  const custom = await createJudgeAccount(client, round, {
    username: 'judge_alpha',
    password: '123456',
    displayName: '一号评委'
  })
  assert.equal(custom.username, 'judge_alpha')
  assert.equal(custom.password, '123456')
  assert.equal(custom.displayName, '一号评委')

  const stored = client.db.select().from(competitionJudges).all().find(row => row.id === custom.id)!
  assert.equal(await verifyPassword('123456', stored.passwordHash), true)

  // 账号重名（不区分大小写）要被挡住。
  await assert.rejects(
    () => createJudgeAccount(client, round, { username: 'JUDGE_ALPHA', password: 'abcdef' }),
    (error: unknown) => {
      const tagged = error as { data?: { code?: string } }
      return tagged.data?.code === 'JUDGE_USERNAME_TAKEN'
    }
  )

  // 密码不足 6 位要被挡住。
  await assert.rejects(
    () => createJudgeAccount(client, round, { username: 'judge_beta', password: '12345' }),
    (error: unknown) => {
      const tagged = error as { data?: { code?: string } }
      return tagged.data?.code === 'VALIDATION_ERROR'
    }
  )

  // 留空自动生成，账号不重复。
  const auto = await createJudgeAccount(client, round)
  assert.ok(auto.username.length >= 3)
  assert.ok(auto.password.length >= 6)

  // 改账号 + 改密码，旧密码失效。
  const updated = await updateJudge(client, round.id, custom.id, {
    username: 'judge_gamma',
    password: 'newpass1'
  })
  assert.equal(updated.username, 'judge_gamma')
  const after = client.db.select().from(competitionJudges).all().find(row => row.id === custom.id)!
  assert.equal(await verifyPassword('123456', after.passwordHash), false)
  assert.equal(await verifyPassword('newpass1', after.passwordHash), true)

  closeDatabase(':memory:')
})

test('数据库：拖动排序把选手挪到目标前后，分天时不影响另一天的相对顺序', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  for (const [name, song] of [['甲', '晴天'], ['乙', '后来'], ['丙', '如愿'], ['丁', '起风了']] as const) {
    createSinger(client, event.id, { name, song })
    checkInEntries(client, musicId)
  }

  const reload = () => getRoundByKey(client, event.id, 'prelim')
  const entries = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  const byName = (name: string) => entries.find(entry => entry.singer.name === name)!

  // 甲 拖到 丙 后面：乙/丙/甲/丁
  moveRoundEntry(client, reload(), byName('甲').id, byName('丙').id, 'after')
  assert.deepEqual(
    roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries.map(entry => entry.singer.name),
    ['乙', '丙', '甲', '丁']
  )

  // 丁 拖到 乙 前面：丁/乙/丙/甲
  moveRoundEntry(client, reload(), byName('丁').id, byName('乙').id, 'before')
  assert.deepEqual(
    roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries.map(entry => entry.singer.name),
    ['丁', '乙', '丙', '甲']
  )

  // 分成两天后，只重排第一天，第二天的相对顺序不变。
  setEntryDay(client, reload(), byName('丁').id, 1)
  setEntryDay(client, reload(), byName('乙').id, 1)
  setEntryDay(client, reload(), byName('丙').id, 2)
  setEntryDay(client, reload(), byName('甲').id, 2)
  setRoundDay(client, reload(), 1)
  moveRoundEntry(client, reload(), byName('乙').id, byName('丁').id, 'before')
  const afterMove = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  assert.deepEqual(
    afterMove.filter(entry => entry.contestDay === 1).map(entry => entry.singer.name),
    ['乙', '丁']
  )
  // 第二天的相对顺序不受影响。
  assert.deepEqual(
    afterMove.filter(entry => entry.contestDay === 2).map(entry => entry.singer.name),
    ['丙', '甲']
  )

  closeDatabase(':memory:')
})

test('数据库：评委端进度只算当天到场的人，新扫码登记后总人数实时增加', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  for (const [name, song] of [['张三', '晴天'], ['李四', '后来'], ['王五', '如愿']] as const) {
    createSinger(client, event.id, { name, song })
  }
  checkInEntries(client, musicId, 'prelim')

  const reload = () => getRoundByKey(client, event.id, 'prelim')
  updateRound(client, reload(), { status: 'open' })
  const judges = await createJudgeAccounts(client, reload(), 2)
  const actor = { ...judges[0]!, eventId: event.id, roundId: reload().id }

  const entries = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  setEntryDay(client, reload(), entries[0]!.id, 1)
  setEntryDay(client, reload(), entries[1]!.id, 1)
  setEntryDay(client, reload(), entries[2]!.id, 2)
  setRoundDay(client, reload(), 1)

  // 第一天的评委只看到第一天的人，进度分母也是当天人数。
  const first = getJudgePayload(client, actor)
  assert.equal(first.singers.length, 2)
  assert.deepEqual(first.progress, { scored: 0, total: 2 })

  // 现场扫码登记的新人立刻进当天名单，总人数跟着涨。
  registerSingerFromForm(client, musicId, {
    name: '新来的',
    className: '26音乐学1班',
    studentNo: '20260100',
    phone: '13800009999',
    email: 'new@example.com',
    song: '夜曲'
  })
  checkInEntries(client, musicId)
  const afterScan = getJudgePayload(client, actor)
  assert.equal(afterScan.singers.length, 3)
  assert.deepEqual(afterScan.progress, { scored: 0, total: 3 })
  assert.equal(afterScan.singers.at(-1)?.name, '新来的')

  // 自己评过的人只算当天，评第二天的不会把进度顶上去。
  submitJudgeScore(client, actor, entries[0]!.singer.id, { scores: scoresForAll(10) })
  assert.deepEqual(getJudgePayload(client, actor).progress, { scored: 1, total: 3 })

  closeDatabase(':memory:')
})

test('数据库：免登录叫号台只给叫号信息，按出场顺序，不露电话邮箱评分', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  const round = getRoundByKey(client, event.id, 'prelim')
  createSinger(client, event.id, { name: '阿甲', song: '晴天', className: '26音乐学1班' })
  createSinger(client, event.id, { name: '阿乙', song: '后来', className: '26英语1班' })
  setRoundDay(client, round, 1)
  const roster = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  for (const entry of roster) setEntryCheckIn(client, getRoundByKey(client, event.id, 'prelim'), entry.id, true)

  const board = getCallBoard(client, musicId)
  assert.equal(board.round.activeDay, 1)
  assert.equal(board.total, 2)
  assert.deepEqual(board.rows.map(row => [row.position, row.name, row.song]), [
    [1, '阿甲', '晴天'],
    [2, '阿乙', '后来']
  ])
  assert.equal('phone' in board.rows[0]!, false)
  assert.equal('email' in board.rows[0]!, false)
  assert.equal('average' in board.rows[0]!, false)
  assert.equal(board.current, null)
  assert.equal(board.next?.name, '阿甲')

  const judge = await createJudgeAccounts(client, round, 1)
  updateRound(client, round, { status: 'open', judgeCount: 1 })
  moveCurrentEntry(client, getRoundByKey(client, event.id, 'prelim'), 'start')
  submitJudgeScore(client, { ...judge[0]!, eventId: event.id, roundId: round.id }, roster[0]!.singer.id, { scores: scoresForAll(8) })

  const live = getCallBoard(client, musicId)
  assert.equal(live.current?.name, '阿乙')
  assert.equal(live.rows[0]!.state, 'finished')
  assert.equal(live.next, null)

  closeDatabase(':memory:')
})

test('数据库：第一张评分自动开始叫号，当天评委评完自动下一位', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  const round = getRoundByKey(client, event.id, 'prelim')
  createSinger(client, event.id, { name: '甲一', song: '晴天' })
  createSinger(client, event.id, { name: '乙二', song: '后来' })
  setRoundDay(client, round, 1)
  const roster = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  for (const entry of roster) setEntryCheckIn(client, getRoundByKey(client, event.id, 'prelim'), entry.id, true)

  const judges = await createJudgeAccounts(client, round, 2)
  updateRound(client, getRoundByKey(client, event.id, 'prelim'), { status: 'open', judgeCount: 2 })
  assert.equal(getCurrentSinger(client, getRoundByKey(client, event.id, 'prelim')), null)

  // 没人点「开始」，第一张评分就把这位设成正在唱。
  submitJudgeScore(client, { ...judges[0]!, eventId: event.id, roundId: round.id }, roster[0]!.singer.id, { scores: scoresForAll(8) })
  const started = getCurrentSinger(client, getRoundByKey(client, event.id, 'prelim'))
  assert.equal(started?.singer.id, roster[0]!.singer.id)
  assert.equal(started?.judgeTotal, 2)
  assert.equal(started?.allSubmitted, false)

  // 第二张也是这一位 → 凑齐 2 票，自动切到第二位。
  submitJudgeScore(client, { ...judges[1]!, eventId: event.id, roundId: round.id }, roster[0]!.singer.id, { scores: scoresForAll(9) })
  assert.equal(getCurrentSinger(client, getRoundByKey(client, event.id, 'prelim'))?.singer.id, roster[1]!.singer.id)

  // 叫号台跟着显示「正在唱」，并且第一位是已唱完。
  const board = getCallBoard(client, musicId)
  assert.equal(board.current?.name, '乙二')
  assert.equal(board.rows[0]!.state, 'finished')
  assert.equal(board.next, null)

  closeDatabase(':memory:')
})

test('数据库：今天排哪一天按赛程日期判断，非初赛日不收，手动切天优先', () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  const round = getRoundByKey(client, event.id, 'prelim')

  const dates = prelimDayDates(event)
  assert.equal(dates.length, 2)
  const at = (dateKey: string, time: string) => Date.parse(`${dateKey}T${time}:00+08:00`)

  assert.deepEqual(resolvePrelimDay(event, round, at(dates[0]!.dateKey, '19:30')), { day: 1, source: 'date' })
  assert.deepEqual(resolvePrelimDay(event, round, at(dates[1]!.dateKey, '20:00')), { day: 2, source: 'date' })
  assert.deepEqual(resolvePrelimDay(event, round, at('2020-01-01', '12:00')), { day: null, source: 'date' })

  // 管理员手动切到第一天后，不管系统日期是哪天，都按第一天收人。
  setRoundDay(client, round, 1)
  assert.deepEqual(resolvePrelimDay(event, getRoundByKey(client, event.id, 'prelim'), at('2020-01-01', '12:00')), {
    day: 1,
    source: 'active'
  })

  closeDatabase(':memory:')
})

test('数据库：现场进度——正在唱/已结束/前方几人，选手自己能查到排队位置', async () => {
  const client = getDatabase(':memory:')
  runMigrations(client)

  const musicId = randomUUID()
  client.db.insert(contents).values({
    id: musicId,
    kind: 'club',
    slug: 'music-association',
    title: '音乐协会',
    summary: 'test',
    status: 'published'
  }).run()

  const event = ensureCompetitionEvent(client, musicId)
  const singers = [['甲', '晴天'], ['乙', '后来'], ['丙', '如愿']] as const
  for (const [name, song] of singers) createSinger(client, event.id, { name, song })
  checkInEntries(client, musicId)

  const reload = () => getRoundByKey(client, event.id, 'prelim')
  updateRound(client, reload(), { status: 'open' })
  const entries = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  const byName = (name: string) => entries.find(entry => entry.singer.name === name)!

  // 还没开始顺序评分：只区分已打分/未打分。
  assert.equal(byName('甲').queueState, 'idle')

  // 从第一位开始：甲演唱中，乙前方 1 人，丙前方 2 人。
  moveCurrentEntry(client, reload(), 'start')
  let view = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  const nameOf = (id: string) => view.find(entry => entry.id === id)!.singer.name
  const seat = (name: string) => view.find(entry => entry.singer.name === name)!
  assert.equal(seat('甲').queueState, 'singing')
  assert.equal(seat('乙').queueState, 'waiting')
  // ahead 只数「还没轮到我之前还要上场的」，正在唱的那位不算。
  assert.equal(seat('乙').ahead, 0)
  assert.equal(seat('丙').ahead, 1)
  assert.equal(seat('乙').queuePosition, 2)

  const queueFor = (name: string) => getSingerQueuePosition(client, musicId, byName(name).singer.id)
  assert.deepEqual(queueFor('甲'), { state: 'singing', ahead: 0, position: 1, total: 3 })
  assert.deepEqual(queueFor('乙'), { state: 'waiting', ahead: 0, position: 2, total: 3 })

  // 跳到第二位：甲已结束，乙演唱中，丙前面 0 人（下一位）。本轮没有评委，用 skip 强制推进。
  moveCurrentEntry(client, reload(), 'skip')
  view = roundView(getAdminCompetitionPayload(client, musicId), 'prelim').entries
  assert.equal(seat('甲').queueState, 'finished')
  assert.equal(seat('乙').queueState, 'singing')
  assert.equal(seat('丙').ahead, 0)
  assert.equal(nameOf(byName('乙').id), '乙')
  assert.equal(queueFor('甲').state, 'finished')
  assert.equal(queueFor('丙').ahead, 0)
  assert.equal(queueFor('丙').state, 'waiting')

  closeDatabase(':memory:')
})
