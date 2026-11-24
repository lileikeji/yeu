import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import fc from 'fast-check'
import type {
  CompetitionAdminPayload,
  CompetitionDimension,
  CompetitionRoundEntry,
  CompetitionRoundKey,
  CompetitionRoundView,
  CompetitionScore,
  CompetitionSinger
} from '../shared/types'
import {
  DEFAULT_COMPETITION_DIMENSIONS,
  calculateCompetitionTotal,
  competitionMaxTotal,
  roundCompetitionScore
} from '../shared/utils/competition'
import {
  computeCompetitionAnalytics,
  powerTierOf,
  predictDuelWinProbability,
  singerSpreadSigma,
  type SingerAnalyticsProfile
} from '../shared/utils/competition-analytics'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { contents } from '../server/database/schema'
import {
  confirmAdvanceRoster,
  createJudgeAccounts,
  createSinger,
  drawFinalPairs,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  setEntryCheckIn,
  submitJudgeScore,
  updateCompetitionEvent,
  updateRound
} from '../server/modules/competition/service'

const PINNED_EDITION = '2031 第六届'

function makeSinger(id: string, name: string, sortOrder: number, song = '晴天'): CompetitionSinger {
  return {
    id,
    name,
    song,
    className: '25音乐1班',
    remark: null,
    sortOrder,
    photoUrl: null,
    photoUpdatedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    studentNo: `2025${String(sortOrder).padStart(4, '0')}`,
    phone: '13800000000',
    email: null,
    qq: '100001',
    source: 'admin',
    preRegistrationId: null
  }
}

function makeRoundShell(
  key: CompetitionRoundKey,
  title: string,
  position: number,
  dimensions: CompetitionDimension[],
  dimensionMax: number,
  options: {
    status?: 'draft' | 'open' | 'closed'
    trimExtremes?: boolean
    advanceMode?: 'rank' | 'duel'
    entries?: CompetitionRoundEntry[]
    scores?: CompetitionScore[]
    judges?: CompetitionRoundView['judges']
    duelPairs?: CompetitionRoundView['duelPairs']
  } = {}
): CompetitionRoundView {
  return {
    id: `round-${key}`,
    key,
    title,
    position,
    status: options.status ?? 'closed',
    judgeCount: options.judges?.length ?? 3,
    advanceCount: key === 'prelim' ? 30 : key === 'final' ? 6 : null,
    advanceMode: options.advanceMode ?? 'rank',
    rosterConfirmedAt: null,
    resultQueryOpen: false,
    scorePrecision: 'decimal',
    dimensions,
    dimensionMax,
    maxTotal: competitionMaxTotal(dimensions, dimensionMax),
    trimExtremes: options.trimExtremes ?? false,
    activeDay: null,
    createdAt: 1000,
    updatedAt: 1000,
    entries: options.entries ?? [],
    judges: options.judges ?? [],
    scores: options.scores ?? [],
    hasScores: (options.scores?.length ?? 0) > 0,
    sequential: false,
    current: null,
    duelPairs: options.duelPairs ?? []
  }
}

function makeEntry(
  singer: CompetitionSinger,
  sortOrder: number,
  average: number | null,
  scoreCount: number,
  rank: number | null,
  options: {
    qualified?: boolean
    forfeited?: boolean
    pairNo?: number | null
    pairSlot?: number | null
  } = {}
): CompetitionRoundEntry {
  return {
    id: `entry-${singer.id}-${sortOrder}`,
    singer: {
      id: singer.id,
      name: singer.name,
      song: singer.song,
      className: singer.className,
      remark: null,
      sortOrder: singer.sortOrder,
      photoUrl: null,
      photoUpdatedAt: null,
      createdAt: 1000,
      updatedAt: 1000
    },
    sortOrder,
    contestDay: null,
    checkedInAt: 1000,
    song: singer.song,
    accompaniment: null,
    accompanimentUpdatedAt: null,
    advanced: options.qualified ? 1 : null,
    pairNo: options.pairNo ?? null,
    pairSlot: options.pairSlot ?? null,
    advancedFromRank: null,
    average,
    scoreCount,
    rank,
    qualified: options.qualified ?? false,
    forfeited: options.forfeited ?? false
  }
}

