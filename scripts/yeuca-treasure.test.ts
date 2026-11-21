import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createError, createEvent, deleteCookie, getCookie, getHeader, setCookie, setHeader } from 'h3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { adminUsers, contents, userSessions, users } from '../server/database/schema'
import { USER_CSRF_COOKIE_NAME, USER_CSRF_HEADER_NAME, USER_SESSION_COOKIE_NAME } from '../shared/constants/security'
import { createOpaqueToken, hashOpaqueToken } from '../server/utils/security'
import { importYeucaMembersAdmin, loginYeucaMember, registerYeucaMember } from '../server/modules/yeuca/member-service'
import { createYeucaMinister, listYeucaAuditLogs } from '../server/modules/yeuca/minister-service'
import {
  createYeucaTreasurePointAdmin,
  deleteYeucaTreasurePointAdmin,
  getAdminYeucaTreasureOverview,
  getPublicTreasureState,
  handlePublicTreasureClaim,
  updateYeucaTreasureConfigAdmin,
  updateYeucaTreasurePointAdmin
} from '../server/modules/yeuca/treasure-service'
import { resolveYeucaAdminScope } from '../server/utils/yeuca-admin'
import type { AdminSessionContext } from '../server/utils/auth'

const TEST_SECRET = '0123456789abcdef0123456789abcdef_test_secret_key'

// 在 Node tsx 测试环境补齐 Nitro 自动导入的 h3 cookie/header 与 runtimeConfig 辅助函数
Object.assign(globalThis, {
  createError,
  deleteCookie,
  getCookie,
  getHeader,
  setCookie,
  setHeader,
  useRuntimeConfig: () => ({
    adminSessionSecret: TEST_SECRET,
    allowedOrigins: 'http://localhost:3000',
    public: {
      siteUrl: 'http://localhost:3000'
    }
  })
})

function makeEvent(options: {
  method?: string
  origin?: string
  memberToken?: string
  cookie?: string
  csrfHeader?: string
} = {}) {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.url = '/api/public/treasure/claim'
  req.method = options.method || 'POST'
  req.headers = {
    'host': 'localhost:3000',
    'x-forwarded-for': '127.0.0.1',
    ...(options.origin ? { origin: options.origin } : { origin: 'http://localhost:3000' }),
    ...(options.memberToken ? { 'x-yeuca-member-token': options.memberToken } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.csrfHeader ? { [USER_CSRF_HEADER_NAME]: options.csrfHeader } : {})
  }
  const res = new ServerResponse(req)
  return createEvent(req, res)
}

