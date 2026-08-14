import { assertSafeOutboundBotUrl, createBotWebhookSignature } from './security'

async function fetchBotEndpoint(url: URL, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendOneBotGroupMessage(input: {
  apiUrl: string
  apiToken: string
  groupId: string
  message: string
}): Promise<void> {
  const base = await assertSafeOutboundBotUrl(input.apiUrl)
  const url = new URL('send_group_msg', base.href.endsWith('/') ? base : `${base.href}/`)
  const response = await fetchBotEndpoint(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.apiToken ? { Authorization: `Bearer ${input.apiToken}` } : {})
    },
    body: JSON.stringify({ group_id: input.groupId, message: input.message, auto_escape: true })
  })
  if (!response.ok) throw new Error(`QQ_BOT_SEND_HTTP_${response.status}`)
  const payload = await response.json().catch(() => null) as { status?: string; retcode?: number } | null
  if (payload && payload.status !== 'ok' && payload.retcode !== 0) throw new Error('QQ_BOT_SEND_REJECTED')
}

export async function sendWechatRelayMessage(input: {
  sendUrl: string
  secret: string
  roomId: string
  replyToMessageId: string
  message: string
}): Promise<void> {
  const url = await assertSafeOutboundBotUrl(input.sendUrl)
  const body = JSON.stringify({
    roomId: input.roomId,
    replyToMessageId: input.replyToMessageId,
    text: input.message
  })
  const timestamp = String(Date.now())
  const signature = createBotWebhookSignature(input.secret, timestamp, body)
  const response = await fetchBotEndpoint(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Yeu-Timestamp': timestamp,
      'X-Yeu-Signature': `sha256=${signature}`
    },
    body
  })
  if (!response.ok) throw new Error(`WECHAT_BOT_SEND_HTTP_${response.status}`)
}
