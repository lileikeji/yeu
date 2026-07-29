import './load-env'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { load } from 'cheerio'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'

const USER_AGENT = 'YEU-Freshman-Guide-knowledge-crawler/1.0 (public official-source indexing)'
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const CRAWLER_VERSION = 3
const MAX_EXTRACTED_LENGTH = 600_000
const READER_TIMEOUT_MS = 65_000
const MAX_PDF_BYTES = 50 * 1024 * 1024
const MAX_HTML_BYTES = 10 * 1024 * 1024

export const DEFAULT_OFFICIAL_KNOWLEDGE_SEEDS = [
  'https://www.yeu.edu.cn/',
  'https://zhaosheng.yeu.edu.cn/',
  'https://xsb.yeu.edu.cn/',
  'https://bgs.yeu.edu.cn/',
  'https://jwb.yeu.edu.cn/',
  'https://library.yeu.edu.cn/',
  'https://web.yeu.edu.cn/',
  'https://shpg.yeu.edu.cn/',
  'https://zwc.yeu.edu.cn/',
  'https://youth.yeu.edu.cn/',
  'https://jjxy.yeu.edu.cn/',
  'https://glxy.yeu.edu.cn/',
  'https://kjxy.yeu.edu.cn/',
  'https://computer.yeu.edu.cn/',
  'https://rwxy.yeu.edu.cn/',
  'https://sofl.yeu.edu.cn/',
  'https://fxy.yeu.edu.cn/',
  'https://art.yeu.edu.cn/',
  'https://ai.yeu.edu.cn/',
  'https://dqgc.yeu.edu.cn/',
  'https://marx.yeu.edu.cn/',
  'https://tiyu.yeu.edu.cn/',
  'https://xl.yeu.edu.cn/'
] as const

const HIGH_VALUE_TERMS = [
  '新生', '报到', '招生', '入学', '学生手册', '学籍', '转专业', '奖学金', '助学金',
  '综合测评', '综测', '校历', '教务', '选课', '考试', '补考', '重修', '毕业', '学位',
  '宿舍', '住宿', '校园网', '学费', '缴费', '军训', '专业简介', '专业介绍', '培养方案', '师资', '图书馆',
  '心理', '安全', '保卫', '就业', '创新创业', '社团', '团委', '资助'
]

const BLOCKED_PATH = /(?:\/(?:_upload\/tpl|_js|_css|login|logout|auth|cas|vpn|webvpn)\/|\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|m4a|m4v|mov|mp3|mp4|mpeg|ogg|png|svg|ttf|webm|webp|woff2?)(?:$|\?))/i
const SUPPORTED_DOCUMENT = /(?:\.(?:html?|psp|pdf|docx?|xlsx?|txt)(?:$|\?)|\/$)/i

export interface OfficialCrawlOptions {
  databasePath: string
  seeds: string[]
  maxPages: number
  maxDepth: number
  concurrency: number
  delayMs: number
  fresh: boolean
  dryRun: boolean
}

export interface OfficialCrawlQueueItem {
  url: string
  depth: number
  label: string
  discoveredFrom: string | null
  seed: boolean
}

export interface ParsedOfficialDocument {
  url: string
  title: string
  text: string
  publishedAt: number | null
  links: Array<{ url: string, label: string }>
  kind: 'webpage' | 'pdf' | 'document' | 'spreadsheet'
  mimeType: string
  extractionMethod: 'jina' | 'pdfjs' | 'direct-html'
}

export interface OfficialCrawlReport {
  databasePath: string
  startedAt: string
  finishedAt: string
  attempted: number
  fetched: number
  inserted: number
  unchanged: number
  failed: number
  discovered: number
  hosts: Record<string, number>
  errors: Array<{ url: string, message: string }>
}

function isOfficialHostname(hostname: string): boolean {
  const value = hostname.toLocaleLowerCase('en-US')
  return value === 'yeu.edu.cn' || value.endsWith('.yeu.edu.cn')
}

function dropTrackingParameters(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|from|source|spm|timestamp|t|_t)$/i.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
}