function makePayload(
  singers: CompetitionSinger[],
  rounds: CompetitionRoundView[],
  eventDimensions: CompetitionDimension[] = DEFAULT_COMPETITION_DIMENSIONS
): CompetitionAdminPayload {
  return {
    event: {
      id: 'event-1',
      contentId: 'content-1',
      clubName: '音乐协会',
      clubSlug: 'music-association',
      title: '新声歌手大赛',
      registrationOpen: true,
      edition: PINNED_EDITION,
      trimExtremes: false,
      isCurrent: true,
      reminderSubject: '',
      qqGroupUrl: '',
      reminderBody: '',
      schedule: [],
      formFields: [],
      dimensions: eventDimensions,
      maxTotal: competitionMaxTotal(eventDimensions, 10),
      createdAt: 1000,
      updatedAt: 1000
    },
    singers,
    rounds,
    email: {
      templates: {} as CompetitionAdminPayload['email']['templates'],
      stats: {} as CompetitionAdminPayload['email']['stats'],
      latest: [],
      images: []
    },
    preRegistrations: [],
    advance: {},
    receipts: {},
    editions: [],
    popularity: {
      settings: {
        enabled: false,
        title: '人气奖',
        subtitle: '',
        opensAt: null,
        closesAt: null,
        allowChange: false,
        maxChanges: 1,
        qrRotateSeconds: 30,
        showResults: false,
        displayKey: 'key',
        updatedAt: 1000
      },
      candidates: [],
      totalVotes: 0,
      results: [],
      riskVotes: 0,
      status: 'disabled',
      updatedAt: 1000
    }
  }
}

function buildScore(
  roundId: string,
  singerId: string,
  judgeId: string,
  judgeName: string,
  dimensions: CompetitionDimension[],
  values: Record<string, number>,
  dimensionMax: number
): CompetitionScore {
  const total = calculateCompetitionTotal(dimensions, values, dimensionMax)
  return {
    id: `${roundId}-${singerId}-${judgeId}`,
    roundId,
    singerId,
    judgeId,
    judgeName,
    dimensions: dimensions.map(dim => ({
      key: dim.key,
      label: dim.label,
      weight: dim.weight,
      score: values[dim.key] ?? 0
    })),
    total,
    comment: '',
    updatedAt: 1000
  }
}

