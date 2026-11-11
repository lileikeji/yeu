import type { H3Event } from 'h3'
import type { AdminSessionContext } from './auth'
import type { DatabaseClient } from '../database/client'
import { findMusicAssociationContent } from '../modules/competition/service'
import type { CompetitionRoundKey } from '../../shared/types'

/**
 * 新声歌手大赛只属于音乐协会。总管理员可操作；组织管理员必须是音协本身，
 * 其他社团即使直接调用接口也会在这里被拒绝。
 */
export function resolveCompetitionContentId(
  client: DatabaseClient,
  session: AdminSessionContext
): string {
  const music = findMusicAssociationContent(client)

  if (session.admin.role === 'organization'
    && session.admin.organization?.contentId !== music.id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This feature is only available to the Music Association',
      data: { code: 'ADMIN_SCOPE_FORBIDDEN' }
    })
  }

  return music.id
}

export function requireCompetitionRoundKey(event: H3Event): CompetitionRoundKey {
  const value = getRouterParam(event, 'roundKey')
  if (value !== 'prelim' && value !== 'semi' && value !== 'final') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid competition round',
      data: { code: 'INVALID_ROUTE_PARAMETER', message: '轮次必须是 prelim、semi 或 final' }
    })
  }
  return value
}