export function normalizeOfficialUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value.replaceAll('&amp;', '&'), base)
    if (!['http:', 'https:'].includes(url.protocol) || !isOfficialHostname(url.hostname)) return null
    url.protocol = 'https:'
    url.hostname = url.hostname.toLocaleLowerCase('en-US')
    url.hash = ''
    url.pathname = url.pathname.replace(/\/{2,}/g, '/')
    dropTrackingParameters(url)
    const normalized = url.toString()
    if (BLOCKED_PATH.test(`${url.pathname}${url.search}`)) return null
    if (url.pathname.includes('/_upload/') && !/\.(?:pdf|docx?|xlsx?|txt)$/i.test(url.pathname)) return null
    if (!SUPPORTED_DOCUMENT.test(`${url.pathname}${url.search}`)) return null
    return normalized
  } catch {
    return null
  }
}

function readerUrl(value: string): string {
  const url = new URL(value)
  return `https://r.jina.ai/http://${url.host}${url.pathname}${url.search}`
}

async function fetchReader(value: string, fresh: boolean): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(readerUrl(value), {
        headers: {
          'accept': 'text/plain, text/markdown;q=0.9, */*;q=0.1',
          'user-agent': USER_AGENT,
          'x-return-format': 'markdown',
          'x-timeout': '55',
          ...(fresh ? { 'x-no-cache': 'true' } : {})
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(READER_TIMEOUT_MS)
      })
      const body = await response.text()
      if (!response.ok) throw new Error(`reader returned HTTP ${response.status}`)
      if (/^\s*\{\s*"data"\s*:\s*null/u.test(body)) throw new Error('reader could not render the page')
      return body
    } catch (error) {
      lastError = error
      if (attempt < 2) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'reader request failed')
}

async function fetchOfficialHtml(value: string, fresh: boolean): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(value, {
        headers: {
          'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'user-agent': BROWSER_USER_AGENT,
          ...(fresh ? { 'cache-control': 'no-cache' } : {})
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(READER_TIMEOUT_MS)
      })
      if (!response.ok) throw new Error(`official page returned HTTP ${response.status}`)
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > MAX_HTML_BYTES) throw new Error('official page is larger than the 10 MB indexing limit')
      const html = await response.text()
      if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new Error('official page is larger than the 10 MB indexing limit')
      return html
    } catch (error) {
      lastError = error
      if (attempt < 2) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'official page request failed')
}

function markdownLinks(value: string, base: string): Array<{ url: string, label: string }> {
  const links: Array<{ url: string, label: string }> = []
  const add = (rawUrl: string, label: string) => {
    const url = normalizeOfficialUrl(rawUrl.replace(/\\([()])/g, '$1'), base)
    if (!url || links.some(item => item.url === url)) return
    links.push({ url, label: label.replace(/\s+/g, ' ').trim().slice(0, 180) })
  }
  for (const match of value.matchAll(/\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    add((match[2] ?? '').replace(/^<|>$/g, ''), match[1] ?? '')
  }
  for (const match of value.matchAll(/(?:^|[\s<(])(https?:\/\/[^\s)>"']+)/gm)) {
    add(match[1] ?? '', '')
  }
  return links
}

function cleanMarkdown(value: string): string {
  const content = value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*(?:Title|URL Source|Published Time):.*$/gmi, '')
    .replace(/^\s*(?:Markdown Content):\s*$/gmi, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~]{1,3}/g, '')
    .replace(/\bImage\s+\d+\b/gi, '')
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const copyright = content.search(/\n(?:COPYRIGHT|版权所有©?仰恩大学)/i)
  return (copyright > 200 ? content.slice(0, copyright) : content).trim().slice(0, MAX_EXTRACTED_LENGTH)
}

function cleanDirectText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_LENGTH)
}

function isolateArticleText(value: string, title: string, url: string): string {
  if (!/\/(?:page)\.(?:htm|psp)$/i.test(new URL(url).pathname) || title.length < 4) return value
  const heading = value.indexOf(title)
  if (heading < 0 || heading > Math.floor(value.length * 0.55)) return value
  return value.slice(heading).trim()
}

