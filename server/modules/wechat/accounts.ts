import { verifyWechatCallbackSignature } from './callback'

/**
 * 一个公众号 = 一组 AppID / Token / EncodingAESKey。
 * 换号期间允许主号与副号并存：回调按签名自动识别来源，
 * 旧号不断线，新号提交校验也能通过。
 */
export interface WechatMpAccount {
  appId: string
  token: string
  encodingAesKey: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readWechatMpAccounts(runtime: Record<string, unknown>): WechatMpAccount[] {
  const pairs: Array<[unknown, unknown, unknown]> = [
    [runtime.wechatMpAppId, runtime.wechatMpToken, runtime.wechatMpEncodingAesKey],
    [runtime.wechatMpAltAppId, runtime.wechatMpAltToken, runtime.wechatMpAltEncodingAesKey]
  ]
  const accounts: WechatMpAccount[] = []
  for (const [appId, token, encodingAesKey] of pairs) {
    const account: WechatMpAccount = {
      appId: text(appId),
      token: text(token),
      encodingAesKey: text(encodingAesKey)
    }
    // Token 是识别公众号的唯一必要项：换号过渡期可以先只配 Token，让后台校验通过。
    if (!account.token || accounts.some(item => item.token === account.token)) continue
    accounts.push(account)
  }
  return accounts
}

/** 用签名反查是哪个公众号发来的；配不齐 AppID/AESKey 的账号只参与明文校验。 */
export function resolveWechatMpAccount(
  accounts: WechatMpAccount[],
  input: {
    timestamp: string
    nonce: string
    signature: string
    encrypted?: string
  }
): WechatMpAccount | null {
  const requiresSecrets = Boolean(input.encrypted)
  for (const account of accounts) {
    if (requiresSecrets && (!account.appId || !account.encodingAesKey)) continue
    if (verifyWechatCallbackSignature({ token: account.token, ...input })) return account
  }
  return null
}
