import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decideThirdPartyStatus,
  normalizeIpCidr,
  scoreThirdPartyVote,
  type ThirdPartyVoteRow
} from '../server/modules/vote-sync/risk'
import { normalizeJinshujuEntry } from '../server/modules/vote-sync/jinshuju-map'
import { computeThirdPartyContext, estimateBaselinePerMinute, type VoteWindowSample } from '../server/modules/vote-sync/window'
import { buildThirdPartyRanking, type RankingCandidate } from '../server/modules/vote-sync/ranking'

const baseRow: ThirdPartyVoteRow = {
  recordId: 'rec_1',
  optionId: 'singer_a',
  voterRef: 'voter_1',
  ip: '203.0.113.10',
  uaSummary: 'iOS/WeChat',
  votedAt: 1_790_000_000_000,
  uaFingerprint: null,
  fillSeconds: 30
}

const cleanCtx = {
  sameIpWindow: 1,
  sameVoterWindow: 1,
  burstWindow: 3,
  baselinePerMinute: 3,
  votedIntervalMs: 60_000
}

test('干净票得 0 分并计入有效票', () => {
  const result = scoreThirdPartyVote(baseRow, cleanCtx)
  assert.equal(result.score, 0)
  assert.deepEqual(result.flags, [])
  assert.equal(decideThirdPartyStatus(result.score), 'valid')
})

test('同 IP 段 10 分钟内超过 3 票命中 ip_cluster', () => {
  const result = scoreThirdPartyVote(baseRow, { ...cleanCtx, sameIpWindow: 4 })
  assert.equal(result.score, 25)
  assert.deepEqual(result.flags, ['ip_cluster'])
})

test('同 IP 段超过 8 票叠加 ip_heavy', () => {
  const result = scoreThirdPartyVote(baseRow, { ...cleanCtx, sameIpWindow: 9 })
  assert.equal(result.score, 40)
  assert.deepEqual(result.flags, ['ip_cluster', 'ip_heavy'])
})

test('同一平台账号重复投票直接进入待审', () => {
  const result = scoreThirdPartyVote(baseRow, { ...cleanCtx, sameVoterWindow: 2 })
  assert.equal(result.score, 40)
  assert.ok(result.flags.includes('voter_repeat'))
  assert.equal(decideThirdPartyStatus(result.score), 'valid')
})

test('重复投票叠加机房 IP 触发作废阈值', () => {
  const result = scoreThirdPartyVote(
    { ...baseRow, ip: '47.96.12.34' },
    { ...cleanCtx, sameVoterWindow: 2 }
  )
  assert.equal(result.score, 70)
  assert.deepEqual(result.flags, ['voter_repeat', 'idc_ip'])
  assert.equal(decideThirdPartyStatus(result.score), 'watch')
})

test('短时爆发按基线倍数判定', () => {
  const result = scoreThirdPartyVote(baseRow, {
    ...cleanCtx,
    burstWindow: 40,
    baselinePerMinute: 3
  })
  assert.equal(result.score, 20)
  assert.deepEqual(result.flags, ['burst'])
})

test('缺少平台用户标识记无身份分', () => {
  const result = scoreThirdPartyVote({ ...baseRow, voterRef: null }, cleanCtx)
  assert.equal(result.score, 10)
  assert.deepEqual(result.flags, ['no_identity'])
})

test('投票间隔过短命中 fast_interval', () => {
  const result = scoreThirdPartyVote(baseRow, { ...cleanCtx, votedIntervalMs: 900 })
  assert.equal(result.score, 15)
  assert.deepEqual(result.flags, ['fast_interval'])
})

test('填写时长低于阈值视作脚本行为', () => {
  const result = scoreThirdPartyVote({ ...baseRow, fillSeconds: 2 }, cleanCtx)
  assert.equal(result.score, 20)
  assert.deepEqual(result.flags, ['fast_fill'])
})

test('分数上限 100 且阈值映射稳定', () => {
  const result = scoreThirdPartyVote(
    { ...baseRow, voterRef: null, ip: '47.96.12.34', fillSeconds: 1 },
    { sameIpWindow: 9, sameVoterWindow: 3, burstWindow: 100, baselinePerMinute: 1, votedIntervalMs: 200 }
  )
  assert.equal(result.score, 100)
  assert.equal(decideThirdPartyStatus(0), 'valid')
  assert.equal(decideThirdPartyStatus(59), 'valid')
  assert.equal(decideThirdPartyStatus(60), 'watch')
  assert.equal(decideThirdPartyStatus(84), 'watch')
  assert.equal(decideThirdPartyStatus(85), 'void')
})

