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
import { competitionPopularityVoteLogs, contents } from '../server/database/schema'
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
import {
  applyPopularityAction,
  createSinger,
  ensureCompetitionEvent,
  getPopularityAdminState,
  getPopularityPublicState,
  getRoundByKey,
  recordPopularityBallot,
  updatePopularitySettings
} from '../server/modules/competition/service'
import {
  detectAutomatedPopularityAgent,
  hasMatchingPopularityDeviceCookie,
  issuePopularityPageTicket,
  issuePopularityToken,
  popularityIpHash,
  summarizePopularityUserAgent,
  verifyPopularityPageTicket,
  verifyPopularityToken
} from '../server/utils/competition-popularity'
import { hashOpaqueToken } from '../server/utils/security'
import type { H3Event } from 'h3'

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
