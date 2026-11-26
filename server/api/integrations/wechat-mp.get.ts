import { decryptWechatPayload } from '../../modules/wechat/callback'
import { readWechatMpAccounts, resolveWechatMpAccount } from '../../modules/wechat/accounts'

function queryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Edge-Control', 'no-store')
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')

  const runtime = useRuntimeConfig(event)
  const accounts = readWechatMpAccounts(runtime as unknown as Record<string, unknown>)
  if (!accounts.length) {
    throw createError({ statusCode: 503, statusMessage: '微信公众号回调尚未完成配置' })
  }

  const query = getQuery(event)
  const timestamp = queryText(query.timestamp)
  const nonce = queryText(query.nonce)
  const echo = queryText(query.echostr)
  const encryptedSignature = queryText(query.msg_signature)
  const plaintextSignature = queryText(query.signature)
  if (!timestamp || !nonce || !echo) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid verification request' })
  }

  if (encryptedSignature) {
    const account = resolveWechatMpAccount(accounts, {
      timestamp,
      nonce,
      signature: encryptedSignature,
      encrypted: echo
    })
    if (!account) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
    }
    try {
      return decryptWechatPayload({
        encrypted: echo,
        encodingAesKey: account.encodingAesKey,
        appId: account.appId
      })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Invalid encrypted verification request' })
    }
  }

  const account = resolveWechatMpAccount(accounts, {
    timestamp,
    nonce,
    signature: plaintextSignature
  })
  if (!account) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }
  return echo
})
