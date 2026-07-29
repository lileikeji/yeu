import { isShareCancellation, isWechatUserAgent } from '~/utils/browser-environment'
import { useWechatShareCard } from '~/composables/useWechatShareCard'

interface PageShareInput {
  title?: string
  text?: string
  url?: string
  imageUrl?: string
}

async function writeClipboard(value: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value)
    return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  return copied
}

export function useShareActions() {
  const toast = useToast()
  const isWechat = ref(false)
  const { configureWechatShare } = useWechatShareCard()

  onMounted(() => {
    isWechat.value = isWechatUserAgent(navigator.userAgent)
  })

  async function copyText(value: string, label = '内容'): Promise<boolean> {
    try {
      const copied = await writeClipboard(value)
      if (!copied) throw new Error('Clipboard copy was rejected')
      toast.add({ title: `${label}已复制`, color: 'success' })
      return true
    } catch {
      toast.add({
        title: `${label}复制失败`,
        description: '请长按内容后手动复制。',
        color: 'warning'
      })
      return false
    }
  }

  async function sharePage(input: PageShareInput = {}): Promise<void> {
    if (!import.meta.client) return
    const url = input.url ?? window.location.href
    const title = input.title ?? document.title

    if (isWechatUserAgent(navigator.userAgent)) {
      const description = input.text
        || document.querySelector('meta[name="description"]')?.getAttribute('content')
        || title
      const configured = await configureWechatShare({
        title,
        description,
        imageUrl: input.imageUrl
          || new URL('/icons/app-icon-512.png', window.location.origin).toString(),
        link: url
      })
      if (configured) {
        toast.add({
          title: '微信分享已准备好',
          description: '请点击右上角“…”选择发送给朋友或分享到朋友圈。',
          color: 'success'
        })
      } else {
        toast.add({
          title: '微信分享未就绪',
          description: '请刷新页面后使用右上角“…”菜单分享。',
          color: 'warning'
        })
      }

      // The WeChat JS-SDK cannot open the native share sheet programmatically.
      // Do not fall through to clipboard sharing: that produces a plain URL
      // and makes a failed card configuration look successful.
      return
    }

    if (navigator.share) {
      try {
        await navigator.share({ title, text: input.text, url })
        return
      } catch (error) {
        if (isShareCancellation(error)) return
      }
    }

    const copied = await copyText(url, '页面链接')
    if (copied && isWechat.value) {
      toast.add({
        title: '可粘贴到微信会话发送',
        color: 'neutral'
      })
    }
  }

  return {
    isWechat: readonly(isWechat),
    copyText,
    sharePage
  }
}
