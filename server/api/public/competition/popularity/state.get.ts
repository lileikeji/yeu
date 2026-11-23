import { competitionPopularityStateQuerySchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularityPublicState
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import {
  popularityDeviceHash,
  verifyPopularityToken
} from '../../../../utils/competition-popularity'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig, assertTrustedOrigin } from '../../../../utils/security'
import { parseQuery } from '../../../../utils/validation'
import { getRequestIP, setHeader } from 'h3'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  assertRateLimit(event, `popularity-state:${ip}`, 180, 60_000, client)

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

  const deviceHash = popularityDeviceHash(event, security.secret, security.secureCookies)
  const state = getPopularityPublicState(client, eventRow.id, deviceHash)
  setPublicCache(event, 5)
  return state
})
