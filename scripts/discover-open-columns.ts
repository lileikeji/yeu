/**
 * 找出对公网开放的栏目列表页。
 *
 * 学校主站的 tzgg/list.psp 对机房 IP 返回「No Permission」，但部分二级站点的栏目没有这层限制
 * （2026-11 实测 bgs.yeu.edu.cn/_t25/tzgg/list.htm 可以正常取到）。这个脚本按站点首页的导航
 * 链接去找候选列表页，逐个探测，只留下真能取到条目的那些，再交给 crawl-official-knowledge.ts
 * 当 seed 用。
 *
 *   npx tsx scripts/discover-open-columns.ts [--host xsb] [--json out.json]
 */
import { writeFileSync } from 'node:fs'

const HOSTS = [
  'xsb', 'jwb', 'bgs', 'youth', 'library', 'keyanchu', 'zhaosheng', 'xsc', 'tw',
  'rwxy', 'glxy', 'fxy', 'kjxy', 'computer', 'marx', 'wgyxy', 'sxy', 'jyxy',
  'tyxy', 'ysxy', 'ggkj', 'jxjy', 'gjjl', 'jcc', 'rsc'
]
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const COLUMN_LINK = /href="([^"]*(?:\/|^)(?:_t\d+\/)?[a-z0-9]{2,12}\/list\.(?:htm|psp)[^"]*)"/giu
const COMMON_COLUMNS = ['tzgg', 'xwgg', 'xwdt', 'xwzx', 'notice', 'gg', 'tz', 'news']
const DATE_HINT = /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}|20\d{2}\/\d{2}\/\d{2}/u

interface ProbeResult {
  host: string
  url: string
  status: number
  bytes: number
  entries: number
  open: boolean
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`
  const inline = process.argv.find(argument => argument.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<{ status: number, body: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, 'accept': 'text/html,application/xhtml+xml' }
    })
    return { status: response.status, body: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

function candidateColumns(host: string, home: string): string[] {
  const base = `https://${host}.yeu.edu.cn/`
  const urls = new Set<string>()
  for (const match of home.matchAll(COLUMN_LINK)) {
    try {
      const resolved = new URL(match[1]!, base).href
      urls.add(resolved)
    } catch {
      continue
    }
  }
  for (const column of COMMON_COLUMNS) urls.add(new URL(`/${column}/list.htm`, base).href)
  for (const tree of [2, 3, 25, 26, 27]) {
    for (const column of COMMON_COLUMNS.slice(0, 4)) urls.add(new URL(`/_t${tree}/${column}/list.htm`, base).href)
  }
  return [...urls]
}

async function probe(host: string, url: string): Promise<ProbeResult | null> {
  let result: { status: number, body: string }
  try {
    result = await fetchText(url)
  } catch {
    return null
  }
  const blocked = /No Permission|无权访问/u.test(result.body)
  const entries = result.body.split('list.htm').length - 1
  const dated = (result.body.match(new RegExp(DATE_HINT.source, 'gu')) ?? []).length
  const open = result.status === 200 && !blocked && entries >= 2 && dated >= 2
  return { host, url, status: result.status, bytes: result.body.length, entries, open }
}

async function main(): Promise<void> {
  const only = argValue('host')
  const hosts = only ? [only] : HOSTS
  const found: ProbeResult[] = []
  for (const host of hosts) {
    let home: string
    try {
      home = (await fetchText(`https://${host}.yeu.edu.cn/`)).body
    } catch {
      console.log(`# ${host}: 首页不可达`)
      continue
    }
    const candidates = candidateColumns(host, home).slice(0, 40)
    const results: ProbeResult[] = []
    for (let index = 0; index < candidates.length; index += 6) {
      const batch = candidates.slice(index, index + 6)
      const settled = await Promise.all(batch.map(url => probe(host, url)))
      for (const result of settled) if (result?.open) results.push(result)
    }
    const unique = results.filter((item, index) => results.findIndex(other => other.url === item.url) === index)
    found.push(...unique)
    console.log(`# ${host}: ${unique.length} 个开放栏目`)
    for (const item of unique.slice(0, 6)) console.log(`   ${item.entries} 条 ${item.url}`)
  }
  const open = found.filter((item, index) => found.findIndex(other => other.url === item.url) === index)
  console.log(`\n合计 ${open.length} 个开放列表页`)
  const jsonPath = argValue('json')
  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify(open, null, 2)}\n`, 'utf8')
    console.log(`已写入 ${jsonPath}`)
  }
}

await main()
