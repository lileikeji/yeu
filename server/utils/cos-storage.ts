import { createHash, createHmac, randomUUID } from 'node:crypto'

/**
 * 腾讯云 COS 直传：浏览器拿预签名 PUT 地址自己把文件传上去，服务端只保管 object key。
 * 播放/下载用临时签名 GET，桶保持私有读，链接过期就失效，避免伴奏被人扒走到处传。
 *
 * 环境变量：
 *   COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY
 *   COS_ACCOMPANIMENT_PREFIX（默认 competition/accompaniment）
 */
export interface CosConfig {
  bucket: string
  region: string
  secretId: string
  secretKey: string
  prefix: string
}

export function cosConfig(): CosConfig | null {
  const bucket = (process.env.COS_BUCKET || '').trim()
  const region = (process.env.COS_REGION || '').trim()
  const secretId = (process.env.COS_SECRET_ID || '').trim()
  const secretKey = (process.env.COS_SECRET_KEY || '').trim()
  if (!bucket || !region || !secretId || !secretKey) return null
  return {
    bucket,
    region,
    secretId,
    secretKey,
    prefix: (process.env.COS_ACCOMPANIMENT_PREFIX || 'competition/accompaniment').replace(/^\/+|\/+$/g, '')
  }
}

export function cosHost(config: CosConfig): string {
  return `${config.bucket}.cos.${config.region}.myqcloud.com`
}

function hmacSha1(key: string | Buffer, data: string): string {
  return createHmac('sha1', key).update(data).digest('hex')
}

function sha1(data: string): string {
  return createHash('sha1').update(data).digest('hex')
}

