import { getRouterParam, setHeader } from 'h3'
import {
  readUploadedImage,
  uploadedImageContentType
} from '../../utils/uploaded-images'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename') ?? ''
  const contentType = uploadedImageContentType(filename)
  if (!contentType) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  const data = await readUploadedImage(filename)
  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Content-Length', String(data.byteLength))
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'CDN-Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return data
})
