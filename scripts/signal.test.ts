import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { clusterSignalItems, titleSimilarity } from '../server/modules/signal/clustering'
import { computeSignalHeat, decayedHeat, signalTrend } from '../server/modules/signal/heat'
import { buildDailyReport, buildPeriodReport } from '../server/modules/signal/report'
import { decideSignalScore, isUsableSignalTitle, looksLikeAnnouncement, signalCategoryFor } from '../server/modules/signal/scoring'
import {
  documentPublishedAt,
  ensureDailyReport,
  getSignalEventBySlug,
  listHotSignalEvents,
  listSignalReports,
  rebuildSignalIndex
} from '../server/modules/signal/service'
import {
  signalDayKey,
  signalDayKeysInPeriod,
  signalMonthKey,
  signalPeriodRange,
  signalWeekKey
} from '../server/modules/signal/time'

const NOW = Date.parse('2026-11-02T10:00:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

const SOURCE_A = '11111111-1111-4111-8111-111111111111'
const SOURCE_B = '22222222-2222-4222-8222-222222222222'
const SOURCE_C = '33333333-3333-4333-8333-333333333333'

function insertSource(client: DatabaseClient, id: string, options: { level: string, official: boolean, url: string }): void {
  client.sqlite.prepare(`
    INSERT INTO sources (
      id, title, url, platform, publisher_name, source_level, is_official,
      accessed_at, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'official-site', '仰恩大学', ?, ?, ?, 'active', ?, ?)
  `).run(id, `信源 ${id.slice(0, 4)}`, options.url, options.level, options.official ? 1 : 0, NOW, NOW, NOW)
}

function insertNotice(
  client: DatabaseClient,
  input: { id: string, title: string, body: string, publishedAt: number, sourceId?: string }
): void {
  client.sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, metadata_json, status,
      last_verified_at, published_at, created_at, updated_at
    ) VALUES (?, 'notice', ?, ?, ?, ?, '{}', 'published', ?, ?, ?, ?)
  `).run(input.id, `notice-${input.id}`, input.title, input.body.slice(0, 80), input.body, NOW, input.publishedAt, NOW, NOW)
  if (input.sourceId) {
    client.sqlite.prepare(`
      INSERT INTO content_sources (content_id, source_id, is_primary, created_at)
      VALUES (?, ?, 1, ?)
    `).run(input.id, input.sourceId, NOW)
  }
}

function insertDocument(
  client: DatabaseClient,
  input: { id: string, title: string, text: string, capturedAt: number, sourceId: string, kind?: string }
): void {
  client.sqlite.prepare(`
    INSERT INTO knowledge_documents (
      id, source_id, kind, title, original_url, mime_type, content_hash,
      extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'text/html', ?, ?, '{}', 'ready', ?, ?, ?, ?)
  `).run(
    input.id,
    input.sourceId,
    input.kind ?? 'webpage',
    input.title,
    `https://www.yeu.edu.cn/news/${input.id}.html`,
    `hash-${input.id}`,
    input.text,
    input.capturedAt,
    input.capturedAt,
    NOW,
    NOW
  )
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-signal-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)

  insertSource(client, SOURCE_A, { level: 'A', official: true, url: 'https://www.yeu.edu.cn/notice' })
  insertSource(client, SOURCE_B, { level: 'A', official: true, url: 'https://jwc.yeu.edu.cn/notice' })
  insertSource(client, SOURCE_C, { level: 'C', official: false, url: 'https://blog.example.com/yeu' })

  insertNotice(client, {
    id: 'n-freshman',
    title: '关于开展2026级新生报到工作的通知',
    body: '2026级新生报到时间定于2026年9月5日8:00至17:00，地点为仰恩大学第一教学区体育馆。'
      + '报到须携带录取通知书、身份证与档案，学费与住宿费通过校园统一支付平台缴纳。'
      + '咨询电话0595-22082001，逾期未报到请提前联系教务处办理请假。'
      + '新生报到流程、宿舍分配与军训安排另行通知，请关注本页更新。',
    publishedAt: NOW - 1 * DAY,
    sourceId: SOURCE_A
  })
  insertNotice(client, {
    id: 'n-research',
    title: '关于组织国家社会科学基金项目申报工作的通知',
    body: '请各学院组织教师申报2026年度国家社会科学基金项目，申报材料于2026年3月1日前提交科研处。'
      + '项目负责人须具备副高级以上职称，申报指南见附件。教师课题结项材料同步报送。',
    publishedAt: NOW - 1 * DAY,
    sourceId: SOURCE_A
  })
  // 同一件事由两个来源各发一次，应该聚成一个事件、来源数 2
  insertNotice(client, {
    id: 'n-freshman-2',
    title: '关于开展2026级新生报到工作的补充通知',
    body: '新生报到流程维持不变，体育馆报到点增设行李寄存处，咨询电话0595-22082001。',
    publishedAt: NOW - 5 * HOUR,
    sourceId: SOURCE_B
  })
  insertNotice(client, {
    id: 'n-old',
    title: '关于2024年寒假放假安排的通知',
    body: '2024年寒假自1月15日开始，2月25日返校报到，请全体学生按校历安排行程。'
      + '返校后按课表正常上课，补考安排另行通知，具体时间见教务处公告。',
    publishedAt: NOW - 400 * DAY,
    sourceId: SOURCE_A
  })
  insertDocument(client, {
    id: 'd-dorm',
    title: '关于2026级新生宿舍分配结果查询的通知',
    body: '',
    text: '发布时间：2026年10月30日。2026级新生宿舍分配结果已公布，请登录迎新系统查询床位与楼栋。'
      + '宿舍开放时间为9月4日8:00，入住须持校园卡到宿管值班室登记。'
      + '住宿费标准为每人每年1200元，缴费后可在系统下载电子票据。',
    capturedAt: NOW - 20 * HOUR,
    sourceId: SOURCE_B,
    kind: 'pdf'
  })
  insertDocument(client, {
    id: 'd-evergreen',
    title: '学院简介',
    body: '',
    text: '仰恩大学某学院成立于2003年，现设有三个本科专业，教职工六十余人。',
    capturedAt: NOW - 20 * HOUR,
    sourceId: SOURCE_B
  })

  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('时间口径按北京时间切日，周期键与区间自洽', () => {
  assert.equal(signalDayKey(Date.parse('2026-11-02T15:59:00Z')), '2026-11-02')
  assert.equal(signalDayKey(Date.parse('2026-11-02T16:30:00Z')), '2026-11-03')
  assert.equal(signalWeekKey(Date.parse('2026-11-02T03:00:00Z')), '2026-W45')
  assert.equal(signalMonthKey(Date.parse('2026-11-02T03:00:00Z')), '2026-11')

  const day = signalPeriodRange('daily', '2026-11-02')
  assert.equal(day.end - day.start, DAY)
  assert.equal(signalDayKey(day.start), '2026-11-02')
  assert.equal(signalDayKeysInPeriod('weekly', '2026-W45').length, 7)
  assert.equal(signalDayKeysInPeriod('weekly', '2026-W45')[0], '2026-11-02')
  assert.equal(signalPeriodRange('monthly', '2026-11').end - signalPeriodRange('monthly', '2026-11').start, 30 * DAY)
})

