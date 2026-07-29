import {
  decryptWechatPayload,
  readWechatXmlField,
  verifyWechatCallbackSignature
} from '../../modules/wechat/callback'

const MAX_CALLBACK_BYTES = 128 * 1024

function queryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Edge-Control', 'no-store')
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')

  const runtime = useRuntimeConfig(event)
  const token = String(runtime.wechatMpToken || '').trim()
  const encodingAesKey = String(runtime.wechatMpEncodingAesKey || '').trim()
  const appId = String(runtime.wechatMpAppId || '').trim()
  if (!token || !encodingAesKey || !appId) {
    throw createError({ statusCode: 503, statusMessage: '微信公众号回调尚未完成配置' })
  }

  const rawBody = await readRawBody(event) || ''
  if (!rawBody || Buffer.byteLength(rawBody) > MAX_CALLBACK_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid callback body' })
  }

  const query = getQuery(event)
  const timestamp = queryText(query.timestamp)
  const nonce = queryText(query.nonce)
  const encrypted = readWechatXmlField(rawBody, 'Encrypt')
  if (encrypted) {
    if (!verifyWechatCallbackSignature({
      token,
      timestamp,
      nonce,
      signature: queryText(query.msg_signature),
      encrypted
    })) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
    }
    try {
      decryptWechatPayload({ encrypted, encodingAesKey, appId })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Invalid encrypted callback' })
    }
  } else if (!verifyWechatCallbackSignature({
    token,
    timestamp,
    nonce,
    signature: queryText(query.signature)
  })) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  return 'success'
})
