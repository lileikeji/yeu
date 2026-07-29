import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  createWechatCallbackSignature,
  decryptWechatPayload,
  encryptWechatPayload,
  readWechatXmlField,
  verifyWechatCallbackSignature
} from '../server/modules/wechat/callback'

const token = 'testToken123'
const appId = 'wx1234567890abcdef'
const encodingAesKey = Buffer.alloc(32, 7).toString('base64').slice(0, 43)

test('callback signatures cover plaintext and encrypted verification requests', () => {
  const plaintext = createWechatCallbackSignature({
    token,
    timestamp: '1720000000',
    nonce: 'nonce-1'
  })
  assert.equal(plaintext.length, 40)
  assert.equal(verifyWechatCallbackSignature({
    token,
    timestamp: '1720000000',
    nonce: 'nonce-1',
    signature: plaintext
  }), true)
  assert.equal(verifyWechatCallbackSignature({
    token,
    timestamp: '1720000000',
    nonce: 'changed',
    signature: plaintext
  }), false)

  const encrypted = 'encrypted-echo'
  const safeMode = createWechatCallbackSignature({
    token,
    timestamp: '1720000000',
    nonce: 'nonce-1',
    encrypted
  })
  assert.equal(verifyWechatCallbackSignature({
    token,
    timestamp: '1720000000',
    nonce: 'nonce-1',
    signature: safeMode,
    encrypted
  }), true)
})

test('safe-mode AES payloads round-trip and reject the wrong AppID', () => {
  const xml = '<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content></xml>'
  const encrypted = encryptWechatPayload({
    message: xml,
    encodingAesKey,
    appId,
    randomPrefix: Buffer.alloc(16, 3)
  })
  assert.equal(decryptWechatPayload({ encrypted, encodingAesKey, appId }), xml)
  assert.throws(
    () => decryptWechatPayload({ encrypted, encodingAesKey, appId: 'wx-wrong' }),
    /AppID mismatch/
  )
})

test('XML field reader supports CDATA without exposing unrelated message contents', () => {
  const xml = '<xml><Encrypt><![CDATA[base64+/=]]></Encrypt><Content>hello &amp; world</Content></xml>'
  assert.equal(readWechatXmlField(xml, 'Encrypt'), 'base64+/=')
  assert.equal(readWechatXmlField(xml, 'Content'), 'hello & world')
  assert.equal(readWechatXmlField(xml, '../Content'), null)
})

test('callback endpoints are server-only, no-store, and support safe mode', () => {
  const getRoute = readFileSync(resolve('server/api/integrations/wechat-mp.get.ts'), 'utf8')
  const postRoute = readFileSync(resolve('server/api/integrations/wechat-mp.post.ts'), 'utf8')
  const config = readFileSync(resolve('nuxt.config.ts'), 'utf8')

  assert.match(getRoute, /msg_signature/)
  assert.match(getRoute, /decryptWechatPayload/)
  assert.match(postRoute, /readRawBody/)
  assert.match(postRoute, /return 'success'/)
  assert.match(getRoute, /CDN-Cache-Control', 'no-store'/)
  assert.match(postRoute, /CDN-Cache-Control', 'no-store'/)
  assert.match(config, /wechatMpToken: ''/)
  assert.match(config, /wechatMpEncodingAesKey: ''/)
  assert.doesNotMatch(config, /wechatMpToken:\s*'[A-Za-z0-9]{3,32}'/)
  assert.doesNotMatch(config, /wechatMpEncodingAesKey:\s*'[A-Za-z0-9]{43}'/)
})
