import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import type { AdminSessionContext } from './auth'
import type { DatabaseClient } from '../database/client'
import { yeucaDepartmentAdmins } from '../database/schema'
import { findComputerAssociationContent, isComputerAssociationContent } from '../modules/yeuca/service'

export interface YeucaAdminScope {
  contentId: string | null
  role: 'chief' | 'minister'
  isChief: boolean
  departmentName: string | null
  title: string
}

/**
 * 计协官网内容与后台管理权限解析：
 * - super 管理员、绑定 computer-association 的协会主账号：视为总管（chief），拥有全站配额、文案与部长建号权限；
 * - 绑定在 yeuca_department_admins 的账号：视为部门部长（minister），严格隔离至所属部门的数据范围。
 * - 其他组织管理员直接返回 403。
 */
export function resolveYeucaAdminScope(
  client: DatabaseClient,
  session: AdminSessionContext
): YeucaAdminScope {
  if (session.admin.role === 'super') {
    return {
      contentId: findComputerAssociationContent(client)?.id ?? null,
      role: 'chief',
      isChief: true,
      departmentName: null,
      title: '平台总管'
    }
  }

  const contentId = session.admin.organization?.contentId
  if (!contentId || !isComputerAssociationContent(client, contentId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This feature is only available to the Computer Association',
      data: { code: 'ADMIN_SCOPE_FORBIDDEN', message: '仅限计算机协会管理员访问' }
    })
  }

  const explicitScope = session.admin.yeucaScope
  if (explicitScope?.role === 'minister') {
    const dept = (explicitScope.departmentName || '').trim()
    if (!dept) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Department scope is missing',
        data: { code: 'YEUCA_DEPARTMENT_REQUIRED', message: '当前部长账号未绑定具体部门' }
      })
    }
    return {
      contentId,
      role: 'minister',
      isChief: false,
      departmentName: dept,
      title: explicitScope.title || '部长'
    }
  }

  // 防御性查库：即使单测/上下文未携带 yeucaScope，只要数据库归属 yeuca_department_admins 也按部长隔离。
  const deptRow = client.db
    .select({
      departmentName: yeucaDepartmentAdmins.departmentName,
      title: yeucaDepartmentAdmins.title
    })
    .from(yeucaDepartmentAdmins)
    .where(eq(yeucaDepartmentAdmins.adminUserId, session.admin.id))
    .get()

  if (deptRow) {
    return {
      contentId,
      role: 'minister',
      isChief: false,
      departmentName: deptRow.departmentName,
      title: deptRow.title || '部长'
    }
  }

  return {
    contentId,
    role: 'chief',
    isChief: true,
    departmentName: null,
    title: explicitScope?.title || '计协总管'
  }
}

export function requireYeucaChiefScope(
  client: DatabaseClient,
  session: AdminSessionContext
): YeucaAdminScope {
  const scope = resolveYeucaAdminScope(client, session)
  if (!scope.isChief) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Chief administrator privilege required',
      data: { code: 'YEUCA_CHIEF_REQUIRED', message: '仅限协会总管或超级管理员执行此操作' }
    })
  }
  return scope
}

export function assertYeucaDepartmentAccess(
  scope: YeucaAdminScope,
  targetDepartment: string | null | undefined,
  resourceLabel = '资源'
): void {
  if (scope.isChief) return
  const cleanTarget = (targetDepartment || '').trim()
  if (!cleanTarget || cleanTarget !== scope.departmentName) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Department access forbidden',
      data: {
        code: 'YEUCA_DEPARTMENT_FORBIDDEN',
        message: `当前「${scope.departmentName}」部长无权操作其他部门${resourceLabel}`
      }
    })
  }
}

export function resolveYeucaScopedDepartment(scope: YeucaAdminScope, requestedDepartment: string): string {
  if (!scope.isChief && scope.departmentName) {
    return scope.departmentName
  }
  return requestedDepartment.trim()
}
