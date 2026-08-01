import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import {
  issueAdminDeviceChallenge,
  verifyAndConsumeAdminDeviceProof
} from '../server/utils/admin-device-auth'

test('admin device challenge verifies once and stays bound to its origin', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const config = {
    keyId: 'yeu-device-test',
    username: 'admin',
    publicKeyJwk: publicKey.export({ format: 'jwk' })
  }
  const secret = 's'.repeat(64)
  const now = 1_785_100_000_000
  const challenge = issueAdminDeviceChallenge(
    secret,
    config.keyId,
    'https://yx.huiliyill.cn',
    now,
    'fixed-test-nonce'
  )
  const signature = sign(
    'sha256',
    Buffer.from(challenge.token),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }
  ).toString('base64url')

  verifyAndConsumeAdminDeviceProof({
    secret,
    config,
    origin: 'https://yx.huiliyill.cn',
    token: challenge.token,
    signature,
    now: now + 1_000
  })

  assert.throws(() => verifyAndConsumeAdminDeviceProof({
    secret,
    config,
    origin: 'https://yx.huiliyill.cn',
    token: challenge.token,
    signature,
    now: now + 2_000
  }), /REPLAYED/)

  const otherOrigin = issueAdminDeviceChallenge(
    secret,
    config.keyId,
    'https://yx.huiliyill.cn',
    now,
    'other-origin-nonce'
  )
  const otherSignature = sign(
    'sha256',
    Buffer.from(otherOrigin.token),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }
  ).toString('base64url')
  assert.throws(() => verifyAndConsumeAdminDeviceProof({
    secret,
    config,
    origin: 'https://other.example.test',
    token: otherOrigin.token,
    signature: otherSignature,
    now: now + 1_000
  }), /INVALID/)
})
