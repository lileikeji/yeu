import { randomUUID } from 'node:crypto'
import { desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { pinyin } from 'pinyin-pro'
import type {
  YeucaAuditLogItem,
  YeucaAuditLogsPayload,
  YeucaMinisterAdminItem
} from '../../../shared/types/yeuca'
import type { DatabaseClient } from '../../database/client'
import {
  adminSessions,
  adminUsers,
  auditLogs,
  yeucaDepartmentAdmins
} from '../../database/schema'
import { generateOrganizationAdminInitialPassword } from '../organization-admins/service'
import { hashPassword } from '../../utils/password'
import { safeMetadata } from '../../utils/serializers'
import type { YeucaAdminScope } from '../../utils/yeuca-admin'
import { ensureYeucaSettings, findComputerAssociationContent } from './service'

function conflict(message: string, code: string): never {
  throw createError({
    statusCode: 409,
    statusMessage: message,
    data: { code, message }
  })
}

function notFound(message = 'Minister administrator not found'): never {
  throw createError({
    statusCode: 404,
    statusMessage: message,
    data: { code: 'YEUCA_MINISTER_NOT_FOUND', message: '未找到对应的部门部长账号' }
  })
}

function buildDefaultMinisterUsername(departmentName: string): string {
  const py = pinyin(departmentName, { toneType: 'none', type: 'array' })
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
  return py ? `yeuca-${py}` : 'yeuca-dept'
}

function allocateUniqueAdminUsername(client: DatabaseClient, preferred: string): string {
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? preferred : `${preferred}-${suffix + 1}`
    const exists = client.db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(sql`lower(${adminUsers.username}) = lower(${candidate})`)
      .get()
    if (!exists) return candidate
  }
  conflict('无法分配可用的部长登录账号，请手动指定用户名', 'MINISTER_USERNAME_EXHAUSTED')
}

function resolveValidDepartmentName(client: DatabaseClient, rawName: string): string {
  const clean = rawName.trim()
  const settings = ensureYeucaSettings(client)
  const matched = settings.departments.find(d => d.name === clean)
  if (!matched) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unknown department',
      data: { code: 'INVALID_DEPARTMENT', message: `部门「${clean}」不在当前计协部门列表中` }
    })
  }
  return matched.name
}

export function listYeucaMinisters(client: DatabaseClient): YeucaMinisterAdminItem[] {
  const rows = client.db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
      isActive: adminUsers.isActive,
      mustChangePassword: adminUsers.mustChangePassword,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
      departmentName: yeucaDepartmentAdmins.departmentName,
      title: yeucaDepartmentAdmins.title
    })
    .from(yeucaDepartmentAdmins)
    .innerJoin(adminUsers, eq(adminUsers.id, yeucaDepartmentAdmins.adminUserId))
    .orderBy(yeucaDepartmentAdmins.departmentName, desc(yeucaDepartmentAdmins.createdAt))
    .all()

  return rows.map(row => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    departmentName: row.departmentName,
    title: row.title,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString()
  }))
}

export async function createYeucaMinister(
  client: DatabaseClient,
  createdByAdminId: string,
  input: {
    departmentName: string
    username?: string
    displayName?: string
    title?: '部长' | '副部长'
  }
): Promise<{
  account: YeucaMinisterAdminItem
  initialPassword: string
}> {
  const club = findComputerAssociationContent(client)
  if (!club) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Computer association content missing',
      data: { code: 'YEUCA_CONTENT_MISSING', message: '计算机协会主站档案缺失，请先初始化设置' }
    })
  }

  const departmentName = resolveValidDepartmentName(client, input.departmentName)
  const title = input.title || '部长'
  const requestedUsername = input.username?.trim()
  let username: string
  if (requestedUsername) {
    const taken = client.db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(sql`lower(${adminUsers.username}) = lower(${requestedUsername})`)
      .get()
    if (taken) {
      conflict(`登录账号「${requestedUsername}」已存在，请换一个账号名`, 'ADMIN_USERNAME_EXISTS')
    }
    username = requestedUsername
  } else {
    username = allocateUniqueAdminUsername(client, buildDefaultMinisterUsername(departmentName))
  }

  const displayName = input.displayName?.trim() || `${departmentName}${title}`
  const initialPassword = generateOrganizationAdminInitialPassword()
  const passwordHash = await hashPassword(initialPassword)
  const adminUserId = randomUUID()
  const now = Date.now()

  client.db.transaction((tx) => {
    tx.insert(adminUsers).values({
      id: adminUserId,
      username,
      passwordHash,
      displayName,
      role: 'organization',
      mustChangePassword: true,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).run()

    tx.insert(yeucaDepartmentAdmins).values({
      adminUserId,
      contentId: club.id,
      departmentName,
      title,
      createdByAdminId,
      createdAt: now,
      updatedAt: now
    }).run()
  })

  return {
    account: {
      id: adminUserId,
      username,
      displayName,
      departmentName,
      title,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: null,
      createdAt: new Date(now).toISOString()
    },
    initialPassword
  }
}

