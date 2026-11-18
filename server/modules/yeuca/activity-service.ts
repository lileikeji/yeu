import { randomUUID } from 'node:crypto'
import { and, desc, eq, ne } from 'drizzle-orm'
import { createError } from 'h3'
import type {
  YeucaActivityRegStatus,
  YeucaActivityRegistrationItem,
  YeucaActivityStatus,
  YeucaAdminActivityItem,
  YeucaPublicActivityItem
} from '../../../shared/types/yeuca'
import type { DatabaseClient } from '../../database/client'
import { yeucaActivities, yeucaActivityRegistrations, yeucaMembers } from '../../database/schema'

function parsePhotosJson(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function makeActivitySlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${ascii || 'act'}-${Date.now().toString(36)}`
}

function parseTimestamp(raw: string, fieldName: string): number {
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid date for ${fieldName}`,
      data: { code: 'INVALID_DATE', message: `时间格式不正确：${fieldName}` }
    })
  }
  return ms
}

function countRegistrationsByActivity(client: DatabaseClient): Map<string, { active: number, checkedIn: number }> {
  const map = new Map<string, { active: number, checkedIn: number }>()
  const rows = client.db
    .select({
      activityId: yeucaActivityRegistrations.activityId,
      status: yeucaActivityRegistrations.status
    })
    .from(yeucaActivityRegistrations)
    .where(ne(yeucaActivityRegistrations.status, 'cancelled'))
    .all()

  for (const row of rows) {
    const cur = map.get(row.activityId) ?? { active: 0, checkedIn: 0 }
    cur.active++
    if (row.status === 'checked_in') cur.checkedIn++
    map.set(row.activityId, cur)
  }
  return map
}

function serializeAdminActivity(
  row: typeof yeucaActivities.$inferSelect,
  counts: { active: number, checkedIn: number }
): YeucaAdminActivityItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    deptName: row.deptName,
    category: row.category,
    summary: row.summary,
    body: row.body,
    placeName: row.placeName,
    room: row.room,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
    allowRegistration: Boolean(row.allowRegistration),
    maxParticipants: row.maxParticipants,
    status: row.status,
    photos: parsePhotosJson(row.photosJson),
    registrationCount: counts.active,
    checkedInCount: counts.checkedIn,
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

export function listYeucaActivitiesAdmin(client: DatabaseClient): YeucaAdminActivityItem[] {
  const rows = client.db
    .select()
    .from(yeucaActivities)
    .orderBy(desc(yeucaActivities.startsAt), desc(yeucaActivities.updatedAt))
    .all()
  const counts = countRegistrationsByActivity(client)
  return rows.map(row => serializeAdminActivity(row, counts.get(row.id) ?? { active: 0, checkedIn: 0 }))
}

export function listYeucaActivitiesPublic(client: DatabaseClient): YeucaPublicActivityItem[] {
  const rows = client.db
    .select()
    .from(yeucaActivities)
    .where(eq(yeucaActivities.status, 'published'))
    .orderBy(desc(yeucaActivities.startsAt))
    .all()
  const counts = countRegistrationsByActivity(client)
  return rows.map(row => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
    placeName: row.placeName,
    room: row.room || null,
    photos: parsePhotosJson(row.photosJson),
    source: 'yeuca' as const,
    deptName: row.deptName,
    category: row.category,
    allowRegistration: Boolean(row.allowRegistration),
    maxParticipants: row.maxParticipants,
    registrationCount: counts.get(row.id)?.active ?? 0
  }))
}

