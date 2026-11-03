/**
 * 图片通知 OCR：官网有些通知把正文做成图片，抓取只拿到一句「详见附件」，
 * 于是榜单里这类通知永远进不来。这里把页面里的正文图片丢给视觉模型转写，
 * 转写结果并回 extracted_text，后续打分/聚簇就当作正常正文处理。
 *
 * 只依赖 fetch + cheerio，不引入新依赖：调用方传 HTML 与页面地址即可。
 */
import { load } from 'cheerio'

export interface ImageOcrConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface ImageOcrOptions {
  maxImages?: number
  maxChars?: number
}

const DEFAULT_MAX_IMAGES = 3
const DEFAULT_MAX_CHARS = 1500
const MIN_IMAGE_SIDE = 200

/** 站点装饰图：logo、图标、二维码、按钮这类不该送 OCR。 */
const DECORATION_PATTERN = /logo|icon|ico_|avatar|qrcode|erweima|ewm|sprite|banner|btn|button|badge|weixin|wechat|share|arrow|loading|placeholder/iu

/** 站群模板的隐藏统计像素与模板资源，一定不是正文。 */
const TRACKING_PATTERN = /_visitcount|visitcount|\/_upload\/site\/|\/tpl\/|_ueditor/iu

/** 视觉模型没法直接读的格式。 */
const SKIP_EXTENSION = /\.(?:svg|gif|ico|webp)(?:\?|$)/iu

export function imageOcrConfigFromEnv(env: Record<string, string | undefined> = process.env): ImageOcrConfig | null {
  const baseUrl = (env.OCR_BASE_URL || env.NUXT_OCR_BASE_URL || '').trim()
  const apiKey = (env.OCR_API_KEY || env.NUXT_OCR_API_KEY || '').trim()
  const model = (env.OCR_MODEL || env.NUXT_OCR_MODEL || '').trim()
  if (!baseUrl || !apiKey || !model) return null
  const timeoutMs = Math.max(5_000, Number(env.OCR_TIMEOUT_MS) || 60_000)
  return { baseUrl: baseUrl.replace(/\/+$/u, ''), apiKey, model, timeoutMs }
}

/**
 * 从页面 HTML 里挑出可能是正文的图片地址。
 * 过滤规则保守一些：宁可漏一张，也不要把站标、二维码送去 OCR 白花钱。
 */
export function candidateImageUrls(html: string, pageUrl: string, limit = DEFAULT_MAX_IMAGES): string[] {
  const $ = load(html)
  const seen = new Set<string>()
  const picked: string[] = []
  $('img').each((_, element) => {
    if (picked.length >= limit) return false
    const node = $(element)
    // 站群大量用占位图 + data-src 懒加载：src 是 data URI 时不能直接放弃，要继续看 data-src。
    const raw = [node.attr('src'), node.attr('data-src'), node.attr('data-original')]
      .find(value => value && !value.startsWith('data:')) ?? ''
    if (!raw) return
    const width = node.attr('width')
    const height = node.attr('height')
    // 模板里隐藏像素写的是 width="0" height="0"，用真假判断会漏过去，这里显式判空。
    if (width !== undefined && Number(width) < MIN_IMAGE_SIDE) return
    if (height !== undefined && Number(height) < MIN_IMAGE_SIDE) return
    let absolute: URL
    try {
      absolute = new URL(raw, pageUrl)
    } catch {
      return
    }
    if (!/^https?:$/u.test(absolute.protocol)) return
    const candidate = absolute.toString()
    if (SKIP_EXTENSION.test(candidate) || DECORATION_PATTERN.test(candidate) || TRACKING_PATTERN.test(candidate)) return
    if (seen.has(candidate)) return
    seen.add(candidate)
    picked.push(candidate)
    return
  })
  return picked
}

/** 页面正文太短时用它判断「是不是正文其实是图片」。 */
export function hasContentImages(html: string, pageUrl: string): boolean {
  return candidateImageUrls(html, pageUrl, 1).length > 0
}

function messageText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices
  const content = choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''))
      .join('')
  }
  return ''
}

const OCR_PROMPT = [
  '把这张图片里的所有文字原样转写出来，保留换行。',
  '不要解释、不要总结、不要补全，看不清就跳过那一行。',
  '如果图片里没有文字，只回一个「无文字」。'
].join('')

/**
 * 逐张调用视觉模型转写，返回拼接后的文字。
 * 单张失败只记录在结果里，不影响其他图片。
 */
export async function ocrImageUrls(
  urls: string[],
  config: ImageOcrConfig,
  options: ImageOcrOptions = {}
): Promise<{ text: string, errors: string[] }> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const chunks: string[] = []
  const errors: string[] = []
  for (const url of urls.slice(0, options.maxImages ?? DEFAULT_MAX_IMAGES)) {
    if (chunks.join('\n').length >= maxChars) break
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1200,
          temperature: 0,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: OCR_PROMPT },
              { type: 'image_url', image_url: { url } }
            ]
          }]
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        errors.push(`${url} HTTP ${response.status}`)
        continue
      }
      const text = messageText(await response.json()).trim()
      if (!text || /^无文字[。.]?$/u.test(text)) continue
      chunks.push(text)
    } catch (error) {
      errors.push(`${url} ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timer)
    }
  }
  const merged = chunks.join('\n').replace(/[ \t]+\n/gu, '\n').trim()
  return { text: merged.slice(0, maxChars), errors }
}
