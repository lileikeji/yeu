import { competitionPopularityStateQuerySchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularityPublicState
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import {
  issuePopularityPageTicket,
  resolvePopularityDevice,
  verifyPopularityToken
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
  const payload = verifyPopularityToken(security.secret, query.t)
  if (!payload) {
    throw createError({
      statusCode: 403,
      message: '二维码已过期，请扫大屏上的新码',
      data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码已过期，请扫大屏上的新码' }
    })
  }

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  if (payload.eventId !== eventRow.id) {
    throw createError({
      statusCode: 403,
      message: '二维码不属于当前赛事',
      data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码不属于当前赛事' }
    })
  }

  const identity = resolvePopularityDevice(
    event,
    security.secret,
    security.secureCookies,
    eventRow.id,
    query.d
  )
  const state = getPopularityPublicState(client, eventRow.id, identity.deviceHash)
  const pageTicket = issuePopularityPageTicket(
    security.secret,
    eventRow.id,
    identity.deviceHash,
    state.myBallot?.version ?? 0
  )
  return { ...state, deviceToken: identity.token, pageTicket }
})