test('双评分：新生通知过线，科研申报落选', () => {
  const notice = decideSignalScore({
    title: '关于开展2026级新生报到工作的通知',
    body: '报到时间2026年9月5日，地点第一教学区，咨询电话0595-22082001，学费与住宿费缴费方式见附件。',
    publishedAt: NOW - DAY,
    itemKind: 'notice',
    tier: 'A',
    isOfficial: true
  }, NOW)
  assert.equal(notice.passed, true)
  assert.ok(notice.scoreA >= 50, `相关度应达线，实际 ${notice.scoreA}`)

  const research = decideSignalScore({
    title: '关于组织国家社会科学基金项目申报工作的通知',
    body: '请教师于2026年3月1日前提交申报材料，项目负责人须具备副高级以上职称。',
    publishedAt: NOW - DAY,
    itemKind: 'notice',
    tier: 'A',
    isOfficial: true
  }, NOW)
  // 科研申报的标题里有「申报」，会拿到公告豁免，但相关度不到 门槛-12+12，仍要被拦下。
  assert.equal(research.passed, false)
  assert.ok(research.scoreA < research.threshold, `科研申报应被相关度拦下，实际 ${research.scoreA}/${research.threshold}`)
})

test('双评分：同样的内容，二手信源门槛更高', () => {
  const input = {
    title: '关于新生报到时间安排的通知',
    body: '报到时间为2026年9月5日，地点体育馆。',
    publishedAt: NOW - DAY,
    itemKind: 'notice' as const,
    isOfficial: false
  }
  const official = decideSignalScore({ ...input, tier: 'A', isOfficial: true }, NOW)
  const secondary = decideSignalScore({ ...input, tier: 'C', isOfficial: false }, NOW)
  assert.ok(secondary.score < official.score)
  assert.equal(secondary.threshold, 75)
})