test('IPv4 归一到 /24，非法 IP 保持原样', () => {
  assert.equal(normalizeIpCidr('203.0.113.10'), '203.0.113.0/24')
  assert.equal(normalizeIpCidr('::1'), '::1')
  assert.equal(normalizeIpCidr('not-an-ip'), 'not-an-ip')
  assert.equal(normalizeIpCidr(null), null)
})

test('金数据条目归一化取 token 作为幂等键', () => {
  const row = normalizeJinshujuEntry({
    token: 'entry_abc',
    serial_number: 7,
    created_at: '2026-11-26T09:00:00.000Z',
    creator_name: '张三',
    info_remote_ip: '203.0.113.10',
    info_platform: 'iOS',
    info_os: 'iOS 18',
    info_browser: 'WeChat',
    info_filling_duration: 42,
    field_3: 'singer_a'
  }, { optionField: 'field_3' })

  assert.ok(row)
  assert.equal(row.recordId, 'entry_abc')
  assert.equal(row.optionId, 'singer_a')
  assert.equal(row.voterRef, '张三')
  assert.equal(row.ip, '203.0.113.10')
  assert.equal(row.votedAt, Date.parse('2026-11-26T09:00:00.000Z'))
  assert.equal(row.fillSeconds, 42)
  assert.equal(row.uaSummary, 'iOS/iOS 18')
})

test('金数据条目支持 {label, value} 形态并回退 serial_number', () => {
  const row = normalizeJinshujuEntry({
    serial_number: 9,
    created_at: '2026-11-26T09:00:00.000Z',
    field_3: { label: '选手甲', value: 'singer_a' }
  }, { optionField: 'field_3' })

  assert.ok(row)
  assert.equal(row.recordId, 'sn_9')
  assert.equal(row.optionId, 'singer_a')
  assert.equal(row.voterRef, null)
  assert.equal(row.ip, null)
})

test('金数据条目缺填写时长时保持 null 而不是折算成 0 秒', () => {
  const row = normalizeJinshujuEntry({
    token: 'entry_nodur',
    created_at: '2026-11-26T09:00:00.000Z',
    info_filling_duration: null,
    field_3: 'singer_a'
  }, { optionField: 'field_3' })

  assert.ok(row)
  assert.equal(row.fillSeconds, null)
})

test('金数据条目缺时间或缺选项时丢弃', () => {
  assert.equal(normalizeJinshujuEntry({ token: 'a', field_3: 'x' }, { optionField: 'field_3' }), null)
  assert.equal(normalizeJinshujuEntry({
    token: 'a',
    created_at: '2026-11-26T09:00:00.000Z'
  }, { optionField: 'field_3' }), null)
  assert.equal(normalizeJinshujuEntry('not-an-object', { optionField: 'field_3' }), null)
})

const T0 = 1_790_000_000_000
const sample = (recordId: string, ipCidr: string | null, voterRef: string | null, votedAt: number): VoteWindowSample =>
  ({ recordId, ipCidr, voterRef, votedAt })

test('同 IP 段只统计 10 分钟以内的票', () => {
  const pool = [
    sample('a', '1.1.1.0/24', null, T0 - 60_000),
    sample('b', '1.1.1.0/24', null, T0 - 120_000),
    sample('c', '1.1.1.0/24', null, T0 - 180_000),
    sample('d', '1.1.1.0/24', null, T0 - 40 * 60_000)
  ]
  const ctx = computeThirdPartyContext(sample('target', '1.1.1.0/24', null, T0), pool, 3)
  assert.equal(ctx.sameIpWindow, 3)
})

test('同投票人窗口与上一条间隔', () => {
  const pool = [
    sample('a', null, '张三', T0 - 500_000),
    sample('b', null, '张三', T0 - 40_000),
    sample('c', null, '李四', T0 - 10_000)
  ]
  const ctx = computeThirdPartyContext(sample('target', null, '张三', T0), pool, 2)
  assert.equal(ctx.sameVoterWindow, 2)
  assert.equal(ctx.votedIntervalMs, 40_000)
})

test('60 秒爆发窗口只数一分钟内的票', () => {
  const pool = [
    sample('a', null, null, T0 - 10_000),
    sample('b', null, null, T0 - 20_000),
    sample('c', null, null, T0 - 90_000)
  ]
  const ctx = computeThirdPartyContext(sample('target', null, null, T0), pool, 1)
  assert.equal(ctx.burstWindow, 2)
})

test('基线按样本跨度估算', () => {
  assert.equal(estimateBaselinePerMinute([]), 0)
  assert.equal(estimateBaselinePerMinute([sample('a', null, null, T0)]), 0)
  const dense = [
    sample('a', null, null, T0),
    sample('b', null, null, T0 + 30_000),
    sample('c', null, null, T0 + 60_000)
  ]
  assert.equal(estimateBaselinePerMinute(dense), 2)
})

