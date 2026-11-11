/** 报名物料簇：二维码图片加载、海报画布合成、遮罩涂抹、下载。 */
export function useCompetitionPoster() {
  // -- 报名物料（二维码 / 海报拼接） ----------------------------------------------

  const posterInput = ref<HTMLInputElement | null>(null)
  const posterSrc = ref<string | null>(null)
  const posterImg = ref<HTMLImageElement | null>(null)
  const qrPreEnabled = ref(true)
  const qrRegisterEnabled = ref(false)
  const qrSizeRatio = ref(18)
  const qrPosition = ref<'bottom-left' | 'bottom-right' | 'bottom-center'>('bottom-right')
  const preCaption = ref('扫码预报名')
  const regCaption = ref('现场扫码登记')
  const patchColor = ref('#ffffff')
  const patchMode = ref(false)
  const patches = ref<Array<{ x: number, y: number, w: number, h: number, color: string }>>([])
  const drawingStart = ref<{ x: number, y: number } | null>(null)
  const draftPatch = ref<{ x: number, y: number, w: number, h: number, color: string } | null>(null)
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const qrPreImg = ref<HTMLImageElement | null>(null)
  const qrRegImg = ref<HTMLImageElement | null>(null)
  const qrPreUrl = '/api/admin/competition/qr?path=%2Fsinger%2Fpre-register&size=512'
  const qrRegisterUrl = '/api/admin/competition/qr?path=%2Fsinger%2Fregister&size=512'

  function loadQrImage(src: string, target: { value: HTMLImageElement | null }): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        target.value = img
        resolve()
      }
      img.onerror = () => resolve()
      img.src = src
    })
  }

  function composePoster(): void {
    const canvas = canvasRef.value
    const img = posterImg.value
    if (!canvas || !img) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    for (const patch of [...patches.value, ...(draftPatch.value ? [draftPatch.value] : [])]) {
      ctx.fillStyle = patch.color
      ctx.fillRect(patch.x, patch.y, patch.w, patch.h)
    }

    const items = [
      { img: qrPreImg.value, caption: preCaption.value, enabled: qrPreEnabled.value },
      { img: qrRegImg.value, caption: regCaption.value, enabled: qrRegisterEnabled.value }
    ].filter(item => item.enabled && item.img)
    if (items.length === 0) return

    const width = canvas.width
    const height = canvas.height
    const size = Math.round(width * (qrSizeRatio.value / 100))
    const margin = Math.round(width * 0.04)
    const captionHeight = Math.round(size * 0.22)
    const blockHeight = size + captionHeight
    const totalWidth = items.length * size + (items.length - 1) * margin
    const startX = qrPosition.value === 'bottom-center'
      ? Math.round((width - totalWidth) / 2)
      : qrPosition.value === 'bottom-right'
        ? width - totalWidth - margin
        : margin
    const startY = height - blockHeight - margin

    items.forEach((item, index) => {
      const x = startX + index * (size + margin)
      const pad = Math.round(size * 0.06)
      const radius = Math.round(size * 0.05)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(x - pad, startY - pad, size + pad * 2, blockHeight + pad * 2, radius)
      ctx.fill()
      ctx.drawImage(item.img!, x, startY, size, size)
      ctx.fillStyle = '#33413a'
      ctx.font = `bold ${Math.round(size * 0.11)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(item.caption, x + size / 2, startY + size + captionHeight * 0.55, size)
    })
  }

  watch([posterSrc, qrPreEnabled, qrRegisterEnabled, qrSizeRatio, qrPosition, preCaption, regCaption,
    qrPreImg, qrRegImg, patches, draftPatch], () => composePoster(), { deep: true })

  function onPosterFileChange(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      posterSrc.value = String(reader.result)
      const img = new Image()
      img.onload = () => {
        posterImg.value = img
        composePoster()
      }
      img.src = posterSrc.value
    }
    reader.readAsDataURL(file)
  }

  function canvasPoint(event: MouseEvent): { x: number, y: number } {
    const canvas = canvasRef.value!
    const rect = canvas.getBoundingClientRect()
    const scale = canvas.width / rect.width
    return {
      x: Math.round((event.clientX - rect.left) * scale),
      y: Math.round((event.clientY - rect.top) * scale)
    }
  }

  function onCanvasDown(event: MouseEvent): void {
    if (!patchMode.value) return
    drawingStart.value = canvasPoint(event)
  }

  function onCanvasMove(event: MouseEvent): void {
    const start = drawingStart.value
    if (!start || !patchMode.value) return
    const point = canvasPoint(event)
    draftPatch.value = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      w: Math.abs(point.x - start.x),
      h: Math.abs(point.y - start.y),
      color: patchColor.value
    }
  }

  function onCanvasUp(): void {
    const draft = draftPatch.value
    if (draft && draft.w > 4 && draft.h > 4) {
      patches.value = [...patches.value, draft]
    }
    draftPatch.value = null
    drawingStart.value = null
    composePoster()
  }

  function undoLastPatch(): void {
    patches.value = patches.value.slice(0, -1)
  }

  function clearPatches(): void {
    patches.value = []
  }

  function downloadQr(path: string, name: string): void {
    const link = document.createElement('a')
    link.href = `/api/admin/competition/qr?path=${encodeURIComponent(path)}&size=1024&download=1&name=${encodeURIComponent(name)}`
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function downloadPoster(): void {
    const canvas = canvasRef.value
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = '新声歌手大赛-海报拼接.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    }, 'image/png')
  }

  onMounted(async () => {
    await Promise.all([
      loadQrImage(qrPreUrl, qrPreImg),
      loadQrImage(qrRegisterUrl, qrRegImg)
    ])
    composePoster()
  })

  return {
    posterInput,
    posterSrc,
    posterImg,
    qrPreEnabled,
    qrRegisterEnabled,
    qrSizeRatio,
    qrPosition,
    preCaption,
    regCaption,
    patchColor,
    patchMode,
    patches,
    drawingStart,
    draftPatch,
    canvasRef,
    qrPreImg,
    qrRegImg,
    qrPreUrl,
    qrRegisterUrl,
    loadQrImage,
    composePoster,
    onPosterFileChange,
    canvasPoint,
    onCanvasDown,
    onCanvasMove,
    onCanvasUp,
    undoLastPatch,
    clearPatches,
    downloadQr,
    downloadPoster
  }
}
