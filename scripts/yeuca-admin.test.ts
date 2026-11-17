import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createEvent } from 'h3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { adminUsers, contents, recruitForms, recruitSubmissions } from '../server/database/schema'
import {
  createYeucaActivityAdmin,
  listActivityRegistrationsAdmin,
  setMemberActivityRegistration,
  updateActivityRegistrationStatusAdmin
} from '../server/modules/yeuca/activity-service'
import type { SyncGiteaAccountInput } from '../server/modules/yeuca/gitea'
import {
  approveRecruitSubmissionsToMembers,
  changeMemberPassword,
  importYeucaMembersAdmin,
  loginYeucaMember,
  readOptionalYeucaMemberSession,
  registerYeucaMember,
  updateYeucaMemberAdmin,
  verifyMemberEligibility
} from '../server/modules/yeuca/member-service'
import {
  createYeucaPost,
  createYeucaProject,
  getAdminYeucaOverview,
  getPublicYeucaSnapshot,
  isComputerAssociationContent,
  updateYeucaPost,
  updateYeucaSettings
} from '../server/modules/yeuca/service'
import { resolveYeucaAdminScope } from '../server/utils/yeuca-admin'
import type { AdminSessionContext } from '../server/utils/auth'
import {
  parseMatrixToMemberImportRows,
  parsePastedTextToMemberImportRows
} from '../shared/utils/yeuca-member-import'

function makeTestEvent(token?: string) {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.url = '/api/public/yeuca/member/test'
  req.method = 'POST'
  req.headers = {
    'host': 'localhost:3000',
    'x-forwarded-for': '127.0.0.1',
    ...(token ? { 'x-yeuca-member-token': token } : {})
  }
  const res = new ServerResponse(req)
  return createEvent(req, res)
}