/** COS 的 object key：不能以 / 开头，中文等要百分号编码。 */
export function encodeCosKey(key: string): string {
  return key
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

export interface CosSignedUrlOptions {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE'
  key: string
  expiresIn: number
  contentType?: string
  /** 桶级接口（例如 ?cors）用的 query 参数；参与签名。 */
  params?: Record<string, string>
}

/**
 * COS 签名 v5。`q-sign-algorithm=sha1&q-ak=…&q-sign-time=…&q-key-time=…&q-header-list=…&q-url-param-list=…&q-signature=…`
 * 参考 https://cloud.tencent.com/document/product/436/7778
 */
export function signCosUrl(config: CosConfig, options: CosSignedUrlOptions): string {
  const now = Math.floor(Date.now() / 1000)
  const keyTime = `${now};${now + options.expiresIn}`
  const encodedKey = encodeCosKey(options.key)
  const host = cosHost(config)
  const pathname = `/${encodedKey}`

  const headerPairs: Array<[string, string]> = [['host', host]]
  if (options.contentType) headerPairs.push(['content-type', options.contentType])
  headerPairs.sort((left, right) => left[0].localeCompare(right[0]))

  const headerList = headerPairs.map(([name]) => name).join(';')
  const paramPairs = Object.entries(options.params ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const urlParamList = paramPairs.map(([name]) => name).join(';')
  const httpHeaders = headerPairs.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')
  const httpParams = paramPairs.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')
  const httpString = `${options.method.toLowerCase()}\n${pathname}\n${httpParams}\n${httpHeaders}\n`

  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`
  const signKey = hmacSha1(config.secretKey, keyTime)
  const signature = hmacSha1(signKey, stringToSign)

  const params = [
    'q-sign-algorithm=sha1',
    `q-ak=${config.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=${urlParamList}`,
    `q-signature=${signature}`
  ].join('&')

  const query = paramPairs.length
    ? `${paramPairs.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')}&${params}`
    : params
  return `https://${host}${pathname}?${query}`
}

/** 按对象扩展名推断播放用的 MIME，供 GET 覆盖响应头。 */
export function contentTypeForKey(key: string): string {
  const extension = (key.split('.').at(-1) || '').toLowerCase()
  if (extension === 'm4a' || extension === 'mp4') return 'audio/mp4'
  if (extension === 'wav') return 'audio/wav'
  if (extension === 'aac') return 'audio/aac'
  if (extension === 'ogg') return 'audio/ogg'
  if (extension === 'flac') return 'audio/flac'
  return 'audio/mpeg'
}

/**
 * 浏览器直传用的预签名 PUT 地址。
 *
 * `content-type` 故意不参与签名：微信/旧版前端会按浏览器给的 `file.type` 发
 * `video/mp4` 之类的头，一旦进签名就会 `403 SignatureDoesNotMatch`，而这类
 * 不一致完全取决于客户端缓存了哪一版 JS。对象存下来的 Content-Type 不可信，
 * 播放时一律用 `presignCosGet` 的 `response-content-type` 覆盖。
 */
export function presignCosPut(config: CosConfig, key: string, _contentType?: string, expiresIn = 900): string {
  return signCosUrl(config, { method: 'PUT', key, expiresIn })
}

/** 播放/下载用的临时 GET 地址（带 response-content-type，避免存成 video/mp4 时放不出来）。 */
export function presignCosGet(config: CosConfig, key: string, expiresIn = 6 * 60 * 60, contentType?: string): string {
  return signCosUrl(config, {
    method: 'GET',
    key,
    expiresIn,
    params: { 'response-content-type': contentType || contentTypeForKey(key) }
  })
}

/** 按展示文件名（姓名《曲目》.ext）推断播放用的 MIME。 */
export function contentTypeForName(name: string | null | undefined, fallbackKey?: string): string {
  const value = String(name || '').trim()
  const match = value.match(/\.([a-z0-9]{2,5})$/i)
  if (match) return contentTypeForKey(`x.${match[1]!.toLowerCase()}`)
  return contentTypeForKey(fallbackKey || '')
}

/** 给一声部生成新的 object key（保留扩展名）。 */
export function newAccompanimentKey(config: CosConfig, extension: string): string {
  return `${config.prefix}/${randomUUID()}.${extension.replace(/^\./, '')}`
}

/** 用 PUT 上传一段字节（服务端侧用，例如后台代传或迁移老文件）。 */
export async function putCosObject(
  config: CosConfig,
  key: string,
  data: Uint8Array,
  contentType: string
): Promise<void> {
  const url = signCosUrl(config, { method: 'PUT', key, expiresIn: 900, contentType })
  const response = await fetch(url, { method: 'PUT', body: data as unknown as BodyInit, headers: { 'Content-Type': contentType } })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`COS PUT ${response.status}: ${text.slice(0, 160)}`)
  }
}

/** HEAD 校验对象是否真的存在、多大、什么类型——不能只信客户端上报。 */
export async function headCosObject(
  config: CosConfig,
  key: string
): Promise<{ size: number, contentType: string } | null> {
  const url = signCosUrl(config, { method: 'HEAD', key, expiresIn: 300 })
  const response = await fetch(url, { method: 'HEAD' })
  if (response.status === 404) return null
  if (!response.ok) return null
  const length = Number(response.headers.get('content-length') || 0)
  return { size: Number.isFinite(length) ? length : 0, contentType: response.headers.get('content-type') || '' }
}

/**
 * 从磁盘流式上传（原件包 500MB 级别不读进内存）。
 * undici 的 fetch 支持 ReadStream，但要显式 duplex: 'half'。
 */
export async function putCosObjectFromFile(
  config: CosConfig,
  key: string,
  filePath: string,
  contentType: string
): Promise<void> {
  const { createReadStream, statSync } = await import('node:fs')
  const size = statSync(filePath).size
  const url = `https://${cosHost(config)}/${encodeCosKey(key)}?${signCosUrl(config, { method: 'PUT', key, expiresIn: 900 })}`
  // undici 从 node:stream 的 ReadStream 需要 duplex，类型上 body 只接受 BodyInit，这里按运行时用法断言
  const body = createReadStream(filePath) as unknown as BodyInit
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(size) },
    body,
    // @ts-expect-error undici 专有选项
    duplex: 'half'
  })
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Storage upload failed',
      data: { code: 'STORAGE_UPLOAD_FAILED', message: `对象存储上传失败（${response.status}）` }
    })
  }
}
