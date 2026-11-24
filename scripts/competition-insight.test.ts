import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { CompetitionRoundKey } from '../shared/types'
import type {
  CompetitionAnalyticsReport,
  DuelPrediction,
  RoundDistributionStat,
  SingerAnalyticsProfile
} from '../shared/utils/competition-analytics'
import {
  COMPETITION_INSIGHT_PROMPT,
  chatCompletionsUrl,
  insightConfigFromValues,
  insightDigest,
  insightFingerprint,
  parseInsight,
  requestInsight
} from '../server/modules/competition/insight'
import {
  insightStoreFile,
  readStoredInsight,
  writeStoredInsight,
  type StoredCompetitionInsight
} from '../server/modules/competition/insight-store'

type ReportOverrides = Partial<CompetitionAnalyticsReport>

function emptyRound(key: CompetitionRoundKey): RoundDistributionStat {
  return {
    roundKey: key,
    roundTitle: `${key} 轮`,
    status: 'closed',
    maxTotal: 100,
    entryCount: 0,
    scoredCount: 0,
    checkedInCount: 0,
    accompanimentCount: 0,
    qualifiedCount: 0,
    forfeitedCount: 0,
    averageScore: null,
    averagePercent: null,
    highestScore: null,
    lowestScore: null,
    stdDevPercent: null,
    buckets: [],
    judges: []
  }
}

function report(overrides: ReportOverrides = {}): CompetitionAnalyticsReport {
  const roundStats = {
    prelim: emptyRound('prelim'),
    semi: emptyRound('semi'),
    final: emptyRound('final'),
    final2: emptyRound('final2')
  } as Record<CompetitionRoundKey, RoundDistributionStat>
  return {
    generatedAt: 1_700_000_000_000,
    overview: {
      singerTotal: 0,
      preRegTotal: 0,
      preRegConverted: 0,
      ratedCount: 0,
      sTierCount: 0,
      aPlusOrAboveCount: 0,
      finalCount: 0,
      final2Count: 0,
      finalSongsCount: 0,
      duelReadyCount: 0,
      duelTotalCount: 0,
      totalVotes: 0,
      topPopularityName: null,
      topPopularityVotes: 0
    },
    funnel: [],
    roundStats,
    profiles: [],
    profilesById: {},
    duelPredictions: {},
    fieldSkillAverages: [],
    ...overrides
  }
}

function profile(index: number, overrides: Partial<SingerAnalyticsProfile['power']> = {}): SingerAnalyticsProfile {
  return {
    singer: {
      id: `s${index}`,
      name: `选手${index}`,
      className: '2024级',
      song: `曲目${index}`
    },
    power: {
      singerId: `s${index}`,
      hasRating: true,
      completeness: 'both',
      powerScore: 90 - index,
      powerRank: index + 1,
      tier: 'A',
      tierLabel: 'A',
      prelimWeight: 0.35,
      semiWeight: 0.65,
      baseScore: 80,
      dominanceScore: 80,
      stabilityScore: 80,
      momentumScore: 80,
      deltaPercent: 1,
      deltaZ: 0.2,
      prelim: null,
      semi: null,
      skillProfile: [],
      topStrength: { key: 'vocal', label: '音准', fieldAverage: 80, singerValue: 88, delta: 8 },
      weakSpot: { key: 'stage', label: '舞台表现', fieldAverage: 80, singerValue: 70, delta: -10 },
      summaryNote: '稳定',
      ...overrides
    },
    rounds: { prelim: null, semi: null, final: null, final2: null },
    currentStageLabel: '决赛',
    inFinal: true,
    inFinal2: false,
    finalPairNo: null,
    finalPairSlot: null,
    finalOpponentName: null,
    finalDuelWon: null,
    finalSongs: null,
    popularityVotes: 10,
    popularityPercent: 5,
    popularityRank: index + 1
  } as SingerAnalyticsProfile
}