const rankingCandidates: RankingCandidate[] = [
  { singerId: 's1', number: 1, name: '林敬凯', className: '25 计科 1 班', photoUrl: null, song: '神探' },
  { singerId: 's2', number: 2, name: '陈静涵', className: '25 英语 2 班', photoUrl: null, song: '句号。' },
  { singerId: 's3', number: 3, name: '林艳阳', className: null, photoUrl: null, song: '世界赠予我的' }
]

test('榜单按有效票降序排出名次', () => {
  const payload = buildThirdPartyRanking({
    formToken: 'MpuE34',
    candidates: rankingCandidates,
    generatedAt: 1_700_000_000_000,
    rows: [
      { optionId: '林敬凯', status: 'valid', count: 3 },
      { optionId: '陈静涵', status: 'valid', count: 9 },
      { optionId: '林艳阳', status: 'valid', count: 5 }
    ]
  })
  assert.deepEqual(payload.entries.map(entry => entry.name), ['陈静涵', '林艳阳', '林敬凯'])
  assert.deepEqual(payload.entries.map(entry => entry.rank), [1, 2, 3])
  assert.deepEqual(payload.totals, { received: 17, valid: 17, watch: 0, voided: 0 })
})

test('同票并列名次，下一名跳号', () => {
  const payload = buildThirdPartyRanking({
    formToken: 'MpuE34',
    candidates: rankingCandidates,
    generatedAt: 0,
    rows: [
      { optionId: '林敬凯', status: 'valid', count: 4 },
      { optionId: '陈静涵', status: 'valid', count: 4 },
      { optionId: '林艳阳', status: 'valid', count: 1 }
    ]
  })
  // 并列时按出场号决定展示顺序，名次仍并列。
  assert.deepEqual(payload.entries.map(entry => entry.name), ['林敬凯', '陈静涵', '林艳阳'])
  assert.deepEqual(payload.entries.map(entry => entry.rank), [1, 1, 3])
})

test('watch 票不进排名，void 票只进总数', () => {
  const payload = buildThirdPartyRanking({
    formToken: 'MpuE34',
    candidates: rankingCandidates,
    generatedAt: 0,
    rows: [
      { optionId: '林敬凯', status: 'valid', count: 2 },
      { optionId: '林敬凯', status: 'watch', count: 5 },
      { optionId: '林敬凯', status: 'void', count: 1 },
      { optionId: '陈静涵', status: 'valid', count: 2 }
    ]
  })
  const top = payload.entries[0]!
  assert.equal(top.name, '林敬凯')
  assert.equal(top.valid, 2)
  assert.equal(top.watch, 5)
  assert.equal(top.voided, 1)
  assert.equal(top.rank, 1)
  assert.deepEqual(payload.totals, { received: 10, valid: 4, watch: 5, voided: 1 })
})

test('不在候选名单的选项保留在末尾', () => {
  const payload = buildThirdPartyRanking({
    formToken: 'MpuE34',
    candidates: rankingCandidates,
    generatedAt: 0,
    rows: [
      { optionId: '林敬凯', status: 'valid', count: 1 },
      { optionId: '往届选手', status: 'valid', count: 6 }
    ]
  })
  const tail = payload.entries[payload.entries.length - 1]!
  assert.equal(tail.name, '往届选手')
  assert.equal(tail.singerId, null)
  assert.equal(tail.number, null)
  assert.equal(tail.rank, 0)
  assert.equal(payload.entries[0]?.name, '林敬凯')
})

test('没有票时名次与占比都是 0', () => {
  const payload = buildThirdPartyRanking({
    formToken: 'MpuE34',
    candidates: rankingCandidates,
    generatedAt: 0,
    rows: []
  })
  assert.equal(payload.entries.length, 3)
  assert.ok(payload.entries.every(entry => entry.rank === 0 && entry.share === 0))
  assert.deepEqual(payload.totals, { received: 0, valid: 0, watch: 0, voided: 0 })
})

test('占比按有效票总数计算', () => {
  const payload = buildThirdPartyRanking({
    formToken: 'MpuE34',
    candidates: rankingCandidates,
    generatedAt: 0,
    rows: [
      { optionId: '林敬凯', status: 'valid', count: 3 },
      { optionId: '陈静涵', status: 'valid', count: 1 }
    ]
  })
  assert.equal(payload.entries[0]?.share, 0.75)
  assert.equal(payload.entries[1]?.share, 0.25)
  assert.equal(payload.entries[2]?.share, 0)
})
