import { randomUUID } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createError } from 'h3'
import { uploadDirectory } from './uploaded-images'

export const MAX_UPLOADED_AUDIO_BYTES = 15 * 1024 * 1024

const AUDIO_TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac'
} as const

export type UploadedAudioExtension = keyof typeof AUDIO_TYPES

function ascii(data: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...data.slice(start, start + length))
}

/** 按文件头判断音频类型，不信任客户端给的扩展名。 */
export function detectUploadedAudioType(data: Uint8Array): UploadedAudioExtension | null {
  if (data.length < 4) return null
  if (ascii(data, 0, 3) === 'ID3') return 'mp3'
  if (data[0] === 0xff && (data[1] ?? 0) >= 0xe0 && ((data[1] ?? 0) & 0x06) === 0x02) {
    return data[1] === 0xf1 ? 'aac' : 'mp3'
  }
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WAVE') return 'wav'
  if (ascii(data, 0, 4) === 'OggS') return 'ogg'
  if (ascii(data, 0, 4) === 'fLaC') return 'flac'
  if (data.length >= 12 && ascii(data, 4, 4) === 'ftyp') return 'm4a'
  return null
}

export function uploadedAudioContentType(filename: string): string | null {
  const extension = filename.split('.').at(-1)?.toLowerCase() as UploadedAudioExtension | undefined
  return extension ? AUDIO_TYPES[extension] ?? null : null
}

export async function storeUploadedAudio(data: Uint8Array): Promise<{
  filename: string
  url: string
  size: number
  contentType: string
}> {
  if (data.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'Audio is empty', data: { code: 'EMPTY_AUDIO' } })
  }
  if (data.length > MAX_UPLOADED_AUDIO_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Audio is too large', data: { code: 'PAYLOAD_TOO_LARGE' } })
  }
  const type = detectUploadedAudioType(data)
  if (!type) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unsupported audio type',
      data: { code: 'UNSUPPORTED_AUDIO', message: '只收 mp3 / m4a / wav / aac / ogg / flac 这几种格式' }
    })
  }
  const directory = uploadDirectory()
  await mkdir(directory, { recursive: true })
  const filename = `${randomUUID()}.${type}`
  // 0644：nginx 以 www 身份读文件，0640 会 403
  const target = resolve(directory, filename)
  await writeFile(target, data, { mode: 0o644 })
  // 进程 umask 常是 027，会把 644 削成 640，nginx 以 www 身份就读不到；这里显式补一次。
  await chmod(target, 0o644)
  return { filename, url: `/uploads/${filename}`, size: data.length, contentType: AUDIO_TYPES[type] }
}
