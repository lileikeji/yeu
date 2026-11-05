import './load-env'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { basename, dirname, resolve } from 'node:path'
import { readdirSync, readFileSync, rmSync, statSync, statfsSync } from 'node:fs'
import * as XLSX from '@e965/xlsx'
import { load } from 'cheerio'
import { candidateImageUrls, imageOcrConfigFromEnv, ocrImageUrls } from '../server/modules/knowledge/image-ocr'
import { hasFetchRelay, relayFetchUrl } from '../server/modules/knowledge/fetch-relay'
import { unzipSync } from 'fflate'
import WordExtractor from 'word-extractor'
import { closeDatabase, getDatabase, resolveDatabasePath, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { compileOfficialKnowledgeDocuments } from '../server/modules/knowledge/document-compiler'

const USER_AGENT = 'YEU-Freshman-Guide-knowledge-crawler/1.0 (public official-source indexing)'
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const CRAWLER_VERSION = 6
const MAX_EXTRACTED_LENGTH = 600_000
const READER_TIMEOUT_MS = 20_000
const MAX_PDF_BYTES = 50 * 1024 * 1024
const MAX_OFFICE_BYTES = 30 * 1024 * 1024
const MAX_HTML_BYTES = 10 * 1024 * 1024
export const EXPLICIT_SEED_PRIORITY = 10_000

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
  'https://xl.yeu.edu.cn/',
  'https://xsb.yeu.edu.cn/2025/0530/c640a49640/page.htm',
  'https://xsb.yeu.edu.cn/2025/0429/c640a49115/page.htm',
  'https://xsb.yeu.edu.cn/2025/0311/c644a47889/page.htm',
  'https://xsb.yeu.edu.cn/2025/0311/c644a47890/page.htm',
  'https://xsb.yeu.edu.cn/2025/0311/c644a47891/page.htm',
  'https://xsb.yeu.edu.cn/2024/0903/c640a45584/page.htm',
  'https://xsb.yeu.edu.cn/2023/0630/c644a39463/page.htm',
  'https://xsb.yeu.edu.cn/2023/1205/c124a41670/page.htm',
  'https://jwb.yeu.edu.cn/2025/1030/c1173a53025/page.htm',
  'https://jwb.yeu.edu.cn/2019/1105/c51a1115/page.htm',
  'https://www.yeu.edu.cn/_upload/article/files/31/96/4102aa1f401191c22c2586f302bf/6fbb20c4-a915-4f04-9841-f21c56f253e4.doc',
  'https://www.yeu.edu.cn/_upload/article/files/78/01/ca457e7144299ad59ad99da88460/0bfe3bf3-5dfd-4ccb-a132-a556f46a4300.docx'
] as const

const HIGH_VALUE_TERMS = [
  '新生', '报到', '招生', '入学', '学生手册', '学籍', '转专业', '奖学金', '助学金',
  '综合测评', '综测', '校历', '教务', '选课', '考试', '补考', '重修', '毕业', '学位',
  '宿舍', '住宿', '校园网', '学费', '缴费', '军训', '专业简介', '专业介绍', '培养方案', '师资', '图书馆',
  '心理', '安全', '保卫', '就业', '创新创业', '社团', '团委', '资助'
]

const BLOCKED_PATH = /(?:\/(?:_upload\/tpl|_js|_css|login|logout|auth|cas|vpn|webvpn)\/|\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|m4a|m4v|mov|mp3|mp4|mpeg|ogg|png|svg|ttf|webm|webp|woff2?)(?:$|\?))/i
const SUPPORTED_DOCUMENT = /(?:\.(?:html?|psp|pdf|docx?|xlsx?|txt)(?:$|\?)|\/$)/i

/** 正文短于这个字数才值得 OCR：正常网页正文都远超 300 字。 */
const OCR_MIN_TEXT = 300

export interface OfficialCrawlOptions {
  databasePath: string
  seeds: string[]
  maxPages: number
  maxDepth: number
  concurrency: number
  delayMs: number
  fresh: boolean
  dryRun: boolean
  /** compile 会把整库重编一遍，几万条要跑一个多小时；只要正文入库时用 --no-compile 跳过。 */
  compile?: boolean
  /** 正文是图片的通知靠视觉模型转写；没有 OCR_* 环境变量时自动跳过。 */
  ocr?: boolean
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
  extractionMethod: 'jina' | 'pdfjs' | 'direct-html' | 'office-xml' | 'office-binary'
  pageCount?: number
  attachmentLandingPage?: boolean
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
  /** 合并回生产库失败时的原因；成功时缺省。 */
  mergeError?: string
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
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      if (attempt < 2 && !timedOut) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'reader request failed')
}

