import { createError, setResponseHeaders } from 'h3'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'

const BAIDU_CAMPUS_PAGE_URL = 'https://map.baidu.com/poi/%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6/@13204528,2871631,21z,87t,-16.6h'
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const HTML_CACHE_TTL_MS = 30 * 60 * 1000
const ALLOWED_FRAME_ANCESTORS = [
  'https://yeu.huiliyill.cn',
  'https://global.yeu.huiliyill.cn',
  'https://cn.yeu.huiliyill.cn',
  'http://localhost:*',
  'http://127.0.0.1:*'
].join(' ')

let cachedHtml = ''
let cachedAt = 0
let pendingHtml: Promise<string> | null = null

function prepareDesktopPanoramaHtml(html: string): string {
  if (html.length < 10_000 || !/<head[\s>]/i.test(html) || !html.includes('百度地图')) {
    throw new Error('Unexpected panorama page')
  }

  return html.replace(
    /<head([^>]*)>/i,
    '<head$1><base href="https://map.baidu.com/"><meta name="viewport" content="width=1280">'
  )
}

async function fetchDesktopPanoramaHtml(): Promise<string> {
  const response = await fetch(BAIDU_CAMPUS_PAGE_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': DESKTOP_USER_AGENT
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8_000)
  })

  if (!response.ok) {
    throw new Error(`Panorama upstream returned ${response.status}`)
  }

  return prepareDesktopPanoramaHtml(await response.text())
}

async function resolvePanoramaHtml(): Promise<{ html: string, cache: 'HIT' | 'MISS' | 'STALE' }> {
  const now = Date.now()
  if (cachedHtml && now - cachedAt < HTML_CACHE_TTL_MS) {
    return { html: cachedHtml, cache: 'HIT' }
  }

  pendingHtml ??= fetchDesktopPanoramaHtml()
  try {
    cachedHtml = await pendingHtml
    cachedAt = Date.now()
    return { html: cachedHtml, cache: 'MISS' }
  } catch (error) {
    if (cachedHtml) return { html: cachedHtml, cache: 'STALE' }
    throw error
  } finally {
    pendingHtml = null
  }
}

export default defineEventHandler(async (event) => {
  assertRateLimit(
    event,
    `public:campus-panorama:${getClientIpAddress(event)}`,
    120,
    60_000
  )

  let result: Awaited<ReturnType<typeof resolvePanoramaHtml>>
  try {
    result = await resolvePanoramaHtml()
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: '校园实景暂时加载失败，请稍后重试'
    })
  }

  setResponseHeaders(event, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
    'CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
    'Content-Security-Policy': `frame-ancestors ${ALLOWED_FRAME_ANCESTORS}; base-uri https://map.baidu.com; object-src 'none'; upgrade-insecure-requests`,
    'Cross-Origin-Opener-Policy': 'unsafe-none',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), accelerometer=(), gyroscope=()',
    'X-Frame-Options': '',
    'X-Panorama-Cache': result.cache,
    'X-Robots-Tag': 'noindex, nofollow'
  })

  event.node.res.removeHeader('X-Frame-Options')
  return result.html
})