function createTempClient() {
  process.env.NUXT_ADMIN_SESSION_SECRET = TEST_SECRET
  process.env.NUXT_ALLOWED_ORIGINS = 'http://localhost:3000'
  const dir = mkdtempSync(join(tmpdir(), 'yeu-treasure-test-'))
  const dbPath = join(dir, 'test.sqlite')
  const client = getDatabase(dbPath)
  runMigrations(client)
  const now = Date.now()

  client.db.insert(adminUsers).values({
    id: 'admin-super',
    username: 'superadmin',
    passwordHash: 'hash',
    displayName: '总管',
    role: 'super',
    isActive: true,
    createdAt: now,
    updatedAt: now
  }).run()

  client.db.insert(contents).values({
    id: 'club-yeuca',
    kind: 'club',
    slug: 'computer-association',
    title: '计算机协会',
    summary: '计协',
    body: '计协',
    status: 'published',
    createdAt: now,
    updatedAt: now
  }).run()

  return {
    client,
    cleanup() {
      closeDatabase(dbPath)
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

test('treasure admin supports chief full control, minister dept isolation, GCJ02 conversion and secret hiding', async () => {
  const { client, cleanup } = createTempClient()
  try {
    const chiefSession = {
      admin: { id: 'admin-super', role: 'super' }
    } as unknown as AdminSessionContext
    const chiefScope = resolveYeucaAdminScope(client, chiefSession)

    const aiCreated = await createYeucaMinister(client, 'admin-super', {
      departmentName: 'AI 部',
      username: 'ai-minister',
      title: '部长'
    })
    const aiMinisterSession = {
      admin: {
        id: aiCreated.account.id,
        role: 'organization',
        organization: { contentId: 'club-yeuca', slug: 'computer-association', title: '计算机协会', kind: 'club' },
        yeucaScope: { role: 'minister', departmentName: 'AI 部', title: '部长' }
      }
    } as unknown as AdminSessionContext
    const aiScope = resolveYeucaAdminScope(client, aiMinisterSession)

    const initialChief = getAdminYeucaTreasureOverview(client, chiefScope)
    assert.equal(initialChief.points.length, 29)
    assert.equal(initialChief.config.goalCount, 5)

    // 部长视图应隐藏其它部门暗号并标记不可编辑
    const initialMinister = getAdminYeucaTreasureOverview(client, aiScope)
    const bridgeInMinister = initialMinister.points.find(p => p.id === 'zodiac-bridge')
    assert.equal(bridgeInMinister?.canEdit, false)
    assert.equal(bridgeInMinister?.answer, '')

    // 部长尝试改全局设置或新增 finish 终点均被拒绝
    assert.throws(
      () => updateYeucaTreasureConfigAdmin(client, makeEvent(), aiCreated.account.id, aiScope, {
        enabled: true,
        title: '非法修改',
        subtitle: '',
        goalCount: 2,
        requireMember: true
      }),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )

    assert.throws(
      () => createYeucaTreasurePointAdmin(client, makeEvent(), aiCreated.account.id, aiScope, {
        name: '私自终点',
        alias: '',
        kind: 'finish',
        deptName: '编程部',
        landmark: '图书馆',
        room: '',
        coordType: 'wgs84',
        lng: 118.6038,
        lat: 25.1128,
        radiusMeters: 20,
        verifyMode: 'gps_answer',
        clue: '测试线索',
        question: '暗号',
        answer: 'ok',
        characterKey: '',
        glyph: '',
        sortOrder: 500,
        isPublished: true
      }),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )

    // 部长新增本部门点位（尝试传编程部，后端强锁为 AI 部；使用 GCJ-02 自动转 WGS84）
    const aiPoint = createYeucaTreasurePointAdmin(client, makeEvent(), aiCreated.account.id, aiScope, {
      name: 'AI 实验角打卡点',
      alias: '',
      kind: 'chest',
      deptName: '编程部',
      landmark: '泽钏教学楼',
      room: '201',
      coordType: 'gcj02',
      lng: 118.6105,
      lat: 25.1095,
      radiusMeters: 25,
      verifyMode: 'gps_answer',
      clue: '前往泽钏楼 AI 部机房门口',
      question: '门口挂牌简称是什么？',
      answer: 'YEUCA-AI',
      characterKey: 'frog',
      glyph: '',
      sortOrder: 310,
      isPublished: true
    })
    assert.equal(aiPoint.deptName, 'AI 部')
    assert.equal(aiPoint.canEdit, true)
    assert.notEqual(aiPoint.lng, 118.6105)

    // 部长看得到自己部门点位暗号
    const afterMinister = getAdminYeucaTreasureOverview(client, aiScope)
    const foundOwn = afterMinister.points.find(p => p.id === aiPoint.id)
    assert.equal(foundOwn?.canEdit, true)
    assert.equal(foundOwn?.answer, 'YEUCA-AI')

    // 总管全权改写全局配置与编辑任意点
    const updatedCfg = updateYeucaTreasureConfigAdmin(client, makeEvent(), 'admin-super', chiefScope, {
      enabled: true,
      title: '计协秋季校园实景寻宝',
      subtitle: '请凭计协会员登录集章',
      goalCount: 2,
      requireMember: false
    })
    assert.equal(updatedCfg.goalCount, 2)
    assert.equal(updatedCfg.title, '计协秋季校园实景寻宝')

    // 部长不能编辑或删总管名下点位
    assert.throws(
      () => updateYeucaTreasurePointAdmin(client, makeEvent(), aiCreated.account.id, aiScope, 'yangen', {
        name: '被篡改',
        alias: '',
        kind: 'chest',
        deptName: 'AI 部',
        landmark: '仰恩教学楼',
        room: '',
        coordType: 'wgs84',
        lng: 118.6024,
        lat: 25.1081,
        radiusMeters: 20,
        verifyMode: 'answer_or_trial',
        clue: '1',
        question: '1',
        answer: '1',
        characterKey: '',
        glyph: '',
        sortOrder: 10,
        isPublished: true
      }),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )

    // 审计日志可完整追溯
    const audits = listYeucaAuditLogs(client, chiefScope, 'admin-super', { category: 'content' })
    assert.ok(audits.items.some(a => a.action === 'yeuca.treasure.point.create'))
    assert.ok(audits.items.some(a => a.action === 'yeuca.treasure.config.update'))

    // 部长可以删除自己添加的点位
    const del = deleteYeucaTreasurePointAdmin(client, makeEvent(), aiCreated.account.id, aiScope, aiPoint.id)
    assert.equal(del.deletedId, aiPoint.id)
  } finally {
    cleanup()
  }
})

test('treasure public API links yeuca_members login, GPS verification, goal check and requireMember gate', async () => {
  const { client, cleanup } = createTempClient()
  try {
    const chiefSession = {
      admin: { id: 'admin-super', role: 'super' }
    } as unknown as AdminSessionContext
    const chiefScope = resolveYeucaAdminScope(client, chiefSession)

    // 设置目标印章为 2，且新建一个 GPS 免密打卡点
    updateYeucaTreasureConfigAdmin(client, makeEvent(), 'admin-super', chiefScope, {
      enabled: true,
      title: '计协寻宝',
      subtitle: '欢迎计协会员参加',
      goalCount: 2,
      requireMember: true
    })

    const gpsOnlyPt = createYeucaTreasurePointAdmin(client, makeEvent(), 'admin-super', chiefScope, {
      name: '广场到点免密点',
      alias: '',
      kind: 'chest',
      deptName: 'AI 部',
      landmark: '碑林广场',
      room: '',
      coordType: 'wgs84',
      lng: 118.6030,
      lat: 25.1114,
      radiusMeters: 20,
      verifyMode: 'gps_only',
      clue: '走到广场中心即可自动点亮',
      question: '',
      answer: '',
      characterKey: '',
      glyph: '',
      sortOrder: 320,
      isPublished: true
    })

    // 注册并登录一位计协会员
    importYeucaMembersAdmin(client, 'admin-super', 'update_existing', [{
      studentNo: '125920250165',
      name: '李磊',
      gradeMajorClass: '25电子专升本1班',
      department: 'AI 部',
      roleTitle: '会员',
      term: '2025-2026',
      phone: '',
      qq: '',
      email: '',
      gitUsername: '',
      notes: ''
    }])
    const mockSync = async () => ({ synced: true, gitUserId: 10, error: '' })
    await registerYeucaMember(makeEvent(), client, {
      studentNo: '125920250165',
      name: '李磊',
      gitUsername: 'lilei',
      password: 'Password123!'
    }, { giteaSync: mockSync })
    const logged = await loginYeucaMember(makeEvent(), client, '125920250165', 'Password123!')

    // 新建一个普通迎新网用户验证 requireMember 门禁是否拦截
    const now = Date.now()
    client.db.insert(users).values({
      id: 'user-plain',
      username: 'plainuser',
      passwordHash: 'hash',
      displayName: '普通访客',
      status: 'active',
      createdAt: now,
      updatedAt: now
    }).run()
    const rawUserSess = createOpaqueToken()
    const rawUserCsrf = createOpaqueToken()
    client.db.insert(userSessions).values({
      id: 'usess-1',
      userId: 'user-plain',
      tokenHash: hashOpaqueToken(TEST_SECRET, 'user-session', rawUserSess),
      csrfTokenHash: hashOpaqueToken(TEST_SECRET, 'user-csrf', rawUserCsrf),
      expiresAt: now + 3600_000,
      lastSeenAt: now,
      createdAt: now
    }).run()
    const plainRes = handlePublicTreasureClaim(
      makeEvent({
        cookie: `${USER_SESSION_COOKIE_NAME}=${rawUserSess}; ${USER_CSRF_COOKIE_NAME}=${rawUserCsrf}`,
        csrfHeader: rawUserCsrf
      }),
      client,
      { action: 'check', pointId: gpsOnlyPt.id, trialDistanceMeters: 10 }
    )
    assert.equal(plainRes.status, 'member-required')

    // 公开状态接口绝不暴露 answer 字段
    const pubState = getPublicTreasureState(makeEvent({ memberToken: logged.sessionToken }), client)
    assert.equal(pubState.actor.authenticated, true)
    assert.equal(pubState.actor.type, 'yeuca_member')
    assert.equal(pubState.points.some(p => Object.hasOwn(p, 'answer')), false)

    // 计协会员 1：尝试用试玩距离绕过 gps_only -> 被拒返回 outside
    const cheatTry = handlePublicTreasureClaim(
      makeEvent({ memberToken: logged.sessionToken }),
      client,
      { action: 'claim', pointId: gpsOnlyPt.id, trialDistanceMeters: 5 }
    )
    assert.equal(cheatTry.status, 'outside')

    // 真实 GPS 距离内打卡 gps_only -> 直接 collected
    const claimGpsOnly = handlePublicTreasureClaim(
      makeEvent({ memberToken: logged.sessionToken }),
      client,
      {
        action: 'claim',
        pointId: gpsOnlyPt.id,
        position: { lng: 118.6030, lat: 25.1114, accuracy: 8, timestamp: Date.now() }
      }
    )
    assert.equal(claimGpsOnly.status, 'collected')

    // 未达到 2 枚印章时，终点 finish 返回 goal-unmet
    const earlyFinish = handlePublicTreasureClaim(
      makeEvent({ memberToken: logged.sessionToken }),
      client,
      { action: 'claim', pointId: 'finish', trialDistanceMeters: 5, answer: '文体中心' }
    )
    assert.equal(earlyFinish.status, 'goal-unmet')

    // 答错 1 次暗号 -> 返回 wrong-answer；再用大写加全角通过第 2 枚（library 答案 cat）
    const wrongAns = handlePublicTreasureClaim(
      makeEvent({ memberToken: logged.sessionToken }),
      client,
      { action: 'claim', pointId: 'library', trialDistanceMeters: 5, answer: 'dog' }
    )
    assert.equal(wrongAns.status, 'wrong-answer')

    const claimSecond = handlePublicTreasureClaim(
      makeEvent({ memberToken: logged.sessionToken }),
      client,
      { action: 'claim', pointId: 'library', trialDistanceMeters: 5, answer: ' ＣＡＴ ' }
    )
    assert.equal(claimSecond.status, 'collected')

    // 现在满 2 枚印章，终点可通关
    const passFinish = handlePublicTreasureClaim(
      makeEvent({ memberToken: logged.sessionToken }),
      client,
      { action: 'claim', pointId: 'finish', trialDistanceMeters: 10, answer: '文体中心' }
    )
    assert.equal(passFinish.status, 'collected')

    // 后台看板确认统计数据与榜单均同步更新
    const adminOverview = getAdminYeucaTreasureOverview(client, chiefScope)
    assert.equal(adminOverview.stats.totalStamps, 3)
    assert.equal(adminOverview.stats.participantCount, 1)
    assert.equal(adminOverview.stats.finishCount, 1)
    assert.equal(adminOverview.leaderboard[0]?.finishCollected, true)
  } finally {
    cleanup()
  }
})
