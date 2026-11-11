/** 后台纳新页共用的文件下载：模板 / 示例文档 / 单份申请表 / 选中打包 zip / 总表 xlsx。 */
export function useRecruitFiles() {
  const isWeChatBrowser = /MicroMessenger/i.test(navigator.userAgent)

  /**
   * Nuxt UI buttons render `href` through NuxtLink, which treats an /api path as
   * an internal route and SPA-navigates to the 404 page instead of downloading.
   * Fetch the bytes with session cookies and hand the blob to a temp anchor;
   * WeChat's in-app browser cannot save blobs, so it opens a new window instead.
   */
  async function downloadFile(url: string, filename: string): Promise<void> {
    if (isWeChatBrowser) {
      window.open(url, '_blank', 'noopener')
      return
    }
    try {
      const blob = await $fetch<Blob>(url, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      window.open(url, '_blank', 'noopener')
    }
  }

  return { downloadFile }
}
