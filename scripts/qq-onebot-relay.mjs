import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

process.loadEnvFile(process.env.NUXT_ENV_FILE || '/www/wwwroot/yeu/shared/.env')

const host = process.env.YEU_QQ_RELAY_HOST || '172.17.0.1'
const port = Number(process.env.YEU_QQ_RELAY_PORT || 3012)
const targetUrl = process.env.YEU_QQ_RELAY_TARGET_URL || 'http://127.0.0.1:3000/api/integrations/bots/qq-onebot'
const secret = process.env.NUXT_QQ_BOT_WEBHOOK_TOKEN || ''
const selfId = process.env.NUXT_QQ_BOT_SELF_ID || ''
const allowedGroups = new Set((process.env.NUXT_QQ_BOT_ALLOWED_GROUP_IDS || '').split(/[\s,]+/).filter(Boolean))
const maxBodyBytes = 64 * 1024

if (secret.length < 32 || !selfId || allowedGroups.size === 0) {
  throw new Error('QQ_RELAY_CONFIGURATION_INVALID')
}

function send(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function signatureValid(value, body) {
  const provided = String(value || '').replace(/^sha1=/i, '').trim().toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(provided)) return false
  const expected = createHmac('sha1', secret).update(body).digest('hex')
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function targetMentioned(message) {
  return Array.isArray(message) && message.some(segment => (
    segment?.type === 'at' && String(segment?.data?.qq || '') === selfId
  ))
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    send(response, 200, { status: 'ok' })
    return
  }
  if (request.method !== 'POST' || request.url !== '/api/integrations/bots/qq-onebot') {
    send(response, 404, { status: 'not_found' })
    return
  }

  const chunks = []
  let size = 0
  request.on('data', (chunk) => {
    size += chunk.length
    if (size > maxBodyBytes) request.destroy()
    else chunks.push(chunk)
  })
  request.on('end', async () => {
    const rawBody = Buffer.concat(chunks).toString('utf8')
    if (!signatureValid(request.headers['x-signature'], rawBody)) {
      send(response, 401, { status: 'unauthorized' })
      return
    }

    let event
    try {
      event = JSON.parse(rawBody)
    } catch {
      send(response, 400, { status: 'invalid_json' })
      return
    }

    const allowed = event?.post_type === 'message'
      && event?.message_type === 'group'
      && allowedGroups.has(String(event?.group_id || ''))
      && targetMentioned(event?.message)
    if (!allowed) {
      send(response, 200, { status: 'ignored' })
      return
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': request.headers['x-signature'] },
        body: rawBody,
        signal: AbortSignal.timeout(10_000)
      })
      response.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(await upstream.text())
    } catch {
      send(response, 502, { status: 'upstream_unavailable' })
    }
  })
})

server.listen(port, host)
