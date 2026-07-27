import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createError } from 'h3'

export const MAX_UPLOADED_IMAGE_BYTES = 5 * 1024 * 1024

const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp'
} as const

export type UploadedImageExtension = keyof typeof IMAGE_TYPES

export function uploadDirectory(): string {
  const configured = process.env.NUXT_UPLOAD_DIR?.trim()
  return resolve(configured || resolve(process.cwd(), 'storage/uploads'))
}

export function detectUploadedImageType(data: Uint8Array): UploadedImageExtension | null {
  if (data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) {
    return 'png'
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'jpg'
  }
  if (data.length >= 12
    && String.fromCharCode(...data.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...data.slice(8, 12)) === 'WEBP') {
    return 'webp'
  }
  return null
}

export function isUploadedImageFilename(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i.test(value)
}

export function uploadedImageContentType(filename: string): string | null {
  const extension = filename.split('.').at(-1)?.toLowerCase() as UploadedImageExtension | undefined
  return extension ? IMAGE_TYPES[extension] ?? null : null
}

export async function storeUploadedImage(data: Uint8Array): Promise<{
  filename: string
  url: string
  contentType: string
  size: number
}> {
  if (data.length === 0 || data.length > MAX_UPLOADED_IMAGE_BYTES) {
    throw createError({
      statusCode: data.length > MAX_UPLOADED_IMAGE_BYTES ? 413 : 422,
      statusMessage: data.length > MAX_UPLOADED_IMAGE_BYTES ? 'Image is too large' : 'Image is empty',
      data: { code: data.length > MAX_UPLOADED_IMAGE_BYTES ? 'PAYLOAD_TOO_LARGE' : 'EMPTY_IMAGE' }
    })
  }

  const extension = detectUploadedImageType(data)
  if (!extension) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Unsupported image type',
      data: { code: 'UNSUPPORTED_IMAGE_TYPE', allowed: Object.values(IMAGE_TYPES) }
    })
  }

  const directory = uploadDirectory()
  await mkdir(directory, { recursive: true, mode: 0o755 })
  await chmod(directory, 0o755)
  const filename = `${randomUUID()}.${extension}`
  const filepath = resolve(directory, filename)
  await writeFile(filepath, data, { flag: 'wx', mode: 0o644 })
  // The service process may use a restrictive umask. Enforce the mode after
  // creation so the Nginx static-file worker can serve uploaded images.
  await chmod(filepath, 0o644)

  return {
    filename,
    url: `/uploads/${filename}`,
    contentType: IMAGE_TYPES[extension],
    size: data.length
  }
}

export async function readUploadedImage(filename: string): Promise<Uint8Array> {
  if (!isUploadedImageFilename(filename)) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }
  try {
    return await readFile(resolve(uploadDirectory(), filename))
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }
}
