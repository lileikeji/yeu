const DATABASE_NAME = 'yeu-admin-device-auth'
const DATABASE_VERSION = 1
const STORE_NAME = 'credentials'
const PRIMARY_KEY = 'primary'

interface StoredAdminDeviceKey {
  keyId: string
  privateKey: CryptoKey
}

interface AdminDeviceKeyFile {
  version: 1
  keyId: string
  algorithm: 'ECDSA_P256_SHA256'
  privateKeyJwk: JsonWebKey
}

export interface AdminDeviceChallengePayload {
  algorithm: 'ECDSA_P256_SHA256'
  keyId: string
  token: string
  expiresAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readStoredKey(): Promise<StoredAdminDeviceKey | null> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(PRIMARY_KEY)
      request.onsuccess = () => resolve((request.result as StoredAdminDeviceKey | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

function parseKeyFile(text: string): AdminDeviceKeyFile {
  const value = JSON.parse(text) as Partial<AdminDeviceKeyFile>
  if (
    value.version !== 1
    || value.algorithm !== 'ECDSA_P256_SHA256'
    || typeof value.keyId !== 'string'
    || !/^[a-zA-Z0-9._-]{8,80}$/.test(value.keyId)
    || value.privateKeyJwk?.kty !== 'EC'
    || value.privateKeyJwk.crv !== 'P-256'
    || typeof value.privateKeyJwk.d !== 'string'
  ) {
    throw new Error('INVALID_ADMIN_DEVICE_KEY')
  }
  return value as AdminDeviceKeyFile
}

export async function importAdminDeviceKey(text: string): Promise<string> {
  const value = parseKeyFile(text)
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    value.privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .put({ keyId: value.keyId, privateKey }, PRIMARY_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
  return value.keyId
}

export async function hasAdminDeviceKey(): Promise<boolean> {
  return Boolean(await readStoredKey())
}

export async function forgetAdminDeviceKey(): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .delete(PRIMARY_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export async function signAdminDeviceChallenge(
  challenge: AdminDeviceChallengePayload
): Promise<{ keyId: string, token: string, signature: string }> {
  const stored = await readStoredKey()
  if (!stored || stored.keyId !== challenge.keyId) {
    throw new Error('ADMIN_DEVICE_KEY_NOT_FOUND')
  }
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    stored.privateKey,
    new TextEncoder().encode(challenge.token)
  )
  const bytes = new Uint8Array(signature)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return {
    keyId: stored.keyId,
    token: challenge.token,
    signature: btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
}
