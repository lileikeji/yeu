import { competitionPopularityStateQuerySchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularityPublicState,
  getPopularitySettings
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import {
  issuePopularityPageTicket,
  resolvePopularityDevice,
  verifyPopularityToken,
  verifyPopularityWechatTicket
} from '../../../../utils/competition-popularity'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig, assertTrustedOrigin } from '../../../../utils/security'
import { parseQuery } from '../../../../utils/validation'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { setHeader } from 'h3'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-state:${ip}`, 120, 60_000, client)

  const query = parseQuery(event, competitionPopularityStateQuerySchema)
  const security = getSecurityConfig(event)
  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const settings = getPopularitySettings(client, eventRow.id)

  if (query.vt) {
    const wechatTicket = verifyPopularityWechatTicket(security.secret, query.vt)
    if (!wechatTicket || wechatTicket.eventId !== eventRow.id) {
      throw createError({
        statusCode: 403,
        message: '你的专属投票链接已过期或无效，请回公众号重新回复大屏口令领取',
        data: {
          code: 'POPULARITY_WECHAT_TICKET_INVALID',
          message: '你的专属投票链接已过期或无效，请回公众号重新回复大屏口令领取'
        }
      })
    }
    const identity = resolvePopularityDevice(
      event,
      security.secret,
      security.secureCookies,
      eventRow.id,
      query.d
    )
    const state = getPopularityPublicState(client, eventRow.id, wechatTicket.openIdHash, {
      wechatVerified: true,
      requiresWechatTicket: false
    })
    const pageTicket = issuePopularityPageTicket(
      security.secret,
      eventRow.id,
      wechatTicket.openIdHash,
      state.myBallot?.version ?? 0
    )
    return { ...state, deviceToken: identity.token, pageTicket }
  }

  if (query.t) {
    const payload = verifyPopularityToken(security.secret, query.t)
    if (!payload || payload.eventId !== eventRow.id) {
      throw createError({
        statusCode: 403,
        message: payload ? '二维码不属于当前赛事' : '二维码已过期，请扫大屏上的新码',
        data: {
          code: 'POPULARITY_TOKEN_INVALID',
          message: payload ? '二维码不属于当前赛事' : '二维码已过期，请扫大屏上的新码'
        }
      })
    }
  }

  if (settings.authMode === 'wechat_mp') {
    const state = getPopularityPublicState(client, eventRow.id, '', {
      wechatVerified: false,
      requiresWechatTicket: true
    })
    return { ...state }
  }

  if (!query.t) {
    throw createError({
      statusCode: 403,
      message: '二维码已过期，请扫大屏上的新码',
      data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码已过期，请扫大屏上的新码' }
    })
  }

  const identity = resolvePopularityDevice(
    event,
    security.secret,
    security.secureCookies,
    eventRow.id,
    query.d
  )
  const state = getPopularityPublicState(client, eventRow.id, identity.deviceHash, {
    wechatVerified: false,
    requiresWechatTicket: false
  })
  const pageTicket = issuePopularityPageTicket(
    security.secret,
    eventRow.id,
    identity.deviceHash,
    state.myBallot?.version ?? 0
  )
  return { ...state, deviceToken: identity.token, pageTicket }
})
