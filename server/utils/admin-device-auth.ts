import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify
} from 'node:crypto'

const CHALLENGE_TTL_MS = 60_000
const MAX_CONSUMED_PROOFS = 500
const consumedProofs = new Map<string, number>()

interface AdminDeviceConfig {
  keyId: string
  username: string
  publicKeyJwk: JsonWebKey
}

interface ChallengePayload {
  version: 1
  keyId: string
  origin: string
  nonce: string
  issuedAt: number
  expiresAt: number
}

export interface AdminDeviceChallenge {
  algorithm: 'ECDSA_P256_SHA256'
  keyId: string
  token: string
  expiresAt: number
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
}

function challengeMac(secret: string, encodedPayload: string): string {
  return createHmac('sha256', secret)
    .update('admin-device-challenge')
    .update('\0')
    .update(encodedPayload)
    .digest('base64url')
}

function equalMac(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin
}

function parsePublicKey(value: string): JsonWebKey | null {
  try {
    const key = JSON.parse(value) as JsonWebKey
    if (
      key.kty !== 'EC'
      || key.crv !== 'P-256'
      || typeof key.x !== 'string'
      || typeof key.y !== 'string'
      || typeof key.d === 'string'
    ) {
      return null
    }
    return key
  } catch {
    return null
  }
}

export function getAdminDeviceConfig(): AdminDeviceConfig | null {
  const keyId = String(process.env.NUXT_ADMIN_DEVICE_KEY_ID || '').trim()
  const username = String(process.env.NUXT_ADMIN_DEVICE_USERNAME || 'admin').trim()
  const publicKeyJwk = parsePublicKey(
    String(process.env.NUXT_ADMIN_DEVICE_PUBLIC_KEY_JWK || '').trim()
  )

  if (!/^[a-zA-Z0-9._-]{8,80}$/.test(keyId) || !username || !publicKeyJwk) {
    return null
  }
  return { keyId, username, publicKeyJwk }
}

export function issueAdminDeviceChallenge(
  secret: string,
  keyId: string,
  origin: string,
  now = Date.now(),
  nonce = randomBytes(24).toString('base64url')
): AdminDeviceChallenge {
  const payload: ChallengePayload = {
    version: 1,
    keyId,
    origin: normalizeOrigin(origin),
    nonce,
    issuedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS
  }
  const encodedPayload = encodeJson(payload)
  const token = `${encodedPayload}.${challengeMac(secret, encodedPayload)}`
  return {
    algorithm: 'ECDSA_P256_SHA256',
    keyId,
    token,
    expiresAt: payload.expiresAt
  }
}

function pruneConsumedProofs(now: number): void {
  for (const [hash, expiresAt] of consumedProofs) {
    if (expiresAt <= now) consumedProofs.delete(hash)
  }
  while (consumedProofs.size > MAX_CONSUMED_PROOFS) {
    const oldest = consumedProofs.keys().next().value
    if (typeof oldest !== 'string') break
    consumedProofs.delete(oldest)
  }
}

export function verifyAndConsumeAdminDeviceProof(input: {
  secret: string
  config: AdminDeviceConfig
  origin: string
  token: string
  signature: string
  now?: number
}): void {
  const now = input.now ?? Date.now()
  const parts = input.token.split('.')
  if (parts.length !== 2) throw new Error('ADMIN_DEVICE_PROOF_INVALID')

  const [encodedPayload, mac] = parts
  if (!encodedPayload || !mac || !equalMac(mac, challengeMac(input.secret, encodedPayload))) {
    throw new Error('ADMIN_DEVICE_PROOF_INVALID')
  }

  let payload: ChallengePayload
  try {
    payload = decodeJson<ChallengePayload>(encodedPayload)
  } catch {
    throw new Error('ADMIN_DEVICE_PROOF_INVALID')
  }

  if (
    payload.version !== 1
    || payload.keyId !== input.config.keyId
    || payload.origin !== normalizeOrigin(input.origin)
    || !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)
    || payload.issuedAt > now + 5_000
    || payload.expiresAt < now
    || payload.expiresAt - payload.issuedAt !== CHALLENGE_TTL_MS
  ) {
    throw new Error('ADMIN_DEVICE_PROOF_INVALID')
  }

  const proofHash = createHash('sha256').update(input.token).digest('hex')
  pruneConsumedProofs(now)
  if (consumedProofs.has(proofHash)) throw new Error('ADMIN_DEVICE_PROOF_REPLAYED')

  let signature: Buffer
  try {
    signature = Buffer.from(input.signature, 'base64url')
  } catch {
    throw new Error('ADMIN_DEVICE_PROOF_INVALID')
  }
  if (signature.length !== 64) throw new Error('ADMIN_DEVICE_PROOF_INVALID')

  const publicKey = createPublicKey({
    key: input.config.publicKeyJwk,
    format: 'jwk'
  })
  const valid = verify(
    'sha256',
    Buffer.from(input.token),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  )
  if (!valid) throw new Error('ADMIN_DEVICE_PROOF_INVALID')

  consumedProofs.set(proofHash, payload.expiresAt)
}
