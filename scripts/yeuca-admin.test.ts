import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { adminUsers, contents } from '../server/database/schema'
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

function createTempClient() {
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

test('yeuca initializes 6 verified departments with zero fake news/projects and enforces club isolation', () => {
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

    const overview = getAdminYeucaOverview(client)
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
