import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getHeader, setHeader } from 'h3'
import { getClientIpAddress } from './client-ip'

/**
 * 校外公交接口的防盗刷闸门。
 *
 * 思路：接口不再认「有 Origin 就给」，而要一张短票据：
 *   1. `/api/public/transit/ticket` 发一张 120 秒票据，签名绑定 客户端 IP + User-Agent；
 *   2. 数据接口必须带 `x-yeu-ticket: <过期毫秒>.<签名>`，过期、换 IP、换 UA、改签名都拒；
 *   3. 响应体统一包成 `{ v: 1, n, d }`，`d` 是按 `n` 派生的密钥流异或后的 base64，
 *      直接 curl 拿到的是乱码，字段名也不在明文里。
 *
 * 这挡不住铁了心逆向前端的人（网页端本来就必须能解密），但拿不到「curl 一下就白嫖」的路。
 */

const SECRET = process.env.NUXT_TRANSIT_GUARD_SECRET || 'yeu-transit-guard::k2k6::2026'
const TICKET_TTL_MS = 120_000
const TICKET_HEADER = 'x-yeu-ticket'

function uaHash(event: H3Event): string {
  const ua = getHeader(event, 'user-agent') ?? ''
  return createHash('sha256').update(ua).digest('hex').slice(0, 16)
}

function sign(event: H3Event, expiresAt: number): string {
  const material = `${expiresAt}.${getClientIpAddress(event)}.${uaHash(event)}`
  return createHmac('sha256', SECRET).update(material).digest('base64url')
}

/** 发一张票据：调用方把它放进 `x-yeu-ticket`。 */
export function issueTransitTicket(event: H3Event): { t: number, s: string, ttl: number } {
  const expiresAt = Date.now() + TICKET_TTL_MS
  setHeader(event, 'Cache-Control', 'no-store')
  return { t: expiresAt, s: sign(event, expiresAt), ttl: Math.round(TICKET_TTL_MS / 1000) }
}

/** 校验票据；不合法直接 403，错误码固定，不泄露细节。返回票据签名（客户端也持有，做密钥料）。 */
export function assertTransitTicket(event: H3Event): string {
  const raw = getHeader(event, TICKET_HEADER) ?? ''
  const [expiresRaw, signature] = raw.split('.')
  const expiresAt = Number(expiresRaw)
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    throw createError({ statusCode: 403, statusMessage: 'Transit ticket required' })
  }
  const expected = sign(event, expiresAt)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw createError({ statusCode: 403, statusMessage: 'Transit ticket required' })
  }
  return expected
}

/**
 * 按「票据签名 + nonce」派生密钥流。签名只有拿到合格票据的客户端才有，
 * 所以这里不需要把密钥硬编码进前端包。
 */
function keystream(keyMaterial: string, nonce: string, length: number): Buffer {
  const chunks: Buffer[] = []
  let total = 0
  let counter = 0
  while (total < length) {
    const block = createHash('sha256').update(`${keyMaterial}|${nonce}|${counter}`).digest()
    chunks.push(block)
    total += block.length
    counter += 1
  }
  return Buffer.concat(chunks).subarray(0, length)
}

/** 把 JSON 包成 `{ v, n, d }`；`n` 由调用方给（每次请求换一个）。 */
export function encodeTransitPayload(keyMaterial: string, nonce: string, payload: unknown): { v: 1, n: string, d: string } {
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const stream = keystream(keyMaterial, nonce, plain.length)
  const cipher = Buffer.alloc(plain.length)
  for (let i = 0; i < plain.length; i += 1) cipher[i] = plain[i]! ^ stream[i]!
  return { v: 1, n: nonce, d: cipher.toString('base64') }
}

/** 票据 + 加密一起做，数据接口一行调用。 */
export function guardedTransitPayload(event: H3Event, nonce: string, payload: unknown) {
  const keyMaterial = assertTransitTicket(event)
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  return encodeTransitPayload(keyMaterial, nonce, payload)
}

/** 客户端自带的 nonce（每次请求一个），只管加密，不做重放判定。 */
export function transitNonceFrom(event: H3Event): string {
  const raw = getHeader(event, 'x-yeu-nonce') ?? ''
  return /^[a-z0-9]{8,32}$/i.test(raw) ? raw : createHash('sha256').update(`${Date.now()}${Math.random()}`).digest('hex').slice(0, 16)
}