async function fetchOfficialHtml(value: string, fresh: boolean): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(relayFetchUrl(value), {
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
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      if (attempt < 2 && !timedOut) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
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

function stripUnsupportedControlCharacters(value: string): string {
  let result = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    const unsupported = (
      code <= 8
      || code === 11
      || code === 12
      || (code >= 14 && code <= 31)
      || code === 127
    )
    if (unsupported) result += ' '
    else result += character
  }
  return result
}

function cleanMarkdown(value: string): string {
  const content = stripUnsupportedControlCharacters(value)
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
  return stripUnsupportedControlCharacters(value)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_LENGTH)
}

function meaningfulAttachmentTitle(rawTitle: string, text: string, sourceUrl: string): string {
  const cleanedRawTitle = rawTitle
    .replace(/\.(?:pdf|docx?|xlsx?|txt)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const rawLooksOpaque = !cleanedRawTitle
    || /^[0-9a-f-]{16,}$/i.test(cleanedRawTitle.replace(/\s+/g, ''))
    || /^仰恩大学官方附件$/u.test(cleanedRawTitle)
  const earlyCandidate = text
    .split(/\n+/)
    .slice(0, 8)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .find(line => line.length >= 5
      && line.length <= 140
      && !/^(?:工作表|sheet)\s*[：:]/i.test(line)
      && /办法|规定|细则|章程|指南|手册|流程|通知|报告|培养方案|校历|课程表|申请表|名单/u.test(line))
  if (!rawLooksOpaque) {
    const metadataLooksStale = earlyCandidate
      && earlyCandidate !== cleanedRawTitle
      && !text.slice(0, 800).replace(/\s+/g, '').includes(cleanedRawTitle.replace(/\s+/g, ''))
    return (metadataLooksStale ? earlyCandidate : cleanedRawTitle).slice(0, 300)
  }
  if (earlyCandidate) return earlyCandidate.slice(0, 300)

  const quoted = text.match(/《(仰恩大学[^》]{2,120}(?:办法|规定|细则|章程|指南|手册|流程|通知|报告)[^》]{0,30})》/u)?.[1]
  if (quoted) return quoted.replace(/\s+/g, '').slice(0, 300)

  const candidates = text
    .split(/\n+/)
    .map((line, index) => ({ line: line.replace(/\s+/g, ' ').trim(), index }))
    .filter(item => item.line.length >= 5 && item.line.length <= 140 && /[\u3400-\u9FFF]/u.test(item.line))
    .filter(item => /办法|规定|细则|章程|指南|手册|流程|通知|报告|培养方案|校历|课程表|申请表|名单/u.test(item.line))
    .map(({ line, index }) => ({
      line,
      score: (line.includes('仰恩大学') ? 40 : 0)
        + (/办法|规定|细则|章程|手册|培养方案|校历/u.test(line) ? 25 : 0)
        + Math.max(0, 60 - index * 4)
        - (/^(?:关于|附件|办理事项)/u.test(line) ? 4 : 0)
        - (/[：:]直线|Image|签发人/u.test(line) ? 30 : 0)
    }))
    .sort((left, right) => right.score - left.score || left.line.length - right.line.length)
  return (candidates[0]?.line || attachmentFileTitle(sourceUrl)).slice(0, 300)
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
  const rawFilename = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    .replace(/\.(?:pdf|docx?|xlsx?|txt)$/i, '')
    .trim()
  const opaque = /^[0-9a-f-]{16,}$/i.test(rawFilename)
  const filename = rawFilename
    .replace(/[_-]+/g, ' ')
    .trim()
  return filename && !opaque
    ? filename.slice(0, 300)
    : '仰恩大学官方附件'
}

function officialDocumentTitle(document: ParsedOfficialDocument, queueItem: OfficialCrawlQueueItem): string {
  if (document.kind === 'webpage') return document.title
  const label = queueItem.label
    .replace(/\.(?:pdf|docx?|xlsx?|txt)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
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
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      if (attempt < 2 && !timedOut) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'official PDF request failed')
}

async function fetchOfficeBytes(value: string, fresh: boolean, discoveredFrom: string | null): Promise<Uint8Array> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(value, {
        headers: {
          'accept': 'application/vnd.openxmlformats-officedocument.*,application/octet-stream;q=0.8,*/*;q=0.1',
          'user-agent': BROWSER_USER_AGENT,
          ...(discoveredFrom ? { referer: discoveredFrom } : {}),
          ...(fresh ? { 'cache-control': 'no-cache' } : {})
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(READER_TIMEOUT_MS)
      })
      if (!response.ok) throw new Error(`official Office attachment returned HTTP ${response.status}`)
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > MAX_OFFICE_BYTES) throw new Error('Office attachment is larger than the 30 MB indexing limit')
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > MAX_OFFICE_BYTES) throw new Error('Office attachment is larger than the 30 MB indexing limit')
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error('official attachment did not return an Open XML file')
      }
      return bytes
    } catch (error) {
      lastError = error
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      if (attempt < 2 && !timedOut) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'official Office attachment request failed')
}

