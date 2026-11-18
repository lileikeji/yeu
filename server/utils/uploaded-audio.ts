import { randomUUID } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createError } from 'h3'
import { uploadDirectory } from './uploaded-images'

export const MAX_UPLOADED_AUDIO_BYTES = 400 * 1024 * 1024

/**
 * 一次只允许一个伴奏上传在内存里解析：400MB 的 base64 展开后峰值接近 1.4GB，
 * 两个并发就会把 768M/1792M 的 cgroup 顶爆。拿不到名额的直接提示稍后再试。
 */
let audioUploadInFlight = false

export function beginAudioUpload(): boolean {
  if (audioUploadInFlight) return false
  audioUploadInFlight = true
  return true
}

export function endAudioUpload(): void {
  audioUploadInFlight = false
}

export function audioUploadBusyError() {
  return createError({
    statusCode: 429,
    statusMessage: 'Another audio upload is in progress',
    data: { code: 'AUDIO_UPLOAD_BUSY', message: '有人正在上传伴奏，等半分钟再试' }
  })
}

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

/**
 * 伴奏可以走「职业发展平台」已经接好的对象存储：
 * 那边有桶和接口，我们只把字节转过去，拿回一个公网可直接播放的 URL。
 * 没配置 CAREER_STORAGE_BASE_URL 时继续落本机 /uploads（原行为不变）。
 */
export interface CareerStorageConfig {
  baseUrl: string
  token: string
  path: string
  prefix: string
}

export function careerStorageConfig(): CareerStorageConfig | null {
  const baseUrl = (process.env.CAREER_STORAGE_BASE_URL || '').trim().replace(/\/+$/, '')
  if (!baseUrl) return null
  return {
    baseUrl,
    token: (process.env.CAREER_STORAGE_TOKEN || '').trim(),
    path: (process.env.CAREER_STORAGE_PATH || '/api/storage/upload').trim(),
    prefix: (process.env.CAREER_STORAGE_PREFIX || 'competition/accompaniment').replace(/^\/+|\/+$/g, '')
  }
}

/** 把上传接口的返回体兼容成一条 URL：`url`、`data.url`、`data.data.url` 都认。 */
export function pickStorageUrl(payload: unknown): string | null {
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number): string | null => {
    if (!node || depth > 4 || typeof node !== 'object' || seen.has(node)) return null
    seen.add(node)
    const record = node as Record<string, unknown>
    for (const key of ['url', 'src', 'href', 'downloadUrl', 'fileUrl']) {
      const value = record[key]
      if (typeof value === 'string' && /^https?:\/\//.test(value)) return value
    }
    for (const value of Object.values(record)) {
      const found = walk(value, depth + 1)
      if (found) return found
    }
    return null
  }
  return walk(payload, 0)
}

async function uploadAudioToCareer(
  config: CareerStorageConfig,
  data: Uint8Array,
  filename: string,
  contentType: string
): Promise<string> {
  const form = new FormData()
  const key = `${config.prefix}/${filename}`
  form.append('file', new Blob([data as unknown as BlobPart], { type: contentType }), filename)
  form.append('path', key)
  form.append('filename', filename)
  const headers: Record<string, string> = {}
  if (config.token) headers.Authorization = `Bearer ${config.token}`
  const response = await fetch(`${config.baseUrl}${config.path}`, { method: 'POST', body: form, headers })
  const text = await response.text()
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Career storage upload failed',
      data: { code: 'STORAGE_UPLOAD_FAILED', message: `对象存储返回 ${response.status}：${text.slice(0, 120)}` }
    })
  }
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    if (/^https?:\/\//.test(text.trim())) return text.trim()
  }
  const url = pickStorageUrl(json)
  if (!url) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Career storage returned no url',
      data: { code: 'STORAGE_UPLOAD_NO_URL', message: `对象存储没回传可播放链接：${text.slice(0, 120)}` }
    })
  }
  return url
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
  const filename = `${randomUUID()}.${type}`
  const career = careerStorageConfig()
  if (career) {
    const url = await uploadAudioToCareer(career, data, filename, AUDIO_TYPES[type])
    return { filename, url, size: data.length, contentType: AUDIO_TYPES[type] }
  }
  const directory = uploadDirectory()
  await mkdir(directory, { recursive: true })
  // 0644：nginx 以 www 身份读文件，0640 会 403
  const target = resolve(directory, filename)
  await writeFile(target, data, { mode: 0o644 })
  // 进程 umask 常是 027，会把 644 削成 640，nginx 以 www 身份就读不到；这里显式补一次。
  await chmod(target, 0o644)
  return { filename, url: `/uploads/${filename}`, size: data.length, contentType: AUDIO_TYPES[type] }
}