export async function updateYeucaMinister(
  client: DatabaseClient,
  adminUserId: string,
  input: {
    isActive?: boolean
    resetPassword?: boolean
    departmentName?: string
    title?: '部长' | '副部长'
    displayName?: string
  }
): Promise<{
  account: YeucaMinisterAdminItem
  passwordReset: boolean
  initialPassword?: string
}> {
  const existing = client.db
    .select({
      user: adminUsers,
      dept: yeucaDepartmentAdmins
    })
    .from(yeucaDepartmentAdmins)
    .innerJoin(adminUsers, eq(adminUsers.id, yeucaDepartmentAdmins.adminUserId))
    .where(eq(yeucaDepartmentAdmins.adminUserId, adminUserId))
    .get()

  if (!existing) notFound()

  const nextDepartment = input.departmentName !== undefined
    ? resolveValidDepartmentName(client, input.departmentName)
    : existing.dept.departmentName
  const nextTitle = input.title ?? (existing.dept.title === '副部长' ? '副部长' : '部长')
  const nextDisplayName = input.displayName !== undefined
    ? input.displayName.trim()
    : (input.departmentName !== undefined || input.title !== undefined
        ? `${nextDepartment}${nextTitle}`
        : existing.user.displayName)
  const nextActive = input.isActive ?? existing.user.isActive

  const resetPassword = Boolean(input.resetPassword)
  const initialPassword = resetPassword ? generateOrganizationAdminInitialPassword() : undefined
  const passwordHash = initialPassword ? await hashPassword(initialPassword) : undefined
  const now = Date.now()

  client.db.transaction((tx) => {
    tx.update(adminUsers).set({
      isActive: nextActive,
      displayName: nextDisplayName,
      ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
      updatedAt: now
    }).where(eq(adminUsers.id, adminUserId)).run()

    tx.update(yeucaDepartmentAdmins).set({
      departmentName: nextDepartment,
      title: nextTitle,
      updatedAt: now
    }).where(eq(yeucaDepartmentAdmins.adminUserId, adminUserId)).run()

    if (nextActive === false || resetPassword) {
      tx.delete(adminSessions).where(eq(adminSessions.adminUserId, adminUserId)).run()
    }
  })

  const updated = client.db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
      isActive: adminUsers.isActive,
      mustChangePassword: adminUsers.mustChangePassword,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
      departmentName: yeucaDepartmentAdmins.departmentName,
      title: yeucaDepartmentAdmins.title
    })
    .from(yeucaDepartmentAdmins)
    .innerJoin(adminUsers, eq(adminUsers.id, yeucaDepartmentAdmins.adminUserId))
    .where(eq(yeucaDepartmentAdmins.adminUserId, adminUserId))
    .get()!

  return {
    account: {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      departmentName: updated.departmentName,
      title: updated.title,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      lastLoginAt: updated.lastLoginAt ? new Date(updated.lastLoginAt).toISOString() : null,
      createdAt: new Date(updated.createdAt).toISOString()
    },
    passwordReset: resetPassword,
    ...(initialPassword ? { initialPassword } : {})
  }
}

const AUDIT_CATEGORY_ACTIONS: Record<string, Set<string>> = {
  git: new Set([
    'yeuca.member.register',
    'yeuca.member.gitea_sync_failed',
    'yeuca.member.sync_git',
    'yeuca.member.password_change',
    'yeuca.member.profile_update',
    'yeuca.member.reset_password',
    'yeuca.member.create',
    'yeuca.gitea.probe'
  ]),
  member_auth: new Set([
    'yeuca.member.verify_passed',
    'yeuca.member.verify_rejected',
    'yeuca.member.register',
    'yeuca.member.register_rejected',
    'yeuca.member.login',
    'yeuca.member.login_failed',
    'yeuca.member.password_change',
    'yeuca.member.profile_update'
  ]),
  minister: new Set([
    'yeuca.minister.create',
    'yeuca.minister.update',
    'yeuca.minister.password_reset',
    'auth.login',
    'auth.logout',
    'auth.password_change',
    'auth.login_failed'
  ])
}