test('标题可用性与公告判定挡住文件名和常青页面', () => {
  assert.equal(isUsableSignalTitle('7e57374d-3d33-484f-b0dc-65a79bc87c58.doc'), false)
  assert.equal(isUsableSignalTitle('招生就业'), false)
  assert.equal(isUsableSignalTitle('2026级新生报到手册.pdf'), true)
  // 科研申报、招标采购这类给老师看的东西不进榜；标题里提到奖助、报到的仍然放行。
  assert.equal(isUsableSignalTitle('关于组织申报2026年度市级科技计划项目（第二批）的通知'), false)
  assert.equal(isUsableSignalTitle('关于开展2026年产学研合作平台申报工作的通知'), false)
  assert.equal(isUsableSignalTitle('关于做好2026年国家奖学金评审工作的通知'), true)
  assert.equal(looksLikeAnnouncement('学院简介', '本院设有三个本科专业，教职工六十余人。'), false)
  assert.equal(looksLikeAnnouncement('关于宿舍分配的通知', ''), true)
  assert.equal(signalCategoryFor('关于2026级新生宿舍分配结果查询的通知'), '住宿')
})

test('文档发布时间取正文里的日期，没有日期就不入库', () => {
  const captured = NOW
  assert.equal(
    documentPublishedAt('学生宿舍搬迁通知', '搬迁时间：2014年7月4日至7日，请提前打包。', captured),
    Date.parse('2014-07-04T00:00:00+08:00')
  )
  assert.equal(
    documentPublishedAt('2026级新生报到须知', '报到时间：2026-09-05，逾期不候。', captured),
    Date.parse('2026-09-05T00:00:00+08:00')
  )
  // 一点日期都没有的文档返回 0：不拿抓取时间冒充发布时机。
  assert.equal(documentPublishedAt('关于宿舍分配的通知', '本次分配按学院集中安排，具体名单另行公布。', captured), 0)
  assert.equal(
    documentPublishedAt('关于组织教师报名参加2014年上半年培训的通知', '请各学院汇总名单后报送。', captured),
    Date.parse('2014-01-01T00:00:00+08:00')
  )
  assert.equal(documentPublishedAt('关于报到的通知', '时间：2099年1月1日。', captured), 0)
})

test('热度：同一来源重复发布只算一次，按 7 天半衰', () => {
  const single = decayedHeat([{ key: 'source-a', at: NOW - 2 * HOUR }], NOW)
  // 同一个来源发两次，只按最新那条时间计一次，不能叠加成 1.9
  const duplicated = decayedHeat([
    { key: 'source-a', at: NOW - 2 * HOUR },
    { key: 'source-a', at: NOW - 1 * HOUR }
  ], NOW)
  assert.equal(duplicated, decayedHeat([{ key: 'source-a', at: NOW - 1 * HOUR }], NOW))
  assert.ok(duplicated < 1)
  assert.ok(Math.abs(single - 2 ** (-2 / 168)) < 0.002)
  assert.equal(decayedHeat([{ key: 'source-a', at: NOW - 721 * HOUR }], NOW), 0)
})

test('趋势：第一次进快照判 new，来源数变多算涨', () => {
  const OLD = NOW - 40 * HOUR
  assert.equal(signalTrend(1, null, NOW - HOUR, NOW), 'new', '第一次进快照')
  assert.equal(signalTrend(3, 2, OLD, NOW), 'up', '又多了来源跟进')
  assert.equal(signalTrend(1, 3, OLD, NOW), 'down', '来源变少')
  assert.equal(signalTrend(2, 2, OLD, NOW), 'flat', '来源数没变')
  assert.equal(signalTrend(5, 1, NOW - HOUR, NOW), 'new', '6 小时内第一次出现')

  // 热度本身是 30 天窗口 + 7 天半衰
  const cooling = computeSignalHeat([
    { key: 'source-a', at: NOW - 8 * HOUR },
    { key: 'source-b', at: NOW - 8 * HOUR }
  ], OLD, NOW)
  assert.ok(cooling.heat < cooling.heatPrev, '热度随时间衰减')
})