async function fetchLegacyOfficeBytes(
  value: string,
  fresh: boolean,
  discoveredFrom: string | null
): Promise<Uint8Array> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(value, {
        headers: {
          'accept': 'application/msword,application/vnd.ms-excel,application/octet-stream;q=0.8,*/*;q=0.1',
          'user-agent': BROWSER_USER_AGENT,
          ...(discoveredFrom ? { referer: discoveredFrom } : {}),
          ...(fresh ? { 'cache-control': 'no-cache' } : {})
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(READER_TIMEOUT_MS)
      })
      if (!response.ok) throw new Error(`official legacy Office attachment returned HTTP ${response.status}`)
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > MAX_OFFICE_BYTES) throw new Error('Office attachment is larger than the 30 MB indexing limit')
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > MAX_OFFICE_BYTES) throw new Error('Office attachment is larger than the 30 MB indexing limit')
      const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
      const isOle = bytes.length >= oleSignature.length
        && oleSignature.every((byte, index) => bytes[index] === byte)
      const isOpenXml = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
      if (!isOle && !isOpenXml) {
        throw new Error('official attachment did not return a supported Office file')
      }
      return bytes
    } catch (error) {
      lastError = error
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      if (attempt < 2 && !timedOut) await new Promise(resolvePromise => setTimeout(resolvePromise, 700 * attempt))
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'official legacy Office attachment request failed')
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

function textFromOpenXmlFragment(value: string): string {
  return cleanDirectText(decodeXmlText(value
    .replace(/<w:tab\b[^>]*\/?>/gi, '\t')
    .replace(/<w:br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/w:tc>/gi, '\t')
    .replace(/<\/w:tr>/gi, '\n')
    .replace(/<\/(?:t|v)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')))
}

function openXmlTitle(files: Record<string, Uint8Array>, fallback: string): string {
  const core = files['docProps/core.xml']
  if (!core) return fallback
  const xml = new TextDecoder().decode(core)
  const title = decodeXmlText(xml.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return title || fallback
}

function spreadsheetColumnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toLocaleUpperCase('en-US') ?? 'A'
  let index = 0
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64
  return Math.max(0, index - 1)
}

function parseOpenXmlSpreadsheet(files: Record<string, Uint8Array>): string {
  const decoder = new TextDecoder()
  const sharedXml = files['xl/sharedStrings.xml'] ? decoder.decode(files['xl/sharedStrings.xml']) : ''
  const sharedStrings = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)]
    .map(match => textFromOpenXmlFragment(match[1] ?? ''))
  const workbookXml = files['xl/workbook.xml'] ? decoder.decode(files['xl/workbook.xml']) : ''
  const sheetNames = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/gi)]
    .map(match => decodeXmlText(match[1] ?? '').trim())
  const worksheetEntries = Object.entries(files)
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(([left], [right]) => left.localeCompare(right, 'en-US', { numeric: true }))
  const output: string[] = []

  for (const [sheetName, bytes] of worksheetEntries) {
    const index = Number(sheetName.match(/sheet(\d+)\.xml$/i)?.[1] ?? output.length + 1) - 1
    output.push(`工作表：${sheetNames[index] || `Sheet ${index + 1}`}`)
    const xml = decoder.decode(bytes)
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
      const cells: string[] = []
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const attributes = cellMatch[1] ?? ''
        const body = cellMatch[2] ?? ''
        const reference = attributes.match(/\br="([^"]+)"/i)?.[1] ?? `A${cells.length + 1}`
        const type = attributes.match(/\bt="([^"]+)"/i)?.[1] ?? ''
        const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? ''
        let value = type === 's'
          ? sharedStrings[Number(rawValue)] ?? ''
          : type === 'inlineStr'
            ? textFromOpenXmlFragment(body)
            : decodeXmlText(rawValue).trim()
        if (type === 'b') value = value === '1' ? '是' : '否'
        const cellIndex = spreadsheetColumnIndex(reference)
        while (cells.length < cellIndex) cells.push('')
        cells[cellIndex] = value
      }
      const line = cells.join('\t').replace(/\t+$/g, '').trim()
      if (line) output.push(line)
      if (output.reduce((total, line) => total + line.length, 0) >= MAX_EXTRACTED_LENGTH) break
    }
  }
  return cleanDirectText(output.join('\n'))
}

