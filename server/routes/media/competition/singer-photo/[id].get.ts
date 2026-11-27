import { eq } from 'drizzle-orm'
import { getQuery, getRouterParam, setHeader } from 'h3'
import { competitionSingers } from '../../../../database/schema'
import { singerPhotoUrl } from '../../../../modules/competition/service'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'

const PHOTO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 选手照片的公开同源媒体路由：/media/competition/singer-photo/<uuid>.jpg
 *
 * 微信客户端与接收方手机拉取分享卡片缩略图时不带 Origin/Referer/PageContext，
 * 放在 /api/ 下会被 01-api-origin-guard 拦截并返回 403；放在 /media/competition/ 下
 * 既可被微信直接拉取，也可按 ?v=photoUpdatedAt 走 CDN 缓存（源站带宽仅 3Mbps）。
 */
export default defineEventHandler(async (event) => {
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-singer-photo:${ip}`, 180, 60_000, client)

  const raw = getRouterParam(event, 'id') || ''
  const id = raw.replace(/\.(?:jpe?g|png|webp)$/i, '').trim()
  if (!PHOTO_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  const row = client.db.select({ photoKey: competitionSingers.photoKey })
    .from(competitionSingers)
    .where(eq(competitionSingers.id, id))
    .get()
  const photoUrl = row ? singerPhotoUrl(row) : null
  if (!photoUrl) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  const upstream = await fetch(photoUrl, { signal: AbortSignal.timeout(8000) })
  if (!upstream.ok || !upstream.body) {
    throw createError({
      statusCode: 502,
      message: '照片读取失败，请稍后再试',
      data: { code: 'POPULARITY_SINGER_PHOTO_UPSTREAM', message: '照片读取失败，请稍后再试' }
    })
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await upstream.arrayBuffer())
  const hasVersion = Boolean(String(getQuery(event).v ?? '').trim())
  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Content-Length', buffer.byteLength)
  setHeader(event, 'Cache-Control', hasVersion ? 'public, max-age=31536000, immutable' : 'public, max-age=1800')
  setHeader(event, 'CDN-Cache-Control', hasVersion ? 'public, max-age=31536000' : 'public, max-age=1800')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return buffer
})
