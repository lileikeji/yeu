import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  closeDatabase,
  getDatabase,
  type DatabaseClient
} from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { competitionPopularityBallots, competitionPopularityVoteLogs, contents } from '../server/database/schema'
import {
  computePopularityGuardReport,
  moderatePopularityBallots,
  recordBlockedPopularityAttempt
} from '../server/modules/competition/popularity-guard'
import {
  maybeTriggerAutoPopularityInspection,
  preparePopularityInspection,
  runPopularityInspectionNow
} from '../server/modules/competition/popularity-inspector'
import { handleWechatMpPopularityMessage } from '../server/modules/competition/popularity-wechat'
import {
  applyPopularityAction,
  createSinger,
  ensureCompetitionEvent,
  getPopularityAdminState,
  getPopularityPublicState,
  getRoundByKey,
  recordPopularityBallot,
  updatePopularityDisplaySessionHash,
  updatePopularitySettings
} from '../server/modules/competition/service'
import {
  computePopularityWechatPasscode,
  detectAutomatedPopularityAgent,
  hasBrowserFetchMetadata,
  hasMatchingPopularityDeviceCookie,
  HYBRID_FIRST_VOTE_MIN_DWELL_MS,
  issuePopularityPageTicket,
  issuePopularityToken,
  issuePopularityWechatTicket,
  popularityIpHash,
  popularityOpenIdHash,
  summarizePopularityUserAgent,
  verifyPopularityPageTicket,
  verifyPopularityToken,
  verifyPopularityWechatPasscode,
  verifyPopularityWechatTicket
} from '../server/utils/competition-popularity'
import { hashOpaqueToken } from '../server/utils/security'
import type { H3Event } from 'h3'
import { createApp, createError, createRouter, eventHandler, getHeader, getMethod, getRequestURL, readRawBody, setHeader, toWebHandler } from 'h3'
import { handlePopularityVote } from '../server/modules/competition/popularity-vote'
import { solvePopularityVotePow } from '../shared/utils/popularity-pow'

function tempDb(): { client: DatabaseClient, path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'yeu-popularity-guard-test-'))
  const path = join(dir, 'test.sqlite')
  return { client: getDatabase(path), path }
}

function cleanup(client: DatabaseClient, path: string): void {
  closeDatabase(path)
  rmSync(join(path, '..'), { recursive: true, force: true })
}

function codeOf(error: unknown): string {
  return (error as { data?: { code?: string } }).data?.code ?? ''
}

function createEventWithSingers(client: DatabaseClient) {
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
  const singers = Array.from({ length: 3 }, (_, idx) => createSinger(client, event.id, {
    name: `选手${idx + 1}`,
    song: `曲目${idx + 1}`,
    className: '26音乐1班',
    studentNo: `2026100${idx + 1}`,
    qq: `200100${idx + 1}`
  }))
  const finalRound = getRoundByKey(client, event.id, 'final')
  const insertEntry = client.sqlite.prepare(
    'INSERT INTO competition_round_entries (id, round_id, singer_id, sort_order, song) VALUES (?, ?, ?, ?, ?)'
  )
  singers.forEach((singer, idx) => {
    insertEntry.run(randomUUID(), finalRound.id, singer.id, idx + 1, `决赛曲${idx + 1}`)
  })
  updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '现场扫码',
    opensAt: Date.now() - 5_000,
    closesAt: Date.now() + 300_000,
    allowChange: true,
    maxChanges: 2,
    votesPerVoter: 1,
    allowRepeatVote: true,
    qrRotateSeconds: 30,
    showResults: true
  })
  return { event, singers }
}

