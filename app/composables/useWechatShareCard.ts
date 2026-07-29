import { isWechatUserAgent } from '~/utils/browser-environment'

interface WechatShareCardInput {
  title: string
  description: string
  imageUrl: string
  link?: string
}

interface WechatShareSignature {
  appId: string
  nonceStr: string
  timestamp: number
  signature: string
  jsApiList: string[]
}

interface WechatSharePayload {
  title: string
  desc?: string
  link: string
  imgUrl: string
}

interface WechatJsSdk {
  config(input: {
    debug: boolean
    appId: string
    timestamp: number
    nonceStr: string
    signature: string
    jsApiList: string[]
  }): void
  ready(callback: () => void): void
  error(callback: (error: unknown) => void): void
  updateAppMessageShareData?: (input: WechatSharePayload) => void
  updateTimelineShareData?: (input: WechatSharePayload) => void
  onMenuShareAppMessage?: (input: WechatSharePayload) => void
  onMenuShareTimeline?: (input: WechatSharePayload) => void
}

declare global {
  interface Window {
    wx?: WechatJsSdk
  }
}

let sdkPromise: Promise<WechatJsSdk> | null = null

function loadWechatJsSdk(): Promise<WechatJsSdk> {
  if (window.wx) return Promise.resolve(window.wx)
  if (sdkPromise) return sdkPromise

  const loading = new Promise<WechatJsSdk>((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => reject(new Error('WeChat JS-SDK load timeout')), 10_000)
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
    script.async = true
    script.dataset.yeuWechatSdk = 'true'
    script.addEventListener('load', () => {
      window.clearTimeout(timeout)
      if (window.wx) resolve(window.wx)
      else reject(new Error('WeChat JS-SDK unavailable'))
    }, { once: true })
    script.addEventListener('error', () => {
      window.clearTimeout(timeout)
      reject(new Error('WeChat JS-SDK load failed'))
    }, { once: true })
    document.head.append(script)
  }).catch((error) => {
    sdkPromise = null
    throw error
  })
  sdkPromise = loading
  return loading
}

function sdkReady(sdk: WechatJsSdk, signature: WechatShareSignature): Promise<void> {
  return new Promise((resolve, reject) => {
    sdk.ready(resolve)
    sdk.error(reject)
    sdk.config({
      debug: false,
      appId: signature.appId,
      timestamp: signature.timestamp,
      nonceStr: signature.nonceStr,
      signature: signature.signature,
      jsApiList: signature.jsApiList
    })
  })
}

export function useWechatShareCard() {
  async function configureWechatShare(input: WechatShareCardInput): Promise<boolean> {
    if (!import.meta.client || !isWechatUserAgent(navigator.userAgent)) return false

    const signedUrl = window.location.href.split('#')[0]!
    const shareLink = new URL(input.link || window.location.href, window.location.origin).toString()
    const imageUrl = new URL(input.imageUrl, window.location.origin).toString()

    try {
      const [signature, sdk] = await Promise.all([
        $fetch<WechatShareSignature>('/api/public/wechat-share', {
          query: { url: signedUrl }
        }),
        loadWechatJsSdk()
      ])
      await sdkReady(sdk, signature)
      const payload: WechatSharePayload = {
        title: input.title.slice(0, 100),
        desc: input.description.slice(0, 160),
        link: shareLink,
        imgUrl: imageUrl
      }
      sdk.updateAppMessageShareData?.(payload)
      sdk.updateTimelineShareData?.(payload)
      // Older WeChat WebViews still expose only the legacy share hooks.
      sdk.onMenuShareAppMessage?.(payload)
      sdk.onMenuShareTimeline?.(payload)
      return true
    } catch {
      return false
    }
  }

  return { configureWechatShare }
}
