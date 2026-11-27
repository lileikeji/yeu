import { eq } from 'drizzle-orm'
import { setHeader } from 'h3'
import { competitionSingers } from '../../../../database/schema'
import { singerPhotoUrl } from '../../../../modules/competition/service'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'

const PHOTO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 选手照片的同源代理：微信 JS-SDK 只接受当前域名下的图片，分享卡也不该跨域取 COS 预签名地址。
 * 这里现签一次对象存储直链，服务端取回字节后同源下发。
 */
export default defineEventHandler(async (event) => {
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-singer-photo:${ip}`, 120, 60_000, client)

  const id = String(getQuery(event).id ?? '').trim()
  if (!PHOTO_ID_PATTERN.test(id)) {
    throw createError({
      statusCode: 400,
      message: '选手编号不合法',
      data: { code: 'POPULARITY_SINGER_PHOTO_INVALID', message: '选手编号不合法' }
    })
  }

  const row = client.db.select({ photoKey: competitionSingers.photoKey })
    .from(competitionSingers)
    .where(eq(competitionSingers.id, id))
    .get()
  const photoUrl = row ? singerPhotoUrl(row) : null
  if (!photoUrl) {
    throw createError({
      statusCode: 404,
      message: '选手还没有照片',
      data: { code: 'POPULARITY_SINGER_PHOTO_MISSING', message: '选手还没有照片' }
    })
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
  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Cache-Control', 'public, max-age=1800')
  setHeader(event, 'CDN-Cache-Control', 'public, max-age=1800')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  const bytes = await upstream.arrayBuffer()
  return new Uint8Array(bytes)
})
