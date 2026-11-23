import { competitionPopularityVoteSchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  recordPopularityBallot
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import {
  popularityIpHash,
  resolvePopularityDevice,
  verifyPopularityToken
} from '../../../../utils/competition-popularity'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig, assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'
import { getRequestIP, setHeader } from 'h3'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionPopularityVoteSchema)
  const security = getSecurityConfig(event)
  const token = verifyPopularityToken(security.secret, input.token)
  if (!token) {
    throw createError({
      statusCode: 403,
      message: '二维码已过期，请扫大屏上的新码',
      data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码已过期，请扫大屏上的新码' }
    })
  }

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  if (token.eventId !== eventRow.id) {
    throw createError({
      statusCode: 403,
      message: '二维码不属于当前赛事',
      data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码不属于当前赛事' }
    })
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const identity = resolvePopularityDevice(
    event,
    security.secret,
    security.secureCookies,
    eventRow.id,
    input.d
  )
  assertRateLimit(event, `popularity-vote-ip:${ip}`, 40, 60_000, client)
  assertRateLimit(event, `popularity-vote-device:${identity.deviceHash}`, 15, 60_000, client)

  const state = recordPopularityBallot(
    client,
    eventRow.id,
    identity.deviceHash,
    input.singerId,
    input.revision,
    ip === 'unknown' ? null : popularityIpHash(security.secret, ip)
  )
  return { ...state, deviceToken: identity.token }
})
