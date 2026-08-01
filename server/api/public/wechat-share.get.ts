import { getQuery } from 'h3'
import { createWechatJsSdkSignature, normalizeWechatShareUrl } from '../../modules/wechat/share'
import { getClientIpAddress } from '../../utils/client-ip'
import { useAppDatabase } from '../../utils/database'
import { assertRateLimit } from '../../utils/rate-limit'

const DEFAULT_ALLOWED_HOSTS = [
  'yx.huiliyill.cn'
]

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Cloudflare-CDN-Cache-Control', 'no-store')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')

  const runtimeConfig = useRuntimeConfig(event)
  const appId = String(runtimeConfig.wechatMpAppId || process.env.WECHAT_MP_APP_ID || '').trim()
  const appSecret = String(runtimeConfig.wechatMpAppSecret || process.env.WECHAT_MP_APP_SECRET || '').trim()
  if (!appId || !appSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: '微信分享尚未完成配置',
      data: { code: 'WECHAT_JS_SDK_NOT_CONFIGURED' }
    })
  }

  const configuredHosts = String(
    runtimeConfig.wechatShareAllowedHosts
    || process.env.WECHAT_SHARE_ALLOWED_HOSTS
    || ''
  ).split(',')
    .map(host => host.trim())
    .filter(Boolean)
  const query = getQuery(event)
  const rawUrl = Array.isArray(query.url) ? query.url[0] : query.url
  const url = normalizeWechatShareUrl(String(rawUrl || ''), configuredHosts.length
    ? configuredHosts
    : DEFAULT_ALLOWED_HOSTS)

  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `wechat-share:${ipAddress}`, 120, 60 * 1000, client)

  return await createWechatJsSdkSignature({ appId, appSecret, url })
})