export function createYeucaActivityAdmin(
  client: DatabaseClient,
  adminId: string,
  input: {
    title: string
    deptName: string
    category: string
    summary: string
    body: string
    placeName: string
    room: string
    startsAt: string
    endsAt?: string | null
    allowRegistration: boolean
    maxParticipants: number
    status: YeucaActivityStatus
    photos: string[]
  }
): YeucaAdminActivityItem {
  const now = Date.now()
  const id = randomUUID()
  const startsAtMs = parseTimestamp(input.startsAt, 'startsAt')
  const endsAtMs = input.endsAt ? parseTimestamp(input.endsAt, 'endsAt') : null

  client.db.insert(yeucaActivities).values({
    id,
    slug: makeActivitySlug(input.title),
    title: input.title.trim(),
    deptName: input.deptName.trim() || '协会全体',
    category: input.category.trim() || '技术培训',
    summary: input.summary.trim(),
    body: input.body.trim(),
    placeName: input.placeName.trim() || '校内场地',
    room: input.room.trim(),
    startsAt: startsAtMs,
    endsAt: endsAtMs,
    allowRegistration: input.allowRegistration,
    maxParticipants: input.maxParticipants,
    status: input.status,
    photosJson: JSON.stringify(input.photos),
    createdByAdminId: adminId,
    createdAt: now,
    updatedAt: now
  }).run()

  const row = client.db.select().from(yeucaActivities).where(eq(yeucaActivities.id, id)).get()!
  return serializeAdminActivity(row, { active: 0, checkedIn: 0 })
}

export function updateYeucaActivityAdmin(
  client: DatabaseClient,
  id: string,
  input: Partial<{
    title: string
    deptName: string
    category: string
    summary: string
    body: string
    placeName: string
    room: string
    startsAt: string
    endsAt: string | null
    allowRegistration: boolean
    maxParticipants: number
    status: YeucaActivityStatus
    photos: string[]
  }>
): YeucaAdminActivityItem {
  const existing = client.db.select().from(yeucaActivities).where(eq(yeucaActivities.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found', data: { code: 'NOT_FOUND' } })
  }

  client.db.update(yeucaActivities).set({
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.deptName !== undefined ? { deptName: input.deptName.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category.trim() } : {}),
    ...(input.summary !== undefined ? { summary: input.summary.trim() } : {}),
    ...(input.body !== undefined ? { body: input.body.trim() } : {}),
    ...(input.placeName !== undefined ? { placeName: input.placeName.trim() } : {}),
    ...(input.room !== undefined ? { room: input.room.trim() } : {}),
    ...(input.startsAt !== undefined ? { startsAt: parseTimestamp(input.startsAt, 'startsAt') } : {}),
    ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? parseTimestamp(input.endsAt, 'endsAt') : null } : {}),
    ...(input.allowRegistration !== undefined ? { allowRegistration: input.allowRegistration } : {}),
    ...(input.maxParticipants !== undefined ? { maxParticipants: input.maxParticipants } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.photos !== undefined ? { photosJson: JSON.stringify(input.photos) } : {}),
    updatedAt: Date.now()
  }).where(eq(yeucaActivities.id, id)).run()

  const counts = countRegistrationsByActivity(client).get(id) ?? { active: 0, checkedIn: 0 }
  return serializeAdminActivity(client.db.select().from(yeucaActivities).where(eq(yeucaActivities.id, id)).get()!, counts)
}

export function deleteYeucaActivityAdmin(client: DatabaseClient, id: string): void {
  const existing = client.db.select({ id: yeucaActivities.id }).from(yeucaActivities).where(eq(yeucaActivities.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found', data: { code: 'NOT_FOUND' } })
  }
  client.db.delete(yeucaActivities).where(eq(yeucaActivities.id, id)).run()
}

export function listActivityRegistrationsAdmin(
  client: DatabaseClient,
  activityId: string
): YeucaActivityRegistrationItem[] {
  const rows = client.db
    .select({
      reg: yeucaActivityRegistrations,
      member: yeucaMembers
    })
    .from(yeucaActivityRegistrations)
    .innerJoin(yeucaMembers, eq(yeucaActivityRegistrations.memberId, yeucaMembers.id))
    .where(eq(yeucaActivityRegistrations.activityId, activityId))
    .orderBy(desc(yeucaActivityRegistrations.createdAt))
    .all()

  return rows.map(({ reg, member }) => ({
    id: reg.id,
    activityId: reg.activityId,
    memberId: reg.memberId,
    studentNo: member.studentNo,
    name: member.name,
    gradeMajorClass: member.gradeMajorClass,
    department: member.department,
    roleTitle: member.roleTitle,
    status: reg.status,
    note: reg.note,
    checkedInAt: reg.checkedInAt ? new Date(reg.checkedInAt).toISOString() : null,
    createdAt: new Date(reg.createdAt).toISOString()
  }))
}

export function updateActivityRegistrationStatusAdmin(
  client: DatabaseClient,
  registrationId: string,
  status: YeucaActivityRegStatus
): void {
  const existing = client.db
    .select()
    .from(yeucaActivityRegistrations)
    .where(eq(yeucaActivityRegistrations.id, registrationId))
    .get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Registration not found', data: { code: 'NOT_FOUND' } })
  }
  const now = Date.now()
  client.db.update(yeucaActivityRegistrations).set({
    status,
    checkedInAt: status === 'checked_in' ? (existing.checkedInAt ?? now) : null,
    updatedAt: now
  }).where(eq(yeucaActivityRegistrations.id, registrationId)).run()
}

