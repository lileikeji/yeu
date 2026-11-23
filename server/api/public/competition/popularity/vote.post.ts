import { competitionPopularityVoteSchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  recordPopularityBallot
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import {
  popularityDeviceHash,
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
  const deviceHash = popularityDeviceHash(event, security.secret, security.secureCookies)
  assertRateLimit(event, `popularity-vote-ip:${ip}`, 40, 60_000, client)
  assertRateLimit(event, `popularity-vote-device:${deviceHash}`, 15, 60_000, client)

  return recordPopularityBallot(client, eventRow.id, deviceHash, input.singerId, input.revision)
})