function matchesAuditCategory(action: string, category: string): boolean {
  if (!category || category === 'all') return true
  if (category === 'member_admin') {
    return action.startsWith('yeuca.member.') || action === 'yeuca.recruit.approve_to_members'
  }
  if (category === 'content') {
    return (
      action.startsWith('yeuca.activity.')
      || action.startsWith('yeuca.post.')
      || action.startsWith('yeuca.project.')
      || action.startsWith('yeuca.department.')
      || action.startsWith('yeuca.settings.')
      || action.startsWith('yeuca.recruit.config.')
      || action.startsWith('yeuca.treasure.')
    )
  }
  return AUDIT_CATEGORY_ACTIONS[category]?.has(action) ?? true
}

function isAuditVisibleToMinister(
  row: {
    actorAdminId: string | null
    action: string
    details: Record<string, unknown>
  },
  actorId: string,
  departmentName: string
): boolean {
  if (row.actorAdminId === actorId) return true
  const detailDept = String(
    row.details.department
    ?? row.details.deptName
    ?? row.details.departmentName
    ?? ''
  ).trim()
  if (detailDept && detailDept === departmentName) return true
  return false
}

export function listYeucaAuditLogs(
  client: DatabaseClient,
  scope: YeucaAdminScope,
  actorAdminId: string,
  options: {
    category?: string
    keyword?: string
    page?: number
    pageSize?: number
  }
): YeucaAuditLogsPayload {
  const category = (options.category || 'all').trim()
  const keyword = (options.keyword || '').trim().toLowerCase()
  const page = Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page!)) : 1
  const pageSize = Number.isFinite(options.pageSize) ? Math.min(100, Math.max(1, Math.trunc(options.pageSize!))) : 40

  // 关联出计协相关管理员 ID，便于把计协总管/部长的登录/改密审计也纳入计协审计视图。
  const ministerRows = client.db
    .select({ adminUserId: yeucaDepartmentAdmins.adminUserId })
    .from(yeucaDepartmentAdmins)
    .all()
  const yeucaActorIds = new Set<string>(ministerRows.map(r => r.adminUserId))
  if (scope.contentId) {
    const clubAdminRows = client.db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(or(eq(adminUsers.username, '计算机协会'), eq(adminUsers.displayName, '计算机协会管理员')))
      .all()
    for (const r of clubAdminRows) yeucaActorIds.add(r.id)
  }
  yeucaActorIds.add(actorAdminId)

  const actorIdList = Array.from(yeucaActorIds)
  const rawRows = client.db
    .select({
      id: auditLogs.id,
      actorAdminId: auditLogs.actorAdminId,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      requestId: auditLogs.requestId,
      detailsJson: auditLogs.detailsJson,
      createdAt: auditLogs.createdAt,
      actorUsername: adminUsers.username,
      actorDisplayName: adminUsers.displayName
    })
    .from(auditLogs)
    .leftJoin(adminUsers, eq(auditLogs.actorAdminId, adminUsers.id))
    .where(or(
      like(auditLogs.action, 'yeuca.%'),
      like(auditLogs.entityType, 'yeuca%'),
      ...(actorIdList.length ? [inArray(auditLogs.actorAdminId, actorIdList)] : [])
    ))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1200)
    .all()

  const filtered: YeucaAuditLogItem[] = []
  for (const row of rawRows) {
    if (!matchesAuditCategory(row.action, category)) continue
    const details = safeMetadata(row.detailsJson)
    if (!scope.isChief && scope.departmentName) {
      if (!isAuditVisibleToMinister({
        actorAdminId: row.actorAdminId,
        action: row.action,
        details
      }, actorAdminId, scope.departmentName)) {
        continue
      }
    }
    if (keyword) {
      const hay = [
        row.action,
        row.entityType,
        row.entityId || '',
        row.actorUsername || '',
        row.actorDisplayName || '',
        row.detailsJson
      ].join(' ').toLowerCase()
      if (!hay.includes(keyword)) continue
    }
    filtered.push({
      id: row.id,
      actorAdminId: row.actorAdminId,
      actorUsername: row.actorUsername || null,
      actorDisplayName: row.actorDisplayName || null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      requestId: row.requestId,
      details,
      createdAt: new Date(row.createdAt).toISOString()
    })
  }

  const total = filtered.length
  const offset = (page - 1) * pageSize
  return {
    items: filtered.slice(offset, offset + pageSize),
    total,
    page,
    pageSize
  }
}