test('迁移 0086：防刷流水表、AI巡检表与扩展列就绪，pageTicket与脚本检测生效', () => {
  const { client, path } = tempDb()
  runMigrations(client)

  const tables = client.sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('competition_popularity_vote_logs', 'competition_popularity_inspections') ORDER BY name`
  ).all() as Array<{ name: string }>
  assert.deepEqual(tables.map(r => r.name), [
    'competition_popularity_inspections',
    'competition_popularity_vote_logs'
  ])

  const secret = 'guard-test-secret-0123456789abcdef'
  const eventId = randomUUID()
  const qr = issuePopularityToken(secret, eventId, 90_000)
  const verifiedQr = verifyPopularityToken(secret, qr.token)
  assert.ok(verifiedQr)
  assert.ok(verifiedQr.nonce.length > 0)
  assert.ok(verifiedQr.issuedAt && verifiedQr.issuedAt <= Date.now())

  const ticket = issuePopularityPageTicket(secret, eventId, 'device-hash-1', 0, 1_000_000)
  assert.ok(verifyPopularityPageTicket(secret, ticket, eventId, 'device-hash-1', 0, 1_002_000))
  assert.equal(verifyPopularityPageTicket(secret, ticket, eventId, 'device-hash-1', 1, 1_002_000), null)
  assert.equal(verifyPopularityPageTicket(secret, ticket, eventId, 'device-hash-other', 0, 1_002_000), null)
  assert.equal(verifyPopularityPageTicket(secret, ticket, randomUUID(), 'device-hash-1', 0, 1_002_000), null)

  assert.equal(detectAutomatedPopularityAgent('python-requests/2.31.0'), 'BOT_USER_AGENT')
  assert.equal(detectAutomatedPopularityAgent('curl/8.4.0'), 'BOT_USER_AGENT')
  assert.equal(detectAutomatedPopularityAgent(''), 'EMPTY_USER_AGENT')
  assert.equal(
    detectAutomatedPopularityAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.47'),
    null
  )
  assert.equal(
    summarizePopularityUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.47'),
    'iOS/WeChat'
  )

  const fakeCookieId = 'c'.repeat(32)
  const expectedDeviceHash = hashOpaqueToken(secret, 'competition-popularity-device', fakeCookieId)
  const fakeReqEvent = {
    node: { req: { headers: { cookie: `yeu_popularity_device=${fakeCookieId}` } } }
  } as unknown as H3Event
  const missingCookieEvent = {
    node: { req: { headers: {} } }
  } as unknown as H3Event
  assert.equal(hasMatchingPopularityDeviceCookie(fakeReqEvent, secret, expectedDeviceHash), true)
  assert.equal(hasMatchingPopularityDeviceCookie(fakeReqEvent, secret, 'mismatch-hash'), false)
  assert.equal(hasMatchingPopularityDeviceCookie(missingCookieEvent, secret, expectedDeviceHash), false)

  cleanup(client, path)
})

test('刷票预估、批量作废/恢复与作废设备锁改票联动准确', () => {
  const { client, path } = tempDb()
  runMigrations(client)
  const { event, singers } = createEventWithSingers(client)
  updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '现场扫码',
    opensAt: Date.now() - 5_000,
    closesAt: Date.now() + 300_000,
    allowChange: true,
    maxChanges: 2,
    votesPerVoter: 1,
    allowRepeatVote: true,
    qrRotateSeconds: 30,
    showResults: true,
    autoQuarantine: false
  })
  const [singerA, singerB] = singers as [typeof singers[number], typeof singers[number]]

  const sharedIp = popularityIpHash('secret-1', '198.51.100.2')
  const sharedEnv = 'env-same-phone-hash'

  // 给选手 B 投 3 张正常分散票
  for (let i = 0; i < 3; i += 1) {
    recordPopularityBallot(
      client,
      event.id,
      `clean-dev-${i}`,
      singerB.id,
      0,
      popularityIpHash('secret-1', `203.0.113.${i + 1}`),
      {
        uaSummary: 'iOS/WeChat',
        envHash: `clean-env-${i}`,
        dwellMs: 4200,
        cookiePresent: true,
        qrNonce: `qr-${i}`,
        qrAgeMs: 5000,
        qrRotateSeconds: 30
      }
    )
  }

  // 给选手 A 注入 6 张同 IP + 同硬件环境 + 无 Cookie + 极短停留的刷票
  for (let i = 0; i < 6; i += 1) {
    recordPopularityBallot(
      client,
      event.id,
      `brush-dev-${i}`,
      singerA.id,
      0,
      sharedIp,
      {
        uaSummary: 'Android/Chrome',
        envHash: sharedEnv,
        dwellMs: 650,
        cookiePresent: false,
        qrNonce: 'qr-stale-nonce',
        qrAgeMs: 80_000,
        qrRotateSeconds: 30
      }
    )
  }

  // 记录一次前置脚本拦截日志
  recordBlockedPopularityAttempt(client, event.id, {
    blockCode: 'BOT_USER_AGENT',
    deviceHash: 'bot-dev-1',
    ipHash: sharedIp,
    envHash: sharedEnv,
    qrNonce: 'qr-stale-nonce',
    singerId: singerA.id,
    uaSummary: 'Bot/Script',
    cookiePresent: false,
    dwellMs: null
  })

  const reportBefore = computePopularityGuardReport(client, event.id, { aiConfigured: false })
  assert.equal(reportBefore.overview.validVotes, 9)
  assert.equal(reportBefore.overview.blockedAttempts, 1)
  assert.equal(reportBefore.overview.totalLogCount, 10)
  assert.ok(reportBefore.overview.estimatedBrushVotes >= 4, '应预估出明显刷票数量')

  const estA = reportBefore.singerEstimates.find(s => s.singerId === singerA.id)!
  const estB = reportBefore.singerEstimates.find(s => s.singerId === singerB.id)!
  assert.equal(estA.validVotes, 6)
  assert.equal(estB.validVotes, 3)
  assert.equal(estA.rawRank, 1)
  assert.ok(estA.estimatedRealVotes < estA.validVotes, '选手 A 净估票应明显低于原始有效票')
  assert.ok(estA.estimatedBrushVotes >= 4)
  assert.ok(estB.estimatedRealRank <= estA.estimatedRealRank, '去除刷票水分后选手 B 净排名应不低于 A')
  assert.ok(reportBefore.clusters.length >= 2, '应聚合同 IP 与同环境簇')

  // 整簇作废共享环境刷票
  const envCluster = reportBefore.clusters.find(c => c.kind === 'env')!
  assert.equal(envCluster.ballotCount, 6)
  const modVoid = moderatePopularityBallots(client, event.id, 'admin-1', {
    mode: 'void',
    ballotIds: envCluster.ballotIds,
    reason: '同环境批量无痕刷票'
  })
  assert.equal(modVoid.updatedCount, 6)

  // 作废后公开票数与后台有效票即时只剩选手 B 的 3 票
  const adminAfterVoid = getPopularityAdminState(client, event.id)
  assert.equal(adminAfterVoid.totalVotes, 3)
  assert.equal(adminAfterVoid.voidedVotes, 6)
  const publicAfterVoid = getPopularityPublicState(client, event.id, 'brush-dev-0')
  assert.equal(publicAfterVoid.totalVotes, 3)
  assert.equal(publicAfterVoid.myBallot, null)
  assert.equal(publicAfterVoid.canChange, false)

  // 被作废设备尝试改票应被风控锁拒绝
  assert.throws(() => recordPopularityBallot(client, event.id, 'brush-dev-0', singerB.id, 1), err => (
    codeOf(err) === 'POPULARITY_BALLOT_VOIDED'
  ))

  // 恢复选票后重新计入
  const modRestore = moderatePopularityBallots(client, event.id, 'admin-1', {
    mode: 'restore',
    ballotIds: envCluster.ballotIds
  })
  assert.equal(modRestore.updatedCount, 6)
  assert.equal(getPopularityAdminState(client, event.id).totalVotes, 9)

  // reset-votes 连同日志表一并清空
  applyPopularityAction(client, event.id, 'reset-votes')
  const logsAfterReset = client.db.select().from(competitionPopularityVoteLogs).all()
  assert.equal(logsAfterReset.length, 0)

  cleanup(client, path)
})

test('记忆 AI 巡检：满20条自动微批巡检并将跨批次memoryNote传给后续批次与单票巡检', async () => {
  const { client, path } = tempDb()
  runMigrations(client)
  const { event, singers } = createEventWithSingers(client)
  const singerA = singers[0]!

  // 制造 20 条投票日志触发自动微批
  const sharedIp = popularityIpHash('secret-2', '198.51.100.88')
  for (let i = 0; i < 20; i += 1) {
    recordPopularityBallot(
      client,
      event.id,
      `auto-dev-${i}`,
      singerA.id,
      0,
      i < 10 ? sharedIp : popularityIpHash('secret-2', `203.0.114.${i}`),
      {
        uaSummary: i < 10 ? 'Android/Chrome' : 'iOS/WeChat',
        envHash: i < 10 ? 'auto-same-env' : `auto-env-${i}`,
        dwellMs: i < 10 ? 700 : 4500,
        cookiePresent: i >= 10,
        qrNonce: 'qr-batch-1',
        qrAgeMs: 4000,
        qrRotateSeconds: 30
      }
    )
  }

  const capturedBodies: Array<Record<string, unknown>> = []
  const mockFetch: typeof fetch = async (_url, init) => {
    const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    capturedBodies.push(parsed)
    const callIdx = capturedBodies.length
    const content = callIdx === 1
      ? JSON.stringify({
          verdict: 'suspect',
          confidence: 91,
          estimatedBrushCount: 10,
          headline: '第1-20票存在同环境集中刷票',
          findings: ['seq 1-10 来自同一硬件环境且停留低于1秒'],
          flaggedSeqs: [1, 2, 3],
          memoryNote: 'ip与env聚集在1-10号，持续注水选手1'
        })
      : JSON.stringify({
          verdict: 'watch',
          confidence: 78,
          estimatedBrushCount: 1,
          headline: '第21票延续前序可疑环境特征',
          findings: ['seq 21 沿用此前记忆中的异常环境标签'],
          flaggedSeqs: [21],
          memoryNote: '第21票仍属同一可疑环境延续'
        })
    return new Response(JSON.stringify({
      choices: [{ message: { content } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const fakeConfig = {
    baseUrl: 'http://127.0.0.1:18080',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 15_000
  }

  const autoPromise = maybeTriggerAutoPopularityInspection(client, event.id, fakeConfig, { fetchImpl: mockFetch })
  assert.ok(autoPromise, '第20条日志应触发自动微批巡检')
  await autoPromise

  // 重复检查尚未到第40条，不应再次自动触发
  assert.equal(maybeTriggerAutoPopularityInspection(client, event.id, fakeConfig, { fetchImpl: mockFetch }), null)

  // 新增第21票并发起单票上下文 AI 巡检，验证 rollingMemory 已携带第1批的 memoryNote
  recordPopularityBallot(client, event.id, 'auto-dev-20', singerA.id, 0, sharedIp, {
    uaSummary: 'Android/Chrome',
    envHash: 'auto-same-env',
    dwellMs: 800,
    cookiePresent: false,
    qrNonce: 'qr-batch-2',
    qrAgeMs: 4000,
    qrRotateSeconds: 30
  })

  const reportMid = computePopularityGuardReport(client, event.id, { aiConfigured: true })
  assert.equal(reportMid.inspections.length, 1)
  assert.equal(reportMid.rollingMemory.length, 1)
  assert.equal(reportMid.rollingMemory[0]?.memoryNote, 'ip与env聚集在1-10号，持续注水选手1')

  const targetLog = reportMid.logs.find(l => l.seq === 21)!
  assert.ok(targetLog)
  const preparedSingle = preparePopularityInspection(client, event.id, {
    mode: 'single-log',
    triggerSource: 'manual',
    adminId: 'admin-1',
    logId: targetLog.id
  })
  assert.ok(preparedSingle)
  assert.equal(preparedSingle.digest.rollingMemory.length, 1)
  assert.equal(preparedSingle.digest.rollingMemory[0]?.memoryNote, 'ip与env聚集在1-10号，持续注水选手1')

  const singleResult = await runPopularityInspectionNow(client, event.id, fakeConfig, {
    mode: 'single-log',
    triggerSource: 'manual',
    adminId: 'admin-1',
    logId: targetLog.id
  }, { fetchImpl: mockFetch })
  assert.ok(singleResult)
  assert.deepEqual(singleResult.flaggedSeqs, [21])
  assert.equal(capturedBodies.length, 2)

  // 验证第二次调用 AI 时 user prompt 里真实包含第一批 memoryNote
  const secondMessages = capturedBodies[1]?.messages as Array<{ content: string }>
  assert.ok(secondMessages[1]?.content.includes('ip与env聚集在1-10号，持续注水选手1'))

  cleanup(client, path)
})

test('0087 微信口令领票与唯一索引：动态口令核验、同一微信号跨设备防重投', () => {
  const { client, path } = tempDb()
  runMigrations(client)
  const { event, singers } = createEventWithSingers(client)
  const secret = 'fortress-wechat-secret-0123456789'
  const now = 1_795_534_500_000

  const idxRows = client.sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('competition_popularity_ballots_event_openid_slot_unique', 'competition_popularity_ballots_event_quarantined_idx') ORDER BY name`
  ).all() as Array<{ name: string }>
  assert.deepEqual(idxRows.map(r => r.name), [
    'competition_popularity_ballots_event_openid_slot_unique',
    'competition_popularity_ballots_event_quarantined_idx'
  ])

  const passcode = computePopularityWechatPasscode(secret, event.id, now)
  assert.match(passcode, /^\d{2}$/)
  assert.equal(verifyPopularityWechatPasscode(secret, event.id, passcode, now), true)
  assert.equal(verifyPopularityWechatPasscode(secret, event.id, passcode, now + 59_000), true)

  // 非投票指令返回 null 交给原校园助手
  assert.equal(
    handleWechatMpPopularityMessage(client, {
      fromUserName: 'oUser_001',
      content: '图书馆几点关门',
      siteOrigin: 'https://yx.huiliyill.cn',
      secret,
      now
    }),
    null
  )

  // 错误口令返回提示
  const wrongReply = handleWechatMpPopularityMessage(client, {
    fromUserName: 'oUser_001',
    content: '投票 00',
    siteOrigin: 'https://yx.huiliyill.cn',
    secret,
    now
  })
  assert.ok(wrongReply && wrongReply.includes('口令不正确'))

  // 正确口令秒发专属 vt 链接
  const okReply = handleWechatMpPopularityMessage(client, {
    fromUserName: 'oUser_001',
    content: `投票 ${passcode}`,
    siteOrigin: 'https://yx.huiliyill.cn',
    secret,
    now
  })
  assert.ok(okReply && okReply.includes('/singer/popularity?vt='))
  const match = /\?vt=([^\s]+)/.exec(okReply!)
  assert.ok(match)
  const ticketRaw = decodeURIComponent(match![1]!)
  const verified = verifyPopularityWechatTicket(secret, ticketRaw, now + 1000)
  assert.ok(verified)
  assert.equal(verified.eventId, event.id)
  assert.equal(verified.openIdHash, popularityOpenIdHash(secret, event.id, 'oUser_001'))

  // 同一微信号在手机浏览器首次投票
  const s1 = recordPopularityBallot(client, event.id, 'browser-dev-1', singers[0]!.id, 0, 'ip-1', {
    voterOpenidHash: verified.openIdHash,
    cookiePresent: true,
    dwellMs: 4000,
    uaSummary: 'iOS/WeChat'
  })
  assert.equal(s1.totalVotes, 1)
  assert.equal(s1.wechatVerified, true)

  // 同一微信号把 vt 转发给另一台设备（换了 deviceHash）再首投同一个人仅幂等不加票；投给别人受同一张票 revision/改票规则约束
  const issuedOther = issuePopularityWechatTicket(secret, event.id, verified.openIdHash, 600_000, now)
  assert.ok(verifyPopularityWechatTicket(secret, issuedOther.ticket, now))
  assert.throws(() => recordPopularityBallot(client, event.id, 'browser-dev-2', singers[1]!.id, 0, 'ip-2', {
    voterOpenidHash: verified.openIdHash,
    cookiePresent: true,
    dwellMs: 4000
  }), err => codeOf(err) === 'POPULARITY_CONFLICT')
  assert.equal(getPopularityAdminState(client, event.id).totalVotes, 1)

  // Fetch Metadata 校验与大屏会话哈希更新
  const browserEvt = {
    node: { req: { headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } } }
  } as unknown as H3Event
  const scriptEvt = {
    node: { req: { headers: {} } }
  } as unknown as H3Event
  assert.equal(hasBrowserFetchMetadata(browserEvt), true)
  assert.equal(hasBrowserFetchMetadata(scriptEvt), false)
  updatePopularityDisplaySessionHash(client, event.id, 'session-hash-v1')
  applyPopularityAction(client, event.id, 'rotate-display-key')
  const stateAfterRotate = getPopularityPublicState(client, event.id, '')
  assert.equal(stateAfterRotate.requiresWechatTicket, true)

  cleanup(client, path)
})

