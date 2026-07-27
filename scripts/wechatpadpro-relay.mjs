import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const MAX_BODY_BYTES = 64 * 1024
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const RECENT_MESSAGE_TTL_MS = 30 * 60 * 1000

function scalar(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (!value || typeof value !== 'object') return ''
  for (const key of ['string', 'value', 'Value']) {
    if (typeof value[key] === 'string' || typeof value[key] === 'number') return String(value[key]).trim()
  }
  return ''
}

function firstValue(source, keys) {
  for (const key of keys) {
    const value = scalar(source?.[key])
    if (value) return value
  }
  return ''
}

function listValue(value) {
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean)
  const text = scalar(value)
  return text ? text.split(/[;,\s]+/).map(item => item.trim()).filter(Boolean) : []
}

function configuredSet(value) {
  return new Set(String(value || '').split(/[\s,]+/).map(item => item.trim()).filter(Boolean))
}

function safeEqualHex(provided, expected) {
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false
  return timingSafeEqual(Buffer.from(provided.toLowerCase()), Buffer.from(expected.toLowerCase()))
}

function timestampValid(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return false
  const milliseconds = parsed < 10_000_000_000 ? parsed * 1000 : parsed
  return Math.abs(Date.now() - milliseconds) <= MAX_CLOCK_SKEW_MS
}

export function verifySignature({ secret, timestamp, signature, rawBody, separator = '' }) {
  if (Buffer.byteLength(secret || '') < 32 || !timestampValid(timestamp)) return false
  const provided = String(signature || '').replace(/^sha256=/i, '').trim()
  const expected = createHmac('sha256', secret).update(`${timestamp}${separator}${rawBody}`).digest('hex')
  return safeEqualHex(provided, expected)
}

function xmlMentionIds(value) {
  const text = scalar(value)
  const match = text.match(/<atuserlist>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/atuserlist>/i)
  return match ? listValue(match[1]) : []
}

function stripSenderPrefix(text) {
  const match = text.match(/^([^:\n]{3,160}):\n([\s\S]*)$/)
  return match ? { senderId: match[1].trim(), text: match[2] } : { senderId: '', text }
}

function stripBotMention(text, botName) {
  if (!botName) return text.replace(/^@[\p{L}\p{N}_.\-\u4e00-\u9fff]+(?:\s|\u2005)+/u, '').trim()
  const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`@${escaped}(?:\\s|\\u2005)*`, 'gu'), ' ').replace(/\s+/g, ' ').trim()
}