test('跨量纲综合实力算法：初赛 50 分制 + 复赛 100 分制评分表与四维子分精确计算', () => {
  const prelimDims: CompetitionDimension[] = [
    { key: 'pitch', label: '音准', weight: 20 },
    { key: 'rhythm', label: '节奏', weight: 20 },
    { key: 'emotion', label: '情感', weight: 20 },
    { key: 'timbre', label: '音色', weight: 20 },
    { key: 'stage', label: '舞台表现', weight: 20 }
  ]
  const semiDims: CompetitionDimension[] = [
    { key: 'pitch', label: '音准', weight: 30, max: 30 },
    { key: 'rhythm', label: '节奏', weight: 20, max: 20 },
    { key: 'emotion', label: '情感', weight: 25, max: 25 },
    { key: 'stage', label: '舞台表现', weight: 25, max: 25 }
  ]

  const singers = [
    makeSinger('s1', '林星河', 1, '光亮'),
    makeSinger('s2', '陈若溪', 2, '如愿'),
    makeSinger('s3', '周子墨', 3, '起风了')
  ]

  // 初赛（满分 50）：s1=47(94%), s2=42(84%), s3=35(70%)
  const prelimScores: CompetitionScore[] = [
    buildScore('round-prelim', 's1', 'j1', '评委1', prelimDims, { pitch: 9.5, rhythm: 9.5, emotion: 9.5, timbre: 9.5, stage: 9 }, 10),
    buildScore('round-prelim', 's1', 'j2', '评委2', prelimDims, { pitch: 9.5, rhythm: 9, emotion: 9.5, timbre: 9.5, stage: 9.5 }, 10),
    buildScore('round-prelim', 's2', 'j1', '评委1', prelimDims, { pitch: 8.5, rhythm: 8.5, emotion: 8.5, timbre: 8.5, stage: 8 }, 10),
    buildScore('round-prelim', 's2', 'j2', '评委2', prelimDims, { pitch: 8, rhythm: 8.5, emotion: 8.5, timbre: 8.5, stage: 8.5 }, 10),
    buildScore('round-prelim', 's3', 'j1', '评委1', prelimDims, { pitch: 7, rhythm: 7, emotion: 7, timbre: 7, stage: 7 }, 10),
    buildScore('round-prelim', 's3', 'j2', '评委2', prelimDims, { pitch: 7, rhythm: 7, emotion: 7, timbre: 7, stage: 7 }, 10)
  ]

  // 复赛（满分 100，开启去极值）：s1 均分 93，s2 均分 90（强势上升），s3 均分 72
  const semiScores: CompetitionScore[] = [
    // s1: 3 评委 -> 96, 93, 90 (去极值后=93)
    buildScore('round-semi', 's1', 'sj1', '复赛评委1', semiDims, { pitch: 29, rhythm: 19, emotion: 24, stage: 24 }, 30),
    buildScore('round-semi', 's1', 'sj2', '复赛评委2', semiDims, { pitch: 28, rhythm: 19, emotion: 23, stage: 23 }, 30),
    buildScore('round-semi', 's1', 'sj3', '复赛评委3', semiDims, { pitch: 27, rhythm: 18, emotion: 22, stage: 23 }, 30),
    // s2: 3 评委 -> 91, 90, 89 (去极值后=90，一致性极高)
    buildScore('round-semi', 's2', 'sj1', '复赛评委1', semiDims, { pitch: 27, rhythm: 19, emotion: 23, stage: 22 }, 30),
    buildScore('round-semi', 's2', 'sj2', '复赛评委2', semiDims, { pitch: 27, rhythm: 18, emotion: 23, stage: 22 }, 30),
    buildScore('round-semi', 's2', 'sj3', '复赛评委3', semiDims, { pitch: 26, rhythm: 18, emotion: 23, stage: 22 }, 30),
    // s3: 3 评委 -> 72, 72, 72
    buildScore('round-semi', 's3', 'sj1', '复赛评委1', semiDims, { pitch: 22, rhythm: 14, emotion: 18, stage: 18 }, 30),
    buildScore('round-semi', 's3', 'sj2', '复赛评委2', semiDims, { pitch: 22, rhythm: 14, emotion: 18, stage: 18 }, 30),
    buildScore('round-semi', 's3', 'sj3', '复赛评委3', semiDims, { pitch: 22, rhythm: 14, emotion: 18, stage: 18 }, 30)
  ]

  const prelimRound = makeRoundShell('prelim', '初赛', 1, prelimDims, 10, {
    entries: [
      makeEntry(singers[0]!, 1, 47, 2, 1, { qualified: true }),
      makeEntry(singers[1]!, 2, 42, 2, 2, { qualified: true }),
      makeEntry(singers[2]!, 3, 35, 2, 3, { qualified: true })
    ],
    scores: prelimScores,
    judges: [
      { id: 'j1', roundId: 'round-prelim', username: 'j1', displayName: '评委1', isActive: true, day: null, lastLoginAt: null, createdAt: 1, scoreCount: 3 },
      { id: 'j2', roundId: 'round-prelim', username: 'j2', displayName: '评委2', isActive: true, day: null, lastLoginAt: null, createdAt: 1, scoreCount: 3 }
    ]
  })
  const semiRound = makeRoundShell('semi', '复赛', 2, semiDims, 30, {
    trimExtremes: true,
    entries: [
      makeEntry(singers[0]!, 1, 93, 3, 1, { qualified: true }),
      makeEntry(singers[1]!, 2, 90, 3, 2, { qualified: true }),
      makeEntry(singers[2]!, 3, 72, 3, 3, { qualified: false })
    ],
    scores: semiScores,
    judges: [
      { id: 'sj1', roundId: 'round-semi', username: 'sj1', displayName: '复赛评委1', isActive: true, day: null, lastLoginAt: null, createdAt: 1, scoreCount: 3 },
      { id: 'sj2', roundId: 'round-semi', username: 'sj2', displayName: '复赛评委2', isActive: true, day: null, lastLoginAt: null, createdAt: 1, scoreCount: 3 },
      { id: 'sj3', roundId: 'round-semi', username: 'sj3', displayName: '复赛评委3', isActive: true, day: null, lastLoginAt: null, createdAt: 1, scoreCount: 3 }
    ]
  })
  const finalRound = makeRoundShell('final', '决赛', 3, semiDims, 30, { status: 'draft', advanceMode: 'duel' })
  const final2Round = makeRoundShell('final2', '决赛·第二轮', 4, semiDims, 30, { status: 'draft' })

  const report = computeCompetitionAnalytics(makePayload(singers, [prelimRound, semiRound, finalRound, final2Round]))

  assert.equal(report.overview.singerTotal, 3)
  assert.equal(report.overview.ratedCount, 3)
  assert.equal(report.profiles[0]!.singer.id, 's1')
  assert.equal(report.profiles[1]!.singer.id, 's2')
  assert.equal(report.profiles[2]!.singer.id, 's3')

  const s1 = report.profilesById.s1!
  assert.equal(s1.power.completeness, 'both')
  assert.equal(s1.power.prelimWeight, 0.35)
  assert.equal(s1.power.semiWeight, 0.65)
  assert.equal(s1.power.prelim?.percentScore, 94)
  assert.equal(s1.power.semi?.percentScore, 93)
  // baseScore = 0.35 * 94 + 0.65 * 93 = 93.35
  assert.equal(s1.power.baseScore, 93.35)
  assert.ok((s1.power.powerScore ?? 0) >= 90)
  assert.equal(s1.power.tier, 'S')
  assert.equal(s1.power.powerRank, 1)
  // 维度按 label 归并后应保留 5 项（音准、节奏、情感、音色、舞台表现）
  assert.equal(s1.power.skillProfile.length, 5)
  const s1Pitch = s1.power.skillProfile.find(item => item.label === '音准')!
  assert.equal(s1Pitch.prelimRate, 95)
  // s1 复赛音准：29/30=96.67, 28/30=93.33, 27/30=90 -> 去极值后中间值 93.33%
  assert.equal(s1Pitch.semiRate, 93.33)

  const s2 = report.profilesById.s2!
  // s2 从 84% 升至 90%，成长势能必须高于 75 中性线
  assert.ok((s2.power.momentumScore ?? 0) > 80)
  assert.equal(s2.power.deltaPercent, 6)
  assert.equal(s2.power.powerRank, 2)

  // 评委尺度统计应输出完整
  assert.equal(report.roundStats.semi.judges.length, 3)
  assert.equal(report.roundStats.semi.maxTotal, 100)
  assert.ok(report.roundStats.semi.judges[0]!.biasFromRound !== null)
})