function parsePublishedAt(value: string, url: string): number | null {
  const metadata = value.match(/^Published Time:\s*(\d{4})-(\d{2})-(\d{2})/mi)
  const pathDate = new URL(url).pathname.match(/\/(20\d{2})\/(\d{2})(\d{2})\//)
  const parts = metadata ?? pathDate
  if (!parts) return null
  const time = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  return Number.isFinite(time) ? time : null
}

function documentKind(url: string): Pick<ParsedOfficialDocument, 'kind' | 'mimeType'> {
  const path = new URL(url).pathname.toLocaleLowerCase('en-US')
  if (path.endsWith('.pdf')) return { kind: 'pdf', mimeType: 'application/pdf' }
  if (/\.docx?$/.test(path)) return { kind: 'document', mimeType: path.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword' }
  if (/\.xlsx?$/.test(path)) return { kind: 'spreadsheet', mimeType: path.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel' }
  if (path.endsWith('.txt')) return { kind: 'document', mimeType: 'text/plain' }
  return { kind: 'webpage', mimeType: 'text/markdown' }
}

function isAttachmentUrl(url: string): boolean {
  return /\.(?:pdf|docx?|xlsx?|txt)(?:$|\?)/i.test(url)
}

function attachmentFileTitle(url: string): string {
  const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    .replace(/\.(?:pdf|docx?|xlsx?|txt)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  return filename && !/^[0-9a-f-]{16,}$/i.test(filename)
    ? filename.slice(0, 300)
    : '仰恩大学官方附件'
}

function officialDocumentTitle(document: ParsedOfficialDocument, queueItem: OfficialCrawlQueueItem): string {
  if (document.kind === 'webpage') return document.title
  const label = queueItem.label.replace(/\s+/g, ' ').trim()
  if (label.length >= 3 && !/^(?:官方入口|附件|下载|点击下载|查看|详情|pdf|word)$/i.test(label)) {
    return label.slice(0, 300)
  }
  return document.title || attachmentFileTitle(document.url)
}

async function fetchPdfBytes(value: string, fresh: boolean, discoveredFrom: string | null): Promise<Uint8Array> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(value, {
        headers: {
          'accept': 'application/pdf,application/octet-stream;q=0.8,*/*;q=0.1',
          'user-agent': BROWSER_USER_AGENT,
          ...(discoveredFrom ? { referer: discoveredFrom } : {}),
          ...(fresh ? { 'cache-control': 'no-cache' } : {})
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(READER_TIMEOUT_MS)
      })
      if (!response.ok) throw new Error(`official PDF returned HTTP ${response.status}`)
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > MAX_PDF_BYTES) throw new Error('PDF is larger than the 50 MB indexing limit')
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF is larger than the 50 MB indexing limit')
      if (bytes.length < 5 || new TextDecoder('ascii').decode(bytes.slice(0, 5)) !== '%PDF-') {
        throw new Error('official attachment did not return a PDF file')
      }
      return bytes
    } catch (error) {
      lastError = error
      if (attempt < 2) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'official PDF request failed')
}

export async function parseOfficialPdf(
  bytes: Uint8Array,
  requestedUrl: string,
  label = ''
): Promise<ParsedOfficialDocument> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  })
  try {
    const pdf = await loadingTask.promise
    const metadata = await pdf.getMetadata().catch(() => null)
    const metadataTitle = metadata?.info && typeof metadata.info === 'object' && 'Title' in metadata.info
      ? String(metadata.info.Title ?? '').trim()
      : ''
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        pageText += item.str
        pageText += item.hasEOL ? '\n' : ' '
      }
      const cleaned = pageText
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (cleaned) pages.push(`第 ${pageNumber} 页\n${cleaned}`)
      if (pages.reduce((total, value) => total + value.length, 0) >= MAX_EXTRACTED_LENGTH) break
    }
    const text = pages.join('\n\n').slice(0, MAX_EXTRACTED_LENGTH).trim()
    if (text.length < 80) throw new Error('PDF did not contain enough selectable text; it may be a scanned image')
    return {
      url: requestedUrl,
      title: metadataTitle || label.trim() || attachmentFileTitle(requestedUrl),
      text,
      publishedAt: null,
      links: [],
      kind: 'pdf',
      mimeType: 'application/pdf',
      extractionMethod: 'pdfjs'
    }
  } finally {
    await loadingTask.destroy()
  }
}

