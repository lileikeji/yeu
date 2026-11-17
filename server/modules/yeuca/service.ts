import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { and, desc, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { DatabaseClient } from '../../database/client'
import {
  activities,
  contents,
  places,
  recruitForms,
  recruitSubmissions,
  yeucaMembers,
  yeucaPosts,
  yeucaProjects,
  yeucaSiteSettings
} from '../../database/schema'
import { ensureRecruitForm, getRecruitFormBySlug } from '../recruit/service'
import { inspectGiteaHealth } from './gitea'
import { listYeucaActivitiesAdmin, listYeucaActivitiesPublic } from './activity-service'
import { listYeucaMembersAdmin } from './member-service'
import type {
  createYeucaPostSchema,
  createYeucaProjectSchema,
  updateYeucaPostSchema,
  updateYeucaProjectSchema,
  updateYeucaRecruitConfigSchema,
  updateYeucaSettingsSchema
} from '../../../shared/schemas/yeuca'
import type {
  YeucaAdminOverviewPayload,
  YeucaDepartment,
  YeucaPostItem,
  YeucaProjectItem,
  YeucaPublicActivityItem,
  YeucaPublicSnapshot,
  YeucaRecruitAdminConfig,
  YeucaRecruitSubmissionAdminItem,
  YeucaSiteExtras,
  YeucaSiteSettings
} from '../../../shared/types/yeuca'
import {
  COMPUTER_ASSOCIATION_SLUG,
  COMPUTER_ASSOCIATION_TITLE,
  DEFAULT_YEUCA_DEPARTMENTS,
  DEFAULT_YEUCA_INTRO,
  DEFAULT_YEUCA_TAGLINE,
  YEUCA_HISTORY_FACTS
} from '../../../shared/utils/yeuca'

type UpdateSettingsInput = z.infer<typeof updateYeucaSettingsSchema>
type CreatePostInput = z.infer<typeof createYeucaPostSchema>
type UpdatePostInput = z.infer<typeof updateYeucaPostSchema>
type CreateProjectInput = z.infer<typeof createYeucaProjectSchema>
type UpdateProjectInput = z.infer<typeof updateYeucaProjectSchema>

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as T[] : fallback
  } catch {
    return fallback
  }
}

function parseJsonObject<T extends object>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as T
      : fallback
  } catch {
    return fallback
  }
}

function formatDate(ms: number | Date | null | undefined): string {
  if (!ms) return ''
  const date = typeof ms === 'number' ? new Date(ms) : ms
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function makePostSlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const suffix = randomUUID().slice(0, 8)
  return ascii ? `${ascii}-${suffix}` : `post-${suffix}`
}

export function findComputerAssociationContent(client: DatabaseClient) {
  return client.db
    .select({
      id: contents.id,
      slug: contents.slug,
      title: contents.title,
      status: contents.status,
      kind: contents.kind
    })
    .from(contents)
    .where(eq(contents.slug, COMPUTER_ASSOCIATION_SLUG))
    .get()
    ?? client.db
      .select({
        id: contents.id,
        slug: contents.slug,
        title: contents.title,
        status: contents.status,
        kind: contents.kind
      })
      .from(contents)
      .where(eq(contents.title, COMPUTER_ASSOCIATION_TITLE))
      .get()
      ?? null
}

export function isComputerAssociationContent(client: DatabaseClient, contentId: string): boolean {
  const row = client.db
    .select({ slug: contents.slug, title: contents.title })
    .from(contents)
    .where(eq(contents.id, contentId))
    .get()
  return Boolean(
    row && (row.slug === COMPUTER_ASSOCIATION_SLUG || row.title === COMPUTER_ASSOCIATION_TITLE)
  )
}

function serializeSettings(row: typeof yeucaSiteSettings.$inferSelect): YeucaSiteSettings {
  const departments = parseJsonArray<YeucaDepartment>(row.departmentsJson, DEFAULT_YEUCA_DEPARTMENTS)
  const extras = parseJsonObject<YeucaSiteExtras>(row.extrasJson, {})
  return {
    id: row.id,
    contentId: row.contentId,
    campus: row.campus,
    tagline: row.tagline,
    intro: row.intro,
    recruitNote: row.recruitNote,
    contactNote: row.contactNote,
    groupQrUrl: row.groupQrUrl,
    departments: departments.length > 0 ? departments : DEFAULT_YEUCA_DEPARTMENTS,
    extras,
    updatedAt: Number(row.updatedAt)
  }
}