function duel(pairNo: number): DuelPrediction {
  return {
    pairNo,
    leftSingerId: 's1',
    rightSingerId: 's2',
    leftPower: 88,
    rightPower: 80,
    leftWinProb: 72,
    rightWinProb: 28,
    powerDiff: 8,
    tag: '稳',
    upset: false,
    note: '实力接近',
    confidence: 78,
    volatility: '稳定'
  }
}

test('insightConfigFromValues：网关三项缺一项就当未接入', () => {
  assert.equal(insightConfigFromValues({}), null)
  assert.equal(insightConfigFromValues({ aiGatewayBaseUrl: 'https://gw.example.com' }), null)
  assert.equal(insightConfigFromValues({ aiGatewayApiKey: 'k' }), null)

  const config = insightConfigFromValues({
    aiGatewayBaseUrl: 'https://gw.example.com/',
    aiGatewayApiKey: 'k',
    aiGatewayModel: 'gpt-5.4'
  })
  assert.ok(config)
  assert.equal(config.model, 'gpt-5.4')
  assert.equal(config.timeoutMs, 45_000)

  const overridden = insightConfigFromValues({
    aiGatewayBaseUrl: 'https://gw.example.com',
    aiGatewayApiKey: 'k',
    competitionInsightModel: 'qwen-max',
    competitionInsightTimeoutMs: '15000'
  })
  assert.equal(overridden?.model, 'qwen-max')
  assert.equal(overridden?.timeoutMs, 15_000)

  const floored = insightConfigFromValues({
    aiGatewayBaseUrl: 'https://gw.example.com',
    aiGatewayApiKey: 'k',
    competitionInsightTimeoutMs: '100'
  })
  assert.equal(floored?.timeoutMs, 10_000)
})

test('insightDigest：空数据不抛，且产出可序列化摘要', () => {
  const digest = insightDigest(report())
  assert.equal(digest.overview.singers, 0)
  assert.deepEqual(digest.leaders, [])
  assert.deepEqual(digest.duels, [])
  assert.equal(digest.rounds.length, 4)
  assert.equal(JSON.parse(JSON.stringify(digest)).event, '仰恩大学歌手大赛')
})

test('insightDigest：选手与对阵都有硬上限，不随名单膨胀', () => {
  const profiles = Array.from({ length: 40 }, (_, index) => profile(index))
  const profilesById = Object.fromEntries(profiles.map(item => [item.singer.id, item]))
  const duelPredictions = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [index + 1, duel(index + 1)])
  )
  const digest = insightDigest(report({ profiles, profilesById, duelPredictions }))

  assert.ok(digest.leaders.length <= 12)
  assert.ok(digest.duels.length <= 6)
  assert.equal(digest.duels[0]?.pairNo, 1)
  assert.equal(digest.leaders[0]?.rank, 1)
  assert.equal(digest.duels[0]?.left, '选手1')
  assert.equal(digest.duels[0]?.leftWinPercent, 72)
  assert.equal(digest.duels[0]?.confidence, 78)
  assert.equal(digest.duels[0]?.volatility, '稳定')
  assert.ok(JSON.stringify(digest).length < 20_000)
})

test('insightDigest：未建模选手退化为按票数排序，避免空白分析', () => {
  const low = profile(1, { hasRating: false, powerScore: null, powerRank: null, tier: '—' })
  low.popularityVotes = 5
  const high = profile(2, { hasRating: false, powerScore: null, powerRank: null, tier: '—' })
  high.popularityVotes = 99
  const digest = insightDigest(report({
    profiles: [low, high],
    profilesById: { s1: low, s2: high },
    overview: { ...report().overview, singerTotal: 2, ratedCount: 0, totalVotes: 104 }
  }))
  assert.equal(digest.leaders[0]?.name, '选手2')
  assert.equal(digest.leaders[0]?.power, null)
})

test('insightFingerprint：同数据同指纹，数字一变就不同', () => {
  const base = insightDigest(report())
  const same = insightDigest(report())
  assert.equal(insightFingerprint(base), insightFingerprint(same))
  assert.match(insightFingerprint(base), /^[0-9a-f]{16}$/)

  const changed = insightDigest(report({
    overview: { ...report().overview, totalVotes: 1 }
  }))
  assert.notEqual(insightFingerprint(base), insightFingerprint(changed))
})

