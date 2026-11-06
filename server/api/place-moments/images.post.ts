import { getHeader, readMultipartFormData } from 'h3'
import { storeUploadedImage } from '../../utils/uploaded-images'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'

/**
 * 留言/打卡的配图上传。
 *
 * 只接受 png/jpg/webp、单张 ≤5 MB（`storeUploadedImage` 会按文件头判定真实类型，
 * 不信 `Content-Type`），文件名由服务端生成 UUID，返回的 URL 形如 `/uploads/<uuid>.png`。
 * 留言接口只接受这种形状的 URL，所以客户端没法把外站图片塞进来。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `place-moment-upload:${ip}`, 30, 60 * 60 * 1000, client)

  const contentType = getHeader(event, 'content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw createError({ statusCode: 415, statusMessage: 'Expected multipart/form-data' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.filename && part.data)
  if (!file || !file.data) {
    throw createError({ statusCode: 422, statusMessage: 'No image uploaded', data: { code: 'NO_IMAGE' } })
  }

  const stored = await storeUploadedImage(new Uint8Array(file.data))
  setResponseStatus(event, 201)
  return { url: stored.url, width: null, size: stored.size }
})
