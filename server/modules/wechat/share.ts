import { createHash, randomBytes } from 'node:crypto'
import { createError } from 'h3'

interface WechatTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

interface WechatTicketResponse {
  ticket?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

interface CachedCredential {
  appId: string
  value: string
  expiresAt: number
}

export interface WechatJsSdkSignature {
  appId: string
  nonceStr: string
  timestamp: number
  signature: string
  url: string
  jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData']
}

let tokenCache: CachedCredential | null = null
let ticketCache: CachedCredential | null = null
let tokenPromise: Promise<string> | null = null
let ticketPromise: Promise<string> | null = null

function credentialExpiresAt(expiresIn: number | undefined): number {
  const lifetimeSeconds = Math.max(60, Math.min(7200, Number(expiresIn) || 7200) - 300)
  return Date.now() + lifetimeSeconds * 1000
}

function cachedValue(cache: CachedCredential | null, appId: string): string | null {
  if (!cache || cache.appId !== appId || cache.expiresAt <= Date.now()) return null
  return cache.value
}

function wechatApiError(operation: string, payload: { errcode?: number, errmsg?: string }): Error {
  return createError({
    statusCode: 502,
    statusMessage: '微信分享配置暂时不可用',
    data: {
      code: 'WECHAT_JS_SDK_UPSTREAM_ERROR',
      operation,
      wechatErrorCode: Number(payload.errcode) || null
    }
  })
}

async function requestWechatJson<T>(url: URL): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: '微信分享配置暂时不可用',
      data: { code: 'WECHAT_JS_SDK_NETWORK_ERROR' }
    })
  }

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: '微信分享配置暂时不可用',
      data: { code: 'WECHAT_JS_SDK_HTTP_ERROR', upstreamStatus: response.status }
    })
  }

  return await response.json() as T
}

export async function getWechatAccessToken(appId: string, appSecret: string): Promise<string> {
  const cached = cachedValue(tokenCache, appId)
  if (cached) return cached
  if (tokenPromise) return await tokenPromise

  tokenPromise = (async () => {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
    url.searchParams.set('grant_type', 'client_credential')
    url.searchParams.set('appid', appId)
    url.searchParams.set('secret', appSecret)
    const payload = await requestWechatJson<WechatTokenResponse>(url)
    if (!payload.access_token || payload.errcode) throw wechatApiError('access_token', payload)
    tokenCache = {
      appId,
      value: payload.access_token,
      expiresAt: credentialExpiresAt(payload.expires_in)
    }
    return payload.access_token
  })()

  try {
    return await tokenPromise
  } finally {
    tokenPromise = null
  }
}

async function fetchJsApiTicket(appId: string, appSecret: string): Promise<string> {
  const cached = cachedValue(ticketCache, appId)
  if (cached) return cached
  if (ticketPromise) return await ticketPromise

  ticketPromise = (async () => {
    const accessToken = await getWechatAccessToken(appId, appSecret)
    const url = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket')
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('type', 'jsapi')
    const payload = await requestWechatJson<WechatTicketResponse>(url)
    if (!payload.ticket || payload.errcode) throw wechatApiError('jsapi_ticket', payload)
    ticketCache = {
      appId,
      value: payload.ticket,
      expiresAt: credentialExpiresAt(payload.expires_in)
    }
    return payload.ticket
  })()

  try {
    return await ticketPromise
  } finally {
    ticketPromise = null
  }
}

export function normalizeWechatShareUrl(rawUrl: string, allowedHosts: readonly string[]): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw createError({ statusCode: 400, statusMessage: '分享页面地址无效' })
  }

  const allowed = new Set(allowedHosts.map(host => host.trim().toLowerCase()).filter(Boolean))
  if (
    url.protocol !== 'https:'
    || (url.port && url.port !== '443')
    || !allowed.has(url.hostname.toLowerCase())
    || url.username
    || url.password
  ) {
    throw createError({ statusCode: 400, statusMessage: '分享页面地址不受支持' })
  }
  url.hash = ''
  return url.toString()
}

export function buildWechatJsSdkSignature(
  ticket: string,
  nonceStr: string,
  timestamp: number,
  url: string
): string {
  const source = [
    `jsapi_ticket=${ticket}`,
    `noncestr=${nonceStr}`,
    `timestamp=${timestamp}`,
    `url=${url}`
  ].join('&')
  return createHash('sha1').update(source).digest('hex')
}

export async function createWechatJsSdkSignature(input: {
  appId: string
  appSecret: string
  url: string
}): Promise<WechatJsSdkSignature> {
  const nonceStr = randomBytes(16).toString('hex')
  const timestamp = Math.floor(Date.now() / 1000)
  const ticket = await fetchJsApiTicket(input.appId, input.appSecret)
  return {
    appId: input.appId,
    nonceStr,
    timestamp,
    signature: buildWechatJsSdkSignature(ticket, nonceStr, timestamp, input.url),
    url: input.url,
    jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData']
  }
}

export function clearWechatShareCachesForTests(): void {
  tokenCache = null
  ticketCache = null
  tokenPromise = null
  ticketPromise = null
}
