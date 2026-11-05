/**
 * 给开放栏目排序：哪些栏目在持续更新、而且发的是通知而不是新闻。
 *
 * 抓取面铺开之后，真正决定榜单质量的是「哪些栏目值得多翻几页」。这里按列表页
 * 最近 180 天的条目数与通知类标题占比打分，输出可直接喂给 collect-column-articles
 * 的优先顺序。
 *
 *   npx tsx scripts/score-columns.ts --input /tmp/open-columns.json --json /tmp/columns-ranked.json
 */
import { readFileSync, writeFileSync } from 'node:fs'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const ANCHOR_RE = /<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/giu
const HREF_DATE_RE = /\/(20\d{2})\/(\d{2})(\d{2})\//
const TEXT_DATE_RE = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/u
const NOTICE_RE = /通知|公告|公示|名单|安排|须知|报名|申请|办理|提醒|预告|征集|招募|选聘|方案|办法|规定|细则|评审|认定|登记/u
const NOISE_RE = /科研|课题|基金|专利|申报|招标|采购|征文|教改|遴选|科技奖|产学研|科技特派员/u

interface OpenColumn { host: string, url: string, entries: number, open: boolean }

function arg(name: string): string | null {
  const prefix = `--${name}=`
  const inline = process.argv.find(item => item.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.text()
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function publishedAtOf(href: string, text: string): number {
  const byHref = HREF_DATE_RE.exec(href)
  if (byHref) return Date.parse(`${byHref[1]}-${byHref[2]}-${byHref[3]}T00:00:00+08:00`)
  const byText = TEXT_DATE_RE.exec(text)
  if (byText) return Date.parse(`${byText[1]}-${String(byText[2]).padStart(2, '0')}-${String(byText[3]).padStart(2, '0')}T00:00:00+08:00`)
  return Number.NaN
}

async function main(): Promise<void> {
  const inputPath = arg('input')
  if (!inputPath) throw new Error('缺少 --input')
  const columns = JSON.parse(readFileSync(inputPath, 'utf8')) as OpenColumn[]
  const cutoff = Date.now() - 180 * 86_400_000
  const ranked: Array<{ url: string, host: string, recent: number, notices: number, noise: number, latest: string, score: number }> = []

  for (const column of columns) {
    try {
      const html = await fetchText(column.url)
      let recent = 0
      let notices = 0
      let noise = 0
      let latest = 0
      for (const match of html.matchAll(ANCHOR_RE)) {
        const href = match[1] ?? ''
        if (!/\/page\.htm|\/info\/|\.htm$/u.test(href)) continue
        const text = stripTags(match[2] ?? '')
        if (text.length < 6) continue
        const publishedAt = publishedAtOf(href, text)
        if (!Number.isFinite(publishedAt)) continue
        latest = Math.max(latest, publishedAt)
        if (publishedAt < cutoff) continue
        recent += 1
        if (NOTICE_RE.test(text)) notices += 1
        if (NOISE_RE.test(text)) noise += 1
      }
      const useful = Math.max(0, notices - noise)
      const score = useful * 3 + recent
      ranked.push({
        url: column.url,
        host: column.host,
        recent,
        notices,
        noise,
        latest: latest ? new Date(latest).toISOString().slice(0, 10) : '',
        score
      })
    } catch {
      // 探测失败就跳过，不阻塞排序。
    }
  }

  ranked.sort((left, right) => right.score - left.score)
  const outputPath = arg('json')
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(ranked, null, 2)}\n`, 'utf8')
  for (const row of ranked.slice(0, 15)) {
    console.log(`${String(row.score).padStart(4)}  近半年 ${String(row.recent).padStart(3)} 条 通知 ${String(row.notices).padStart(3)} 噪声 ${String(row.noise).padStart(2)}  最新 ${row.latest}  ${row.url}`)
  }
  console.log(`\n共 ${ranked.length} 个栏目完成评分`)
}

await main()
