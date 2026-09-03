import { getHeader, readMultipartFormData } from 'h3'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { MAX_UPLOADED_IMAGE_BYTES, storeUploadedImage } from '../../../utils/uploaded-images'
import { warmUpUploadedAsset } from '../../../utils/uploaded-cdn'

const MAX_MULTIPART_BYTES = MAX_UPLOADED_IMAGE_BYTES + 64 * 1024

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const contentType = getHeader(event, 'content-type')?.toLowerCase() ?? ''
  const contentLength = Number(getHeader(event, 'content-length'))

  if (!contentType.startsWith('multipart/form-data;')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Unsupported Media Type',
      data: { code: 'UNSUPPORTED_MEDIA_TYPE', expected: 'multipart/form-data' }
    })
  }
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_MULTIPART_BYTES) {
    throw createError({
      statusCode: contentLength > MAX_MULTIPART_BYTES ? 413 : 411,
      statusMessage: contentLength > MAX_MULTIPART_BYTES ? 'Image is too large' : 'Content-Length is required',
      data: { code: contentLength > MAX_MULTIPART_BYTES ? 'PAYLOAD_TOO_LARGE' : 'CONTENT_LENGTH_REQUIRED' }
    })
  }

  const parts = await readMultipartFormData(event)
  const image = parts?.find(part => part.name === 'image' && part.filename && part.data)
  if (!image) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Image file is required',
      data: { code: 'IMAGE_REQUIRED' }
    })
  }

  const result = await storeUploadedImage(image.data)
  // Warm the CDN edge so the first visitor does not eat an origin fetch.
  warmUpUploadedAsset(event, result.url)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'media.image.upload',
    entityType: 'media',
    entityId: result.filename,
    details: { contentType: result.contentType, size: result.size }
  })
  setResponseStatus(event, 201)
  return result
})
