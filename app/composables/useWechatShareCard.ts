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
  url: string
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
let sdkConfigurationQueue: Promise<void> = Promise.resolve()
let configuredSignatureUrl: string | null = null

const SDK_READY_TIMEOUT_MS = 8_000

function describeWechatSdkError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string' && error.trim()) return new Error(error)
  if (error && typeof error === 'object') {
    const message = 'errMsg' in error && typeof error.errMsg === 'string'
      ? error.errMsg
      : 'message' in error && typeof error.message === 'string'
        ? error.message
        : ''
    if (message) return new Error(message)
  }
  return new Error('WeChat JS-SDK configuration failed')
}

function loadWechatJsSdk(): Promise<WechatJsSdk> {
  if (window.wx && typeof window.wx.config === 'function' && typeof window.wx.ready === 'function') {
    return Promise.resolve(window.wx)
  }
  if (sdkPromise) return sdkPromise

  const loading = new Promise<WechatJsSdk>((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => reject(new Error('WeChat JS-SDK load timeout')), 10_000)
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
    script.async = true
    script.dataset.yeuWechatSdk = 'true'
    script.addEventListener('load', () => {
      window.clearTimeout(timeout)
      if (window.wx && typeof window.wx.config === 'function' && typeof window.wx.ready === 'function') {
        resolve(window.wx)
      } else reject(new Error('WeChat JS-SDK unavailable'))
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
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('WeChat JS-SDK ready timeout'))
    }, SDK_READY_TIMEOUT_MS)
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (error) reject(describeWechatSdkError(error))
      else resolve()
    }

    // Register callbacks before config. This is safe for current SDKs and
    // prevents an older embedded WebView from dropping the first event.
    try {
      sdk.ready(() => finish())
      sdk.error(error => finish(error))
      sdk.config({
        debug: false,
        appId: signature.appId,
        timestamp: signature.timestamp,
        nonceStr: signature.nonceStr,
        signature: signature.signature,
        jsApiList: signature.jsApiList
      })
    } catch (error) {
      finish(error)
    }
  })
}

function queueSdkConfiguration(sdk: WechatJsSdk, signature: WechatShareSignature): Promise<void> {
  const task = sdkConfigurationQueue.then(async () => {
    if (configuredSignatureUrl === signature.url) return
    await sdkReady(sdk, signature)
    configuredSignatureUrl = signature.url
  })
  // Keep the queue alive after an individual page/configuration failure so a
  // later route can retry instead of inheriting a rejected promise forever.
  sdkConfigurationQueue = task.catch(() => undefined)
  return task
}

function canonicalPageUrl(): string {
  const url = new URL(window.location.href)
  url.hash = ''
  return url.toString()
}

function shareUrl(rawUrl: string): string {
  const url = new URL(rawUrl, window.location.origin)
  url.hash = ''
  return url.toString()
}

export function useWechatShareCard() {
  async function configureWechatShare(input: WechatShareCardInput): Promise<boolean> {
    if (!import.meta.client || !isWechatUserAgent(navigator.userAgent)) return false

    const signedUrl = canonicalPageUrl()
    const shareLink = shareUrl(input.link || signedUrl)
    const imageUrl = new URL(input.imageUrl, window.location.origin).toString()

    try {
      const [signature, sdk] = await Promise.all([
        $fetch<WechatShareSignature>('/api/public/wechat-share', {
          query: { url: signedUrl }
        }),
        loadWechatJsSdk()
      ])
      if (signature.url !== signedUrl) {
        throw new Error('WeChat JS-SDK signature URL mismatch')
      }
      await queueSdkConfiguration(sdk, signature)
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
