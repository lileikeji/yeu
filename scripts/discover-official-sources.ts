import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export const OFFICIAL_SEARCH_HOME_URL = 'https://www.yeu.edu.cn/'
export const DEFAULT_OFFICIAL_SOURCE_KEYWORDS = [
  '校园卡',
  '一卡通',
  '快递',
  '外卖',
  '新生 接站',
  '社团 招新',
  '公交',
  '交通',
  '录取通知书',
  '迎新'
] as const

const USER_AGENT = 'YEU-Freshman-Guide-source-audit/0.1 (passive public-source review)'

interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>
}

export interface OfficialSourceCandidate {
  title: string
  url: string
  publishedAt: string | null
  publisher: string | null
  directory: string | null
  creator: string | null
}

export interface OfficialSourceSearchResult {
  keyword: string
  total: number
  returned: number
  items: OfficialSourceCandidate[]
}

export interface OfficialSourceDiscoveryReport {
  formatVersion: 1
  generatedAt: string
  homepageUrl: string
  searchPageUrl: string
  ajaxUrl: string
  queries: OfficialSourceSearchResult[]
}

export interface OfficialSourceDiscoveryOptions {
  keywords?: string[]
  fetchImpl?: FetchLike
  now?: () => Date
}

function defaultFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init)
}

function sessionCookie(response: Response): string | null {
  const value = response.headers.get('set-cookie') ?? ''
  const match = value.match(/(?:^|,\s*)JSESSIONID=([^;,\s]+)/i)
  return match?.[1] ?? null
}

function ensureOk(response: Response, label: string): void {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
}

function htmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16))
      } catch {
        return _
      }
    })
    .replace(/&#(\d+);/g, (_, digits: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(digits, 10))
      } catch {
        return _
      }
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function officialSearchUrl(value: string, base: string, label: string): string {
  const url = new URL(value, base)
  if (url.protocol !== 'https:' || url.hostname !== 'www.yeu.edu.cn') {
    throw new Error(`${label} must stay on https://www.yeu.edu.cn`)
  }
  return url.toString()
}

function formUrl(homepageHtml: string): string {
  const match = homepageHtml.match(/<form[^>]+action=["']([^"']*\/_web\/_search\/api\/search\/new\.rst[^"']*)["']/i)
  if (!match?.[1]) throw new Error('Official search form was not found on the homepage')
  return officialSearchUrl(match[1], OFFICIAL_SEARCH_HOME_URL, 'Official search form')
}

function ajaxUrl(searchPageHtml: string, searchPageUrl: string): string {
  const match = searchPageHtml.match(/url:\s*["']([^"']*searchCon\/create\.rst[^"']*)["']/i)
  if (!match?.[1]) throw new Error('Official search AJAX endpoint was not found')
  return officialSearchUrl(match[1], searchPageUrl, 'Official search AJAX endpoint')
}

function searchInfo(keyword: string): string {
  return Buffer.from(JSON.stringify([
    { field: 'pageIndex', value: 1 },
    { field: 'group', value: 0 },
    { field: 'searchType', value: '' },
    { field: 'keyword', value: keyword },
    { field: 'recommend', value: '1' },
    { field: 4, value: '' },
    { field: 5, value: '' },
    { field: 6, value: '' },
    { field: 7, value: '' },
    { field: 9, value: '' }
  ])).toString('base64')
}

function parseCandidates(data: string): OfficialSourceCandidate[] {
  const anchors = /<h3[^>]*class=["']item_title["'][^>]*>\s*<a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const matches = [...data.matchAll(anchors)]

  return matches.map((match, index) => {
    const segment = data.slice(match.index ?? 0, matches[index + 1]?.index ?? data.length)
    const value = (pattern: RegExp): string | null => {
      const found = segment.match(pattern)
      return found?.[1] ? htmlText(found[1]) : null
    }
    return {
      title: htmlText(match[2]),
      url: new URL(match[1], OFFICIAL_SEARCH_HOME_URL).toString(),
      publishedAt: value(/发布时间:([^<]+)/i),
      publisher: value(/出处:([^<]+)/i),
      directory: value(/目录:([^<]+)/i),
      creator: value(/创建者:([^<]+)/i)
    }
  })
}

export async function discoverOfficialSources(options: OfficialSourceDiscoveryOptions = {}): Promise<OfficialSourceDiscoveryReport> {
  const fetchImpl = options.fetchImpl ?? defaultFetch
  const now = options.now ?? (() => new Date())
  const keywords = options.keywords?.filter(Boolean).map(value => value.trim()).filter(Boolean)
    ?? [...DEFAULT_OFFICIAL_SOURCE_KEYWORDS]
  if (!keywords.length) throw new Error('At least one search keyword is required')

  const homepageResponse = await fetchImpl(OFFICIAL_SEARCH_HOME_URL, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000)
  })
  ensureOk(homepageResponse, 'Official homepage')
  const homepageHtml = await homepageResponse.text()
  const searchPageUrl = formUrl(homepageHtml)
  let cookie = sessionCookie(homepageResponse)

  const searchPageResponse = await fetchImpl(searchPageUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      'referer': OFFICIAL_SEARCH_HOME_URL,
      'user-agent': USER_AGENT,
      ...(cookie ? { cookie: `JSESSIONID=${cookie}` } : {})
    },
    body: new URLSearchParams({ keyword: keywords[0] }),
    signal: AbortSignal.timeout(20_000)
  })
  ensureOk(searchPageResponse, 'Official search page')
  cookie = sessionCookie(searchPageResponse) ?? cookie
  const searchPageHtml = await searchPageResponse.text()
  const endpoint = ajaxUrl(searchPageHtml, searchPageUrl)
  const queries: OfficialSourceSearchResult[] = []

  for (const keyword of keywords) {
    const response = await fetchImpl(`${endpoint}&tt=${Date.now()}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        'referer': searchPageUrl,
        'user-agent': USER_AGENT,
        ...(cookie ? { cookie: `JSESSIONID=${cookie}` } : {})
      },
      body: new URLSearchParams({ searchInfo: searchInfo(keyword) }),
      signal: AbortSignal.timeout(20_000)
    })
    ensureOk(response, `Official search query ${keyword}`)
    cookie = sessionCookie(response) ?? cookie
    const result = await response.json() as { total?: string | number, data?: string }
    const items = parseCandidates(String(result.data ?? ''))
    queries.push({
      keyword,
      total: Number(result.total ?? items.length),
      returned: items.length,
      items
    })
  }

  return {
    formatVersion: 1,
    generatedAt: now().toISOString(),
    homepageUrl: OFFICIAL_SEARCH_HOME_URL,
    searchPageUrl,
    ajaxUrl: endpoint,
    queries
  }
}

export function parseCliKeywords(args: string[]): string[] | undefined {
  const values: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument !== '--keyword') throw new Error(`Unknown argument: ${argument}`)
    const value = args[index + 1]
    if (!value || value.startsWith('-')) throw new Error('--keyword requires a value')
    values.push(value)
    index += 1
  }
  return values.length > 0 ? values : undefined
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await discoverOfficialSources({ keywords: parseCliKeywords(process.argv.slice(2)) })
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
