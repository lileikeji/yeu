import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import type { AdminSessionContext } from '../server/utils/auth'
import {
  activityReviewRecipients,
  archiveActivity,
  createActivity,
  deleteActivity,
  getAdminActivity,
  getPublicActivity,
  listAdminActivities,
  listHomepageActivities,
  listPublicActivities,
  reviewActivity,
  submitActivity,
  updateActivity
} from '../server/modules/activities/service'

const SUPER_ADMIN_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const ORG_ADMIN_A_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'
const ORG_ADMIN_B_ID = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f'
const CLUB_A_ID = 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70'
const CLUB_B_ID = 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7081'
const BUILDING_ID = 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708192'
const DRAFT_BUILDING_ID = 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f708192a3'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-activities-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)

  const now = Date.now()
  client.sqlite.prepare(`
    INSERT INTO admin_users (id, username, password_hash, display_name, created_at, updated_at)
    VALUES
      (?, 'super', 'x', '总管理员', ?, ?),
      (?, 'club-a-admin', 'x', '社团甲管理员', ?, ?),
      (?, 'club-b-admin', 'x', '社团乙管理员', ?, ?)
  `).run(SUPER_ADMIN_ID, now, now, ORG_ADMIN_A_ID, now, now, ORG_ADMIN_B_ID, now, now)

  client.sqlite.prepare(`
    INSERT INTO contents (id, kind, slug, title, summary, status, created_at, updated_at)
    VALUES
      (?, 'club', 'club-a', '社团甲', '甲社团简介', 'published', ?, ?),
      (?, 'club', 'club-b', '社团乙', '乙社团简介', 'published', ?, ?)
  `).run(CLUB_A_ID, now, now, CLUB_B_ID, now, now)

  client.sqlite.prepare(`
    INSERT INTO places (id, slug, name, summary, scope, type, category, status, created_at, updated_at)
    VALUES
      (?, 'teaching-building-a', '吉龙楼', '教学楼', 'campus', 'teaching-building', 'campus-building', 'published', ?, ?),
      (?, 'teaching-building-draft', '待发布楼', '教学楼', 'campus', 'teaching-building', 'campus-building', 'draft', ?, ?)
  `).run(BUILDING_ID, now, now, DRAFT_BUILDING_ID, now, now)

  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function organizationSession(
  adminId: string,
  contentId: string,
  slug: string,
  title: string
): AdminSessionContext {
  return {
    admin: {
      id: adminId,
      username: `${slug}-admin`,
      displayName: title,
      role: 'organization',
      mustChangePassword: false,
      organization: { contentId, kind: 'club', slug, title }
    },
    sessionId: 'test-session',
    expiresAt: Date.now() + 60_000,
    csrfToken: 'test-csrf'
  }
}

function superSession(): AdminSessionContext {
  return {
    admin: {
      id: SUPER_ADMIN_ID,
      username: 'super',
      displayName: '总管理员',
      role: 'super',
      mustChangePassword: false,
      organization: null
    },
    sessionId: 'test-super-session',
    expiresAt: Date.now() + 60_000,
    csrfToken: 'test-csrf'
  }
}

function activityInput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Agent 工作流分享会',
    summary: '计算机协会技术分享，欢迎旁听。',
    body: '第一场：Agent 基础\n第二场：工作流实操',
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    placeId: BUILDING_ID,
    room: '吉龙楼 302',
    photos: ['/uploads/activity-a.png'],
    ...overrides
  }
}

test('activities: 组织创建草稿并带出组织与教学楼', () => {
  const { client, cleanup } = createFixture()
  try {
    const session = organizationSession(ORG_ADMIN_A_ID, CLUB_A_ID, 'club-a', '社团甲')
    const activity = createActivity(client, session, activityInput())

    assert.equal(activity.status, 'draft')
    assert.equal(activity.organization?.slug, 'club-a')
    assert.equal(activity.organization?.kind, 'club')
    assert.equal(activity.place?.name, '吉龙楼')
    assert.equal(activity.room, '吉龙楼 302')
    assert.deepEqual(activity.photos, ['/uploads/activity-a.png'])
    assert.match(activity.slug, /^[a-z0-9-]+-[0-9a-f]{6}$/)
    assert.equal(activity.publishedAt, null)
  } finally {
    cleanup()
  }
})

test('activities: 只有组织管理员能创建，总管理员只审核', () => {
  const { client, cleanup } = createFixture()
  try {
    const session = organizationSession(ORG_ADMIN_A_ID, CLUB_A_ID, 'club-a', '社团甲')
    assert.throws(
      () => createActivity(client, superSession(), activityInput()),
      (error: { statusCode?: number }) => error.statusCode === 403
    )
    assert.equal(listAdminActivities(client, session, { page: 1, pageSize: 20 }).total, 0)
  } finally {
    cleanup()
  }
})

