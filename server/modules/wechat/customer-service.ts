import { getWechatAccessToken } from './share'

interface WechatCustomerServiceResponse {
  errcode?: number
  errmsg?: string
}

export function createWechatCustomerServiceTextPayload(openId: string, message: string) {
  const recipient = openId.trim()
  const content = message.trim()
  if (!recipient || recipient.length > 160) throw new Error('WECHAT_MP_INVALID_RECIPIENT')
  if (!content) throw new Error('WECHAT_MP_EMPTY_MESSAGE')
  return {
    touser: recipient,
    msgtype: 'text' as const,
    text: { content }
  }
}

export async function sendWechatCustomerServiceText(input: {
  appId: string
  appSecret: string
  openId: string
  message: string
}): Promise<void> {
  const accessToken = await getWechatAccessToken(input.appId, input.appSecret)
  const url = new URL('https://api.weixin.qq.com/cgi-bin/message/custom/send')
  url.searchParams.set('access_token', accessToken)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createWechatCustomerServiceTextPayload(input.openId, input.message)),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    throw new Error('WECHAT_MP_SEND_NETWORK_ERROR')
  }
  if (!response.ok) throw new Error(`WECHAT_MP_SEND_HTTP_${response.status}`)
  const payload = await response.json().catch(() => null) as WechatCustomerServiceResponse | null
  if (!payload || Number(payload.errcode) !== 0) {
    throw new Error(`WECHAT_MP_SEND_REJECTED_${Number(payload?.errcode) || 'UNKNOWN'}`)
  }
}