test('边界场景：空赛事、单人成轮、单轮缺失与 1v1 预测标签及爆冷判定', () => {
  // 空赛事不报错
  const emptyReport = computeCompetitionAnalytics(makePayload([], [
    makeRoundShell('prelim', '初赛', 1, DEFAULT_COMPETITION_DIMENSIONS, 10, { status: 'draft' }),
    makeRoundShell('semi', '复赛', 2, DEFAULT_COMPETITION_DIMENSIONS, 10, { status: 'draft' }),
    makeRoundShell('final', '决赛', 3, DEFAULT_COMPETITION_DIMENSIONS, 10, { status: 'draft' }),
    makeRoundShell('final2', '决赛·第二轮', 4, DEFAULT_COMPETITION_DIMENSIONS, 10, { status: 'draft' })
  ]))
  assert.equal(emptyReport.overview.singerTotal, 0)
  assert.equal(emptyReport.overview.ratedCount, 0)
  assert.equal(emptyReport.profiles.length, 0)

  // 单人成轮（σ=0）+ 单评委 + 仅初赛/仅复赛/无分
  const singers = [
    makeSinger('only-p', '仅初赛', 1),
    makeSinger('only-s', '仅复赛', 2),
    makeSinger('none', '缺赛者', 3)
  ]
  const prelim = makeRoundShell('prelim', '初赛', 1, DEFAULT_COMPETITION_DIMENSIONS, 10, {
    entries: [
      makeEntry(singers[0]!, 1, 45, 1, 1, { qualified: false }),
      makeEntry(singers[2]!, 2, null, 0, null, { forfeited: true })
    ],
    scores: [
      buildScore('round-prelim', 'only-p', 'j1', '评委1', DEFAULT_COMPETITION_DIMENSIONS, { pitch: 9, rhythm: 9, emotion: 9, timbre: 9, stage: 9 }, 10)
    ]
  })
  const semi = makeRoundShell('semi', '复赛', 2, DEFAULT_COMPETITION_DIMENSIONS, 20, {
    entries: [
      makeEntry(singers[1]!, 1, 88, 1, 1, { qualified: true })
    ],
    scores: [
      buildScore('round-semi', 'only-s', 'j2', '评委2', DEFAULT_COMPETITION_DIMENSIONS, { pitch: 18, rhythm: 17, emotion: 18, timbre: 17, stage: 18 }, 20)
    ]
  })
  const report = computeCompetitionAnalytics(makePayload(singers, [prelim, semi]))

  const pOnly = report.profilesById['only-p']!
  assert.equal(pOnly.power.completeness, 'prelim_only')
  assert.equal(pOnly.power.prelim?.zScore, 0)
  assert.equal(pOnly.power.prelim?.percentile, 100)
  assert.equal(pOnly.power.stabilityScore, 85)
  assert.equal(pOnly.power.momentumScore, 75)

  const sOnly = report.profilesById['only-s']!
  assert.equal(sOnly.power.completeness, 'semi_only')
  assert.equal(sOnly.power.baseScore, 88)

  const none = report.profilesById.none!
  assert.equal(none.power.completeness, 'none')
  assert.equal(none.power.hasRating, false)
  assert.equal(none.power.powerScore, null)
  assert.equal(none.power.tier, '—')
  assert.equal(none.currentStageLabel, '初赛弃权')

  // 1v1 预测函数边界与标签
  assert.equal(powerTierOf(null).tier, '—')
  assert.equal(powerTierOf(91).tier, 'S')
  assert.equal(powerTierOf(85).tier, 'A+')
  assert.equal(powerTierOf(80).tier, 'A')
  assert.equal(powerTierOf(75).tier, 'B+')
  assert.equal(powerTierOf(65).tier, 'B')
  assert.equal(powerTierOf(60).tier, 'C')

  const clash = predictDuelWinProbability(88, 86, { pairNo: 1 })
  assert.equal(clash.tag, '强强焦点组')
  assert.equal((clash.leftWinProb ?? 0) + (clash.rightWinProb ?? 0), 100)

  const even = predictDuelWinProbability(76, 75, { pairNo: 2 })
  assert.equal(even.tag, '势均力敌')

  const dominant = predictDuelWinProbability(90, 78, {
    pairNo: 3,
    leftEntryId: 'eL',
    rightEntryId: 'eR',
    winnerEntryId: 'eR'
  })
  assert.equal(dominant.tag, '优势明显')
  assert.equal(dominant.upset, true)

  const missing = predictDuelWinProbability(85, null, { pairNo: 4 })
  assert.equal(missing.tag, '实力数据待补')
  assert.equal(missing.leftWinProb, null)
})