export function ensureYeucaSettings(client: DatabaseClient): YeucaSiteSettings {
  const club = findComputerAssociationContent(client)
  const existing = club
    ? client.db.select().from(yeucaSiteSettings).where(eq(yeucaSiteSettings.contentId, club.id)).get()
    : null
  const fallbackRow = existing ?? client.db.select().from(yeucaSiteSettings).get()
  if (fallbackRow) {
    if (!fallbackRow.contentId && club) {
      client.db
        .update(yeucaSiteSettings)
        .set({ contentId: club.id, updatedAt: Date.now() })
        .where(eq(yeucaSiteSettings.id, fallbackRow.id))
        .run()
      return serializeSettings({ ...fallbackRow, contentId: club.id })
    }
    return serializeSettings(fallbackRow)
  }

  const now = Date.now()
  const row: typeof yeucaSiteSettings.$inferInsert = {
    id: 'yeuca-default',
    contentId: club?.id ?? null,
    campus: YEUCA_HISTORY_FACTS.campus,
    tagline: DEFAULT_YEUCA_TAGLINE,
    intro: DEFAULT_YEUCA_INTRO,
    recruitNote: '',
    contactNote: '',
    groupQrUrl: '',
    departmentsJson: JSON.stringify(DEFAULT_YEUCA_DEPARTMENTS),
    extrasJson: '{}',
    createdAt: now,
    updatedAt: now
  }
  client.db.insert(yeucaSiteSettings).values(row).run()
  return serializeSettings(client.db.select().from(yeucaSiteSettings).where(eq(yeucaSiteSettings.id, 'yeuca-default')).get()!)
}

function serializePost(row: typeof yeucaPosts.$inferSelect): YeucaPostItem {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    deptName: row.deptName,
    category: row.category,
    title: row.title,
    summary: row.summary,
    body: row.body,
    tags: parseJsonArray<string>(row.tagsJson, []),
    pinned: Boolean(row.pinned),
    status: row.status,
    publishedAt: row.publishedAt ? formatDate(row.publishedAt) : null,
    updatedAt: formatDate(row.updatedAt)
  }
}

function serializeProject(row: typeof yeucaProjects.$inferSelect): YeucaProjectItem {
  return {
    id: row.id,
    title: row.title,
    deptName: row.deptName,
    track: row.track,
    status: row.status,
    summary: row.summary,
    highlights: parseJsonArray<string>(row.highlightsJson, []),
    stack: parseJsonArray<string>(row.stackJson, []),
    previewImage: row.previewImage,
    repoUrl: row.repoUrl,
    demoUrl: row.demoUrl,
    sortOrder: row.sortOrder,
    isPublished: Boolean(row.isPublished),
    updatedAt: formatDate(row.updatedAt)
  }
}