test('parseInsight：纯 JSON、代码块包裹、前后寒暄都能吃下', () => {
  const payload = {
    headline: '两强格局稳定',
    highlights: ['S 级 2 人'],
    risks: ['复赛离散度偏高'],
    actions: ['提前锁定决赛曲目'],
    caveats: ['决赛尚未打分']
  }
  const plain = parseInsight(JSON.stringify(payload))
  assert.deepEqual(plain, payload)

  const fenced = parseInsight(`好的，以下是分析：\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n希望有帮助`)
  assert.deepEqual(fenced, payload)

  const chatty = parseInsight(`分析如下 ${JSON.stringify(payload)} 以上`)
  assert.deepEqual(chatty, payload)
})

test('parseInsight：缺 headline、非 JSON、空串一律判失败', () => {
  assert.equal(parseInsight(''), null)
  assert.equal(parseInsight('抱歉我无法分析'), null)
  assert.equal(parseInsight('{"highlights":["a"]}'), null)
  assert.equal(parseInsight('{"headline":"","highlights":[]}'), null)
  assert.equal(parseInsight('{"headline":123}'), null)
})

test('parseInsight：过滤非字符串、裁掉超长与超额条目', () => {
  const long = '长'.repeat(400)
  const parsed = parseInsight(JSON.stringify({
    headline: '结论',
    highlights: ['ok', 42, null, long, '', 'b', 'c', 'd', 'e', 'f', 'g'],
    risks: 'not-an-array',
    actions: ['保留'],
    caveats: undefined
  }))
  assert.ok(parsed)
  assert.equal(parsed.risks.length, 0)
  assert.equal(parsed.caveats.length, 0)
  assert.ok(parsed.highlights.length <= 6)
  assert.equal(parsed.highlights[0], 'ok')
  assert.ok(parsed.highlights[1]?.length === 161 && parsed.highlights[1].endsWith('…'))
})

test('chatCompletionsUrl：baseUrl 带不带 /v1 都落到同一条路由', () => {
  assert.equal(chatCompletionsUrl('http://127.0.0.1:18080'), 'http://127.0.0.1:18080/v1/chat/completions')
  assert.equal(chatCompletionsUrl('http://127.0.0.1:18080/'), 'http://127.0.0.1:18080/v1/chat/completions')
  assert.equal(chatCompletionsUrl(' http://127.0.0.1:18080/v1 '), 'http://127.0.0.1:18080/v1/chat/completions')
  assert.equal(chatCompletionsUrl('https://api.example.com/openai/v1/'), 'https://api.example.com/openai/v1/chat/completions')
})

test('requestInsight：请求体带模型与提示词，成功时解析出结论', async () => {
  const calls: Array<{ url: string, body: Record<string, unknown>, auth: string | null }> = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({
      url: String(url),
      body,
      auth: new Headers(init?.headers).get('authorization')
    })
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"headline":"稳中求变","highlights":["S 级领先"],"risks":[],"actions":["锁定曲目"],"caveats":[]}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch

  const insight = await requestInsight(
    { baseUrl: 'https://gw.example.com/', apiKey: 'secret', model: 'gpt-5.4', timeoutMs: 5_000 },
    insightDigest(report()),
    { fetchImpl }
  )

  assert.ok(insight)
  assert.equal(insight.headline, '稳中求变')
  assert.deepEqual(insight.actions, ['锁定曲目'])
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, 'https://gw.example.com/v1/chat/completions')
  assert.equal(calls[0]?.auth, 'Bearer secret')
  assert.equal(calls[0]?.body.model, 'gpt-5.4')
  const messages = calls[0]?.body.messages as Array<{ role: string, content: string }>
  assert.equal(messages[0]?.content, COMPETITION_INSIGHT_PROMPT)
  assert.ok(messages[1]?.content.includes('仰恩大学歌手大赛'))
})