test('评委分歧收缩：sigma 越大胜率越靠 50%，置信度越低，不传 sigma 则与旧行为一致', () => {
  const base = predictDuelWinProbability(88, 80, { pairNo: 1 })
  const wideSigma = predictDuelWinProbability(88, 80, {
    pairNo: 1,
    leftSigma: 12,
    rightSigma: 14
  })

  // 不传 sigma：完全走纯实力分模型。
  assert.equal(base.volatility, '未知')
  assert.equal(base.confidence, 55)
  assert.ok((base.leftWinProb ?? 0) > 60)

  // 传了大分歧：领先方概率被拉回中间，但双方仍互补为 100。
  assert.ok((wideSigma.leftWinProb ?? 0) < (base.leftWinProb ?? 0))
  assert.ok((wideSigma.leftWinProb ?? 0) > 50)
  assert.equal((wideSigma.leftWinProb ?? 0) + (wideSigma.rightWinProb ?? 0), 100)
  assert.equal(wideSigma.volatility, '波动')
  assert.ok(wideSigma.confidence < base.confidence)

  // 分歧很小：基本保持原判，置信度高。
  const tight = predictDuelWinProbability(88, 80, { pairNo: 1, leftSigma: 1, rightSigma: 1 })
  assert.equal(tight.volatility, '稳定')
  assert.ok(tight.confidence > 80)
  assert.ok(Math.abs((tight.leftWinProb ?? 0) - (base.leftWinProb ?? 0)) <= 2)

  // 只给单边 sigma 时不收缩：单边数据会把系数拉偏，宁可不缩。
  const oneSide = predictDuelWinProbability(88, 80, { pairNo: 1, leftSigma: 20 })
  assert.equal(oneSide.leftWinProb, base.leftWinProb)
  assert.equal(oneSide.volatility, '未知')
})

test('singerSpreadSigma：按轮次权重加权评委标准差，缺一轮不会算成 0', () => {
  const both = {
    power: {
      prelimWeight: 0.35,
      semiWeight: 0.65,
      prelim: { judgeStdDev: 2 },
      semi: { judgeStdDev: 6 }
    }
  } as unknown as SingerAnalyticsProfile
  // 初赛 σ=2（权重 0.35）、复赛 σ=6（权重 0.65）→ 2*0.35 + 6*0.65 = 4.6
  assert.equal(singerSpreadSigma(both), 4.6)

  const semiOnly = {
    power: { prelimWeight: 0, semiWeight: 1, prelim: null, semi: { judgeStdDev: 5.5 } }
  } as unknown as SingerAnalyticsProfile
  assert.equal(singerSpreadSigma(semiOnly), 5.5)

  const noData = {
    power: { prelimWeight: 0, semiWeight: 0, prelim: null, semi: null }
  } as unknown as SingerAnalyticsProfile
  assert.equal(singerSpreadSigma(noData), null)
})

