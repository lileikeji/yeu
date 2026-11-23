import QRCode from 'qrcode'
import { competitionPopularityTokenQuerySchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularitySettings
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig, safeEqual } from '../../../../utils/security'
import { issuePopularityToken } from '../../../../utils/competition-popularity'
import { parseQuery } from '../../../../utils/validation'
import { getRequestIP, getRequestURL, setHeader } from 'h3'

/**
 * 大屏取码：需要后台生成的大屏链接里的 key，避免任何人拿公开域名批量造码。
 * 二维码只带短期签名 token，设备投票资格仍由 HttpOnly cookie 决定。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const query = parseQuery(event, competitionPopularityTokenQuerySchema)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  assertRateLimit(event, `popularity-token:${ip}`, 120, 60_000, client)

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const settings = getPopularitySettings(client, eventRow.id)
  if (!settings.enabled) {
    throw createError({
      statusCode: 409,
      message: '人气奖投票还没开启',
      data: { code: 'POPULARITY_DISABLED', message: '人气奖投票还没开启' }
    })
  }
  if (!safeEqual(query.key, settings.displayKey)) {
    throw createError({
      statusCode: 403,
      message: '大屏链接已失效，请在后台重新复制',
      data: { code: 'POPULARITY_DISPLAY_KEY_INVALID', message: '大屏链接已失效，请在后台重新复制' }
    })
  }

  const security = getSecurityConfig(event)
  const ttlSeconds = Math.max(90, Math.min(600, settings.qrRotateSeconds * 3))
  const issued = issuePopularityToken(security.secret, eventRow.id, ttlSeconds * 1000)
  const configured = String(useRuntimeConfig(event).public.siteUrl || '').replace(/\/+$/, '')
  const origin = configured || getRequestURL(event).origin
  const url = `${origin}/singer/popularity?t=${encodeURIComponent(issued.token)}`
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 720,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1f2937ff', light: '#ffffffff' }
  })
  setPublicCache(event, 5)

  return {
    token: issued.token,
    expiresAt: issued.expiresAt,
    url,
    qrDataUrl,
    rotateSeconds: settings.qrRotateSeconds
  }
})