export function parseOfficialOpenXml(
  bytes: Uint8Array,
  requestedUrl: string,
  label = ''
): ParsedOfficialDocument {
  const files = unzipSync(bytes)
  const path = new URL(requestedUrl).pathname.toLocaleLowerCase('en-US')
  const normalizedLabel = label.replace(/\s+/g, ' ').trim()
  const fallbackTitle = normalizedLabel.length >= 3
    && !/^(?:官方入口|附件|下载|点击下载|查看|详情|word|excel)$/i.test(normalizedLabel)
    ? normalizedLabel
    : attachmentFileTitle(requestedUrl)
  let text: string
  let kind: ParsedOfficialDocument['kind']
  let mimeType: string
  if (path.endsWith('.docx') || Boolean(files['word/document.xml'])) {
    const documentXml = files['word/document.xml']
    if (!documentXml) throw new Error('DOCX did not contain word/document.xml')
    text = textFromOpenXmlFragment(new TextDecoder().decode(documentXml))
    kind = 'document'
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  } else if (path.endsWith('.xlsx') || Boolean(files['xl/workbook.xml'])) {
    text = parseOpenXmlSpreadsheet(files)
    kind = 'spreadsheet'
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  } else {
    throw new Error('unsupported Open XML attachment type')
  }
  if (text.length < 20) throw new Error('Office attachment did not contain enough readable text')
  return {
    url: requestedUrl,
    title: meaningfulAttachmentTitle(openXmlTitle(files, fallbackTitle), text, requestedUrl),
    text,
    publishedAt: null,
    links: [],
    kind,
    mimeType,
    extractionMethod: 'office-xml'
  }
}

function legacyAttachmentTitle(requestedUrl: string, label: string, text: string): string {
  const normalizedLabel = label
    .replace(/\.(?:doc|xls)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const earlyTitle = text
    .split(/\n+/)
    .slice(0, 12)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .find(line => line.length >= 5
      && line.length <= 140
      && /校历|作息时间|办理流程|证明书|学位证明|管理办法|实施办法|规定|细则|章程|指南|手册|培养方案|课程表/u.test(line))
  const fallback = normalizedLabel.length >= 3
    && !/^(?:官方入口|附件|下载|点击下载|查看|详情|word|excel)$/i.test(normalizedLabel)
    ? normalizedLabel
    : earlyTitle || attachmentFileTitle(requestedUrl)
  return meaningfulAttachmentTitle(fallback, text, requestedUrl)
}

function parseLegacySpreadsheet(bytes: Uint8Array): string {
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellText: true,
    sheetRows: 10_000
  })
  const output: string[] = []
  let totalLength = 0
  for (const sheetName of workbook.SheetNames.slice(0, 80)) {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) continue
    const heading = `工作表：${sheetName}`
    const text = XLSX.utils.sheet_to_csv(worksheet, {
      FS: '\t',
      RS: '\n',
      blankrows: false,
      strip: true
    })
      .replace(/\t+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!text) continue
    const section = `${heading}\n${text}`
    const remaining = MAX_EXTRACTED_LENGTH - totalLength
    if (remaining <= 0) break
    output.push(section.slice(0, remaining))
    totalLength += section.length
  }
  return cleanDirectText(output.join('\n\n'))
}