test('真实 SQLite 集成测试：12 名选手跑通初赛、复赛与决赛 1v1 抽签后的完整数据可视化与对阵预测', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-analytics-int-'))
  const dbPath = join(directory, 'test.sqlite')
  const client: DatabaseClient = getDatabase(dbPath)
  try {
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

    const created = ensureCompetitionEvent(client, contentId)
    updateCompetitionEvent(client, created, {
      title: '新声歌手大赛',
      edition: PINNED_EDITION,
      registrationOpen: true,
      dimensions: DEFAULT_COMPETITION_DIMENSIONS
    })
    const event = ensureCompetitionEvent(client, contentId)

    const singers = Array.from({ length: 12 }, (_, index) => createSinger(client, event.id, {
      name: `决赛种子${index + 1}`,
      song: `初赛曲目${index + 1}`,
      className: '25音乐学1班',
      studentNo: `2026${String(index + 1).padStart(4, '0')}`,
      qq: `400001${String(index + 1).padStart(2, '0')}`
    }))

    // 初赛开放：12 人签到 + 2 名评委差异化评分
    let prelim = updateRound(client, getRoundByKey(client, event.id, 'prelim'), {
      status: 'open',
      advanceCount: 12
    })
    let payload = getAdminCompetitionPayload(client, contentId)
    for (const entry of payload.rounds.find(r => r.key === 'prelim')!.entries) {
      setEntryCheckIn(client, prelim, entry.id, true)
    }
    const prelimJudges = await createJudgeAccounts(client, prelim, 2)
    singers.forEach((singer, index) => {
      const base = 9.5 - index * 0.25
      const scores = Object.fromEntries(DEFAULT_COMPETITION_DIMENSIONS.map(d => [d.key, Math.max(5, Math.min(10, base))]))
      for (const judge of prelimJudges) {
        submitJudgeScore(client, { ...judge, eventId: event.id, roundId: prelim.id }, singer.id, { scores })
      }
    })
    prelim = updateRound(client, getRoundByKey(client, event.id, 'prelim'), { status: 'closed' })
    assert.equal(confirmAdvanceRoster(client, prelim).advanced, 12)

    // 复赛开放：20 分制（满分 100），2 名评委差异化评分
    let semi = updateRound(client, getRoundByKey(client, event.id, 'semi'), {
      status: 'open',
      advanceCount: 12,
      dimensionMax: 20
    })
    payload = getAdminCompetitionPayload(client, contentId)
    for (const entry of payload.rounds.find(r => r.key === 'semi')!.entries) {
      setEntryCheckIn(client, semi, entry.id, true)
    }
    const semiJudges = await createJudgeAccounts(client, semi, 2)
    singers.forEach((singer, index) => {
      const base = 19 - index * 0.5
      const scores = Object.fromEntries(DEFAULT_COMPETITION_DIMENSIONS.map(d => [d.key, Math.max(10, Math.min(20, base))]))
      for (const judge of semiJudges) {
        submitJudgeScore(client, { ...judge, eventId: event.id, roundId: semi.id }, singer.id, { scores })
      }
    })
    semi = updateRound(client, getRoundByKey(client, event.id, 'semi'), { status: 'closed' })
    assert.equal(confirmAdvanceRoster(client, semi).advanced, 12)

    // 决赛切为 1v1 抽签分组
    const finalRound = updateRound(client, getRoundByKey(client, event.id, 'final'), {
      status: 'open',
      advanceMode: 'duel'
    })
    drawFinalPairs(client, finalRound)

    const finalPayload = getAdminCompetitionPayload(client, contentId)
    const report = computeCompetitionAnalytics(finalPayload)

    assert.equal(report.overview.singerTotal, 12)
    assert.equal(report.overview.ratedCount, 12)
    assert.equal(report.overview.finalCount, 12)
    assert.equal(report.overview.duelTotalCount, 6)
    assert.equal(Object.keys(report.duelPredictions).length, 6)
    assert.equal(report.funnel.find(stage => stage.key === 'final')?.count, 12)

    // 每组对阵的左右两位选手都能取到基于前两轮的综合实力评分与胜率
    const finalView = finalPayload.rounds.find(r => r.key === 'final')!
    for (const pair of finalView.duelPairs) {
      const pred = report.duelPredictions[pair.pairNo]!
      assert.ok(pred)
      assert.ok(pred.leftPower !== null && pred.rightPower !== null)
      assert.equal((pred.leftWinProb ?? 0) + (pred.rightWinProb ?? 0), 100)
      for (const entry of pair.entries) {
        const profile = report.profilesById[entry.singer.id]!
        assert.ok(profile.power.hasRating)
        assert.equal(profile.power.completeness, 'both')
        assert.equal(profile.finalPairNo, pair.pairNo)
      }
    }
  } finally {
    closeDatabase(dbPath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('fast-check 性质 1：任意前两轮随机评分下，实力总分、四维子分与维度得分率恒有界且有限', () => {
  const dims = DEFAULT_COMPETITION_DIMENSIONS
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 12 }),
      fc.integer({ min: 1, max: 4 }),
      fc.array(fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }), { minLength: 48, maxLength: 48 }),
      fc.array(fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true }), { minLength: 48, maxLength: 48 }),
      fc.boolean(),
      (singerCount, judgeCount, prelimPool, semiPool, trimExtremes) => {
        const singers = Array.from({ length: singerCount }, (_, i) => makeSinger(`p-${i}`, `选手${i}`, i + 1))
        const prelimScores: CompetitionScore[] = []
        const semiScores: CompetitionScore[] = []
        const prelimEntries: CompetitionRoundEntry[] = []
        const semiEntries: CompetitionRoundEntry[] = []

        singers.forEach((singer, sIdx) => {
          const pTotals: number[] = []
          const sTotals: number[] = []
          for (let j = 0; j < judgeCount; j += 1) {
            const pVal = roundCompetitionScore(prelimPool[(sIdx * judgeCount + j) % prelimPool.length]!)
            const pMap = Object.fromEntries(dims.map(d => [d.key, pVal]))
            const pScore = buildScore('round-prelim', singer.id, `pj-${j}`, `P${j}`, dims, pMap, 10)
            prelimScores.push(pScore)
            pTotals.push(pScore.total)

            const sVal = roundCompetitionScore(semiPool[(sIdx * judgeCount + j) % semiPool.length]!)
            const sMap = Object.fromEntries(dims.map(d => [d.key, sVal]))
            const sScore = buildScore('round-semi', singer.id, `sj-${j}`, `S${j}`, dims, sMap, 20)
            semiScores.push(sScore)
            sTotals.push(sScore.total)
          }
          const avgP = roundCompetitionScore(pTotals.reduce((a, b) => a + b, 0) / pTotals.length)
          const avgS = roundCompetitionScore(sTotals.reduce((a, b) => a + b, 0) / sTotals.length)
          prelimEntries.push(makeEntry(singer, sIdx + 1, avgP, judgeCount, null))
          semiEntries.push(makeEntry(singer, sIdx + 1, avgS, judgeCount, null))
        })

        const report = computeCompetitionAnalytics(makePayload(singers, [
          makeRoundShell('prelim', '初赛', 1, dims, 10, { trimExtremes, entries: prelimEntries, scores: prelimScores }),
          makeRoundShell('semi', '复赛', 2, dims, 20, { trimExtremes, entries: semiEntries, scores: semiScores })
        ]))

        for (const profile of report.profiles) {
          const { power } = profile
          assert.equal(power.hasRating, true)
          for (const field of [power.powerScore, power.baseScore, power.dominanceScore, power.stabilityScore, power.momentumScore]) {
            assert.ok(field !== null && Number.isFinite(field))
            assert.ok(field >= 0 && field <= 100, `out of range: ${field}`)
          }
          for (const axis of power.skillProfile) {
            assert.ok(Number.isFinite(axis.rate) && axis.rate >= 0 && axis.rate <= 100)
          }
        }
      }
    ),
    { numRuns: 120 }
  )
})