function createTempClient() {
  process.env.NUXT_ADMIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef_test_secret_key'
  const dir = mkdtempSync(join(tmpdir(), 'yeu-yeuca-test-'))
  const dbPath = join(dir, 'test.sqlite')
  const client = getDatabase(dbPath)
  runMigrations(client)
  const now = Date.now()

  client.db.insert(adminUsers).values({
    id: 'admin-super',
    username: 'superadmin',
    passwordHash: 'hash',
    displayName: 'Super',
    role: 'super',
    isActive: true,
    createdAt: now,
    updatedAt: now
  }).run()

  client.db.insert(contents).values([
    {
      id: 'club-yeuca',
      kind: 'club',
      slug: 'computer-association',
      title: '计算机协会',
      summary: '编程、网络、安全、计算机技术交流和实践项目',
      body: '计算机协会',
      status: 'published',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'club-music',
      kind: 'club',
      slug: 'music-association',
      title: '音乐协会',
      summary: '音乐社团',
      body: '音乐协会',
      status: 'published',
      createdAt: now,
      updatedAt: now
    }
  ]).run()

  return {
    client,
    cleanup() {
      closeDatabase(dbPath)
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

test('yeuca initializes 6 verified departments with zero fake news/projects and enforces club isolation', async () => {
  const { client, cleanup } = createTempClient()

  try {
    const initialPublic = getPublicYeucaSnapshot(client)
    assert.equal(initialPublic.settings.departments.length, 6)
    assert.equal(initialPublic.settings.departments[0]?.name, 'AI 部')
    assert.equal(initialPublic.news.length, 0)
    assert.equal(initialPublic.resources.length, 0)
    assert.equal(initialPublic.projects.length, 0)
    assert.equal(initialPublic.activities.length, 0)

    assert.equal(isComputerAssociationContent(client, 'club-yeuca'), true)
    assert.equal(isComputerAssociationContent(client, 'club-music'), false)

    const musicOrgSession = {
      admin: {
        id: 'org-music',
        role: 'organization',
        organization: { contentId: 'club-music', slug: 'music-association', title: '音乐协会', kind: 'club' }
      }
    } as unknown as AdminSessionContext

    assert.throws(
      () => resolveYeucaAdminScope(client, musicOrgSession),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )

    const caOrgSession = {
      admin: {
        id: 'org-ca',
        role: 'organization',
        organization: { contentId: 'club-yeuca', slug: 'computer-association', title: '计算机协会', kind: 'club' }
      }
    } as unknown as AdminSessionContext

    assert.equal(resolveYeucaAdminScope(client, caOrgSession).contentId, 'club-yeuca')

    const draftPost = createYeucaPost(client, 'admin-super', {
      kind: 'news',
      deptName: 'AI 部',
      category: '',
      title: '测试动态草稿',
      summary: '草稿不应公开',
      body: '草稿正文',
      tags: ['AI部'],
      pinned: false,
      status: 'draft'
    })
    const pubPost = createYeucaPost(client, 'admin-super', {
      kind: 'news',
      deptName: 'AI 部',
      category: '',
      title: '公开动态通知',
      summary: '应该对官网可见',
      body: '正文内容',
      tags: ['AI部'],
      pinned: true,
      status: 'published'
    })

    createYeucaProject(client, 'admin-super', {
      title: '隐藏项目',
      deptName: '编程部',
      track: '算法',
      status: 'planning',
      summary: '未发布项目',
      highlights: [],
      stack: [],
      previewImage: '',
      repoUrl: '',
      demoUrl: '',
      sortOrder: 1,
      isPublished: false
    })
    createYeucaProject(client, 'admin-super', {
      title: 'AI 部实操工具',
      deptName: 'AI 部',
      track: 'AI / Agent',
      status: 'active',
      summary: '已公开项目',
      highlights: ['支持检索'],
      stack: ['Python'],
      previewImage: '',
      repoUrl: '',
      demoUrl: '',
      sortOrder: 0,
      isPublished: true
    })

    const overview = await getAdminYeucaOverview(client)
    assert.equal(overview.posts.length, 2)
    assert.equal(overview.projects.length, 2)

    const snapshot = getPublicYeucaSnapshot(client)
    assert.equal(snapshot.news.length, 1)
    assert.equal(snapshot.news[0]?.id, pubPost.id)
    assert.equal(snapshot.projects.length, 1)
    assert.equal(snapshot.projects[0]?.title, 'AI 部实操工具')

    const publishedLater = updateYeucaPost(client, draftPost.id, { status: 'published' })
    assert.equal(publishedLater.status, 'published')
    assert.equal(getPublicYeucaSnapshot(client).news.length, 2)

    const updatedSettings = updateYeucaSettings(client, {
      campus: '仰恩大学洛江校区',
      tagline: '新标语',
      intro: '新介绍',
      recruitNote: '',
      contactNote: '迎新群 123',
      groupQrUrl: '/uploads/qr-test.png',
      departments: [
        ...initialPublic.settings.departments,
        {
          id: 'dept-cloud',
          code: '07 / CLOUD',
          name: '云原生研究组',
          lead: '林同学',
          isFeatured: false,
          acceptingRecruit: true,
          summary: '实验容器编排与自动化部署',
          focusList: ['Docker Compose', 'CI/CD 流水线'],
          tools: ['Docker', 'Linux'],
          recentTopic: '容器与服务部署',
          recruitDesc: '对后端与服务运维有兴趣即可加入'
        }
      ],
      extras: {
        heroImageUrl: '/uploads/hero-test.png',
        gallery: [{ id: 'g-1', title: '实验室讨论', caption: '周五分享', imageUrl: '/uploads/g1.png' }],
        flagshipNote: '由协会维护的仰恩大学迎新指南平台'
      }
    })
    assert.equal(updatedSettings.contactNote, '迎新群 123')
    assert.equal(updatedSettings.departments.length, 7)
    assert.equal(updatedSettings.extras.heroImageUrl, '/uploads/hero-test.png')

    const afterDeptsUpdate = getPublicYeucaSnapshot(client)
    assert.equal(afterDeptsUpdate.settings.departments.length, 7)
    assert.equal(afterDeptsUpdate.settings.departments[6]?.name, '云原生研究组')
    assert.equal(afterDeptsUpdate.settings.extras.gallery?.length, 1)
    assert.equal(afterDeptsUpdate.settings.extras.flagshipNote, '由协会维护的仰恩大学迎新指南平台')

    const reducedSettings = updateYeucaSettings(client, {
      campus: updatedSettings.campus,
      tagline: updatedSettings.tagline,
      intro: updatedSettings.intro,
      recruitNote: '',
      contactNote: updatedSettings.contactNote,
      groupQrUrl: updatedSettings.groupQrUrl,
      departments: updatedSettings.departments.slice(0, 5)
    })
    assert.equal(reducedSettings.departments.length, 5)
    assert.equal(reducedSettings.extras.heroImageUrl, '/uploads/hero-test.png')
  } finally {
    cleanup()
  }
})

test('yeuca member import, whitelist registration, gitea sync, disable, recruit approval and activity registration', async () => {
  const { client, cleanup } = createTempClient()
  const giteaCalls: SyncGiteaAccountInput[] = []

  const fakeGiteaSync = async (input: SyncGiteaAccountInput) => {
    giteaCalls.push(input)
    return {
      synced: true,
      gitUserId: 101,
      error: ''
    }
  }

  try {
    // 1. 解析 Excel 二维数组与粘贴文本
    const pasted = '学号\t姓名\t专业班级\t部门\t角色\n125920250165\t李磊\t25电子专升本1班\tAI 部\t副会长\n\t缺学号\t测试\tAI 部\t会员'
    const parsedPaste = parsePastedTextToMemberImportRows(pasted)
    assert.equal(parsedPaste.length, 2)
    assert.equal(parsedPaste[0]?.valid, true)
    assert.equal(parsedPaste[0]?.studentNo, '125920250165')
    assert.equal(parsedPaste[1]?.valid, false)

    const matrixParsed = parseMatrixToMemberImportRows([
      ['学号', '姓名', '班级', '所属部门'],
      ['20240010', '陈同学', '24计科2班', '编程部']
    ])
    assert.equal(matrixParsed[0]?.valid, true)
    assert.equal(matrixParsed[0]?.department, '编程部')

    // 2. 批量导入入库
    const importSummary = importYeucaMembersAdmin(client, 'admin-super', 'update_existing', [
      {
        studentNo: '125920250165',
        name: '李磊',
        gradeMajorClass: '25电子专升本1班',
        department: 'AI 部',
        roleTitle: '副会长',
        term: '2025-2026学年',
        phone: '',
        qq: '',
        email: '',
        gitUsername: '',
        notes: ''
      }
    ])
    assert.equal(importSummary.inserted, 1)

    // 3. 未导入名单者核验与注册均拒绝
    const notInList = verifyMemberEligibility(makeTestEvent(), client, '99999999', '路人甲')
    assert.equal(notInList.eligible, false)
    assert.equal(notInList.reason, 'NOT_IN_LIST')

    await assert.rejects(
      () => registerYeucaMember(makeTestEvent(), client, {
        studentNo: '99999999',
        name: '路人甲',
        gitUsername: 'lurenjia',
        email: '',
        password: 'Password123'
      }, { giteaSync: fakeGiteaSync }),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )

    // 4. 在册成员核验成功并开放注册 -> 同步开通 Gitea 并自动登录
    const okCheck = verifyMemberEligibility(makeTestEvent(), client, '125920250165', '李磊')
    assert.equal(okCheck.eligible, true)
    assert.equal(okCheck.profile?.suggestedGitUsername, '125920250165')

    const regRes = await registerYeucaMember(makeTestEvent(), client, {
      studentNo: '125920250165',
      name: '李磊',
      gitUsername: 'lilei_yeuca',
      email: 'lilei@example.com',
      password: 'Password123'
    }, { giteaSync: fakeGiteaSync })

    assert.equal(regRes.authenticated, true)
    assert.equal(regRes.member.gitUsername, 'lilei_yeuca')
    assert.equal(regRes.member.gitSynced, true)
    assert.equal(giteaCalls.length, 1)
    assert.equal(giteaCalls[0]?.username, 'lilei_yeuca')
    assert.equal(giteaCalls[0]?.active, true)

    // 5. Token 鉴权读取与修改密码同步 Gitea
    const authedSession = readOptionalYeucaMemberSession(makeTestEvent(regRes.sessionToken), client)
    assert.equal(authedSession?.member.studentNo, '125920250165')

    await changeMemberPassword(client, regRes.member.id, 'Password123', 'NewPassword456', {
      giteaSync: fakeGiteaSync
    })
    assert.equal(giteaCalls.length, 2)
    assert.equal(giteaCalls[1]?.password, 'NewPassword456')

    const loginRes = await loginYeucaMember(makeTestEvent(), client, 'lilei_yeuca', 'NewPassword456')
    assert.equal(loginRes.member.studentNo, '125920250165')

    // 6. 管理员停用成员同步冻结 Gitea 且注销全部会话
    const disabled = await updateYeucaMemberAdmin(client, regRes.member.id, {
      memberStatus: 'disabled'
    }, { giteaSync: fakeGiteaSync })
    assert.equal(disabled.memberStatus, 'disabled')
    assert.equal(giteaCalls.at(-1)?.active, false)
    assert.equal(readOptionalYeucaMemberSession(makeTestEvent(regRes.sessionToken), client), null)

    // 7. 招新一键审批转入白名单 + 活动报名与签到
    const now = Date.now()
    client.db.insert(recruitForms).values({
      id: 'rf-1',
      contentId: 'club-yeuca',
      title: '招新',
      slogan: '',
      intro: '',
      status: 'open',
      createdAt: now,
      updatedAt: now
    }).run()
    client.db.insert(recruitSubmissions).values({
      id: '11111111-1111-4111-8111-111111111111',
      formId: 'rf-1',
      name: '王新同学',
      studentNo: '20251001',
      major: '计算机',
      className: '1班',
      departments: '网络安全部',
      createdAt: now
    }).run()

    const approved = approveRecruitSubmissionsToMembers(
      client,
      'club-yeuca',
      'admin-super',
      ['11111111-1111-4111-8111-111111111111'],
      'AI 部',
      '2025-2026学年'
    )
    assert.equal(approved.imported, 1)
    assert.equal(verifyMemberEligibility(makeTestEvent(), client, '20251001', '王新同学').eligible, true)

    // 恢复李磊并测试直管活动与会员报名签到
    await updateYeucaMemberAdmin(client, regRes.member.id, { memberStatus: 'active' }, { giteaSync: fakeGiteaSync })
    const act = createYeucaActivityAdmin(client, 'admin-super', {
      title: 'Agent 工作流实战分享',
      deptName: 'AI 部',
      category: '技术培训',
      summary: '手把手带跑工具调用',
      body: '带笔记本电脑',
      placeName: '图信楼',
      room: '302 机房',
      startsAt: new Date(now + 3600 * 1000).toISOString(),
      endsAt: null,
      allowRegistration: true,
      maxParticipants: 40,
      status: 'published',
      photos: []
    })
    assert.equal(getPublicYeucaSnapshot(client).activities.length, 1)

    const regStatus = setMemberActivityRegistration(client, act.id, regRes.member.id, 'register', '带笔记本参加')
    assert.equal(regStatus.status, 'registered')
    assert.equal(regStatus.registrationCount, 1)

    const regs = listActivityRegistrationsAdmin(client, act.id)
    assert.equal(regs.length, 1)
    assert.equal(regs[0]?.studentNo, '125920250165')

    updateActivityRegistrationStatusAdmin(client, regs[0]!.id, 'checked_in')
    assert.equal(listActivityRegistrationsAdmin(client, act.id)[0]?.status, 'checked_in')
  } finally {
    cleanup()
  }
})