export async function parseOfficialLegacyOffice(
  bytes: Uint8Array,
  requestedUrl: string,
  label = ''
): Promise<ParsedOfficialDocument> {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return parseOfficialOpenXml(bytes, requestedUrl, label)
  }
  const path = new URL(requestedUrl).pathname.toLocaleLowerCase('en-US')
  let text: string
  let kind: ParsedOfficialDocument['kind']
  let mimeType: string
  if (path.endsWith('.doc')) {
    const document = await new WordExtractor().extract(Buffer.from(bytes))
    text = mergeLegacyWordText(document)
    kind = 'document'
    mimeType = 'application/msword'
  } else if (path.endsWith('.xls')) {
    text = parseLegacySpreadsheet(bytes)
    kind = 'spreadsheet'
    mimeType = 'application/vnd.ms-excel'
  } else {
    throw new Error('unsupported legacy Office attachment type')
  }
  if (text.length < 20) throw new Error('legacy Office attachment did not contain enough readable text')
  return {
    url: requestedUrl,
    title: legacyAttachmentTitle(requestedUrl, label, text),
    text,
    publishedAt: null,
    links: [],
    kind,
    mimeType,
    extractionMethod: 'office-binary'
  }
}

export function mergeLegacyWordText(document: {
  getBody: () => string
  getFootnotes: () => string
  getEndnotes: () => string
  getAnnotations: () => string
  getTextboxes: (options?: {
    includeHeadersAndFooters?: boolean
    includeBody?: boolean
  }) => string
}): string {
  const sections = [
    document.getBody(),
    document.getTextboxes({
      includeHeadersAndFooters: false,
      includeBody: true
    }),
    document.getFootnotes(),
    document.getEndnotes(),
    document.getAnnotations()
  ]
    .map(section => cleanDirectText(section))
    .filter(Boolean)
  return [...new Set(sections)].join('\n\n').slice(0, MAX_EXTRACTED_LENGTH)
}

function ensurePdfTextRuntime(): void {
  if ('DOMMatrix' in globalThis && typeof globalThis.DOMMatrix === 'function') return
  class TextOnlyDOMMatrix {
    a = 1
    b = 0
    c = 0
    d = 1
    e = 0
    f = 0

    constructor(initial?: unknown) {
      if (!Array.isArray(initial) && !ArrayBuffer.isView(initial)) return
      const values = Array.from(initial as ArrayLike<number>)
      if (values.length < 6) return
      this.a = Number(values[0])
      this.b = Number(values[1])
      this.c = Number(values[2])
      this.d = Number(values[3])
      this.e = Number(values[4])
      this.f = Number(values[5])
    }
  }
  Object.defineProperty(globalThis, 'DOMMatrix', {
    configurable: true,
    writable: true,
    value: TextOnlyDOMMatrix
  })
}

export async function parseOfficialPdf(
  bytes: Uint8Array,
  requestedUrl: string,
  label = ''
): Promise<ParsedOfficialDocument> {
  ensurePdfTextRuntime()
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
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
      extractionMethod: 'pdfjs',
      pageCount: pdf.numPages
    }
  } finally {
    await loadingTask.destroy()
  }
}