test('activities: 提交后进入待审核，总管理员通过后公开', () => {
  const { client, cleanup } = createFixture()
  try {
    const org = organizationSession(ORG_ADMIN_A_ID, CLUB_A_ID, 'club-a', '社团甲')
    const created = createActivity(client, org, activityInput())

    assert.equal(listPublicActivities(client, { limit: 20, includePast: false }).total, 0)

    const pending = submitActivity(client, org, created.id)
    assert.equal(pending.status, 'pending')
    assert.ok(pending.submittedAt)
    assert.equal(listPublicActivities(client, { limit: 20, includePast: false }).total, 0)

    const published = reviewActivity(client, superSession(), created.id, {
      decision: 'approve',
      note: null
    })
    assert.equal(published.status, 'published')
    assert.ok(published.publishedAt)
    assert.equal(published.reviewedAt !== null, true)

    const publicList = listPublicActivities(client, {
      organization: 'club-a',
      limit: 20,
      includePast: false
    })
    assert.equal(publicList.total, 1)
    assert.equal(publicList.items[0]!.coverUrl, '/uploads/activity-a.png')
    assert.equal(publicList.items[0]!.organization?.title, '社团甲')
    assert.equal(publicList.items[0]!.place?.name, '吉龙楼')

    const detail = getPublicActivity(client, created.slug)
    assert.equal(detail.title, created.title)
    assert.equal(detail.body, created.body)
    assert.equal(detail.organization?.slug, 'club-a')

    assert.equal(listHomepageActivities(client, 5).length, 1)

    assert.throws(
      () => reviewActivity(client, superSession(), created.id, { decision: 'approve', note: null }),
      (error: { statusCode?: number }) => error.statusCode === 409
    )
  } finally {
    cleanup()
  }
})

test('activities: 驳回保留意见，组织可修改后再次提交', () => {
  const { client, cleanup } = createFixture()
  try {
    const org = organizationSession(ORG_ADMIN_A_ID, CLUB_A_ID, 'club-a', '社团甲')
    const created = createActivity(client, org, activityInput())
    submitActivity(client, org, created.id)

    const rejected = reviewActivity(client, superSession(), created.id, {
      decision: 'reject',
      note: '地点与教室不匹配，请核对。'
    })
    assert.equal(rejected.status, 'rejected')
    assert.equal(rejected.reviewNote, '地点与教室不匹配，请核对。')
    assert.equal(rejected.publishedAt, null)

    const updated = updateActivity(client, org, created.id, { room: '吉龙楼 401' })
    assert.equal(updated.room, '吉龙楼 401')
    assert.equal(updated.status, 'rejected')

    const resubmitted = submitActivity(client, org, created.id)
    assert.equal(resubmitted.status, 'pending')
    assert.equal(resubmitted.reviewNote, null)
  } finally {
    cleanup()
  }
})

test('activities: 组织之间相互隔离，未关联教学楼不能公开', () => {
  const { client, cleanup } = createFixture()
  try {
    const orgA = organizationSession(ORG_ADMIN_A_ID, CLUB_A_ID, 'club-a', '社团甲')
    const orgB = organizationSession(ORG_ADMIN_B_ID, CLUB_B_ID, 'club-b', '社团乙')
    const created = createActivity(client, orgA, activityInput())

    assert.equal(listAdminActivities(client, orgB, { page: 1, pageSize: 20 }).total, 0)
    assert.throws(
      () => getAdminActivity(client, orgB, created.id),
      (error: { statusCode?: number }) => error.statusCode === 404
    )
    assert.throws(
      () => updateActivity(client, orgB, created.id, { room: '别的楼' }),
      (error: { statusCode?: number }) => error.statusCode === 404
    )

    assert.throws(
      () => createActivity(client, orgA, activityInput({ placeId: DRAFT_BUILDING_ID })),
      (error: { statusCode?: number }) => error.statusCode === 422
    )
  } finally {
    cleanup()
  }
})

test('activities: 删除草稿与归档已发布活动', () => {
  const { client, cleanup } = createFixture()
  try {
    const org = organizationSession(ORG_ADMIN_A_ID, CLUB_A_ID, 'club-a', '社团甲')
    const draft = createActivity(client, org, activityInput())
    deleteActivity(client, org, draft.id)
    assert.throws(
      () => getAdminActivity(client, org, draft.id),
      (error: { statusCode?: number }) => error.statusCode === 404
    )

    const published = createActivity(client, org, activityInput({ title: '已发布活动' }))
    submitActivity(client, org, published.id)
    reviewActivity(client, superSession(), published.id, { decision: 'approve', note: null })
    assert.equal(listHomepageActivities(client, 5).length, 1)

    const archived = archiveActivity(client, org, published.id)
    assert.equal(archived.status, 'archived')
    assert.equal(listHomepageActivities(client, 5).length, 0)
  } finally {
    cleanup()
  }
})

test('activities: 审核邮件收件人支持多地址与回退', () => {
  assert.deepEqual(
    activityReviewRecipients({
      ACTIVITY_REVIEW_EMAIL: 'review-a@example.com, review-b@example.com'
    } as NodeJS.ProcessEnv),
    ['review-a@example.com', 'review-b@example.com']
  )
  assert.deepEqual(
    activityReviewRecipients({ ALERT_TO_EMAIL: 'ops@example.com' } as NodeJS.ProcessEnv),
    ['ops@example.com']
  )
  assert.deepEqual(activityReviewRecipients({} as NodeJS.ProcessEnv), [])
})
