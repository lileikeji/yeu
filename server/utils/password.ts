import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEY_LENGTH = 64
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAX_MEMORY
    }, (error, key) => {
      if (error) {
        reject(error)
        return
      }

      resolve(key)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('Admin password must contain at least 12 characters')
  }

  const salt = randomBytes(16)
  const key = await deriveKey(password, salt)
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export function isSupportedPasswordHash(value: string): boolean {
  const parts = value.split('$')

  return parts.length === 6
    && parts[0] === 'scrypt'
    && Number(parts[1]) === SCRYPT_N
    && Number(parts[2]) === SCRYPT_R
    && Number(parts[3]) === SCRYPT_P
    && Boolean(parts[4]?.length)
    && Boolean(parts[5]?.length)
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (!isSupportedPasswordHash(encodedHash)) {
    return false
  }

  const [, , , , saltValue, expectedValue] = encodedHash.split('$')

  if (!saltValue || !expectedValue) {
    return false
  }

  try {
    const salt = Buffer.from(saltValue, 'base64url')
    const expected = Buffer.from(expectedValue, 'base64url')
    const actual = await deriveKey(password, salt)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