export function getYeucaRecruitAdminConfig(client: DatabaseClient, contentId: string | null): YeucaRecruitAdminConfig {
  if (!contentId) {
    return {
      open: false,
      title: '仰恩大学计算机协会纳新报名',
      slogan: '',
      intro: '',
      totalSubmissions: 0,
      submissions: []
    }
  }

  const form = client.db
    .select()
    .from(recruitForms)
    .where(eq(recruitForms.contentId, contentId))
    .get()

  if (!form) {
    return {
      open: false,
      title: '仰恩大学计算机协会纳新报名',
      slogan: '',
      intro: '',
      totalSubmissions: 0,
      submissions: []
    }
  }

  const subRows = client.db
    .select()
    .from(recruitSubmissions)
    .where(eq(recruitSubmissions.formId, form.id))
    .orderBy(desc(recruitSubmissions.createdAt))
    .limit(300)
    .all()

  const memberRows = client.db
    .select({
      studentNo: yeucaMembers.studentNo,
      memberStatus: yeucaMembers.memberStatus,
      recruitSubmissionId: yeucaMembers.recruitSubmissionId
    })
    .from(yeucaMembers)
    .all()

  const bySubId = new Map(
    memberRows
      .filter(m => m.recruitSubmissionId)
      .map(m => [m.recruitSubmissionId!, m.memberStatus])
  )
  const byStudentNo = new Map(
    memberRows.map(m => [m.studentNo.trim().toLowerCase(), m.memberStatus])
  )

  const submissions: YeucaRecruitSubmissionAdminItem[] = subRows.map((row) => {
    const cleanNo = (row.studentNo || '').trim().toLowerCase()
    const matchedStatus = bySubId.get(row.id) ?? (cleanNo ? byStudentNo.get(cleanNo) : undefined) ?? null
    let parsedData: Record<string, unknown> = {}
    try {
      const p: unknown = JSON.parse(row.dataJson)
      if (p && typeof p === 'object' && !Array.isArray(p)) parsedData = p as Record<string, unknown>
    } catch {
      parsedData = {}
    }
    return {
      id: row.id,
      name: row.name || String(parsedData.name || ''),
      studentNo: row.studentNo || String(parsedData.studentNo || ''),
      major: row.major || String(parsedData.major || ''),
      className: row.className || String(parsedData.className || ''),
      phone: row.phone || String(parsedData.phone || ''),
      qq: row.qq || String(parsedData.qq || ''),
      departments: row.departments || (Array.isArray(parsedData.departments) ? parsedData.departments.join('、') : String(parsedData.departments || '')),
      createdAt: new Date(row.createdAt).toISOString(),
      data: parsedData,
      memberImported: matchedStatus !== null,
      memberStatus: matchedStatus
    }
  })

  return {
    open: form.status === 'open',
    title: form.title,
    slogan: form.slogan,
    intro: form.intro,
    totalSubmissions: submissions.length,
    submissions
  }
}

export function updateYeucaRecruitConfig(
  client: DatabaseClient,
  contentId: string,
  input: z.infer<typeof updateYeucaRecruitConfigSchema>
): YeucaRecruitAdminConfig {
  const form = ensureRecruitForm(client, contentId)
  client.db
    .update(recruitForms)
    .set({
      status: input.open ? 'open' : 'closed',
      title: input.title.trim(),
      slogan: input.slogan.trim(),
      intro: input.intro.trim(),
      updatedAt: Date.now()
    })
    .where(eq(recruitForms.id, form.id))
    .run()
  return getYeucaRecruitAdminConfig(client, contentId)
}

export async function getAdminYeucaOverview(client: DatabaseClient): Promise<YeucaAdminOverviewPayload> {
  const settings = ensureYeucaSettings(client)
  const postRows = client.db
    .select()
    .from(yeucaPosts)
    .orderBy(desc(yeucaPosts.pinned), desc(yeucaPosts.updatedAt))
    .all()
  const projectRows = client.db
    .select()
    .from(yeucaProjects)
    .orderBy(yeucaProjects.sortOrder, desc(yeucaProjects.updatedAt))
    .all()

  const posts = postRows.map(serializePost)
  const projects = projectRows.map(serializeProject)
  const yeucaActivitiesList = listYeucaActivitiesAdmin(client)
  const membersList = listYeucaMembersAdmin(client)
  const recruit = getYeucaRecruitAdminConfig(client, settings.contentId)

  let campusPublishedActivities = 0
  if (settings.contentId) {
    campusPublishedActivities = client.db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.organizationContentId, settings.contentId), eq(activities.status, 'published')))
      .all()
      .length
  }

  const gitSyncedMembers = membersList.filter(m => m.gitSynced && m.memberStatus === 'active').length
  const gitea = await inspectGiteaHealth(gitSyncedMembers)

  return {
    settings,
    posts,
    projects,
    activities: yeucaActivitiesList,
    members: membersList,
    recruit,
    gitea,
    stats: {
      publishedNews: posts.filter(p => p.kind === 'news' && p.status === 'published').length,
      publishedResources: posts.filter(p => p.kind === 'resource' && p.status === 'published').length,
      publishedProjects: projects.filter(p => p.isPublished).length,
      publishedActivities: yeucaActivitiesList.filter(a => a.status === 'published').length + campusPublishedActivities,
      recruitOpen: recruit.open,
      recruitSubmissions: recruit.totalSubmissions,
      totalMembers: membersList.length,
      activeMembers: membersList.filter(m => m.memberStatus === 'active').length,
      pendingMembers: membersList.filter(m => m.memberStatus === 'pending').length,
      gitSyncedMembers
    }
  }
}