export function discoverOfficialHtmlLinks(
  value: string,
  requestedUrl: string
): Array<{ url: string, label: string }> {
  const $ = load(value)
  const links: Array<{ url: string, label: string }> = []
  const add = (rawUrl: string, label: string) => {
    const url = normalizeOfficialUrl(rawUrl, requestedUrl)
    if (!url || links.some(item => item.url === url)) return
    links.push({ url, label: label.replace(/\s+/g, ' ').trim().slice(0, 180) })
  }
  const attributes = ['href', 'pdfsrc', 'data-file', 'data-url', 'src', 'data']
  $('a[href], [pdfsrc], [data-file], [data-url], iframe[src], embed[src], object[data]').each((_, element) => {
    const node = $(element)
    const metadata = node.attr('sudyfile-attr') ?? ''
    const metadataTitle = metadata.match(/['"]title['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1] ?? ''
    const label = (
      metadataTitle
      || node.attr('title')
      || node.attr('aria-label')
      || node.text()
      || ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180)
    for (const attribute of attributes) {
      const rawUrl = node.attr(attribute)
      if (rawUrl) add(rawUrl, label)
    }
  })
  return links
}

export function parseReaderDocument(value: string, requestedUrl: string): ParsedOfficialDocument {
  const sourceUrl = normalizeOfficialUrl(value.match(/^URL Source:\s*(\S+)/mi)?.[1] ?? requestedUrl) ?? requestedUrl
  const rawTitle = (value.match(/^Title:\s*(.+)$/mi)?.[1] ?? new URL(sourceUrl).hostname)
    .replace(/\s*[-_|]\s*仰恩大学.*$/u, '')
    .trim()
    .slice(0, 300)
  const marker = value.search(/^Markdown Content:\s*$/mi)
  const markdown = marker >= 0 ? value.slice(marker).replace(/^Markdown Content:\s*$/mi, '') : value
  const text = isolateArticleText(cleanMarkdown(markdown), rawTitle, sourceUrl)
  if (text.length < 80) throw new Error('page did not contain enough readable text')
  const kind = documentKind(sourceUrl)
  const title = kind.kind === 'webpage'
    ? rawTitle
    : meaningfulAttachmentTitle(rawTitle, text, sourceUrl)
  return {
    url: sourceUrl,
    title: title || '仰恩大学官方资料',
    text,
    publishedAt: parsePublishedAt(value, sourceUrl),
    links: markdownLinks(markdown, sourceUrl),
    extractionMethod: 'jina',
    ...kind
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
  const links = discoverOfficialHtmlLinks(value, sourceUrl)

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
  let bestLength = -1
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
  let text = cleanDirectText(readable.text())
  const attachmentLinks = links.filter(item => isAttachmentUrl(item.url))
  const attachmentLandingPage = text.length < 80 && attachmentLinks.length > 0
  if (attachmentLandingPage) {
    const attachmentNames = attachmentLinks
      .map(item => item.label || attachmentFileTitle(item.url))
      .filter(Boolean)
      .join('；')
    text = `${title}\n本页正文由仰恩大学官网附件展示。附件：${attachmentNames}`.trim()
  }
  if (text.length < 80 && !attachmentLandingPage) {
    throw new Error('official page did not contain enough readable text')
  }

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
    extractionMethod: 'direct-html',
    attachmentLandingPage
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
    extractionMethod: document.extractionMethod,
    pageCount: document.pageCount ?? null,
    extractedCharacters: document.text.length,
    attachmentLandingPage: document.attachmentLandingPage ?? false
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

/**
 * 生产库同时被线上进程写，WAL 下读快照升级写会直接抛 SQLITE_BUSY_SNAPSHOT，
 * busy_timeout 拦不住。这里统一用 IMMEDIATE 事务（开事务就拿写锁）并带重试。
 */
function busyTx<T>(client: DatabaseClient, run: () => T): T {
  const attempt = (left: number): T => {
    try {
      return client.sqlite.transaction(run).immediate()
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      if (left > 0 && code.startsWith('SQLITE_BUSY')) {
        const wait = 250 * (5 - left)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
        return attempt(left - 1)
      }
      throw error
    }
  }
  return attempt(5)
}

function claimNextCrawlItem(client: DatabaseClient, now: number): OfficialCrawlQueueItem | null {
  return busyTx(client, () => {
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
  })
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

/** 抓取期间只碰副本的两张表；合并回生产库时按主键覆盖。 */
// sources 必须先合并：knowledge_documents.source_id 指着它，否则合并时外键报错。
// sources 用 OR IGNORE：REPLACE 会先删再插，级联把引用它的文档一起删掉。
const CRAWL_MERGE_TABLES = [
  { table: 'sources', verb: 'INSERT OR IGNORE' },
  { table: 'knowledge_documents', verb: 'INSERT OR REPLACE' },
  { table: 'knowledge_crawl_queue', verb: 'INSERT OR REPLACE' }
] as const

export interface CrawlWorkspace {
  /** 真正跑抓取用的库路径（副本；`:memory:` 时就是原路径）。 */
  workPath: string
  /** 合并目标；`:memory:` 或显式禁用副本时为 null。 */
  livePath: string | null
}

/**
 * 抓取会连续写几十分钟，直接写生产库会把公开接口堵在 SQLITE_BUSY 上
 * （实测 /map 30 秒、公告 500）。改成：先 VACUUM INTO 一份副本，抓取全程只写副本，
 * 结束后用一个短事务把两张表按主键合并回生产库。副本创建只读几十秒，不阻塞写入。
 */
function pruneStaleCrawlCopies(livePath: string): void {
  const directory = dirname(livePath)
  const prefix = `${basename(livePath)}.crawl-`
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue
    const pid = Number(name.slice(prefix.length).split('-')[0])
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0)
        continue
      } catch {
        // 进程不在了：这份副本可以删。
      }
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        rmSync(`${directory}/${name}${suffix}`, { force: true })
      } catch {
        // 删不掉就留着，下一次再试。
      }
    }
  }
}