test('fast-check 性质 2：1v1 预测胜率满足互补性、区间有界与相对大小单调性', () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      (powerA, powerB) => {
        const pred = predictDuelWinProbability(powerA, powerB, { pairNo: 1 })
        assert.ok(pred.leftWinProb !== null && pred.rightWinProb !== null)
        assert.equal(pred.leftWinProb + pred.rightWinProb, 100)
        assert.ok(pred.leftWinProb >= 5 && pred.leftWinProb <= 95)
        assert.ok(pred.rightWinProb >= 5 && pred.rightWinProb <= 95)
        if (powerA >= powerB) {
          assert.ok(pred.leftWinProb >= pred.rightWinProb)
        } else {
          assert.ok(pred.rightWinProb >= pred.leftWinProb)
        }
      }
    ),
    { numRuns: 300 }
  )
})

test('fast-check 性质 3：固定其他选手时，同步提高目标选手初复赛打分（未触顶）综合实力单调不减', () => {
  const dims = DEFAULT_COMPETITION_DIMENSIONS
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 8 }),
      fc.double({ min: 2, max: 7, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 4, max: 14, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.2, max: 2.5, noNaN: true, noDefaultInfinity: true }),
      (otherCount, pBaseRaw, sBaseRaw, boostPctStep) => {
        const pBase = roundCompetitionScore(pBaseRaw)
        const sBase = roundCompetitionScore(sBaseRaw)
        const pBoost = Math.min(10, roundCompetitionScore(pBase + boostPctStep))
        const sBoost = Math.min(20, roundCompetitionScore(sBase + boostPctStep * 2))

        const buildCase = (targetPrelimDim: number, targetSemiDim: number) => {
          const singers = [
            makeSinger('target', '目标选手', 1),
            ...Array.from({ length: otherCount }, (_, i) => makeSinger(`other-${i}`, `对手${i}`, i + 2))
          ]
          const prelimScores: CompetitionScore[] = []
          const semiScores: CompetitionScore[] = []
          const prelimEntries: CompetitionRoundEntry[] = []
          const semiEntries: CompetitionRoundEntry[] = []

          singers.forEach((singer, idx) => {
            const pDim = idx === 0 ? targetPrelimDim : roundCompetitionScore(4 + (idx % 5))
            const sDim = idx === 0 ? targetSemiDim : roundCompetitionScore(8 + (idx % 9))
            const pScore = buildScore('round-prelim', singer.id, 'j1', 'P1', dims, Object.fromEntries(dims.map(d => [d.key, pDim])), 10)
            const sScore = buildScore('round-semi', singer.id, 'j2', 'S1', dims, Object.fromEntries(dims.map(d => [d.key, sDim])), 20)
            prelimScores.push(pScore)
            semiScores.push(sScore)
            prelimEntries.push(makeEntry(singer, idx + 1, pScore.total, 1, null))
            semiEntries.push(makeEntry(singer, idx + 1, sScore.total, 1, null))
          })

          return computeCompetitionAnalytics(makePayload(singers, [
            makeRoundShell('prelim', '初赛', 1, dims, 10, { entries: prelimEntries, scores: prelimScores }),
            makeRoundShell('semi', '复赛', 2, dims, 20, { entries: semiEntries, scores: semiScores })
          ])).profilesById.target!.power.powerScore!
        }

        const before = buildCase(pBase, sBase)
        const after = buildCase(pBoost, sBoost)
        assert.ok(after + 1e-6 >= before, `expected monotonic non-decreasing: before=${before}, after=${after}`)
      }
    ),
    { numRuns: 200 }
  )
})

