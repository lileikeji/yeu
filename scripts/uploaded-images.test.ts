import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  detectUploadedImageType,
  isUploadedImageFilename,
  MAX_UPLOADED_IMAGE_BYTES,
  storeUploadedImage,
  uploadedImageContentType
} from '../server/utils/uploaded-images'

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00
])

test('uploaded image detection trusts file signatures instead of names', () => {
  assert.equal(detectUploadedImageType(PNG_BYTES), 'png')
  assert.equal(detectUploadedImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), 'jpg')
  assert.equal(detectUploadedImageType(Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50
  ])), 'webp')
  assert.equal(detectUploadedImageType(new TextEncoder().encode('<script>alert(1)</script>')), null)
})

test('uploaded image filenames only accept generated UUID paths', () => {
  const filename = '123e4567-e89b-42d3-a456-426614174000.webp'
  assert.equal(isUploadedImageFilename(filename), true)
  assert.equal(uploadedImageContentType(filename), 'image/webp')
  assert.equal(isUploadedImageFilename('../123e4567-e89b-42d3-a456-426614174000.webp'), false)
  assert.equal(isUploadedImageFilename('avatar.svg'), false)
})

test('stored images use a generated immutable URL and preserve bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yeu-uploaded-images-'))
  const previousDirectory = process.env.NUXT_UPLOAD_DIR
  process.env.NUXT_UPLOAD_DIR = directory
  try {
    const result = await storeUploadedImage(PNG_BYTES)
    assert.equal(result.contentType, 'image/png')
    assert.equal(result.size, PNG_BYTES.byteLength)
    assert.match(result.url, /^\/uploads\/[0-9a-f-]+\.png$/)
    assert.equal(isUploadedImageFilename(result.filename), true)
    assert.deepEqual(await readFile(join(directory, result.filename)), Buffer.from(PNG_BYTES))
    if (process.platform !== 'win32') {
      assert.equal((await stat(join(directory, result.filename))).mode & 0o777, 0o644)
    }
  } finally {
    if (previousDirectory === undefined) delete process.env.NUXT_UPLOAD_DIR
    else process.env.NUXT_UPLOAD_DIR = previousDirectory
    await rm(directory, { recursive: true, force: true })
  }
})

test('empty, oversized, and unsupported payloads are rejected before writing', async () => {
  await assert.rejects(storeUploadedImage(new Uint8Array()), (error: unknown) => (
    typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 422
  ))
  await assert.rejects(storeUploadedImage(new Uint8Array(MAX_UPLOADED_IMAGE_BYTES + 1)), (error: unknown) => (
    typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 413
  ))
  await assert.rejects(storeUploadedImage(new TextEncoder().encode('not an image')), (error: unknown) => (
    typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 415
  ))
})
