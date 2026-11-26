import { competitionPopularityStateQuerySchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularityPublicState
} from '../../../../modules/competition/service'
import {
  issuePopularityPageTicket,
  resolvePopularityDevice,
  verifyPopularityWechatTicket
} from '../../../../utils/competition-popularity'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { useAppDatabase } from '../../../../utils/database'
import { getSecurityConfig } from '../../../../utils/security'
import { parseQuery } from '../../../../utils/validation'
import { setHeader } from 'h3'

/** 小程序端只认 vt 票据，不暴露大屏 token 通道。 */
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `miniapp-popularity-state:${ip}`, 180, 60_000, client)

  const query = parseQuery(event, competitionPopularityStateQuerySchema)
  if (!query.vt) {
    throw createError({
      statusCode: 403,
      message: '请先在小程序内完成登录',
      data: { code: 'MINIAPP_TICKET_REQUIRED', message: '请先在小程序内完成登录' }
    })
  }

  const security = getSecurityConfig(event)
  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const ticket = verifyPopularityWechatTicket(security.secret, query.vt)
  if (!ticket || ticket.eventId !== eventRow.id) {
    throw createError({
      statusCode: 403,
      message: '投票凭证已过期，请重新进入小程序',
      data: { code: 'MINIAPP_TICKET_INVALID', message: '投票凭证已过期，请重新进入小程序' }
    })
  }

  const identity = resolvePopularityDevice(
    event,
    security.secret,
    security.secureCookies,
    eventRow.id,
    query.d
  )
  const state = getPopularityPublicState(client, eventRow.id, ticket.openIdHash, {
    wechatVerified: true,
    requiresWechatTicket: false
  })
  const pageTicket = issuePopularityPageTicket(
    security.secret,
    eventRow.id,
    ticket.openIdHash,
    state.myBallot?.version ?? 0
  )
  return { ...state, deviceToken: identity.token, pageTicket }
})