test('requestInsight：HTTP 失败、抛错、内容不可解析都返回 null', async () => {
  const failStatus = (async () => new Response('gateway down', { status: 503 })) as unknown as typeof fetch
  const throwError = (async () => {
    throw new Error('ECONNRESET')
  }) as unknown as typeof fetch
  const badBody = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: '我觉得挺好的' } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

  const config = { baseUrl: 'https://gw.example.com', apiKey: 'k', model: 'gpt-5.4', timeoutMs: 5_000 }
  const digest = insightDigest(report())

  assert.equal(await requestInsight(config, digest, { fetchImpl: failStatus }), null)
  assert.equal(await requestInsight(config, digest, { fetchImpl: throwError }), null)
  assert.equal(await requestInsight(config, digest, { fetchImpl: badBody }), null)
})

test('insight-store：写盘后能原样读回，不同赛事各存一份', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yeu-insight-store-'))
  const dbPath = join(dir, 'yeu.sqlite')
  const value: StoredCompetitionInsight = {
    eventId: 'event-a',
    eventTitle: '仰恩大学歌手大赛',
    insight: { headline: '整体稳定', highlights: ['初赛均分 88'], risks: [], actions: ['提前备伴奏'], caveats: [] },
    model: 'deepseek-flash',
    fingerprint: 'abcdef0123456789',
    generatedAt: 1_760_000_000_000,
    savedAt: 1_760_000_000_500,
    savedByAdminId: 'admin-1'
  }

  assert.equal(readStoredInsight(dbPath, 'event-a'), null)

  writeStoredInsight(dbPath, value)
  const roundTrip = readStoredInsight(dbPath, 'event-a')
  assert.ok(roundTrip)
  assert.equal(roundTrip.insight.headline, '整体稳定')
  assert.deepEqual(roundTrip.insight.highlights, ['初赛均分 88'])
  assert.equal(roundTrip.fingerprint, 'abcdef0123456789')
  assert.equal(roundTrip.savedByAdminId, 'admin-1')

  // 换代后另一届读到的是自己那份，不会被覆盖。
  assert.equal(readStoredInsight(dbPath, 'event-b'), null)
  writeStoredInsight(dbPath, { ...value, eventId: 'event-b', insight: { ...value.insight, headline: '下一届' } })
  assert.equal(readStoredInsight(dbPath, 'event-b')?.insight.headline, '下一届')
  assert.equal(readStoredInsight(dbPath, 'event-a')?.insight.headline, '整体稳定')

  // 落盘是 JSON 文件，跟着数据库同目录，备份脚本能一起带走。
  const file = insightStoreFile(dbPath, 'event-a')
  assert.ok(file.startsWith(dir))
  assert.ok(file.endsWith('event-a.json'))
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).eventId, 'event-a')

  rmSync(dir, { recursive: true, force: true })
})

test('insight-store：文件损坏或缺字段时读回 null，不让面板炸掉', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yeu-insight-broken-'))
  const dbPath = join(dir, 'yeu.sqlite')

  writeStoredInsight(dbPath, {
    eventId: 'event-x',
    eventTitle: 't',
    insight: { headline: 'ok', highlights: [], risks: [], actions: [], caveats: [] },
    model: 'm',
    fingerprint: 'f',
    generatedAt: 1,
    savedAt: 1,
    savedByAdminId: null
  })
  const file = insightStoreFile(dbPath, 'event-x')
  assert.ok(readStoredInsight(dbPath, 'event-x'))

  writeFileSync(file, '{ this is not json', 'utf8')
  assert.equal(readStoredInsight(dbPath, 'event-x'), null)

  writeFileSync(file, JSON.stringify({ eventId: 'event-x', insight: {} }), 'utf8')
  assert.equal(readStoredInsight(dbPath, 'event-x'), null)

  // eventId 里的路径分隔符被清掉，不会写到目录之外。
  const weird = insightStoreFile(dbPath, '../etc/passwd')
  assert.ok(weird.startsWith(dir))
  assert.ok(!weird.includes('..'))

  rmSync(dir, { recursive: true, force: true })
})
