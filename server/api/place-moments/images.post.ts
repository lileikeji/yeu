import { getHeader, readMultipartFormData } from 'h3'
import { MAX_UPLOADED_IMAGE_BYTES, detectUploadedImageType, storeUploadedImage } from '../../utils/uploaded-images'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'

/** 多部分表单的边界与字段头开销，与后台媒体上传同一口径。 */
const MAX_MULTIPART_BYTES = MAX_UPLOADED_IMAGE_BYTES + 64 * 1024

/**
 * 文件头判定出的真实类型 → 允许客户端声明的 MIME（含少数别名）。
 * 微信/部分安卓 WebView 会给出 `image/jpg`、`image/pjpeg` 这类非标准值，
 * 只认 `image/jpeg` 会把正常上传挡在门外，所以按「同族别名」放行，
 * 跨族（真的把 png 声明成 jpeg）仍然 415。
 */
const ALLOWED_DECLARED_MIME: Record<string, readonly string[]> = {
  png: ['image/png', 'image/x-png'],
  jpg: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  webp: ['image/webp']
}

/**
 * 留言/打卡的配图上传（保持匿名，不要求登录）。
 *
 * 只接受 png/jpg/webp、单张 ≤5 MB。校验分三层：
 * - `Content-Length` 声明超过 5 MB + 64 KB 时在读请求体之前就 413，避免把大
 *   multipart 整个读进内存再拒绝；
 * - 文件头判定真实类型（不信任 `Content-Type`），与 `storeUploadedImage` 同一
 *   个嗅探函数；判不出的直接 415；
 * - 声明了具体 MIME 时还要与真实类型一致，防止把 png 伪装成 image/gif 之类
 *   的混过去（`application/octet-stream` 视为「未声明」，只靠文件头）。
 * 文件名由服务端生成 UUID，返回的 URL 形如 `/uploads/<uuid>.png`，留言接口只
 * 接受这种形状的 URL，所以客户端没法把外站图片塞进来。孤儿文件由
 * `scripts/retention/prune-uploads.mjs` 按 7 天回收。
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

  const contentLength = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Image is too large',
      data: { code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_UPLOADED_IMAGE_BYTES }
    })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.filename && part.data)
  if (!file || !file.data) {
    throw createError({ statusCode: 422, statusMessage: 'No image uploaded', data: { code: 'NO_IMAGE' } })
  }

  const bytes = new Uint8Array(file.data)
  if (bytes.length > MAX_UPLOADED_IMAGE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Image is too large',
      data: { code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_UPLOADED_IMAGE_BYTES }
    })
  }

  const extension = detectUploadedImageType(bytes)
  if (!extension) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Unsupported image type',
      data: { code: 'UNSUPPORTED_IMAGE_TYPE', allowed: ['image/png', 'image/jpeg', 'image/webp'] }
    })
  }

  const declared = (file.type ?? '').split(';')[0]!.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream'
    && !ALLOWED_DECLARED_MIME[extension]?.includes(declared)) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Declared image type does not match file content',
      data: {
        code: 'IMAGE_TYPE_MISMATCH',
        declared,
        detected: ALLOWED_DECLARED_MIME[extension]?.[0] ?? null
      }
    })
  }

  const stored = await storeUploadedImage(bytes)
  setResponseStatus(event, 201)
  return { url: stored.url, width: null, size: stored.size }
})