export function normalizeWechatPadProEvent(payload, config = {}) {
  if (!payload || typeof payload !== 'object') return null
  const body = payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload.Data && typeof payload.Data === 'object' ? payload.Data : payload
  const msgType = Number(firstValue(body, ['msgType', 'MsgType', 'type', 'Type']) || 0)
  if (msgType !== 1) return null

  const fromUser = firstValue(body, ['fromUser', 'FromUser', 'fromUserName', 'FromUserName'])
  const toUser = firstValue(body, ['toUser', 'ToUser', 'toUserName', 'ToUserName'])
  const explicitRoom = firstValue(body, ['roomId', 'RoomId', 'chatRoomId', 'ChatRoomId'])
  const roomId = explicitRoom
    || (fromUser.endsWith('@chatroom') ? fromUser : '')
    || (toUser.endsWith('@chatroom') ? toUser : '')
  if (!roomId) return null

  let text = firstValue(body, ['content', 'Content', 'text', 'Text', 'displayContent', 'DisplayContent'])
  const prefixed = stripSenderPrefix(text)
  text = prefixed.text
  const senderId = firstValue(body, ['senderId', 'SenderId', 'sender', 'Sender', 'realChatUser', 'RealChatUser'])
    || prefixed.senderId
  if (!senderId) return null

  const messageId = firstValue(body, ['messageId', 'MessageId', 'newMsgId', 'NewMsgId', 'msgId', 'MsgId'])
  if (!messageId) return null

  const botId = String(config.botId || '').trim()
  const botName = String(config.botName || '').trim()
  const mentionValues = [
    body.mentionedIds,
    body.atUserList,
    body.AtUserList,
    body.atList,
    body.AtList
  ].flatMap(listValue)
  const sourceXml = firstValue(body, ['msgSource', 'MsgSource', 'messageSource', 'MessageSource'])
  mentionValues.push(...xmlMentionIds(sourceXml))
  const explicitAt = body.isAt === true || body.IsAt === true
  const nameMentioned = Boolean(botName && new RegExp(`@${botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|\\u2005|$)`, 'u').test(text))
  const isAt = explicitAt || Boolean(botId && mentionValues.includes(botId)) || nameMentioned

  return {
    event: 'message',
    messageId,
    roomId,
    senderId,
    botId,
    text,
    cleanText: stripBotMention(text, botName),
    isAt,
    mentionedIds: [...new Set(mentionValues)]
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body_too_large'), { statusCode: 413 }))
        request.resume()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function send(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

function parseJson(rawBody) {
  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}

function signYeu(secret, timestamp, rawBody) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

function recentOnce(cache, messageId) {
  const now = Date.now()
  for (const [id, expiresAt] of cache) {
    if (expiresAt <= now) cache.delete(id)
  }
  if (cache.has(messageId)) return false
  cache.set(messageId, now + RECENT_MESSAGE_TTL_MS)
  return true
}

export function createRelayServer(config) {
  const allowedRooms = configuredSet(config.allowedRoomIds)
  const recentMessages = new Map()

  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      send(response, 200, {
        status: 'ok',
        configured: Boolean(config.authKey && config.botId && allowedRooms.size > 0),
        allowedRoomCount: allowedRooms.size
      })
      return
    }

    if (request.method !== 'POST' || !['/webhook/wechatpadpro', '/api/send'].includes(request.url || '')) {
      send(response, 404, { status: 'not_found' })
      return
    }

    let rawBody
    try {
      rawBody = await readBody(request)
    } catch (error) {
      send(response, error?.statusCode || 400, { status: 'invalid_body' })
      return
    }

    if (request.url === '/webhook/wechatpadpro') {
      const valid = verifySignature({
        secret: config.wechatpadproWebhookSecret,
        timestamp: request.headers['x-webhook-timestamp'],
        signature: request.headers['x-webhook-signature'],
        rawBody
      })
      if (!valid) {
        send(response, 401, { status: 'unauthorized' })
        return
      }

      const event = normalizeWechatPadProEvent(parseJson(rawBody), config)
      if (!event || !allowedRooms.has(event.roomId) || !event.isAt || !event.cleanText) {
        send(response, 200, { status: 'ignored' })
        return
      }
      if (!recentOnce(recentMessages, event.messageId)) {
        send(response, 200, { status: 'duplicate' })
        return
      }

      const upstreamBody = JSON.stringify(event)
      const timestamp = String(Date.now())
      try {
        const upstream = await fetch(config.yeuTargetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Yeu-Timestamp': timestamp,
            'X-Yeu-Signature': `sha256=${signYeu(config.yeuSecret, timestamp, upstreamBody)}`
          },
          body: upstreamBody,
          signal: AbortSignal.timeout(10_000)
        })
        send(response, upstream.status, parseJson(await upstream.text()) || { status: 'forwarded' })
      } catch {
        recentMessages.delete(event.messageId)
        send(response, 502, { status: 'upstream_unavailable' })
      }
      return
    }

    const valid = verifySignature({
      secret: config.yeuSecret,
      timestamp: request.headers['x-yeu-timestamp'],
      signature: request.headers['x-yeu-signature'],
      rawBody,
      separator: '.'
    })
    const body = parseJson(rawBody)
    const roomId = scalar(body?.roomId)
    const text = scalar(body?.text)
    if (!valid) {
      send(response, 401, { status: 'unauthorized' })
      return
    }
    if (!allowedRooms.has(roomId) || !text || text.length > 4000) {
      send(response, 400, { status: 'invalid_message' })
      return
    }

    const target = new URL('/message/SendTextMessage', config.wechatpadproBaseUrl)
    target.searchParams.set('key', config.authKey)
    const outgoing = JSON.stringify({
      MsgItem: [{ ToUserName: roomId, TextContent: text, MsgType: 1, AtWxIDList: [] }]
    })
    try {
      const upstream = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: outgoing,
        signal: AbortSignal.timeout(15_000)
      })
      const result = parseJson(await upstream.text())
      if (!upstream.ok || (result && result.code !== undefined && Number(result.code) !== 0)) {
        send(response, 502, { status: 'send_failed' })
        return
      }
      send(response, 200, { status: 'ok' })
    } catch {
      send(response, 502, { status: 'send_unavailable' })
    }
  })
}

function loadConfig() {
  process.loadEnvFile(process.env.NUXT_ENV_FILE || '/www/wwwroot/yeu/shared/wechatpadpro/.env')
  const config = {
    host: process.env.YEU_WECHATPADPRO_RELAY_HOST || '172.30.28.1',
    port: Number(process.env.YEU_WECHATPADPRO_RELAY_PORT || 3022),
    yeuTargetUrl: process.env.YEU_WECHATPADPRO_TARGET_URL || 'http://127.0.0.1:3000/api/integrations/bots/wechat',
    yeuSecret: process.env.NUXT_WECHAT_BOT_WEBHOOK_SECRET || '',
    wechatpadproWebhookSecret: process.env.WECHATPADPRO_WEBHOOK_SECRET || '',
    wechatpadproBaseUrl: process.env.WECHATPADPRO_BASE_URL || 'http://127.0.0.1:1238',
    authKey: process.env.WECHATPADPRO_AUTH_KEY || '',
    botId: process.env.NUXT_WECHAT_BOT_ID || '',
    botName: process.env.NUXT_WECHAT_BOT_NAME || '',
    allowedRoomIds: process.env.NUXT_WECHAT_BOT_ALLOWED_ROOM_IDS || ''
  }
  if (Buffer.byteLength(config.yeuSecret) < 32 || Buffer.byteLength(config.wechatpadproWebhookSecret) < 32) {
    throw new Error('WECHAT_RELAY_SECRETS_INVALID')
  }
  if (!config.authKey) throw new Error('WECHATPADPRO_AUTH_KEY_MISSING')
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('WECHAT_RELAY_PORT_INVALID')
  }
  return config
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig()
  createRelayServer(config).listen(config.port, config.host)
}
