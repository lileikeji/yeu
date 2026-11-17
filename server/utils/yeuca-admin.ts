import { createError } from 'h3'
import type { AdminSessionContext } from './auth'
import type { DatabaseClient } from '../database/client'
import { findComputerAssociationContent, isComputerAssociationContent } from '../modules/yeuca/service'

/**
 * 计协官网内容管理仅限超级管理员或绑定 computer-association 的组织管理员操作。
 * 其他组织管理员调用直接返回 403。
 */
export function resolveYeucaAdminScope(
  client: DatabaseClient,
  session: AdminSessionContext
): { contentId: string | null } {
  if (session.admin.role === 'organization') {
    const contentId = session.admin.organization?.contentId
    if (!contentId || !isComputerAssociationContent(client, contentId)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'This feature is only available to the Computer Association',
        data: { code: 'ADMIN_SCOPE_FORBIDDEN' }
      })
    }
    return { contentId }
  }

  return {
    contentId: findComputerAssociationContent(client)?.id ?? null
  }
}