test('强弱项按相对全场平均判断：全场都低分的维度不会变成所有人的短板', () => {
  const dims: CompetitionDimension[] = [
    { key: 'pitch', label: '音准', weight: 50 },
    { key: 'stage', label: '舞台表现', weight: 50 }
  ]
  const singers = [
    makeSinger('s1', '甲', 1),
    makeSinger('s2', '乙', 2),
    makeSinger('s3', '丙', 3)
  ]
  // 舞台表现这一维度全场只给到 55–65，音准全场 85–95：
  // 按绝对分取最低，三个人都会被标成「舞台表现」，那不是个人短板，是维度难度。
  const prelim = makeRoundShell('prelim', '初赛', 1, dims, 100, {
    entries: [
      makeEntry(singers[0]!, 1, 75, 1, 2),
      makeEntry(singers[1]!, 2, 75, 1, 2),
      makeEntry(singers[2]!, 3, 75, 1, 2)
    ],
    scores: [
      buildScore('round-prelim', 's1', 'j1', '评委1', dims, { pitch: 85, stage: 65 }, 100),
      buildScore('round-prelim', 's2', 'j1', '评委1', dims, { pitch: 95, stage: 55 }, 100),
      buildScore('round-prelim', 's3', 'j1', '评委1', dims, { pitch: 90, stage: 60 }, 100)
    ]
  })
  const report = computeCompetitionAnalytics(makePayload(singers, [prelim], dims))

  const first = report.profilesById.s1!
  assert.equal(first.power.weakSpot?.label, '音准')
  assert.equal(first.power.topStrength?.label, '舞台表现')

  const second = report.profilesById.s2!
  assert.equal(second.power.weakSpot?.label, '舞台表现')
  assert.equal(second.power.topStrength?.label, '音准')

  // 正好踩在全场平均上的选手，差距不足阈值，两头都不贴标签。
  const third = report.profilesById.s3!
  assert.equal(third.power.weakSpot, null)
  assert.equal(third.power.topStrength, null)
})