export function updateYeucaSettings(client: DatabaseClient, input: UpdateSettingsInput): YeucaSiteSettings {
  const current = ensureYeucaSettings(client)
  const now = Date.now()
  client.db
    .update(yeucaSiteSettings)
    .set({
      campus: input.campus,
      tagline: input.tagline,
      intro: input.intro,
      recruitNote: input.recruitNote,
      contactNote: input.contactNote,
      groupQrUrl: input.groupQrUrl,
      departmentsJson: JSON.stringify(input.departments),
      ...(input.extras !== undefined ? { extrasJson: JSON.stringify(input.extras) } : {}),
      updatedAt: now
    })
    .where(eq(yeucaSiteSettings.id, current.id))
    .run()

  return ensureYeucaSettings(client)
}

export function createYeucaPost(
  client: DatabaseClient,
  adminId: string,
  input: CreatePostInput
): YeucaPostItem {
  const now = Date.now()
  const id = randomUUID()
  const row: typeof yeucaPosts.$inferInsert = {
    id,
    slug: makePostSlug(input.title),
    kind: input.kind,
    deptName: input.deptName,
    category: input.category,
    title: input.title,
    summary: input.summary,
    body: input.body,
    tagsJson: JSON.stringify(input.tags),
    pinned: input.pinned,
    status: input.status,
    publishedAt: input.status === 'published' ? now : null,
    createdByAdminId: adminId,
    createdAt: now,
    updatedAt: now
  }
  client.db.insert(yeucaPosts).values(row).run()
  return serializePost(client.db.select().from(yeucaPosts).where(eq(yeucaPosts.id, id)).get()!)
}