/* ---------- 会员侧活动报名 / 取消 / 查询 ---------- */

export function listMemberRegistrations(client: DatabaseClient, memberId: string) {
  return client.db
    .select({
      activityId: yeucaActivityRegistrations.activityId,
      status: yeucaActivityRegistrations.status,
      note: yeucaActivityRegistrations.note,
      createdAt: yeucaActivityRegistrations.createdAt
    })
    .from(yeucaActivityRegistrations)
    .where(and(
      eq(yeucaActivityRegistrations.memberId, memberId),
      ne(yeucaActivityRegistrations.status, 'cancelled')
    ))
    .all()
}

export function setMemberActivityRegistration(
  client: DatabaseClient,
  activityId: string,
  memberId: string,
  action: 'register' | 'cancel',
  note = ''
): { status: YeucaActivityRegStatus, registrationCount: number } {
  const act = client.db.select().from(yeucaActivities).where(eq(yeucaActivities.id, activityId)).get()
  if (!act || act.status !== 'published') {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found', data: { code: 'ACTIVITY_NOT_FOUND', message: '活动不存在或未发布' } })
  }
  if (!act.allowRegistration && action === 'register') {
    throw createError({ statusCode: 403, statusMessage: 'Registration not open', data: { code: 'REGISTRATION_DISABLED', message: '该活动当前未开放会员线上报名' } })
  }

  const existing = client.db
    .select()
    .from(yeucaActivityRegistrations)
    .where(and(
      eq(yeucaActivityRegistrations.activityId, activityId),
      eq(yeucaActivityRegistrations.memberId, memberId)
    ))
    .get()

  const now = Date.now()
  if (action === 'cancel') {
    if (existing) {
      client.db.update(yeucaActivityRegistrations).set({
        status: 'cancelled',
        updatedAt: now
      }).where(eq(yeucaActivityRegistrations.id, existing.id)).run()
    }
    const activeCount = countRegistrationsByActivity(client).get(activityId)?.active ?? 0
    return { status: 'cancelled', registrationCount: activeCount }
  }

  if (existing && existing.status !== 'cancelled') {
    const activeCount = countRegistrationsByActivity(client).get(activityId)?.active ?? 0
    return { status: existing.status, registrationCount: activeCount }
  }

  const curCount = countRegistrationsByActivity(client).get(activityId)?.active ?? 0
  if (act.maxParticipants > 0 && curCount >= act.maxParticipants) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Activity capacity full',
      data: { code: 'CAPACITY_FULL', message: `该活动限额 ${act.maxParticipants} 人，已报满` }
    })
  }

  if (existing) {
    client.db.update(yeucaActivityRegistrations).set({
      status: 'registered',
      note: note.trim(),
      checkedInAt: null,
      updatedAt: now
    }).where(eq(yeucaActivityRegistrations.id, existing.id)).run()
  } else {
    client.db.insert(yeucaActivityRegistrations).values({
      id: randomUUID(),
      activityId,
      memberId,
      status: 'registered',
      note: note.trim(),
      createdAt: now,
      updatedAt: now
    }).run()
  }

  const nextCount = countRegistrationsByActivity(client).get(activityId)?.active ?? 0
  return { status: 'registered', registrationCount: nextCount }
}
