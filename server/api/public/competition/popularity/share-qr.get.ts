import QRCode from 'qrcode'
import { setHeader } from 'h3'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { resolveTrustedOrigins } from '../../../../utils/security'

/**
 * 生成选手分享卡片的二维码（data URL）。
 * 只接受本站链接，避免被当作任意内容的二维码生成器。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-share-qr:${ip}`, 60, 60_000, client)

  const rawUrl = String(getQuery(event).url ?? '').trim()
  if (!rawUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing share url', data: { code: 'SHARE_URL_REQUIRED' } })
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid share url', data: { code: 'SHARE_URL_INVALID' } })
  }

  const allowedOrigins = resolveTrustedOrigins(event)
  if (!allowedOrigins.has(parsed.origin)) {
    throw createError({ statusCode: 400, statusMessage: 'Share url is not on this site', data: { code: 'SHARE_URL_REJECTED' } })
  }

  const dataUrl = await QRCode.toDataURL(parsed.toString(), {
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
    color: { dark: '#1f2937', light: '#ffffff' }
  })
  setPublicCache(event, 300)
  return { ok: true, dataUrl }
})