export function updateYeucaPost(
  client: DatabaseClient,
  id: string,
  input: UpdatePostInput
): YeucaPostItem {
  const existing = client.db.select().from(yeucaPosts).where(eq(yeucaPosts.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found', data: { code: 'NOT_FOUND' } })
  }

  const now = Date.now()
  const nextStatus = input.status ?? existing.status
  const publishedAt = nextStatus === 'published'
    ? (existing.publishedAt ?? now)
    : existing.publishedAt

  client.db
    .update(yeucaPosts)
    .set({
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.deptName !== undefined ? { deptName: input.deptName } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.tags !== undefined ? { tagsJson: JSON.stringify(input.tags) } : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      publishedAt,
      updatedAt: now
    })
    .where(eq(yeucaPosts.id, id))
    .run()

  return serializePost(client.db.select().from(yeucaPosts).where(eq(yeucaPosts.id, id)).get()!)
}

export function deleteYeucaPost(client: DatabaseClient, id: string): void {
  const existing = client.db.select({ id: yeucaPosts.id }).from(yeucaPosts).where(eq(yeucaPosts.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found', data: { code: 'NOT_FOUND' } })
  }
  client.db.delete(yeucaPosts).where(eq(yeucaPosts.id, id)).run()
}

export function createYeucaProject(
  client: DatabaseClient,
  adminId: string,
  input: CreateProjectInput
): YeucaProjectItem {
  const now = Date.now()
  const id = randomUUID()
  const row: typeof yeucaProjects.$inferInsert = {
    id,
    title: input.title,
    deptName: input.deptName,
    track: input.track,
    status: input.status,
    summary: input.summary,
    highlightsJson: JSON.stringify(input.highlights),
    stackJson: JSON.stringify(input.stack),
    previewImage: input.previewImage,
    repoUrl: input.repoUrl,
    demoUrl: input.demoUrl,
    sortOrder: input.sortOrder,
    isPublished: input.isPublished,
    createdByAdminId: adminId,
    createdAt: now,
    updatedAt: now
  }
  client.db.insert(yeucaProjects).values(row).run()
  return serializeProject(client.db.select().from(yeucaProjects).where(eq(yeucaProjects.id, id)).get()!)
}

export function updateYeucaProject(
  client: DatabaseClient,
  id: string,
  input: UpdateProjectInput
): YeucaProjectItem {
  const existing = client.db.select().from(yeucaProjects).where(eq(yeucaProjects.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found', data: { code: 'NOT_FOUND' } })
  }

  client.db
    .update(yeucaProjects)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.deptName !== undefined ? { deptName: input.deptName } : {}),
      ...(input.track !== undefined ? { track: input.track } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.highlights !== undefined ? { highlightsJson: JSON.stringify(input.highlights) } : {}),
      ...(input.stack !== undefined ? { stackJson: JSON.stringify(input.stack) } : {}),
      ...(input.previewImage !== undefined ? { previewImage: input.previewImage } : {}),
      ...(input.repoUrl !== undefined ? { repoUrl: input.repoUrl } : {}),
      ...(input.demoUrl !== undefined ? { demoUrl: input.demoUrl } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      updatedAt: Date.now()
    })
    .where(eq(yeucaProjects.id, id))
    .run()

  return serializeProject(client.db.select().from(yeucaProjects).where(eq(yeucaProjects.id, id)).get()!)
}

export function deleteYeucaProject(client: DatabaseClient, id: string): void {
  const existing = client.db.select({ id: yeucaProjects.id }).from(yeucaProjects).where(eq(yeucaProjects.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found', data: { code: 'NOT_FOUND' } })
  }
  client.db.delete(yeucaProjects).where(eq(yeucaProjects.id, id)).run()
}

export function getPublicYeucaSnapshot(client: DatabaseClient): YeucaPublicSnapshot {
  const settings = ensureYeucaSettings(client)

  const publishedPosts = client.db
    .select()
    .from(yeucaPosts)
    .where(eq(yeucaPosts.status, 'published'))
    .orderBy(desc(yeucaPosts.pinned), desc(yeucaPosts.publishedAt), desc(yeucaPosts.updatedAt))
    .all()
    .map(serializePost)

  const projects = client.db
    .select()
    .from(yeucaProjects)
    .where(eq(yeucaProjects.isPublished, true))
    .orderBy(yeucaProjects.sortOrder, desc(yeucaProjects.updatedAt))
    .all()
    .map(serializeProject)

  const campusActivities: YeucaPublicActivityItem[] = settings.contentId
    ? client.db
        .select({
          activity: activities,
          placeName: places.name,
          placeStatus: places.status
        })
        .from(activities)
        .leftJoin(places, eq(activities.placeId, places.id))
        .where(and(eq(activities.organizationContentId, settings.contentId), eq(activities.status, 'published')))
        .orderBy(desc(activities.startsAt))
        .all()
        .map(row => ({
          id: row.activity.id,
          slug: row.activity.slug,
          title: row.activity.title,
          summary: row.activity.summary,
          body: row.activity.body,
          startsAt: new Date(row.activity.startsAt).toISOString(),
          endsAt: row.activity.endsAt ? new Date(row.activity.endsAt).toISOString() : null,
          placeName: row.placeStatus === 'published' && row.placeName ? row.placeName : '校内场地',
          room: row.activity.room,
          photos: parseJsonArray<string>(row.activity.photosJson, []),
          source: 'campus' as const,
          allowRegistration: false
        }))
    : []

  const directActivities = listYeucaActivitiesPublic(client)
  const publicActivities = [...directActivities, ...campusActivities]
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))

  const recruitFound = getRecruitFormBySlug(client, COMPUTER_ASSOCIATION_SLUG)
  const recruitOpen = Boolean(
    recruitFound && recruitFound.clubStatus === 'published' && recruitFound.form.status === 'open'
  )
  const rawFields = recruitFound
    ? parseJsonArray<YeucaPublicSnapshot['recruit']['fields'][number]>(recruitFound.form.fieldsJson, [])
    : []

  return {
    settings: {
      campus: settings.campus,
      tagline: settings.tagline,
      intro: settings.intro,
      recruitNote: settings.recruitNote,
      contactNote: settings.contactNote,
      groupQrUrl: settings.groupQrUrl,
      departments: settings.departments,
      extras: settings.extras
    },
    news: publishedPosts.filter(item => item.kind === 'news'),
    resources: publishedPosts.filter(item => item.kind === 'resource'),
    projects,
    activities: publicActivities,
    recruit: {
      open: recruitOpen,
      title: recruitFound?.form.title || '仰恩大学计算机协会纳新报名',
      slogan: recruitFound?.form.slogan || '',
      intro: recruitFound?.form.intro || '',
      fields: recruitOpen ? rawFields : []
    }
  }
}