export function prepareCrawlWorkspace(databasePath: string): CrawlWorkspace {
  const livePath = resolveDatabasePath(databasePath)
  if (livePath === ':memory:' || process.env.YEU_CRAWL_SKIP_COPY === '1') {
    return { workPath: livePath, livePath: null }
  }
  // 副本要跟库一样大，磁盘不够时宁可退回直写（旧行为），也别让抓取崩在 ENOSPC 上。
  const dbBytes = statSync(livePath).size
  const freeBytes = statfsSync(dirname(livePath)).bavail * statfsSync(dirname(livePath)).bsize
  if (freeBytes < dbBytes * 1.4) {
    process.stderr.write(`Not enough free space for crawl copy (${freeBytes} < ${dbBytes * 1.4}); writing live db
`)
    return { workPath: livePath, livePath: null }
  }
  // 上一次抓取被 kill 时会留下 1.4 GB 的副本；开跑前先清掉没人用的，避免把盘吃光。
  pruneStaleCrawlCopies(livePath)
  const workPath = `${livePath}.crawl-${process.pid}-${Date.now()}.sqlite`
  const source = getDatabase(livePath)
  source.sqlite.prepare('VACUUM INTO ?').run(workPath)
  closeDatabase(livePath)
  return { workPath, livePath }
}

export function mergeCrawlWorkspace(workspace: CrawlWorkspace): void {
  const { livePath, workPath } = workspace
  if (!livePath) return
  const live = getDatabase(livePath)
  const quoted = workPath.replace(/'/gu, '\'\'')
  live.sqlite.exec(`ATTACH DATABASE '${quoted}' AS crawl_work`)
  try {
    live.sqlite.transaction(() => {
      for (const { table, verb } of CRAWL_MERGE_TABLES) {
        live.sqlite.exec(`${verb} INTO main.${table} SELECT * FROM crawl_work.${table}`)
      }
    })()
  } finally {
    live.sqlite.exec('DETACH DATABASE crawl_work')
  }
  closeDatabase(livePath)
}

export function disposeCrawlWorkspace(workspace: CrawlWorkspace): void {
  if (!workspace.livePath) return
  closeDatabase(workspace.workPath)
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(`${workspace.workPath}${suffix}`, { force: true })
    } catch {
      // 副本删不掉不影响本次抓取结果。
    }
  }
}