export function parseReaderDocument(value: string, requestedUrl: string): ParsedOfficialDocument {
  const sourceUrl = normalizeOfficialUrl(value.match(/^URL Source:\s*(\S+)/mi)?.[1] ?? requestedUrl) ?? requestedUrl
  const title = (value.match(/^Title:\s*(.+)$/mi)?.[1] ?? new URL(sourceUrl).hostname)
    .replace(/\s*[-_|]\s*仰恩大学.*$/u, '')
    .trim()
    .slice(0, 300)
  const marker = value.search(/^Markdown Content:\s*$/mi)
  const markdown = marker >= 0 ? value.slice(marker).replace(/^Markdown Content:\s*$/mi, '') : value
  const text = isolateArticleText(cleanMarkdown(markdown), title, sourceUrl)
  if (text.length < 80) throw new Error('page did not contain enough readable text')
  return {
    url: sourceUrl,
    title: title || '仰恩大学官方资料',
    text,
    publishedAt: parsePublishedAt(value, sourceUrl),
    links: markdownLinks(markdown, sourceUrl),
    extractionMethod: 'jina',
    ...documentKind(sourceUrl)
  }
}

export function parseOfficialHtml(value: string, requestedUrl: string): ParsedOfficialDocument {
  const $ = load(value)
  const sourceUrl = normalizeOfficialUrl(
    $('link[rel="canonical"]').attr('href') ?? $('meta[property="og:url"]').attr('content') ?? requestedUrl,
    requestedUrl
  ) ?? requestedUrl
  const title = (
    $('meta[property="og:title"]').attr('content')
    ?? $('h1').first().text()
    ?? $('title').text()
    ?? '仰恩大学官方资料'
  )
    .replace(/\s*[-_|]\s*仰恩大学.*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
  const links: Array<{ url: string, label: string }> = []
  $('a[href]').each((_, element) => {
    const url = normalizeOfficialUrl($(element).attr('href') ?? '', sourceUrl)
    if (!url || links.some(item => item.url === url)) return
    const label = ($(element).text() || $(element).attr('title') || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180)
    links.push({ url, label })
  })

  const selectors = [
    '.wp_articlecontent',
    '.v_news_content',
    '#vsb_content',
    '#content',
    '.article-content',
    '.news-content',
    'article',
    'main'
  ]
  let content = $('body').first()
  let bestLength = 0
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const candidate = $(element)
      const length = candidate.text().replace(/\s+/g, '').length
      if (length > bestLength) {
        bestLength = length
        content = candidate
      }
    })
  }
  const readable = content.clone()
  readable.find('script,style,noscript,svg,form,iframe,nav').remove()
  readable.find('br').replaceWith('\n')
  readable.find('p,div,li,tr,h1,h2,h3,h4,h5,h6,section').each((_, element) => {
    $(element).append('\n')
  })
  const text = cleanDirectText(readable.text())
  if (text.length < 80) throw new Error('official page did not contain enough readable text')

  const published = $('meta[property="article:published_time"]').attr('content')
    ?? $('meta[name="publishdate"]').attr('content')
    ?? $('meta[name="PubDate"]').attr('content')
    ?? ''
  return {
    url: sourceUrl,
    title: title || '仰恩大学官方资料',
    text,
    publishedAt: parsePublishedAt(published ? `Published Time: ${published}` : '', sourceUrl),
    links,
    kind: 'webpage',
    mimeType: 'text/html',
    extractionMethod: 'direct-html'
  }
}

export function crawlPriority(item: OfficialCrawlQueueItem): number {
  const value = `${item.label} ${item.url}`.toLocaleLowerCase('zh-CN')
  const highValue = HIGH_VALUE_TERMS.reduce((score, term) => score + (value.includes(term.toLocaleLowerCase('zh-CN')) ? 28 : 0), 0)
  const article = /\/20\d{2}\/\d{4}\/c\d+a\d+\/page\.(?:htm|psp)/i.test(item.url) ? 18 : 0
  const list = /\/(?:list|index)\.(?:htm|psp)/i.test(item.url) ? 12 : 0
  const attachment = isAttachmentUrl(item.url) ? 140 : 0
  return (item.seed ? 400 : 0) + attachment + highValue + article + list - item.depth * 5
}

function contentHash(value: string): string {
  return createHash('sha256').update(value.normalize('NFKC')).digest('hex')
}

