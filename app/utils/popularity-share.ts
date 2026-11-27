import type { CompetitionPopularityCandidate } from '~~/shared/types'

export interface PopularityShareCardInput {
  candidate: CompetitionPopularityCandidate
  votes: number | null
  rankText: string
  qrDataUrl: string
  siteLabel?: string
}

const FONT_STACK = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'

/** 选手详情 = 投票页上的详情弹窗，分享链接直接带选手 id 打开它。 */
export function popularitySingerPath(singerId: string): string {
  return `/singer/popularity?id=${encodeURIComponent(singerId)}`
}

export function popularitySingerShareLink(singerId: string, origin?: string): string {
  const base = origin ?? (import.meta.client ? window.location.origin : '')
  return `${base}${popularitySingerPath(singerId)}`
}

/** 同源照片代理：微信卡片与 canvas 都只认当前域名下的图片。 */
export function popularitySingerPhotoPath(singerId: string, version?: string | null): string {
  const base = `/api/public/competition/popularity/singer-photo?id=${encodeURIComponent(singerId)}`
  // 换照片后必须换 URL，否则 CDN 会继续发旧图
  const stamp = (version ?? '').replace(/[^0-9a-zA-Z]/g, '').slice(-16)
  return stamp ? `${base}&v=${stamp}` : base
}

export function popularityShareImageUrl(candidate: CompetitionPopularityCandidate, origin?: string): string {
  const base = origin ?? (import.meta.client ? window.location.origin : '')
  return `${base}${popularitySingerPhotoPath(candidate.singerId, candidate.photoUrl)}`
}

export function popularityShareTitle(candidate: CompetitionPopularityCandidate): string {
  return `${candidate.number}号 ${candidate.name}｜人气奖投票`
}

export function popularityShareDescription(candidate: CompetitionPopularityCandidate): string {
  const song = candidate.song ? `《${candidate.song}》` : ''
  return `仰恩大学音乐协会·新声歌手大赛决赛，为 ${candidate.name}（${candidate.number}号）${song}投一票`
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    if (crossOrigin) image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/**
 * 页面里的 <img> 可能已用无 CORS 的方式请求过同一张图，浏览器缓存的响应不带
 * Access-Control-Allow-Origin，直接交给 canvas 会被判污染。同源代理也走一次 reload，
 * 保证拿到的是完整字节。
 */
async function loadImageForCanvas(src: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(src, { cache: 'reload', credentials: 'same-origin' })
    if (!response.ok) return null
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      return await loadImage(objectUrl, false)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let clipped = text
  while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}…`
}

/** 生成分享卡片（750×1160）：票数、名次、二维码各自独立成行，不再互相压字。 */
export async function renderPopularityShareCard(input: PopularityShareCardInput): Promise<Blob> {
  const width = 750
  const height = 1160
  const padding = 56
  const contentWidth = width - padding * 2
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')

  const background = context.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#fff1f2')
  background.addColorStop(0.55, '#fff8f8')
  background.addColorStop(1, '#ffe4e6')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#be123c'
  context.font = `700 26px ${FONT_STACK}`
  context.fillText('仰恩大学音乐协会 · 新声歌手大赛', padding, 74)

  context.fillStyle = '#0f172a'
  context.font = `900 44px ${FONT_STACK}`
  context.fillText(`人气奖 · ${input.candidate.number}号`, padding, 134)

  context.fillStyle = '#475569'
  context.font = `700 32px ${FONT_STACK}`
  context.fillText(fitText(context, input.candidate.name, contentWidth), padding, 184)

  const photoX = padding
  const photoY = 214
  const photoW = contentWidth
  const photoH = 500

  context.save()
  roundedRect(context, photoX, photoY, photoW, photoH, 32)
  context.fillStyle = '#fecdd3'
  context.fill()
  context.clip()
  let photo: HTMLImageElement | null = await loadImageForCanvas(
    popularitySingerPhotoPath(input.candidate.singerId, input.candidate.photoUrl),
  )
  if (photo) {
    try {
      drawCover(context, photo, photoX, photoY, photoW, photoH)
    } catch {
      photo = null
    }
  }
  if (!photo) {
    context.fillStyle = '#be123c'
    context.font = `900 160px ${FONT_STACK}`
    context.textAlign = 'center'
    context.fillText(input.candidate.name.slice(0, 1), photoX + photoW / 2, photoY + photoH / 2 + 56)
    context.textAlign = 'left'
  }
  context.restore()

  const metaY = photoY + photoH + 62
  context.fillStyle = '#6b7280'
  context.font = `500 25px ${FONT_STACK}`
  const meta = [input.candidate.className || '', input.candidate.song ? `《${input.candidate.song}》` : '']
    .filter(Boolean)
    .join(' · ')
  context.fillText(fitText(context, meta || '决赛候选选手', contentWidth), padding, metaY)

  // 票数徽标 + 名次，两段文字分列，避免叠字。
  const badgeY = metaY + 34
  const badgeH = 68
  const voteText = input.votes === null ? '待开榜' : `${input.votes} 票`
  context.font = `900 38px ${FONT_STACK}`
  const voteWidth = context.measureText(voteText).width
  const badgeW = Math.max(150, voteWidth + 48)
  roundedRect(context, padding, badgeY, badgeW, badgeH, badgeH / 2)
  context.fillStyle = '#be123c'
  context.fill()
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(voteText, padding + badgeW / 2, badgeY + badgeH / 2 + 1)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#9f1239'
  context.font = `800 30px ${FONT_STACK}`
  context.fillText(
    fitText(context, input.rankText || '暂未开榜', contentWidth - badgeW - 24),
    padding + badgeW + 20,
    badgeY + badgeH / 2 + 11,
  )

  const ruleY = badgeY + badgeH + 42
  context.strokeStyle = 'rgba(190, 18, 60, 0.16)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(padding, ruleY)
  context.lineTo(width - padding, ruleY)
  context.stroke()

  const qrSize = 168
  const qrX = width - padding - qrSize
  const qrY = ruleY + 34
  const qrImage = await loadImage(input.qrDataUrl, false)
  if (qrImage) {
    context.fillStyle = '#ffffff'
    roundedRect(context, qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 20)
    context.fill()
    context.drawImage(qrImage, qrX, qrY, qrSize, qrSize)
  }

  const hintX = padding
  const hintWidth = qrX - padding - 28
  context.fillStyle = '#be123c'
  context.font = `800 30px ${FONT_STACK}`
  context.fillText(fitText(context, '长按识别二维码', hintWidth), hintX, qrY + 58)
  context.fillStyle = '#334155'
  context.font = `800 30px ${FONT_STACK}`
  context.fillText(fitText(context, '为 TA 投一票', hintWidth), hintX, qrY + 104)
  context.fillStyle = '#94a3b8'
  context.font = `500 22px ${FONT_STACK}`
  context.fillText(fitText(context, input.siteLabel || 'yx.huiliyill.cn', hintWidth), hintX, qrY + 146)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Share card rendering failed'))
    }, 'image/png')
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000)
}