test('0087 实时自动冻结与 AI 巡检直接执法：等距节拍隔离不计票，AI 直接作废与放行，人工放行免疫', async () => {
  const { client, path } = tempDb()
  runMigrations(client)
  const { event, singers } = createEventWithSingers(client)
  const [singerA, singerB] = singers as [typeof singers[number], typeof singers[number]]
  updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '现场扫码',
    opensAt: Date.now() - 5_000,
    closesAt: Date.now() + 300_000,
    allowChange: true,
    maxChanges: 1,
    votesPerVoter: 1,
    allowRepeatVote: true,
    qrRotateSeconds: 30,
    showResults: true,
    authMode: 'device_strict',
    autoQuarantine: true,
    aiAutoModerate: true
  })

  const attackerIp = popularityIpHash('secret-fortress', '198.51.100.99')
  const baseNow = Date.now() - 120_000

  // 模仿 popularity-flood-v2.mjs：单 IP 每 10 秒等距投同一选手、每票换新设备与独立 env、无 Fetch Metadata
  for (let i = 0; i < 6; i += 1) {
    recordPopularityBallot(
      client,
      event.id,
      `flood-v2-dev-${i}`,
      singerA.id,
      0,
      attackerIp,
      {
        uaSummary: 'iOS/Safari',
        envHash: `flood-v2-env-${i}`,
        dwellMs: 3100,
        cookiePresent: true,
        qrNonce: 'qr-v2',
        qrAgeMs: 4000,
        qrRotateSeconds: 30,
        missingFetchMeta: true,
        now: baseNow + i * 10_000
      }
    )
  }

  // 再制造 1 张因为礼堂同基站+点得快被规则误冻的正常票（随后 AI 复核放行，再加 1 张人工放行票测免疫）
  recordPopularityBallot(
    client,
    event.id,
    'false-positive-dev',
    singerB.id,
    0,
    attackerIp,
    {
      uaSummary: 'iOS/WeChat',
      envHash: 'clean-unique-env',
      dwellMs: 1100,
      cookiePresent: true,
      missingFetchMeta: false,
      now: baseNow + 65_000
    }
  )

  const adminBeforeAi = getPopularityAdminState(client, event.id)
  const reportBeforeAi = computePopularityGuardReport(client, event.id, { aiConfigured: true })
  assert.ok((adminBeforeAi.quarantinedVotes ?? 0) >= 4, '等距节拍与同IP多新设备票应实时自动冻结隔离')
  assert.ok(adminBeforeAi.totalVotes < 4, '被冻结隔离的高危票不得计入公开有效票')
  assert.equal(getPopularityPublicState(client, event.id, '').totalVotes, adminBeforeAi.totalVotes)

  // 找到所有 seq，让 AI 巡检直接自动作废前 6 票（flaggedSeqs: [1..6]），并自动放行第 7 票（releaseSeqs: [7]）
  const releaseSeq = reportBeforeAi.logs.find(l => l.singerId === singerB.id)!.seq
  const mockAi: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          verdict: 'suspect',
          confidence: 95,
          estimatedBrushCount: 6,
          headline: 'seq 1-6 为同IP 10s 等距脚本刷票',
          findings: ['seq 1-6 每10s规律切换设备与env且无Fetch元数据', `seq ${releaseSeq} 为微信正常停留误冻票`],
          flaggedSeqs: [1, 2, 3, 4, 5, 6],
          releaseSeqs: [releaseSeq],
          memoryNote: 'ip 存在每10秒换env稳态刷票'
        })
      }
    }]
  }), { status: 200, headers: { 'content-type': 'application/json' } })

  // 触发冻结加急自动巡检（未满 20 条，因 hasNewQuarantined=true 且 >=3 条直接触发）
  const fastAuto = maybeTriggerAutoPopularityInspection(client, event.id, {
    baseUrl: 'http://127.0.0.1:18080',
    apiKey: 'k',
    model: 'm',
    timeoutMs: 10_000
  }, { fetchImpl: mockAi, hasNewQuarantined: true })
  assert.ok(fastAuto, '存在实时冻结票且未检>=3条时应触发快速自动巡检')
  await fastAuto

  const adminAfterAi = getPopularityAdminState(client, event.id)
  assert.equal(adminAfterAi.voidedVotes, 6, 'AI 巡检应直接将 seq 1-6 自动置为 voided=1')
  assert.equal(adminAfterAi.quarantinedVotes, 0, 'AI 巡检应直接放行第 7 票并清零冻结池')
  assert.equal(adminAfterAi.totalVotes, 1, '最终仅保留经过 AI 放行的 1 张正常票')
  assert.equal(adminAfterAi.results.find(r => r.singerId === singerA.id)?.count, 0)
  assert.equal(adminAfterAi.results.find(r => r.singerId === singerB.id)?.count, 1)

  const reportAfterAi = computePopularityGuardReport(client, event.id, { aiConfigured: true })
  assert.equal(reportAfterAi.inspections[0]?.autoVoidedCount, 6)
  assert.equal(reportAfterAi.inspections[0]?.autoReleasedCount, 1)

  // 管理员手动恢复其中第 1 票后应写入 admin-restored 豁免标记，后续 AI 再次标疑该票也不得二次作废
  const seq1BallotId = reportAfterAi.logs.find(l => l.seq === 1)!.ballotId!
  moderatePopularityBallots(client, event.id, 'admin-1', {
    mode: 'release',
    ballotIds: [seq1BallotId],
    reason: '人工复核确认为线下观众'
  })
  const immuneResult = await runPopularityInspectionNow(client, event.id, {
    baseUrl: 'http://127.0.0.1:18080',
    apiKey: 'k',
    model: 'm',
    timeoutMs: 10_000
  }, {
    mode: 'manual-batch',
    triggerSource: 'manual',
    adminId: 'admin-1',
    fromSeq: 1,
    toSeq: 7
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            verdict: 'suspect',
            confidence: 92,
            estimatedBrushCount: 1,
            headline: '复测仍怀疑 seq 1',
            findings: ['复核 seq 1'],
            flaggedSeqs: [1],
            releaseSeqs: [],
            memoryNote: '复核测试'
          })
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  assert.ok(immuneResult)
  assert.equal(immuneResult.autoVoidedCount, 0, '管理员手动恢复放行后的选票应豁免 AI 二次作废')
  assert.equal(getPopularityAdminState(client, event.id).totalVotes, 2)

  cleanup(client, path)
})

