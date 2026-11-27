import { DEFAULT_SHARE_ICON_URL, normalizeShareIconUrl } from '../../shared/config/brand'
import type { CompetitionPopularityCandidate } from '../../shared/types'

export interface PopularityShareCardInput {
  candidate: CompetitionPopularityCandidate
  votes: number | null
  rankText: string
  gapText?: string
  qrDataUrl: string
  siteLabel?: string
}

export interface PopularityPageSharePayload {
  title: string
  description: string
  imageUrl: string
  link: string
}

const FONT_STACK = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'

function defaultShareOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return new URL(DEFAULT_SHARE_ICON_URL).origin
}

/** 选手详情 = 投票页上的详情弹窗，分享链接直接带选手 id 打开它。 */
export function popularitySingerPath(singerId: string): string {
  return `/singer/popularity?id=${encodeURIComponent(singerId)}`
}

export function popularitySingerShareLink(singerId: string, origin?: string): string {
  const base = (origin ?? defaultShareOrigin()).replace(/\/+$/, '')
  return `${base}${popularitySingerPath(singerId)}`
}

/** 同源公开媒体路径：微信卡片与 canvas 都走 /media/competition/singer-photo/<id>.jpg。 */
export function popularitySingerPhotoPath(singerId: string, photoUpdatedAt?: number | string | null): string {
  const basePath = `/media/competition/singer-photo/${encodeURIComponent(singerId)}.jpg`
  if (typeof photoUpdatedAt === 'number' && Number.isFinite(photoUpdatedAt) && photoUpdatedAt > 0) {
    return `${basePath}?v=${Math.trunc(photoUpdatedAt)}`
  }
  if (typeof photoUpdatedAt === 'string') {
    const stamp = photoUpdatedAt.replace(/[^0-9a-zA-Z]/g, '').slice(-16)
    if (stamp) return `${basePath}?v=${stamp}`
  }
  return basePath
}

export function popularityShareImageUrl(candidate: CompetitionPopularityCandidate, origin?: string): string {
  const base = (origin || defaultShareOrigin()).replace(/\/+$/, '')
  if (candidate.photoUrl) {
    return `${base}${popularitySingerPhotoPath(candidate.singerId, candidate.photoUpdatedAt)}`
  }
  return normalizeShareIconUrl(undefined, base)
}

export function popularityShareTitle(candidate: CompetitionPopularityCandidate): string {
  return `${candidate.number}号 ${candidate.name}｜人气奖投票`
}

export function popularityShareDescription(candidate: CompetitionPopularityCandidate): string {
  const song = candidate.song ? `《${candidate.song}》` : ''
  return `仰恩大学音乐协会·新声歌手大赛决赛，为 ${candidate.name}（${candidate.number}号）${song}投一票`
}

export function resolvePopularityPageSharePayload(input: {
  title?: string | null
  subtitle?: string | null
  candidate: CompetitionPopularityCandidate | null
  origin: string
}): PopularityPageSharePayload {
  const baseOrigin = (input.origin || defaultShareOrigin()).replace(/\/+$/, '')
  if (input.candidate) {
    return {
      title: popularityShareTitle(input.candidate),
      description: popularityShareDescription(input.candidate),
      imageUrl: popularityShareImageUrl(input.candidate, baseOrigin),
      link: popularitySingerShareLink(input.candidate.singerId, baseOrigin)
    }
  }
  const pageTitle = (input.title || '').trim() || '人气奖投票'
  const pageDescription = (input.subtitle || '').trim() || '仰恩大学音乐协会·新声歌手大赛决赛，为你喜欢的歌手投一票'
  return {
    title: `${pageTitle}｜新声歌手大赛`,
    description: pageDescription,
    imageUrl: normalizeShareIconUrl(undefined, baseOrigin),
    link: `${baseOrigin}/singer/popularity`
  }
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

/** 生成分享卡片（750×1340）：照片按 4:5 原比例完整呈现，票数与名次分行，不压字。 */
export async function renderPopularityShareCard(input: PopularityShareCardInput): Promise<Blob> {
  const width = 750
  const height = 1340
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

  const photoW = 520
  const photoH = 650
  const photoX = (width - photoW) / 2
  const photoY = 214

  context.save()
  roundedRect(context, photoX, photoY, photoW, photoH, 32)
  context.fillStyle = '#fecdd3'
  context.fill()
  context.clip()
  let photo: HTMLImageElement | null = input.candidate.photoUrl
    ? await loadImageForCanvas(
        popularitySingerPhotoPath(input.candidate.singerId, input.candidate.photoUpdatedAt)
      )
    : null
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

  // 票数徽标 + 名次，两段文字分列，避免叠字；后台隐藏票数时不画票数与排名。
  const badgeY = metaY + 34
  const badgeH = 68
  if (input.votes === null) {
    const hasGapHint = Boolean(input.gapText && input.gapText.trim())
    const badgeLabel = hasGapHint ? (input.rankText || '人气投票中') : '人气投票中'
    context.font = `900 32px ${FONT_STACK}`
    const badgeW = Math.max(190, Math.min(280, context.measureText(badgeLabel).width + 52))
    roundedRect(context, padding, badgeY, badgeW, badgeH, badgeH / 2)
    context.fillStyle = '#be123c'
    context.fill()
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(badgeLabel, padding + badgeW / 2, badgeY + badgeH / 2 + 1)

    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#9f1239'
    context.font = `800 28px ${FONT_STACK}`
    context.fillText(
      fitText(context, hasGapHint ? input.gapText! : '扫码为 TA 助力投票', contentWidth - badgeW - 24),
      padding + badgeW + 20,
      badgeY + badgeH / 2 + 10
    )
  } else {
    const voteText = `${input.votes} 票`
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
      badgeY + badgeH / 2 + 11
    )
  }

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
