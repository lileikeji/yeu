import { isShareCancellation, isWechatUserAgent } from '~/utils/browser-environment'

interface PageShareInput {
  title?: string
  text?: string
  url?: string
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