export async function crawlOfficialKnowledge(options: OfficialCrawlOptions): Promise<OfficialCrawlReport> {
  const ocrConfig = options.ocr === false ? null : imageOcrConfigFromEnv()
  // 主站通知栏目只对校园网出口开放；配了中继就走中继，没配就直连（被挡的页面会记失败）。
  if (hasFetchRelay()) console.log('抓取出口：中继（CRAWL_FETCH_PROXY）')
  let failed = false
  let skippedDispose = false
  const startedAt = new Date()
  const workspace = prepareCrawlWorkspace(options.databasePath)
  const client = getDatabase(workspace.workPath)
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
  if (options.fresh) {
    client.sqlite.prepare(`
      UPDATE knowledge_crawl_queue
      SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = '', updated_at = ?
      WHERE status = 'failed' AND last_error = 'fetch failed'
    `).run(startedAt.getTime())
  }
  for (const item of seedItems) enqueueCrawlItem(client, item, startedAt.getTime())
  refreshPendingPriorities(client)
  if (seedItems.length > 0) {
    const prioritizeSeed = client.sqlite.prepare(`
      UPDATE knowledge_crawl_queue
      SET priority = max(priority, ${EXPLICIT_SEED_PRIORITY}), next_attempt_at = NULL, updated_at = ?
      WHERE url = ?
    `)
    client.sqlite.transaction(() => {
      for (const item of seedItems) prioritizeSeed.run(startedAt.getTime(), item.url)
    })()
  }
  const report: OfficialCrawlReport = {
    databasePath: workspace.livePath ?? client.path,
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
        } else if (/\.(?:docx|xlsx)$/i.test(new URL(item.url).pathname)) {
          try {
            const bytes = await fetchOfficeBytes(item.url, options.fresh, item.discoveredFrom)
            document = parseOfficialOpenXml(bytes, item.url, item.label)
          } catch (directOfficeError) {
            try {
              const raw = await fetchReader(item.url, options.fresh)
              document = parseReaderDocument(raw, item.url)
            } catch {
              throw directOfficeError
            }
          }
        } else if (/\.(?:doc|xls)$/i.test(new URL(item.url).pathname)) {
          try {
            const bytes = await fetchLegacyOfficeBytes(item.url, options.fresh, item.discoveredFrom)
            document = await parseOfficialLegacyOffice(bytes, item.url, item.label)
          } catch (directOfficeError) {
            try {
              const raw = await fetchReader(item.url, options.fresh)
              document = parseReaderDocument(raw, item.url)
            } catch {
              throw directOfficeError
            }
          }
        } else if (documentKind(item.url).kind === 'webpage') {
          try {
            const html = await fetchOfficialHtml(item.url, options.fresh)
            document = parseOfficialHtml(html, item.url)
            // 正文做成图片的通知只有一句引导语，交给视觉模型补一次转写。
            if (options.ocr && ocrConfig && document.text.length < OCR_MIN_TEXT) {
              const images = candidateImageUrls(html, document.url, 2)
              if (images.length > 0) {
                const { text } = await ocrImageUrls(images, ocrConfig, { maxImages: 2 })
                if (text) document = { ...document, text: `${document.text}

【图片文字】
${text}` }
              }
            }
          } catch (directHtmlError) {
            // 4xx 是站点权限或路径问题，reader 也救不回来，别再白等一轮 65 秒超时。
            const directMessage = directHtmlError instanceof Error ? directHtmlError.message : String(directHtmlError)
            if (/HTTP 4\d{2}/u.test(directMessage)) throw directHtmlError
            try {
              const raw = await fetchReader(item.url, options.fresh)
              document = parseReaderDocument(raw, item.url)
            } catch (readerError) {
              const directMessage = directHtmlError instanceof Error ? directHtmlError.message : String(directHtmlError)
              const readerMessage = readerError instanceof Error ? readerError.message : String(readerError)
              throw new Error(
                `direct HTML failed: ${directMessage}; reader fallback failed: ${readerMessage}`,
                { cause: readerError }
              )
            }
          }
        } else {
          const raw = await fetchReader(item.url, options.fresh)
          document = parseReaderDocument(raw, item.url)
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
    if (!options.dryRun && options.compile) {
      const compiled = compileOfficialKnowledgeDocuments(client)
      process.stderr.write(
        `Compiled official knowledge: ${compiled.documents} documents; `
        + `${compiled.claimsInserted} inserted; ${compiled.claimsUpdated} updated; `
        + `${compiled.claimsRemoved} removed\n`
      )
    }
  } catch (error) {
    failed = true
    throw error
  } finally {
    report.discovered = (client.sqlite.prepare('SELECT count(1) AS value FROM knowledge_crawl_queue').get() as { value: number }).value
    report.finishedAt = new Date().toISOString()
    closeDatabase(workspace.workPath)
    if (!options.dryRun && !failed) {
      // 抓取全程没碰生产库，这里一次性短事务合并；失败时保留副本现场供排查。
      try {
        mergeCrawlWorkspace(workspace)
      } catch (error) {
        report.mergeError = error instanceof Error ? error.message : String(error)
        process.stderr.write(`Merge crawl results failed: ${report.mergeError}
${workspace.workPath}
`)
        skippedDispose = true
      }
    }
    if (!skippedDispose) disposeCrawlWorkspace(workspace)
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
    dryRun: false,
    compile: true,
    ocr: true
  }
  const explicitSeeds: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (argument === '--fresh') options.fresh = true
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--no-compile') options.compile = false
    else if (argument === '--no-ocr') options.ocr = false
    else if (argument === '--database' && value) {
      options.databasePath = value
      index += 1
    } else if (argument === '--seed' && value) {
      explicitSeeds.push(value)
      index += 1
    } else if (argument === '--seeds-file' && value) {
      const parsed = JSON.parse(readFileSync(value, 'utf8')) as Array<{ url?: string } | string>
      for (const entry of parsed) {
        const url = typeof entry === 'string' ? entry : entry.url
        if (url) explicitSeeds.push(url)
      }
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
