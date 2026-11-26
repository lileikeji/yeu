import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularitySettings
} from '../../../../modules/competition/service'
import {
  issuePopularityWechatTicket,
  popularityOpenIdHash
} from '../../../../utils/competition-popularity'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'
import { competitionPopularityMiniappLoginSchema } from '../../../../../shared/schemas/server'
import { setHeader } from 'h3'

/**
 * 小程序投票登录：wx.login 的一次性 code -> jscode2session -> openid -> vt。
 *
 * 与公众号口令共用同一套票据（`voter_openid_hash` 落库），区别只在身份来源：
 * 公众号靠回调消息，这里靠微信服务端对 code 的校验，都不经过客户端自报字段。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `miniapp-popularity-login:${ip}`, 30, 60_000, client)

  const input = await parseBody(event, competitionPopularityMiniappLoginSchema)
  const security = getSecurityConfig(event)
  const runtime = useRuntimeConfig(event) as Record<string, unknown>
  const appId = String(runtime.wechatMiniappAppId || '').trim()
  const appSecret = String(runtime.wechatMiniappAppSecret || '').trim()
  if (!appId || !appSecret) {
    throw createError({
      statusCode: 503,
      message: '小程序登录尚未配置',
      data: { code: 'MINIAPP_LOGIN_NOT_CONFIGURED', message: '小程序登录尚未配置' }
    })
  }

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const settings = getPopularitySettings(client, eventRow.id)
  if (!settings.enabled) {
    throw createError({
      statusCode: 409,
      message: '人气奖投票尚未开启',
      data: { code: 'POPULARITY_DISABLED', message: '人气奖投票尚未开启' }
    })
  }

  const url = 'https://api.weixin.qq.com/sns/jscode2session'
    + `?appid=${encodeURIComponent(appId)}`
    + `&secret=${encodeURIComponent(appSecret)}`
    + `&js_code=${encodeURIComponent(input.code)}`
    + '&grant_type=authorization_code'

  let payload: { openid?: string, errcode?: number, errmsg?: string } = {}
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    payload = await response.json() as typeof payload
  } catch {
    throw createError({
      statusCode: 502,
      message: '微信登录服务暂时不可用，请稍后重试',
      data: { code: 'MINIAPP_LOGIN_UPSTREAM', message: '微信登录服务暂时不可用，请稍后重试' }
    })
  }

  const openId = String(payload.openid || '').trim()
  if (!openId) {
    throw createError({
      statusCode: 403,
      message: '微信登录校验失败，请重新进入小程序',
      data: {
        code: 'MINIAPP_LOGIN_FAILED',
        errcode: payload.errcode ?? null,
        message: '微信登录校验失败，请重新进入小程序'
      }
    })
  }

  const openIdHash = popularityOpenIdHash(security.secret, eventRow.id, openId)
  const issued = issuePopularityWechatTicket(security.secret, eventRow.id, openIdHash, 45 * 60_000)
  return {
    vt: issued.ticket,
    expiresAt: issued.expiresAt,
    authMode: settings.authMode,
    status: Date.now() < settings.opensAt ? 'scheduled' : (Date.now() > settings.closesAt ? 'closed' : 'open')
  }
})