test('混合模式第一票防刷与单人多票免误伤：无PoW/短停留/缺Cookie拦截，无痕切号自动冻结，微信3票同投不误报', async () => {
  const { client, path } = tempDb()
  runMigrations(client)
  const { event, singers } = createEventWithSingers(client)
  const [singerA, singerB] = singers as [typeof singers[number], typeof singers[number]]

  updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '混合模式',
    opensAt: Date.now() - 5_000,
    closesAt: Date.now() + 300_000,
    allowChange: false,
    maxChanges: 0,
    votesPerVoter: 1,
    wechatBonusVotes: 2,
    allowRepeatVote: true,
    qrRotateSeconds: 30,
    showResults: true,
    authMode: 'hybrid',
    autoQuarantine: true,
    aiAutoModerate: true
  })

  // 1) 同 IP + 同 envHash 免关注连续切换设备刷第一票，应实时静默冻结隔离
  const brushIp = popularityIpHash('hybrid-secret-0123456789abcdef0123', '198.51.100.77')
  const brushEnv = 'hybrid-brush-env'
  for (let i = 0; i < 3; i += 1) {
    recordPopularityBallot(client, event.id, `hybrid-brush-dev-${i}`, singerA.id, 0, brushIp, {
      uaSummary: 'iOS/Safari',
      envHash: brushEnv,
      dwellMs: 1400,
      cookiePresent: true,
      missingFetchMeta: false
    })
  }
  const adminAfterBrush = getPopularityAdminState(client, event.id)
  assert.ok((adminAfterBrush.quarantinedVotes ?? 0) >= 1, '同IP+同硬件环境切无痕刷第一票应进入静默冻结池')

  // 2) 单个关注公众号用户把 3 票全投同一位选手 B，实时风控与事后簇分析均不得误判为刷票
  const realIp = popularityIpHash('hybrid-secret-0123456789abcdef0123', '203.0.113.55')
  const realOpenId = 'real-wechat-openid-hash-001'
  for (let i = 0; i < 3; i += 1) {
    recordPopularityBallot(client, event.id, 'real-wx-dev-1', singerB.id, i, realIp, {
      uaSummary: 'iOS/WeChat',
      envHash: 'real-iphone-env',
      dwellMs: 2500,
      cookiePresent: true,
      missingFetchMeta: false,
      voterOpenidHash: realOpenId
    })
  }
  // 2.5) 4 台不同 IP、同款 iPhone envHash 投不同选手，不得误判为同环境刷票
  for (let i = 0; i < 4; i += 1) {
    const devId = `same-iphone-diff-ip-dev-${i}`
    const targetSinger = singers[i % singers.length]!
    recordPopularityBallot(
      client,
      event.id,
      devId,
      targetSinger.id,
      0,
      popularityIpHash('hybrid-secret-0123456789abcdef0123', `203.0.115.${10 + i}`),
      {
        uaSummary: 'iOS/WeChat',
        envHash: 'shared-iphone15-pro-env',
        dwellMs: 2800,
        cookiePresent: true,
        missingFetchMeta: false
      }
    )
  }

  const report = computePopularityGuardReport(client, event.id, { aiConfigured: false })
  const wxLogs = report.logs.filter(log => log.singerId === singerB.id && log.wechatVerified)
  assert.equal(wxLogs.length, 3)
  assert.ok(wxLogs.every(log => log.effectiveScore < 30), '单个微信观众连投3票同选手不应被误标为 watch/suspect')
  assert.ok(
    report.logs.filter(log => log.uaSummary === 'iOS/WeChat' && !log.wechatVerified).every(log => log.effectiveScore < 30),
    '不同 IP 下同款手机观众不应因 envHash 相同而被误判为可疑'
  )
  assert.equal(getPopularityAdminState(client, event.id).results.find(r => r.singerId === singerB.id)?.count, 4)

  // 3) 通过真实 H3 路由入口验证免关注第一票的 Cookie / 1200ms 停留 / PoW 拦截与放行
  assert.equal(HYBRID_FIRST_VOTE_MIN_DWELL_MS, 1200)
  const testSecret = '0'.repeat(32)
  const prevDbPath = process.env.NUXT_DATABASE_PATH
  const prevSecret = process.env.NUXT_ADMIN_SESSION_SECRET
  const prevSiteUrl = process.env.NUXT_PUBLIC_SITE_URL
  process.env.NUXT_DATABASE_PATH = path
  process.env.NUXT_ADMIN_SESSION_SECRET = testSecret
  process.env.NUXT_PUBLIC_SITE_URL = 'https://yx.huiliyill.cn'

  const g = globalThis as {
    useRuntimeConfig?: (e?: H3Event) => Record<string, unknown>
    getHeader?: typeof getHeader
    getMethod?: typeof getMethod
    getRequestURL?: typeof getRequestURL
    readRawBody?: typeof readRawBody
    setHeader?: typeof setHeader
    createError?: typeof createError
  }
  const prevRuntimeConfig = g.useRuntimeConfig
  const prevGetHeader = g.getHeader
  const prevGetMethod = g.getMethod
  const prevGetRequestURL = g.getRequestURL
  const prevReadRawBody = g.readRawBody
  const prevSetHeader = g.setHeader
  const prevCreateError = g.createError
  g.useRuntimeConfig = () => ({
    databasePath: path,
    adminSessionSecret: testSecret,
    public: { siteUrl: 'https://yx.huiliyill.cn' }
  })
  g.getHeader = getHeader
  g.getMethod = getMethod
  g.getRequestURL = getRequestURL
  g.readRawBody = readRawBody
  g.setHeader = setHeader
  g.createError = createError

  try {
    const app = createApp()
    const router = createRouter()
    router.post('/api/public/competition/popularity/vote', eventHandler(e => handlePopularityVote(e)))
    app.use(router)
    const webHandler = toWebHandler(app)

    const deviceId = 'a'.repeat(32)
    const deviceHash = hashOpaqueToken(testSecret, 'competition-popularity-device', deviceId)
    const deviceToken = `${Buffer.from(`${event.id}.${deviceId}`).toString('base64url')}`
    void deviceToken

    // 缺少 PoW 的免关注请求 -> 403 INVALID_VOTE_PROOF
    const oldTicket = issuePopularityPageTicket(testSecret, event.id, deviceHash, 0, Date.now() - 2000)
    const noPowRes = await webHandler(new Request('https://yx.huiliyill.cn/api/public/competition/popularity/vote', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'https://yx.huiliyill.cn',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.47',
        'cookie': `yeu_popularity_device=${deviceId}`,
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty'
      },
      body: JSON.stringify({
        singerId: singerB.id,
        revision: 0,
        pageTicket: oldTicket
      })
    }))
    assert.equal(noPowRes.status, 403)
    const noPowBody = await noPowRes.json() as { data?: { blockCode?: string } }
    assert.equal(noPowBody.data?.blockCode, 'INVALID_VOTE_PROOF')

    // 停留不足 1200ms（即便带正确 PoW）-> 403 TOO_FAST_SUBMIT
    const fastTicket = issuePopularityPageTicket(testSecret, event.id, deviceHash, 0, Date.now() - 500)
    const fastPow = solvePopularityVotePow(fastTicket, singerB.id)
    const fastRes = await webHandler(new Request('https://yx.huiliyill.cn/api/public/competition/popularity/vote', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'https://yx.huiliyill.cn',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.47',
        'cookie': `yeu_popularity_device=${deviceId}`,
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty'
      },
      body: JSON.stringify({
        singerId: singerB.id,
        revision: 0,
        pageTicket: fastTicket,
        pow: fastPow
      })
    }))
    assert.equal(fastRes.status, 403)
    const fastBody = await fastRes.json() as { data?: { blockCode?: string } }
    assert.equal(fastBody.data?.blockCode, 'TOO_FAST_SUBMIT')

    // 带匹配 Cookie、停留 >= 1200ms 且带正确 PoW -> 200 投票成功
    const validPow = solvePopularityVotePow(oldTicket, singerB.id)
    const okRes = await webHandler(new Request('https://yx.huiliyill.cn/api/public/competition/popularity/vote', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'https://yx.huiliyill.cn',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.47',
        'cookie': `yeu_popularity_device=${deviceId}`,
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty'
      },
      body: JSON.stringify({
        singerId: singerB.id,
        revision: 0,
        pageTicket: oldTicket,
        pow: validPow,
        env: { tz: 'Asia/Shanghai', lang: 'zh-CN', screen: '390x840', touch: 5, cores: 6, dpr: 300, wd: false, fp: 'E2E-Browser-FP-ABC123' }
      })
    }))
    assert.equal(okRes.status, 200)
    const okBody = await okRes.json() as { votesUsed: number, votesRemaining: number }
    assert.equal(okBody.votesUsed, 1)
    assert.equal(okBody.votesRemaining, 0)

    // 该选手此前已有直接落库的测试票，按指纹字段精确定位本次 HTTP 投票写入的那一行。
    const fpBallot = client.db.select().from(competitionPopularityBallots)
      .all()
      .find(row => row.clientFp === 'e2e-browser-fp-abc123')
    assert.ok(fpBallot, '投票成功应把指纹按小写归一化后落库')
    assert.equal(fpBallot.singerId, singerB.id)
    assert.equal(typeof fpBallot.envHash, 'string', '指纹不应改变实时 envHash 的写入')
  } finally {
    g.useRuntimeConfig = prevRuntimeConfig
    g.getHeader = prevGetHeader
    g.getMethod = prevGetMethod
    g.getRequestURL = prevGetRequestURL
    g.readRawBody = prevReadRawBody
    g.setHeader = prevSetHeader
    g.createError = prevCreateError
    if (prevDbPath === undefined) delete process.env.NUXT_DATABASE_PATH
    else process.env.NUXT_DATABASE_PATH = prevDbPath
    if (prevSecret === undefined) delete process.env.NUXT_ADMIN_SESSION_SECRET
    else process.env.NUXT_ADMIN_SESSION_SECRET = prevSecret
    if (prevSiteUrl === undefined) delete process.env.NUXT_PUBLIC_SITE_URL
    else process.env.NUXT_PUBLIC_SITE_URL = prevSiteUrl
    cleanup(client, path)
  }
})

