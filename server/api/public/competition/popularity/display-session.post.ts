import { competitionPopularityDisplaySessionSchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularityDisplayKey,
  updatePopularityDisplaySessionHash
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { getClientIpAddress } from '../../../../utils/client-ip'
import {
  detectAutomatedPopularityAgent,
  hasBrowserFetchMetadata,
  issuePopularityDisplaySession
} from '../../../../utils/competition-popularity'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { assertTrustedOrigin, getSecurityConfig, safeEqual } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'
import { getHeader, setHeader } from 'h3'

/**
 * 大屏单实例会话绑定：用一次性大屏 key 换取 HttpOnly SameSite=Strict Cookie，
 * 并立即覆盖旧的 display_session_hash，防止脚本拿 key 远程并发拉码。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  assertTrustedOrigin(event)

  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-display-session:${ip}`, 15, 60_000, client)

  const userAgent = getHeader(event, 'user-agent') || ''
  if (detectAutomatedPopularityAgent(userAgent)) {
    throw createError({
      statusCode: 403,
      message: '请在正常浏览器中打开投屏页',
      data: { code: 'POPULARITY_SCRIPT_BLOCKED', message: '请在正常浏览器中打开投屏页' }
    })
  }
  if (!hasBrowserFetchMetadata(event)) {
    throw createError({
      statusCode: 403,
      message: '请求缺少浏览器上下文标识',
      data: { code: 'POPULARITY_DISPLAY_FETCH_REQUIRED', message: '请求缺少浏览器上下文标识' }
    })
  }

  const input = await parseBody(event, competitionPopularityDisplaySessionSchema)
  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const displayKey = getPopularityDisplayKey(client, eventRow.id)
  if (!safeEqual(input.key, displayKey)) {
    throw createError({
      statusCode: 403,
      message: '大屏链接已失效，请在后台重新复制',
      data: { code: 'POPULARITY_DISPLAY_KEY_INVALID', message: '大屏链接已失效，请在后台重新复制' }
    })
  }

  const security = getSecurityConfig(event)
  const sessionHash = issuePopularityDisplaySession(event, security.secret, security.secureCookies)
  updatePopularityDisplaySessionHash(client, eventRow.id, sessionHash)

  return { ok: true }
})
