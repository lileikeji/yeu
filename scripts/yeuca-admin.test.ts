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
import { adminUsers, auditLogs, contents, recruitForms, recruitSubmissions } from '../server/database/schema'
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
  createYeucaMinister,
  listYeucaAuditLogs,
  listYeucaMinisters,
  updateYeucaMinister
} from '../server/modules/yeuca/minister-service'
import {
  createYeucaPost,
  createYeucaProject,
  getAdminYeucaOverview,
  getPublicYeucaSnapshot,
  isComputerAssociationContent,
  resolveRecruitDepartmentOptions,
  updateYeucaOwnDepartment,
  updateYeucaPost,
  updateYeucaSettings
} from '../server/modules/yeuca/service'
import { validateSubmissionInput } from '../server/modules/recruit/service'
import {
  assertYeucaDepartmentAccess,
  requireYeucaChiefScope,
  resolveYeucaAdminScope
} from '../server/utils/yeuca-admin'
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

test('报名表按站点部门名单校验意向部门，部门改名后也不会被拒', () => {
  const fieldsJson = JSON.stringify([
    { key: 'name', label: '姓名', type: 'text', required: true },
    { key: 'departments', label: '意向部门', type: 'multiselect', required: true, options: [] }
  ])
  const departments = [
    { name: 'AI 部', acceptingRecruit: true },
    { name: '宣传部', acceptingRecruit: true },
    { name: '运维部', acceptingRecruit: false }
  ]

  const resolved = JSON.parse(resolveRecruitDepartmentOptions(fieldsJson, departments)) as {
    key: string
    required?: boolean
    options?: string[]
  }[]
  const deptField = resolved.find(item => item.key === 'departments')!
  assert.equal(deptField.required, false)
  assert.deepEqual(deptField.options, ['暂未确定（进群后再定）', 'AI 部', '宣传部'])

  const normalized = validateSubmissionInput(
    resolved as Parameters<typeof validateSubmissionInput>[0],
    { name: '张三', departments: ['宣传部'] }
  )
  assert.equal(normalized.departments, '宣传部')
})

