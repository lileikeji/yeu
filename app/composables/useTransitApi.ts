/**
 * 校外公交接口的客户端：先拿 120 秒票据，再带票请求，最后按票据签名解出明文。
 *
 * 服务端 `server/utils/transit-guard.ts` 把响应包成 `{ v: 1, n, d }`，`d` 是用
 * 「票据签名 + nonce」派生的密钥流异或后的 base64。直接 curl 拿不到字段名和坐标，
 * 想白嫖就得先拿票、再照抄这套派生。
 */

type TransitTicket = { t: number, s: string, ttl: number }

type TransitEnvelope = { v: 1, n: string, d: string }

let ticket: TransitTicket | null = null
let ticketPromise: Promise<TransitTicket> | null = null

const textEncoder = new TextEncoder()

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function fromBase64(value: string): Uint8Array {
  const raw = atob(value)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/** 与 Node 侧同构：`sha256("<票据签名>|<nonce>|<counter>")` 顺序拼接后按需截断。 */
async function keystream(keyMaterial: string, nonce: string, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length)
  let offset = 0
  let counter = 0
  while (offset < length) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      textEncoder.encode(`${keyMaterial}|${nonce}|${counter}`)
    )
    const block = new Uint8Array(digest)
    out.set(block.subarray(0, Math.min(block.length, length - offset)), offset)
    offset += block.length
    counter += 1
  }
  return out
}

async function decodeTransit<T>(envelope: TransitEnvelope, keyMaterial: string): Promise<T> {
  const cipher = fromBase64(envelope.d)
  const stream = await keystream(keyMaterial, envelope.n, cipher.length)
  const plain = new Uint8Array(cipher.length)
  for (let i = 0; i < cipher.length; i += 1) plain[i] = cipher[i]! ^ stream[i]!
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

async function ensureTicket(): Promise<TransitTicket> {
  if (ticket && ticket.t - Date.now() > 20_000) return ticket
  if (!ticketPromise) {
    ticketPromise = $fetch<TransitTicket>('/api/public/transit/ticket')
      .then((next) => {
        ticket = next
        return next
      })
      .finally(() => {
        ticketPromise = null
      })
  }
  return ticketPromise
}

/** 带票 + 加密的一次请求；失败按原样抛出，页面自己决定怎么提示。 */
export async function fetchTransit<T>(path: string): Promise<T> {
  const current = await ensureTicket()
  const nonce = randomNonce()
  const envelope = await $fetch<TransitEnvelope>(path, {
    headers: {
      'x-yeu-ticket': `${current.t}.${current.s}`,
      'x-yeu-nonce': nonce
    }
  })
  if (!envelope || envelope.v !== 1) throw new Error('transit payload malformed')
  return decodeTransit<T>(envelope, current.s)
}

/** 票据过期（403）时清掉缓存，下一次调用重新领。 */
export function resetTransitTicket(): void {
  ticket = null
}
