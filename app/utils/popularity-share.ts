import type { CompetitionPopularityCandidate } from '~~/shared/types'

export interface PopularityShareCardInput {
  candidate: CompetitionPopularityCandidate
  votes: number | null
  rankText: string
  qrDataUrl: string
  siteLabel?: string
}

export function popularitySingerPath(singerId: string): string {
  return `/singer/popularity-singer?id=${encodeURIComponent(singerId)}`
}

export function popularitySingerShareLink(singerId: string, origin?: string): string {
  const base = origin ?? (import.meta.client ? window.location.origin : '')
  return `${base}${popularitySingerPath(singerId)}`
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

/** 生成分享卡片长图（750×1000）。图片跨域失败时退化为纯文字卡。 */
export async function renderPopularityShareCard(input: PopularityShareCardInput): Promise<Blob> {
  const width = 750
  const height = 1000
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')

  const background = context.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#fff1f2')
  background.addColorStop(0.55, '#fff7f7')
  background.addColorStop(1, '#ffe4e6')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  context.fillStyle = '#be123c'
  context.font = '700 26px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.textAlign = 'left'
  context.fillText('仰恩大学音乐协会 · 新声歌手大赛', 56, 76)

  context.fillStyle = '#1f2937'
  context.font = '900 40px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillText(`人气奖 · ${input.candidate.number}号 ${input.candidate.name}`, 56, 132)

  const photoX = 56
  const photoY = 166
  const photoW = width - 112
  const photoH = 470

  context.save()
  roundedRect(context, photoX, photoY, photoW, photoH, 32)
  context.fillStyle = '#fecdd3'
  context.fill()
  context.clip()
  let photo: HTMLImageElement | null = null
  if (input.candidate.photoUrl) {
    photo = await loadImage(input.candidate.photoUrl, true)
    if (!photo) photo = await loadImage(input.candidate.photoUrl, false)
  }
  if (photo) {
    try {
      drawCover(context, photo, photoX, photoY, photoW, photoH)
    } catch {
      photo = null
    }
  }
  if (!photo) {
    context.fillStyle = '#be123c'
    context.font = '900 150px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    context.textAlign = 'center'
    context.fillText(input.candidate.name.slice(0, 1), photoX + photoW / 2, photoY + photoH / 2 + 52)
    context.textAlign = 'left'
  }
  context.restore()

  context.fillStyle = '#0f172a'
  context.font = '900 46px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillText(input.candidate.name, 56, photoY + photoH + 74)

  context.fillStyle = '#6b7280'
  context.font = '500 26px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  const meta = [input.candidate.className || '', input.candidate.song ? `《${input.candidate.song}》` : '']
    .filter(Boolean)
    .join(' · ')
  context.fillText(meta || '决赛候选选手', 56, photoY + photoH + 118)

  context.fillStyle = '#be123c'
  context.font = '900 52px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  const voteText = input.votes === null ? '暂未开榜' : `${input.votes} 票`
  context.fillText(voteText, 56, photoY + photoH + 190)
  context.fillStyle = '#9f1239'
  context.font = '700 26px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillText(input.rankText, 56 + context.measureText(voteText).width + 24, photoY + photoH + 190)

  const qrSize = 150
  const qrX = width - 56 - qrSize
  const qrY = height - 56 - qrSize
  const qrImage = await loadImage(input.qrDataUrl, false)
  if (qrImage) {
    context.fillStyle = '#ffffff'
    roundedRect(context, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 18)
    context.fill()
    context.drawImage(qrImage, qrX, qrY, qrSize, qrSize)
  }

  context.fillStyle = '#6b7280'
  context.font = '700 28px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillText('长按识别二维码', 56, qrY + 52)
  context.fillText('为 TA 投一票', 56, qrY + 96)
  context.fillStyle = '#9ca3af'
  context.font = '500 22px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillText(input.siteLabel || 'yx.huiliyill.cn', 56, qrY + 138)

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