test('聚簇：相近标题合并，相隔太远的同类标题不合并', () => {
  const items = [
    { id: 'a', title: '关于开展2026级新生报到工作的通知', publishedAt: NOW - 2 * DAY, score: 70 },
    { id: 'b', title: '关于2026级新生报到时间安排的通知', publishedAt: NOW - 1 * DAY, score: 66 },
    { id: 'c', title: '关于2026级新生报到工作的通知', publishedAt: NOW - 40 * DAY, score: 60 }
  ]
  assert.ok(titleSimilarity(items[0]!.title, items[1]!.title) >= 0.42)
  const groups = clusterSignalItems(items)
  assert.equal(groups.length, 2)
  const sizes = groups.map(group => group.length).sort()
  assert.deepEqual(sizes, [1, 2])
  const merged = groups.find(group => group.length === 2)!
  assert.deepEqual(merged.map(item => item.id), ['a', 'b'], '组内按分数降序')
  assert.equal(groups.find(group => group.length === 1)![0]!.id, 'c', '相隔 40 天的不合并')
})

test('日报：报过且没有新动静不再跟进，有新条目才追加', () => {
  const events = [
    {
      id: 'e1', slug: 'hot-e1', title: '关于开展2026级新生报到工作的通知', summary: '',
      category: '报到', heat: 9, sourceCount: 2, itemCount: 2, tier: 'A', firstSeenAt: NOW - DAY, lastSeenAt: NOW - HOUR
    },
    {
      id: 'e2', slug: 'hot-e2', title: '关于宿舍分配结果查询的通知', summary: '',
      category: '住宿', heat: 5, sourceCount: 1, itemCount: 1, tier: 'A', firstSeenAt: NOW - DAY, lastSeenAt: NOW - 2 * HOUR
    },
    {
      id: 'e3', slug: 'hot-e3', title: '关于开展2026级新生报到工作的通知', summary: '',
      category: '报到', heat: 1, sourceCount: 1, itemCount: 1, tier: 'C', firstSeenAt: NOW - DAY, lastSeenAt: NOW - 3 * HOUR
    }
  ]
  const first = buildDailyReport({
    events,
    periodKey: signalDayKey(NOW),
    generatedAt: NOW,
    reportedAt: new Map()
  })
  const ids = first.lead.map(item => item.eventId)
  assert.deepEqual(ids, ['e1', 'e2'], '同标题去重保留热度高的那条')

  const repeat = buildDailyReport({
    events,
    periodKey: signalDayKey(NOW),
    generatedAt: NOW + HOUR,
    reportedAt: new Map([['e1', NOW], ['e2', NOW]])
  })
  assert.equal(repeat.lead.length, 0, '没有新进展就不再报一次')

  const progressed = buildDailyReport({
    events: events.map(event => event.id === 'e1' ? { ...event, lastSeenAt: NOW + 2 * HOUR } : event),
    periodKey: signalDayKey(NOW),
    generatedAt: NOW + 3 * HOUR,
    reportedAt: new Map([['e1', NOW], ['e2', NOW]])
  })
  assert.deepEqual(progressed.lead.map(item => item.eventId), ['e1'])
})

test('周报把日报按天拼起来', () => {
  const payload = buildPeriodReport({
    kind: 'weekly',
    periodKey: '2026-W45',
    generatedAt: NOW,
    dailies: [
      {
        periodKey: '2026-11-02',
        payload: buildDailyReport({
          events: [{
            id: 'e1', slug: 'hot-e1', title: '关于新生报到的通知', summary: '', category: '报到',
            heat: 6, sourceCount: 1, itemCount: 1, tier: 'A', firstSeenAt: NOW - DAY, lastSeenAt: NOW - HOUR
          }],
          periodKey: '2026-11-02',
          generatedAt: NOW,
          reportedAt: new Map()
        })
      }
    ]
  })
  assert.equal(payload.kind, 'weekly')
  assert.equal(payload.sections.length, 1)
  assert.equal(payload.lead[0]!.eventId, 'e1')
  assert.equal(payload.stats.events, 1)
})

