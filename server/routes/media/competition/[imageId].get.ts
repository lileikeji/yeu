import { eq } from 'drizzle-orm'
import { competitionEmailImages } from '../../../database/schema'
import { useAppDatabase } from '../../../utils/database'

/**
 * 结果邮件内嵌插图的公开地址：/media/competition/<uuid>.png
 *
 * 为什么不放 /api 下：api 全局策略是 no-store（见 utils/request-context.ts 的
 * shouldDisableCache），而邮件插图必须能被 CDN 长期缓存——源站出口只有 3Mbps，
 * 每封信都回源会把图片拖到十几秒。
 *
 * 不放到 /public 静态目录：图片是管理员上传进数据库的，构建产物里并不存在。
 *
 * ID 为随机 uuid、不提供列表，删除即失效（未命中直接 404）。
 */
export default defineEventHandler((event) => {
  const raw = getRouterParam(event, 'imageId') || ''
  const imageId = raw.replace(/\.png$/i, '')
  if (!/^[0-9a-fA-F-]{36}$/.test(imageId)) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  const client = useAppDatabase(event)
  const row = client.db.select().from(competitionEmailImages)
    .where(eq(competitionEmailImages.id, imageId))
    .get()

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  const buffer = Buffer.from(row.data, 'base64')
  setHeader(event, 'Content-Type', row.mime)
  setHeader(event, 'Content-Length', buffer.byteLength)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return buffer
})