function storeOfficialDocument(
  client: DatabaseClient,
  document: ParsedOfficialDocument,
  queueItem: OfficialCrawlQueueItem,
  capturedAt: number,
  dryRun: boolean
): 'inserted' | 'unchanged' {
  const hash = contentHash(document.text)
  const title = officialDocumentTitle(document, queueItem)
  const metadataJson = JSON.stringify({
    crawler: 'official-knowledge',
    crawlerVersion: CRAWLER_VERSION,
    depth: queueItem.depth,
    discoveredFrom: queueItem.discoveredFrom,
    attachmentLabel: document.kind === 'webpage' ? null : queueItem.label,
    outgoingOfficialLinks: document.links.length,
    extractionMethod: document.extractionMethod
  })
  const existing = client.sqlite.prepare(`
    SELECT id FROM knowledge_documents WHERE original_url = ? AND content_hash = ? LIMIT 1
  `).get(document.url, hash) as { id: string } | undefined
  if (existing) {
    if (!dryRun) {
      client.sqlite.prepare(`
        UPDATE knowledge_documents
        SET title = ?, metadata_json = ?, processed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(title, metadataJson, capturedAt, capturedAt, existing.id)
    }
    return 'unchanged'
  }
  if (dryRun) return 'inserted'

  client.sqlite.transaction(() => {
    const sourceId = randomUUID()
    client.sqlite.prepare(`
      INSERT INTO sources (
        id, title, url, platform, publisher_name, source_level, is_official,
        published_at, accessed_at, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, '仰恩大学官网', '仰恩大学', 'A', 1, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        platform = excluded.platform,
        publisher_name = excluded.publisher_name,
        source_level = 'A',
        is_official = 1,
        published_at = coalesce(excluded.published_at, sources.published_at),
        accessed_at = excluded.accessed_at,
        status = 'active',
        updated_at = excluded.updated_at
    `).run(
      sourceId,
      title,
      document.url,
      document.publishedAt,
      capturedAt,
      '官网增量抓取；中转仅用于读取公开正文，证据链接始终保留官方原地址。',
      capturedAt,
      capturedAt
    )
    const source = client.sqlite.prepare('SELECT id FROM sources WHERE url = ?').get(document.url) as { id: string }
    client.sqlite.prepare(`
      UPDATE knowledge_documents
      SET status = 'archived', updated_at = ?
      WHERE original_url = ? AND status = 'ready'
    `).run(capturedAt, document.url)
    client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, storage_path, mime_type,
        content_hash, extracted_text, metadata_json, status, captured_at,
        processed_at, created_by_admin_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'ready', ?, ?, NULL, ?, ?)
    `).run(
      randomUUID(),
      source.id,
      document.kind,
      title,
      document.url,
      document.mimeType,
      hash,
      document.text,
      metadataJson,
      capturedAt,
      capturedAt,
      capturedAt,
      capturedAt
    )
  })()
  return 'inserted'
}

function enqueueCrawlItem(client: DatabaseClient, item: OfficialCrawlQueueItem, now = Date.now()): void {
  client.sqlite.prepare(`
    INSERT INTO knowledge_crawl_queue (
      url, hostname, label, depth, discovered_from, priority, status, attempts,
      last_attempt_at, next_attempt_at, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, '', ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      label = CASE WHEN length(excluded.label) > length(knowledge_crawl_queue.label)
        THEN excluded.label ELSE knowledge_crawl_queue.label END,
      depth = min(knowledge_crawl_queue.depth, excluded.depth),
      discovered_from = coalesce(knowledge_crawl_queue.discovered_from, excluded.discovered_from),
      priority = max(knowledge_crawl_queue.priority, excluded.priority),
      updated_at = excluded.updated_at
  `).run(
    item.url,
    new URL(item.url).hostname,
    item.label,
    item.depth,
    item.discoveredFrom,
    crawlPriority(item),
    now,
    now
  )
}

function refreshPendingPriorities(client: DatabaseClient): void {
  const rows = client.sqlite.prepare(`
    SELECT url, label, depth, discovered_from AS discoveredFrom
    FROM knowledge_crawl_queue
    WHERE status = 'pending'
  `).all() as Array<Omit<OfficialCrawlQueueItem, 'seed'>>
  const update = client.sqlite.prepare('UPDATE knowledge_crawl_queue SET priority = ?, updated_at = ? WHERE url = ?')
  const now = Date.now()
  client.sqlite.transaction(() => {
    for (const row of rows) update.run(crawlPriority({ ...row, seed: row.depth === 0 }), now, row.url)
  })()
}

function claimNextCrawlItem(client: DatabaseClient, now: number): OfficialCrawlQueueItem | null {
  return client.sqlite.transaction(() => {
    const row = client.sqlite.prepare(`
      SELECT url, label, depth, discovered_from AS discoveredFrom
      FROM knowledge_crawl_queue
      WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get(now) as Omit<OfficialCrawlQueueItem, 'seed'> | undefined
    if (!row) return null
    client.sqlite.prepare(`
      UPDATE knowledge_crawl_queue
      SET status = 'processing', attempts = attempts + 1, last_attempt_at = ?, updated_at = ?
      WHERE url = ?
    `).run(now, now, row.url)
    return { ...row, seed: row.depth === 0 }
  })()
}

function completeCrawlItem(client: DatabaseClient, url: string, now: number): void {
  client.sqlite.prepare(`
    UPDATE knowledge_crawl_queue
    SET status = 'completed', next_attempt_at = NULL, last_error = '', updated_at = ?
    WHERE url = ?
  `).run(now, url)
}

function failCrawlItem(client: DatabaseClient, url: string, message: string, now: number): void {
  const row = client.sqlite.prepare('SELECT attempts FROM knowledge_crawl_queue WHERE url = ?').get(url) as { attempts: number }
  const permanentlyFailed = row.attempts >= 2
  client.sqlite.prepare(`
    UPDATE knowledge_crawl_queue
    SET status = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
    WHERE url = ?
  `).run(
    permanentlyFailed ? 'failed' : 'pending',
    permanentlyFailed ? null : now + 5 * 60_000,
    message.slice(0, 1000),
    now,
    url
  )
}

export async function crawlOfficialKnowledge(options: OfficialCrawlOptions): Promise<OfficialCrawlReport> {
  const startedAt = new Date()
  const client = getDatabase(options.databasePath)
  runMigrations(client)
  const seedItems: OfficialCrawlQueueItem[] = options.seeds.flatMap((seed) => {
    const url = normalizeOfficialUrl(seed)
    return url ? [{ url, depth: 0, label: '官方入口', discoveredFrom: null, seed: true }] : []
  })
  client.sqlite.prepare(`
    UPDATE knowledge_crawl_queue
    SET status = 'pending', updated_at = ?
    WHERE status = 'processing' AND last_attempt_at < ?
  `).run(startedAt.getTime(), startedAt.getTime() - 15 * 60_000)
  client.sqlite.prepare(`
    UPDATE knowledge_crawl_queue
    SET status = 'pending', next_attempt_at = NULL, last_error = '', updated_at = ?
    WHERE status = 'completed'
      AND EXISTS (
        SELECT 1
        FROM knowledge_documents
        WHERE knowledge_documents.original_url = knowledge_crawl_queue.url
          AND knowledge_documents.status = 'ready'
          AND knowledge_documents.metadata_json LIKE '%"crawler":"official-knowledge"%'
          AND knowledge_documents.metadata_json NOT LIKE ?
      )
  `).run(startedAt.getTime(), `%"crawlerVersion":${CRAWLER_VERSION}%`)
  client.sqlite.prepare(`
    UPDATE knowledge_crawl_queue
    SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = '', updated_at = ?
    WHERE last_error = 'fetch failed'
  `).run(startedAt.getTime())
  for (const item of seedItems) enqueueCrawlItem(client, item, startedAt.getTime())
  refreshPendingPriorities(client)
  const report: OfficialCrawlReport = {
    databasePath: client.path,
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    attempted: 0,
    fetched: 0,
    inserted: 0,
    unchanged: 0,
    failed: 0,
    discovered: 0,
    hosts: {},
    errors: []
  }

  let lastProgressLogged = 0
  const nextItem = (): OfficialCrawlQueueItem | null => {
    if (report.attempted >= options.maxPages) return null
    const item = claimNextCrawlItem(client, Date.now())
    if (item) report.attempted += 1
    return item
  }
  const worker = async () => {
    while (true) {
      const item = nextItem()
      if (!item) return
      try {
        let document: ParsedOfficialDocument
        if (documentKind(item.url).kind === 'pdf') {
          try {
            const bytes = await fetchPdfBytes(item.url, options.fresh, item.discoveredFrom)
            document = await parseOfficialPdf(bytes, item.url, item.label)
          } catch (directPdfError) {
            try {
              const raw = await fetchReader(item.url, options.fresh)
              document = parseReaderDocument(raw, item.url)
            } catch {
              throw directPdfError
            }
          }
        } else {
          if (options.fresh) {
            try {
              const html = await fetchOfficialHtml(item.url, true)
              document = parseOfficialHtml(html, item.url)
            } catch {
              const raw = await fetchReader(item.url, true)
              document = parseReaderDocument(raw, item.url)
            }
          } else {
            try {
              const raw = await fetchReader(item.url, false)
              document = parseReaderDocument(raw, item.url)
            } catch {
              const html = await fetchOfficialHtml(item.url, false)
              document = parseOfficialHtml(html, item.url)
            }
          }
        }
        report.fetched += 1
        const outcome = storeOfficialDocument(client, document, item, Date.now(), options.dryRun)
        report[outcome] += 1
        const host = new URL(document.url).hostname
        report.hosts[host] = (report.hosts[host] ?? 0) + 1

        for (const link of document.links) {
          if (item.depth < options.maxDepth || isAttachmentUrl(link.url)) {
            enqueueCrawlItem(client, {
              url: link.url,
              depth: item.depth + 1,
              label: link.label,
              discoveredFrom: document.url,
              seed: false
            })
          }
        }
        completeCrawlItem(client, item.url, Date.now())
      } catch (error) {
        report.failed += 1
        const message = error instanceof Error ? error.message : String(error)
        failCrawlItem(client, item.url, message, Date.now())
        if (report.errors.length < 40) {
          report.errors.push({
            url: item.url,
            message
          })
        }
      }
      if (options.delayMs > 0) await new Promise(resolvePromise => setTimeout(resolvePromise, options.delayMs))
      const progress = Math.floor(report.attempted / 10) * 10
      if (progress > lastProgressLogged) {
        lastProgressLogged = progress
        process.stderr.write(`Crawled ${report.attempted}/${options.maxPages}; inserted ${report.inserted}; unchanged ${report.unchanged}; failed ${report.failed}\n`)
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: options.concurrency }, () => worker()))
  } finally {
    report.discovered = (client.sqlite.prepare('SELECT count(1) AS value FROM knowledge_crawl_queue').get() as { value: number }).value
    report.finishedAt = new Date().toISOString()
    closeDatabase(options.databasePath)
  }
  return report
}

function positiveInteger(value: string, label: string, minimum: number, maximum: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}

export function parseOfficialCrawlCli(argv: string[]): OfficialCrawlOptions {
  const options: OfficialCrawlOptions = {
    databasePath: process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite',
    seeds: [...DEFAULT_OFFICIAL_KNOWLEDGE_SEEDS],
    maxPages: 80,
    maxDepth: 4,
    concurrency: 2,
    delayMs: 350,
    fresh: false,
    dryRun: false
  }
  const explicitSeeds: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (argument === '--fresh') options.fresh = true
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--database' && value) {
      options.databasePath = value
      index += 1
    } else if (argument === '--seed' && value) {
      explicitSeeds.push(value)
      index += 1
    } else if (argument === '--max-pages' && value) {
      options.maxPages = positiveInteger(value, '--max-pages', 1, 10_000)
      index += 1
    } else if (argument === '--max-depth' && value) {
      options.maxDepth = positiveInteger(value, '--max-depth', 0, 20)
      index += 1
    } else if (argument === '--concurrency' && value) {
      options.concurrency = positiveInteger(value, '--concurrency', 1, 4)
      index += 1
    } else if (argument === '--delay-ms' && value) {
      options.delayMs = positiveInteger(value, '--delay-ms', 0, 60_000)
      index += 1
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`)
    }
  }
  if (explicitSeeds.length > 0) options.seeds = explicitSeeds
  return options
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await crawlOfficialKnowledge(parseOfficialCrawlCli(process.argv.slice(2)))
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  }
}