test('重建保留第一次出现时间：第二次重建判涨，不是每次都从零开始', () => {
  const fixture = createFixture()
  try {
    rebuildSignalIndex(fixture.client, { now: NOW, lookbackDays: 400 })
    const first = listHotSignalEvents(fixture.client, 20)
      .find(event => event.title.includes('新生报到工作的通知'))!
    assert.equal(first.trend, 'new')

    // 隔一天再重建，同一件事又多了个来源跟进 → 热度上升
    insertNotice(fixture.client, {
      id: 'n-freshman-3',
      title: '关于2026级新生报到地点调整的通知',
      body: '2026级新生报到地点由第一教学区体育馆调整为第三教学区综合馆，报到时间为2026年9月5日8:00至17:00，其余安排不变。'
        + '请携带录取通知书、身份证与档案，学费与住宿费通过校园统一支付平台缴纳，缴费截止时间为2026年9月4日。'
        + '报到流程、宿舍分配、军训安排详见附件一与附件二，咨询电话0595-22082001，工作日8:30至17:00有人接听。'
        + '因故不能按时报到的同学，请提前联系教务处办理请假手续，逾期两周未报到者按自动放弃入学资格处理。'
        + '本次调整只涉及报到地点，接站车辆、宿舍钥匙领取与校园卡办理流程保持不变，请关注后续通知。',
      publishedAt: NOW + 20 * HOUR,
      sourceId: SOURCE_C
    })
    rebuildSignalIndex(fixture.client, { now: NOW + 24 * HOUR, lookbackDays: 400 })

    const second = listHotSignalEvents(fixture.client, 20)
      .find(event => event.title.includes('新生报到工作的通知'))!
    assert.equal(second.firstSeenAt, first.firstSeenAt, '第一次出现时间要沿用，不能每次重建都刷新')
    assert.equal(second.trend, 'up', '又多了一个来源跟进')
    const storedHeatPrev = fixture.client.sqlite
      .prepare('SELECT heat_prev FROM signal_events WHERE slug = ?')
      .pluck()
      .get(second.slug) as number
    assert.ok(storedHeatPrev > 0, '上一份快照的热度要存下来做对比')
    assert.equal(second.sourceCount, 3)
  } finally {
    fixture.cleanup()
  }
})

test('端到端：建库、重建索引、读事件、生成日报且同一天不重复', () => {
  const fixture = createFixture()
  try {
    const result = rebuildSignalIndex(fixture.client, { now: NOW, lookbackDays: 400 })
    // 3 个事件：新生报到（两来源合并 2 条）、宿舍分配、2024 年寒假放假通知（旧通知也收，热度不参与准入）
    assert.equal(result.events, 3, `应选出 3 个事件，实际 ${result.events}`)
    assert.equal(result.items, 4)
    assert.equal(result.persisted, true)
    // 科研申报与学院简介在标题闸门就被挡掉，不算候选，所以这里没有二次淘汰。
    assert.equal(result.candidates, 4, `通过的候选应全部成事件，实际候选 ${result.candidates}`)
    assert.equal(result.rejected, 0)

    const events = listHotSignalEvents(fixture.client, 20)
    const titles = events.map(event => event.title)
    assert.ok(titles.some(title => title.includes('新生报到工作的通知')))
    assert.ok(titles.some(title => title.includes('宿舍分配结果查询')))
    assert.ok(!titles.some(title => title.includes('社会科学基金')), '科研申报不该进榜')
    assert.ok(!titles.some(title => title === '学院简介'), '常青页面不该进榜')
    // 旧通知进榜但排在新事件后面：热度为 0，只按发布时间排。
    const oldIndex = titles.findIndex(title => title.includes('2024年寒假放假'))
    assert.ok(oldIndex > 0, '旧通知应在榜但不在首位')

    const freshman = events.find(event => event.title.includes('新生报到工作的通知'))!
    assert.equal(freshman.tier, 'A')
    assert.equal(freshman.itemCount, 2, '两个来源的同一件事应合并')
    assert.equal(freshman.sourceCount, 2)
    assert.ok(freshman.heat > 0)
    assert.equal(freshman.trend, 'new', '第一次进快照就是新事件')

    const detail = getSignalEventBySlug(fixture.client, freshman.slug)
    assert.ok(detail)
    assert.equal(detail.slug, freshman.slug)
    assert.equal(detail.items.length, freshman.itemCount)
    assert.ok(detail.items.some(item => item.isPrimary && item.isOfficial))

    const report = ensureDailyReport(fixture.client, NOW)
    assert.equal(report.kind, 'daily')
    assert.equal(report.periodKey, signalDayKey(NOW))
    const again = ensureDailyReport(fixture.client, NOW + HOUR)
    assert.equal(again.generatedAt, report.generatedAt, '同一天只出一份日报')
    assert.equal(listSignalReports(fixture.client, 'daily', 10).length, 1)
  } finally {
    fixture.cleanup()
  }
})
