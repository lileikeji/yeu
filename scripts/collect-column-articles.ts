/**
 * 从开放栏目列表页里抽出文章链接，供 crawl-official-knowledge.ts 当 seed 用。
 *
 * 列表页本身没有正文，抓取器会判为失败；先在这一步把条目链接和日期拿出来，
 * 再让抓取器逐篇抓正文。
 *
 *   npx tsx scripts/collect-column-articles.ts --columns open-columns.json --json articles.json
 */
import { readFileSync, writeFileSync } from 'node:fs'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const ANCHOR_RE = /<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/giu
const DATE_RE = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/u
const ARTICLE_HINT = /\/\d{4}\/\d{4}\/|\/page\.htm|\/info\/\d+\/\d+\.htm|\/c\d+a\d+\//

interface ColumnEntry {
  host: string
  url: string
}

interface ArticleLink {
  url: string
  title: string
  publishedAt: number | null
  column: string
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`
  const inline = process.argv.find(argument => argument.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim()
}

function parseDate(value: string): number | null {
  const match = value.match(DATE_RE)
  if (!match) return null
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 4, 0, 0)
  return Number.isFinite(stamp) ? stamp : null
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, 'accept': 'text/html,application/xhtml+xml' }
    })
    return response.ok ? await response.text() : ''
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

function extractArticles(column: ColumnEntry, html: string): ArticleLink[] {
  const found: ArticleLink[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(ANCHOR_RE)) {
    const rawHref = match[1]!
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript')) continue
    let url: URL
    try {
      url = new URL(rawHref, column.url)
    } catch {
      continue
    }
    if (!url.hostname.endsWith('.yeu.edu.cn')) continue
    if (!ARTICLE_HINT.test(url.pathname)) continue
    const title = textOf(match[2] ?? '')
    if (title.length < 8 || title.length > 90) continue
    if (/^(返回|更多|首页|上一篇|下一篇)/u.test(title)) continue
    const tail = html.slice(match.index ?? 0, (match.index ?? 0) + 400)
    const publishedAt = parseDate(tail)
    const key = url.href
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ url: key, title, publishedAt, column: column.url })
  }
  return found
}

/** 列表页翻页：WCM 的 list.htm / list2.htm / list3.htm，另有 list.psp?page=N。 */
function nextPageUrls(column: ColumnEntry, html: string, page: number): string[] {
  const urls: string[] = []
  if (/\/list\.(?:htm|psp)/u.test(column.url)) {
    urls.push(column.url.replace(/\/list(\d*)\.(htm|psp)/u, `/list${page}.$2`))
  }
  for (const match of html.matchAll(ANCHOR_RE)) {
    const label = textOf(match[2] ?? '')
    if (!/^(下一页|下页|后一页|>|»)$/u.test(label)) continue
    try {
      const url = new URL(match[1]!, column.url)
      if (!url.hostname.endsWith('.yeu.edu.cn')) continue
      if (!/list\d*\.(htm|psp)$/u.test(url.pathname)) continue
      urls.push(url.href)
    } catch {
      continue
    }
  }
  return urls
}

async function main(): Promise<void> {
  const columnsPath = argValue('columns')
  if (!columnsPath) throw new Error('缺少 --columns')
  const pages = Math.max(1, Number(argValue('pages') ?? '1'))
  const since = Date.parse(argValue('since') ?? '2000-01-01T00:00:00Z')
  const columns = JSON.parse(readFileSync(columnsPath, 'utf8')) as ColumnEntry[]
  const articles: ArticleLink[] = []
  const seen = new Set<string>()
  for (const column of columns) {
    const queue = [column.url]
    const visited = new Set<string>()
    while (queue.length && visited.size < pages) {
      const pageUrl = queue.shift()!
      if (visited.has(pageUrl)) continue
      visited.add(pageUrl)
      const html = await fetchText(pageUrl)
      if (!html) continue
      for (const article of extractArticles(column, html)) {
        if (seen.has(article.url)) continue
        seen.add(article.url)
        articles.push(article)
      }
      for (const next of nextPageUrls(column, html, visited.size + 1)) {
        if (!visited.has(next)) queue.push(next)
      }
    }
  }
  articles.sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0))
  const recent = articles.filter(article => (article.publishedAt ?? 0) >= since)
  const kept = recent.filter(article => article.publishedAt !== null)
  console.log(`栏目 ${columns.length} 个，抽出文章 ${articles.length} 篇（带日期 ${articles.filter(a => a.publishedAt !== null).length}，${new Date(since).toISOString().slice(0, 10)} 之后 ${kept.length}）`)
  for (const article of articles.slice(0, 8)) {
    const day = article.publishedAt ? new Date(article.publishedAt).toISOString().slice(0, 10) : '----'
    console.log(`   ${day} ${article.title.slice(0, 40)} ${article.url}`)
  }
  const outPath = argValue('json')
  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(articles, null, 2)}\n`, 'utf8')
    console.log(`已写入 ${outPath}`)
  }
}

await main()
