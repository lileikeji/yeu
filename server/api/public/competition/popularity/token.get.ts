import QRCode from 'qrcode'
import { competitionPopularityTokenQuerySchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  ensurePopularitySettings,
  findMusicAssociationContent,
  getPopularityPublicState,
  getPopularitySettings
} from '../../../../modules/competition/service'
import { getOptionalAdminSession } from '../../../../utils/auth'
import { getClientIpAddress } from '../../../../utils/client-ip'
import {
  computePopularityWechatPasscode,
  detectAutomatedPopularityAgent,
  hasValidPopularityDisplaySession,
  issuePopularityToken
} from '../../../../utils/competition-popularity'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { assertTrustedOrigin, getSecurityConfig } from '../../../../utils/security'
import { parseQuery } from '../../../../utils/validation'
import { getHeader, getRequestURL, setHeader } from 'h3'

/**
 * 大屏取码与动态口令：仅接受后台管理员会话或通过 display-session 绑定的单实例大屏 Cookie；
 * 不再接受凭 query `?key=` 裸拉，且响应体绝不返回明文投票 token 或 url。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  assertTrustedOrigin(event)

  const client = useAppDatabase(event)
  parseQuery(event, competitionPopularityTokenQuerySchema)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-token:${ip}`, 120, 60_000, client)

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const rawSettings = ensurePopularitySettings(client, eventRow.id)
  const settings = getPopularitySettings(client, eventRow.id)

  const security = getSecurityConfig(event)
  const adminSession = getOptionalAdminSession(event, client, { csrf: false })
  const userAgent = getHeader(event, 'user-agent') || ''
  if (!adminSession && detectAutomatedPopularityAgent(userAgent)) {
    throw createError({
      statusCode: 403,
      message: '请在正常浏览器中打开投屏页',
      data: { code: 'POPULARITY_SCRIPT_BLOCKED', message: '请在正常浏览器中打开投屏页' }
    })
  }
  if (!adminSession && !hasValidPopularityDisplaySession(event, security.secret, rawSettings.displaySessionHash)) {
    throw createError({
      statusCode: 403,
      message: '大屏会话已失效或已被新大屏接管，请用大屏原链接重新进入',
      data: {
        code: 'POPULARITY_DISPLAY_SESSION_REQUIRED',
        message: '大屏会话已失效或已被新大屏接管，请用大屏原链接重新进入'
      }
    })
  }

  if (!settings.enabled) {
    throw createError({
      statusCode: 409,
      message: '人气奖投票还没开启',
      data: { code: 'POPULARITY_DISABLED', message: '人气奖投票还没开启' }
    })
  }

  const ttlSeconds = Math.max(90, Math.min(600, settings.qrRotateSeconds * 3))
  const issued = issuePopularityToken(security.secret, eventRow.id, ttlSeconds * 1000)
  const configured = String(useRuntimeConfig(event).public.siteUrl || '').replace(/\/+$/, '')
  const origin = configured || getRequestURL(event).origin
  const qrTargetUrl = settings.authMode === 'wechat_mp'
    ? (settings.wechatQrUrl || `${origin}/singer/popularity`)
    : `${origin}/singer/popularity?t=${encodeURIComponent(issued.token)}`

  const qrDataUrl = await QRCode.toDataURL(qrTargetUrl, {
    width: 720,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1f2937ff', light: '#ffffffff' }
  })

  const state = getPopularityPublicState(client, eventRow.id, '')

  return {
    expiresAt: issued.expiresAt,
    qrDataUrl,
    rotateSeconds: settings.qrRotateSeconds,
    authMode: settings.authMode,
    wechatAccountName: settings.wechatAccountName,
    wechatQrUrl: settings.wechatQrUrl,
    wechatPasscode: computePopularityWechatPasscode(security.secret, eventRow.id),
    state
  }
})