test('client_fp：同一浏览器指纹跨 4 台设备投同一选手，巡检抬到 70 分并单独成簇', () => {
  const { client, path } = tempDb()
  runMigrations(client)
  const { event, singers } = createEventWithSingers(client)
  updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '现场扫码',
    opensAt: Date.now() - 5_000,
    closesAt: Date.now() + 300_000,
    allowChange: true,
    maxChanges: 2,
    votesPerVoter: 1,
    allowRepeatVote: false,
    qrRotateSeconds: 30,
    showResults: true,
    autoQuarantine: false
  })
  const singerA = singers[0]!
  const sharedFingerprint = 'shared-browser-fp-0123456789abcdef'

  // 4 台设备：IP 与 envHash 各不相同，只有浏览器指纹一致 —— 只应触发指纹规则。
  for (let i = 0; i < 4; i += 1) {
    recordPopularityBallot(
      client,
      event.id,
      `fp-dev-${i}`,
      singerA.id,
      0,
      popularityIpHash('secret-1', `198.51.100.${100 + i}`),
      {
        uaSummary: 'iOS/WeChat',
        envHash: `fp-env-${i}`,
        clientFp: sharedFingerprint,
        dwellMs: 4200,
        cookiePresent: true,
        qrNonce: `qr-fp-${i}`,
        qrAgeMs: 5000,
        qrRotateSeconds: 30
      }
    )
  }

  const report = computePopularityGuardReport(client, event.id, { aiConfigured: false })
  const fpCluster = report.clusters.find(cluster => cluster.kind === 'fp')
  assert.ok(fpCluster, '同指纹 4 台设备应形成一个 fp 簇')
  assert.equal(fpCluster.ballotCount, 4)
  assert.ok(fpCluster.maxSuspicionScore >= 70, `同指纹簇分数应不低于 70，实际 ${fpCluster.maxSuspicionScore}`)
  assert.equal(fpCluster.topSingerName, singerA.name)
  cleanup(client, path)
})