test('总管创建部门部长、部长严格按部门隔离且开户/登录全链路写审计', async () => {
  const { client, cleanup } = createTempClient()

  try {
    const now = Date.now()
    client.db.insert(adminUsers).values({
      id: 'chief-ca',
      username: '计算机协会',
      passwordHash: 'hash',
      displayName: '计算机协会管理员',
      role: 'organization',
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).run()

    const chiefSession = {
      admin: {
        id: 'chief-ca',
        role: 'organization',
        organization: { contentId: 'club-yeuca', slug: 'computer-association', title: '计算机协会', kind: 'club' },
        yeucaScope: { role: 'chief', departmentName: null, title: '计协总管' }
      }
    } as unknown as AdminSessionContext

    const chiefScope = requireYeucaChiefScope(client, chiefSession)
    assert.equal(chiefScope.isChief, true)

    // 1. 总管创建 AI 部部长账号
    const created = await createYeucaMinister(client, 'chief-ca', {
      departmentName: 'AI 部',
      username: 'ai-minister',
      title: '部长'
    })
    assert.equal(created.account.departmentName, 'AI 部')
    assert.equal(created.account.mustChangePassword, true)
    assert.ok(created.initialPassword.length >= 16)
    assert.equal(listYeucaMinisters(client).length, 1)

    const ministerSession = {
      admin: {
        id: created.account.id,
        role: 'organization',
        organization: { contentId: 'club-yeuca', slug: 'computer-association', title: '计算机协会', kind: 'club' },
        yeucaScope: { role: 'minister', departmentName: 'AI 部', title: '部长' }
      }
    } as unknown as AdminSessionContext

    const ministerScope = resolveYeucaAdminScope(client, ministerSession)
    assert.equal(ministerScope.isChief, false)
    assert.equal(ministerScope.departmentName, 'AI 部')
    assert.throws(
      () => requireYeucaChiefScope(client, ministerSession),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )
    assert.throws(
      () => assertYeucaDepartmentAccess(ministerScope, '编程部', '成员'),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )

    // 2. 跨部门成员/招新/动态/项目与导入隔离
    importYeucaMembersAdmin(client, 'chief-ca', 'update_existing', [
      {
        studentNo: '20250002',
        name: '网络部同学',
        gradeMajorClass: '计科2班',
        department: '网络安全部',
        roleTitle: '会员',
        term: '2025',
        phone: '',
        qq: '',
        email: '',
        gitUsername: '',
        notes: ''
      }
    ])

    // 部长导入名录：同校已属其他部门学号跳过，新学号强制归本部门，会长职务自动降为会员
    const ministerImport = importYeucaMembersAdmin(client, created.account.id, 'update_existing', [
      {
        studentNo: '20250002',
        name: '抢占测试',
        gradeMajorClass: '计科2班',
        department: 'AI 部',
        roleTitle: '会员',
        term: '2025',
        phone: '',
        qq: '',
        email: '',
        gitUsername: '',
        notes: ''
      },
      {
        studentNo: '20250001',
        name: 'AI 部新同学',
        gradeMajorClass: 'AI 1班',
        department: '编程部',
        roleTitle: '会长',
        term: '2025',
        phone: '',
        qq: '',
        email: '',
        gitUsername: '',
        notes: ''
      }
    ], 'AI 部')
    assert.equal(ministerImport.skipped, 1)
    assert.equal(ministerImport.inserted, 1)

    createYeucaPost(client, 'chief-ca', {
      kind: 'news',
      deptName: '网络安全部',
      category: '',
      title: '安全部动态',
      summary: '安全分享',
      body: '正文',
      tags: [],
      pinned: false,
      status: 'published'
    })
    createYeucaPost(client, created.account.id, {
      kind: 'news',
      deptName: 'AI 部',
      category: '',
      title: 'AI部动态',
      summary: 'RAG实战',
      body: '正文',
      tags: [],
      pinned: false,
      status: 'published'
    })

    const ministerView = await getAdminYeucaOverview(client, ministerScope)
    assert.equal(ministerView.members.length, 1)
    assert.equal(ministerView.members[0]?.department, 'AI 部')
    assert.equal(ministerView.members[0]?.roleTitle, '会员')
    assert.equal(ministerView.posts.length, 1)
    assert.equal(ministerView.posts[0]?.deptName, 'AI 部')

    // 3. 部长招新审批仅能处理含本部门意向的报名
    client.db.insert(recruitForms).values({
      id: 'rf-scope',
      contentId: 'club-yeuca',
      title: '招新',
      slogan: '',
      intro: '',
      status: 'open',
      createdAt: now,
      updatedAt: now
    }).run()
    client.db.insert(recruitSubmissions).values([
      {
        id: '22222222-2222-4222-8222-222222222222',
        formId: 'rf-scope',
        name: '报名网络部',
        studentNo: '20250099',
        departments: '网络安全部',
        createdAt: now
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        formId: 'rf-scope',
        name: '报名AI部',
        studentNo: '20250088',
        departments: 'AI 部、编程部',
        createdAt: now
      }
    ]).run()

    assert.throws(
      () => approveRecruitSubmissionsToMembers(client, 'club-yeuca', created.account.id, ['22222222-2222-4222-8222-222222222222'], 'AI 部', '2025', 'AI 部'),
      (err: { statusCode?: number }) => err?.statusCode === 403
    )
    const okApprove = approveRecruitSubmissionsToMembers(client, 'club-yeuca', created.account.id, ['33333333-3333-4333-8333-333333333333'], '编程部', '2025', 'AI 部')
    assert.equal(okApprove.imported, 1)

    // 4. 公开端白名单核验、Gitea 开户失败/成功、登录失败/成功全写入 audit_logs 且部长仅见本部门
    verifyMemberEligibility(makeTestEvent(), client, '00000000', '不存在')
    const failSync = async () => {
      throw new Error('Gitea offline test')
    }
    await assert.rejects(
      () => registerYeucaMember(makeTestEvent(), client, {
        studentNo: '20250001',
        name: 'AI 部新同学',
        gitUsername: 'ai_stu_01',
        email: '',
        password: 'Password123'
      }, { giteaSync: failSync })
    )
    await registerYeucaMember(makeTestEvent(), client, {
      studentNo: '20250001',
      name: 'AI 部新同学',
      gitUsername: 'ai_stu_01',
      email: '',
      password: 'Password123'
    }, {
      giteaSync: async () => ({ synced: true, gitUserId: 99, error: '' })
    })
    await assert.rejects(
      () => loginYeucaMember(makeTestEvent(), client, 'ai_stu_01', 'WrongPwd123')
    )
    await loginYeucaMember(makeTestEvent(), client, 'ai_stu_01', 'Password123')

    const allAudit = client.db.select().from(auditLogs).all()
    assert.ok(allAudit.some(a => a.action === 'yeuca.member.verify_rejected'))
    assert.ok(allAudit.some(a => a.action === 'yeuca.member.gitea_sync_failed'))
    assert.ok(allAudit.some(a => a.action === 'yeuca.member.register'))
    assert.ok(allAudit.some(a => a.action === 'yeuca.member.login_failed'))
    assert.ok(allAudit.some(a => a.action === 'yeuca.member.login'))

    const ministerAudit = listYeucaAuditLogs(client, ministerScope, created.account.id, { category: 'all' })
    assert.ok(ministerAudit.items.some(a => a.action === 'yeuca.member.register'))
    assert.ok(ministerAudit.items.every(a => a.action !== 'yeuca.member.verify_rejected'))

    // 5. 部长只修改自己部门详情、总管重设部长密码
    const updatedDept = updateYeucaOwnDepartment(client, 'AI 部', { recentTopic: '多 Agent 工具调用周赛' })
    assert.equal(updatedDept.recentTopic, '多 Agent 工具调用周赛')

    const resetRes = await updateYeucaMinister(client, created.account.id, { resetPassword: true })
    assert.equal(resetRes.passwordReset, true)
    assert.ok(resetRes.initialPassword && resetRes.initialPassword !== created.initialPassword)
  } finally {
    cleanup()
  }
})