test('client_fp：同一设备（同一 deviceHash）持同一指纹连投多票，不触发指纹规则', () => {
  const { client, path } = tempDb()
  runMigrations(client)
  const { event, singers } = createEventWithSingers(client)
  updatePopularitySettings(client, event.id, {
    enabled: true,
    title: '人气奖投票',
    subtitle: '现场扫码',
    opensAt: Date.now() - 5_000,
    closesAt: Date.now() + 300_000,
    allowChange: true,
    maxChanges: 10,
    votesPerVoter: 3,
    allowRepeatVote: true,
    qrRotateSeconds: 30,
    showResults: true,
    autoQuarantine: false
  })

  // 真实观众：一台设备一个 deviceHash，三票投给不同选手。
  for (let i = 0; i < 3; i += 1) {
    recordPopularityBallot(
      client,
      event.id,
      'single-device-hash',
      singers[i]!.id,
      i,
      popularityIpHash('secret-1', '198.51.100.200'),
      {
        uaSummary: 'iOS/WeChat',
        envHash: 'single-device-env',
        clientFp: 'same-device-browser-fp',
        dwellMs: 3200,
        cookiePresent: true,
        qrNonce: 'qr-single',
        qrAgeMs: 5000,
        qrRotateSeconds: 30
      }
    )
  }

  const report = computePopularityGuardReport(client, event.id, { aiConfigured: false })
  assert.equal(report.clusters.find(cluster => cluster.kind === 'fp'), undefined, '同一设备不应形成指纹簇')
  cleanup(client, path)
})
