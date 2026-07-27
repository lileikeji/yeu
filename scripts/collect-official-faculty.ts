import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const USER_AGENT = 'YEU-Freshman-Guide-faculty-audit/0.1 (passive public-source review)'
const FETCH_TIMEOUT_MS = 10_000
const PROFILE_LIMIT = 1_400

export interface OfficialFacultySource {
  college: string
  url: string
  direct?: boolean
}

export interface OfficialFacultyProfile {
  id: string
  name: string
  college: string
  unit: string
  position: string
  profile: string
  sourceUrl: string
  sourceTitle: string
  retrievedAt: string
}

export const officialFacultySources: OfficialFacultySource[] = [
  { college: '经济学院', url: 'https://jjxy.yeu.edu.cn/szjj/list.htm' },
  { college: '管理学院', url: 'https://glxy.yeu.edu.cn/szjj/list.htm' },
  { college: '会计学院', url: 'https://kjxy.yeu.edu.cn/szjj/list.htm' },
  { college: '工程技术学院', url: 'https://computer.yeu.edu.cn/szjj/list.htm' },
  { college: '人文学院', url: 'https://rwxy.yeu.edu.cn/szjj/list.htm' },
  { college: '外国语学院', url: 'https://sofl.yeu.edu.cn/szjj/list.htm' },
  { college: '法学院', url: 'https://fxy.yeu.edu.cn/szjj/list.htm', direct: true },
  { college: '艺术与教育学院', url: 'https://art.yeu.edu.cn/szjj/list.htm' },
  { college: '人工智能学院', url: 'https://ai.yeu.edu.cn/szjj/list.htm' },
  { college: '电气工程及其自动化学院', url: 'https://dqgc.yeu.edu.cn/szjj/list.htm' },
  { college: '马克思主义学院', url: 'https://marx.yeu.edu.cn/szjj/list.htm', direct: true },
  { college: '体育教研部', url: 'https://tiyu.yeu.edu.cn/szll/list.htm', direct: true },
  {
    college: '心理健康咨询中心',
    url: 'https://xl.yeu.edu.cn/2022/1201/c1019a34131/page.htm',
    direct: true
  }
]

interface PageDocument {
  url: string
  title: string
  text: string
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '\'')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
}

function plainText(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function articleTitle(html: string): string {
  const article = html.match(/<h1[^>]*class=["'][^"']*(?:arti_title|article-title)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
    ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return plainText(article?.[1] ?? '').replace(/[-_]\s*仰恩大学.*$/u, '').trim()
}

function articleText(html: string): string {
  const marker = /<div[^>]+class=["'][^"']*wp_articlecontent[^"']*["'][^>]*>/i.exec(html)
  if (!marker?.index) return plainText(html)
  const start = marker.index + marker[0].length
  const footer = html.indexOf('<!--End||content-->', start)
  return plainText(html.slice(start, footer >= 0 ? footer : undefined))
}

function absoluteOfficialUrl(value: string, base: string): string | null {
  try {
    const url = new URL(decodeHtml(value), base)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.hostname !== 'yeu.edu.cn' && !url.hostname.endsWith('.yeu.edu.cn')) return null
    url.protocol = 'https:'
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
        'user-agent': USER_AGENT
      }
    })
    if (response.ok) return response.text()
  } catch {
    // The official sub-sites intermittently rate-limit public readers.
  }
  const fallback = await fetchReader(url, 'html')
  if (!fallback.ok) throw new Error(`${url} and its read-only fallback returned HTTP ${fallback.status}`)
  return fallback.text()
}

async function fetchWithRetry(url: string, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 1; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`${url} could not be fetched`, { cause: lastError })
}

function readerUrl(value: string): string {
  const url = new URL(value)
  return `https://r.jina.ai/http://${url.host}${url.pathname}${url.search}`
}

function fetchReader(url: string, format: 'html' | 'markdown'): Promise<Response> {
  return fetch(readerUrl(url), {
    headers: {
      'user-agent': USER_AGENT,
      'x-return-format': format,
      'x-timeout': '55'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000)
  })
}

function profileLinks(html: string, base: string): string[] {
  return [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map(match => absoluteOfficialUrl(match[1] ?? '', base))
    .filter((url): url is string => Boolean(url && /\/\d{4}\/\d{4}\/c\d+a\d+\/page\.(?:htm|psp)$/i.test(url)))
    .filter((url, index, items) => items.indexOf(url) === index)
}

function embeddedPdfLinks(html: string, base: string): string[] {
  const values = [
    ...[...html.matchAll(/\bpdfsrc=["']([^"']+\.pdf)["']/gi)].map(match => match[1]),
    ...[...html.matchAll(/\bhref=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map(match => match[1]),
    ...[...html.matchAll(/[?&]file=([^"'&]+\.pdf)/gi)].map(match => match[1])
  ]
  return values
    .map(value => absoluteOfficialUrl(value ?? '', base))
    .filter((url): url is string => Boolean(url))
    .filter((url, index, items) => items.indexOf(url) === index)
}

async function pdfText(url: string): Promise<string> {
  let response: Response | null = null
  try {
    const direct = await fetchWithRetry(url, {
      headers: { 'user-agent': USER_AGENT }
    })
    if (direct.ok) response = direct
  } catch {
    // Fall through to the public read-only parser.
  }
  if (!response) {
    const fallback = await fetchReader(url, 'markdown')
    if (!fallback.ok) throw new Error(`${url} and its read-only fallback returned HTTP ${fallback.status}`)
    return fallback.text()
  }
  const directory = mkdtempSync(join(tmpdir(), 'yeu-faculty-pdf-'))
  const pdfPath = join(directory, basename(new URL(url).pathname) || 'faculty.pdf')
  try {
    writeFileSync(pdfPath, Buffer.from(await response.arrayBuffer()))
    return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

async function pageDocument(url: string): Promise<PageDocument> {
  const html = await fetchText(url)
  const pdfs = embeddedPdfLinks(html, url)
  const settledTexts = await Promise.allSettled(pdfs.map(pdfText))
  const texts = settledTexts.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [result.value]
    process.stderr.write(
      `Skipping unavailable faculty PDF ${pdfs[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}\n`
    )
    return []
  })
  const fallback = articleText(html)
  return {
    url,
    title: articleTitle(html),
    text: [...texts, fallback].filter(value => value.trim()).join('\n\n')
  }
}

function normalizedLines(text: string): string[] {
  return text
    .replace(/\f/g, '\n')
    .replace(/[–—_]{8,}/g, '\n')
    .replace(/(?=\d{1,2}[.、]\s*[\u3400-\u9fff]{2,4}[，,])/gu, '\n')
    .replace(/\s+(姓名\s*[：:])/gu, '\n$1')
    .replace(
      /(?<=[。；])\s*(?=(?:[\u3400-\u9fff]{2,4}|[\u3400-\u9fff]\s+[\u3400-\u9fff])\s+(?:男|女)\s+(?:副教授|教授|教\s+授|副研究员|研究员|讲师|讲\s+师|助教|助\s+教))/gu,
      '\n'
    )
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line
      .replace(/^(?:#{1,6}|[>*+-])\s+/u, '')
      .replace(/教\s+授/gu, '教授')
      .replace(/讲\s+师/gu, '讲师')
      .replace(/助\s+教/gu, '助教')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
}

const POSITION_PATTERN = /副教授|教授|副研究员|研究员|助理研究员|讲师|助教|实验师|高级工程师|工程师|专任教师|教师|辅导员|咨询师|副主任|主任|副院长|院长|副书记|书记|秘书/u
const TEACHING_PROFILE_PATTERN = /(?:专任教师|主讲|高校教学经验|任教)/u
const NAME_PATTERN = /^[·\u3400-\u9fff]{2,4}$/u
const HEADING_DETAIL_PATTERN = /^(?:男|女)?[\s，,、]*(?:(?:法学|管理学|文学|工学|理学|教育学)?(?:副教授|教授|副研究员|研究员|助理研究员|讲师|助教|实验师|高级工程师|工程师|专任教师|教师|辅导员|咨询师)|博士|硕士|研究生|本科)/u
const INVALID_NAME_PATTERN = /(?:学院|大学|学校|中心|项目|成果|获奖|奖项|比赛|论文|期刊|工作|经历|专业|学系|系主任|研究所|研究生|学位|书记|教授|讲师|教师|博士|硕士|主任|技师|人才|现任|简介|团队|外语系|英语系|一项|两项|三项|等奖|果奖|人)$/u
const GEOGRAPHIC_NAME_PATTERN = /^(?:北京|天津|上海|重庆|河北|河南|云南|辽宁|黑龙江|湖南|安徽|山东|新疆|江苏|浙江|江西|湖北|广西|甘肃|山西|内蒙古|陕西|吉林|福建|贵州|广东|青海|西藏|四川|宁夏|海南|台湾|香港|澳门)$/u

function validName(value: string): boolean {
  const name = value.trim()
  if (INVALID_NAME_PATTERN.test(name) || GEOGRAPHIC_NAME_PATTERN.test(name)) return false
  return NAME_PATTERN.test(name)
    || /^[A-Za-z][A-Za-z .'-]{2,58}(?:（[\u3400-\u9fff·]{1,8}）)?$/u.test(name)
}

function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+（/gu, '（').replace(/\s+/g, ' ')
}

function cleanName(value: string): string {
  return value
    .replace(/^(?:姓名|教师)\s*/u, '')
    .replace(/^[一二三四五六七八九十\d]+[、.．]\s*/u, '')
    .replace(/[，,：:；;（）()\s].*$/u, '')
    .replace(/[^\u3400-\u9fff·]/gu, '')
    .trim()
}

function headingAt(lines: string[], index: number): { name: string, heading: string } | null {
  const line = lines[index] ?? ''
  const next = lines[index + 1] ?? ''
  const namedInline = line.match(
    /^姓名\s*[：:]?\s*((?:[·\u3400-\u9fff]{2,4})|(?:[A-Za-z][A-Za-z .'-]{2,58}(?:（[\u3400-\u9fff·]{1,8}）)?))(?=\s*$|\s+|[•，,])/u
  )
  if (namedInline?.[1] && validName(namedInline[1])) {
    return { name: namedInline[1], heading: line }
  }

  const labeledInline = line.match(/^姓名\s*([\u3400-\u9fff]{2,4})\s*性别\s*/u)
  if (labeledInline?.[1] && validName(labeledInline[1])) {
    return { name: labeledInline[1], heading: line }
  }

  const named = line.match(/^姓名\s*[：:]?\s*(.{2,64}?)\s*$/u)
  const namedValue = named?.[1]?.trim()
  if (namedValue && validName(namedValue)) {
    return { name: namedValue, heading: `${line} ${next}`.trim() }
  }

  const numbered = line.match(/^\d{1,2}[、.．]\s*([·\u3400-\u9fff]{2,4})[\s，,]+(.{0,220})$/u)
  if (numbered?.[1]
    && validName(numbered[1])
    && POSITION_PATTERN.test(numbered[2] ?? '')) {
    return { name: numbered[1], heading: line }
  }

  const inline = line.match(/^(?:[一二三四五六七八九十\d]+[、.．]\s*)?([·\u3400-\u9fff]{2,4})[\s，,]+(.+)$/u)
  if (inline?.[1]
    && validName(inline[1])
    && (
      HEADING_DETAIL_PATTERN.test(inline[2] ?? '')
      || POSITION_PATTERN.test((inline[2] ?? '').slice(0, 240))
      || TEACHING_PROFILE_PATTERN.test((inline[2] ?? '').slice(0, 240))
    )) {
    return { name: inline[1], heading: line }
  }

  const spacedInline = line.match(/^([\u3400-\u9fff])\s+([\u3400-\u9fff])\s+(.{0,90})$/u)
  const spacedName = `${spacedInline?.[1] ?? ''}${spacedInline?.[2] ?? ''}`
  if (spacedInline?.[3]
    && validName(spacedName)
    && HEADING_DETAIL_PATTERN.test(spacedInline[3])) {
    return { name: spacedName, heading: `${spacedName} ${spacedInline[3]}` }
  }

  const name = cleanName(line)
  if (validName(name)
    && HEADING_DETAIL_PATTERN.test(next)) {
    return { name, heading: `${line} ${next}`.trim() }
  }
  return null
}

function pageUnit(title: string, college: string): string {
  const value = title
    .replace(/\d{4}年.*$/u, '')
    .replace(/师资(?:简介|力量|队伍)|教师(?:简介|风采)|辅导员简介|思政辅导员简介|介绍/gu, '')
    .replace(/[｜|·_\-\s]+$/g, '')
    .trim()
  return value && value !== college ? value : ''
}

function positionFromHeading(heading: string): string {
  const values = [...heading.matchAll(/副教授|教授|副研究员|研究员|助理研究员|讲师|助教|实验师|高级工程师|工程师|专任教师|教师|辅导员|咨询师|副主任|主任|副院长|院长|副书记|书记|秘书/gu)]
    .map(match => match[0])
  return [...new Set(values)].slice(0, 4).join('、')
}

function professionalProfile(value: string, name: string): string {
  return value
    .replace(new RegExp(`^姓名?\\s*${name}\\s*`, 'u'), '')
    .replace(new RegExp(`^${name}[\\s，,]+`, 'u'), '')
    .replace(/(?:男|女)[，,\s、]*/u, '')
    .replace(/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日出生[，,；;。\s]*/gu, '')
    .replace(/(?:[\u3400-\u9fff]{2,8}(?:省|市|县|区)?人)[，,；;。\s]*/gu, '')
    .replace(/(?:中国\s*共产党|中国\s*共产|中\s*共|共\s*青团|群众|农工党|致公党)\s*(?:预备)?党员[，,；;。\s]*/gu, '')
    .replace(/(?:中国民主同盟|民盟)盟员[，,；;。\s]*/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/([。；，])\1+/g, '$1')
    .trim()
    .slice(0, PROFILE_LIMIT)
}

function stableId(value: string): string {
  let hash = 2166136261
  for (const character of value.normalize('NFKC')) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function parseFacultyDocument(
  document: PageDocument,
  college: string,
  retrievedAt: string
): OfficialFacultyProfile[] {
  const lines = normalizedLines(document.text)
  const headings = lines
    .map((_, index) => ({ index, value: headingAt(lines, index) }))
    .filter((item): item is { index: number, value: { name: string, heading: string } } => Boolean(item.value))

  return headings.map((item, headingIndex) => {
    const nextIndex = headings[headingIndex + 1]?.index ?? lines.length
    const segment = lines.slice(item.index, nextIndex).join(' ')
    const unit = pageUnit(document.title, college)
    const position = positionFromHeading(item.value.heading)
      || (TEACHING_PROFILE_PATTERN.test(segment) ? '教师' : '')
    const name = normalizePersonName(item.value.name)
    return {
      id: `faculty-${stableId(`${name}|${college}`)}`,
      name,
      college,
      unit,
      position,
      profile: professionalProfile(segment, name),
      sourceUrl: document.url,
      sourceTitle: document.title || `${college}师资简介`,
      retrievedAt
    }
  }).filter(profile => (
    profile.name.length >= 2
    && profile.profile.length >= 12
    && (profile.position || POSITION_PATTERN.test(profile.profile))
  ))
}

function mergeProfiles(items: OfficialFacultyProfile[]): OfficialFacultyProfile[] {
  const profiles = new Map<string, OfficialFacultyProfile>()
  for (const item of items) {
    if (!validName(item.name) || item.profile.length < 12) continue
    const key = `${item.name}|${item.college}`
    const existing = profiles.get(key)
    if (!existing) {
      profiles.set(key, item)
      continue
    }
    const preferred = existing.profile.length >= item.profile.length ? existing : item
    profiles.set(key, {
      ...preferred,
      unit: [...new Set([existing.unit, item.unit].filter(Boolean))].join('、'),
      position: [...new Set([existing.position, item.position].filter(Boolean))].join('、'),
      profile: preferred.profile
    })
  }
  return [...profiles.values()].sort((left, right) => (
    left.college.localeCompare(right.college, 'zh-CN')
    || left.name.localeCompare(right.name, 'zh-CN')
  ))
}

export function retainVerifiedFacultySnapshot(
  collected: OfficialFacultyProfile[],
  previous: OfficialFacultyProfile[]
): { profiles: OfficialFacultyProfile[], retained: number } {
  const collectedNames = new Set(collected.map(profile => profile.name))
  const retained = previous.filter(profile => !collectedNames.has(profile.name))
  return {
    profiles: mergeProfiles([...collected, ...previous]),
    retained: retained.length
  }
}

export async function collectOfficialFaculty(
  sources: OfficialFacultySource[] = officialFacultySources,
  retrievedAt = new Date().toISOString().slice(0, 10),
  fallbackProfiles: OfficialFacultyProfile[] = []
): Promise<OfficialFacultyProfile[]> {
  const profiles: OfficialFacultyProfile[] = []
  for (let index = 0; index < sources.length; index += 2) {
    const batch = sources.slice(index, index + 2)
    const results = await Promise.all(batch.map(async (source) => {
      try {
        const html = await fetchText(source.url)
        const urls = source.direct ? [source.url] : profileLinks(html, source.url)
        const documents = await Promise.all((urls.length ? urls : [source.url]).map(pageDocument))
        const collected = documents.flatMap(document => parseFacultyDocument(document, source.college, retrievedAt))
        const fallback = fallbackProfiles.filter(profile => profile.college === source.college)
        const snapshot = retainVerifiedFacultySnapshot(collected, fallback)
        if (snapshot.retained > 0) {
          process.stderr.write(
            `Collected ${collected.length} ${source.college} profiles and retained ${snapshot.retained} missing profiles from the previous verified snapshot\n`
          )
          return snapshot.profiles
        }
        process.stderr.write(`Collected ${collected.length} ${source.college} profiles\n`)
        return snapshot.profiles
      } catch (error) {
        const fallback = fallbackProfiles.filter(profile => profile.college === source.college)
        if (fallback.length === 0) throw error
        process.stderr.write(`Using ${fallback.length} existing ${source.college} profiles: ${error instanceof Error ? error.message : String(error)}\n`)
        return fallback
      }
    }))
    profiles.push(...results.flat())
  }
  return mergeProfiles(profiles)
}

export function parseFacultyDataModule(value: string): OfficialFacultyProfile[] {
  const marker = 'export const facultyProfiles: FacultyProfile[] = '
  const start = value.indexOf(marker)
  if (start < 0) return []
  try {
    const parsed = JSON.parse(value.slice(start + marker.length).trim()) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is OfficialFacultyProfile => (
          typeof item === 'object'
          && item !== null
          && typeof (item as OfficialFacultyProfile).name === 'string'
          && typeof (item as OfficialFacultyProfile).college === 'string'
        ))
      : []
  } catch {
    return []
  }
}

export function facultyDataModule(profiles: OfficialFacultyProfile[]): string {
  return [
    'export interface FacultyProfile {',
    '  id: string',
    '  name: string',
    '  college: string',
    '  unit: string',
    '  position: string',
    '  profile: string',
    '  sourceUrl: string',
    '  sourceTitle: string',
    '  retrievedAt: string',
    '}',
    '',
    '// Generated by scripts/collect-official-faculty.ts from public *.yeu.edu.cn pages.',
    `export const facultyProfiles: FacultyProfile[] = ${JSON.stringify(profiles, null, 2)}`,
    ''
  ].join('\n')
}

interface CliOptions {
  output: string
}

function parseCli(argv: string[]): CliOptions {
  let output = resolve('data/faculty-directory.ts')
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--output' || !argv[index + 1]) throw new Error(`Unknown argument: ${argv[index]}`)
    output = resolve(argv[index + 1]!)
    index += 1
  }
  return { output }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseCli(process.argv.slice(2))
    const fallbackProfiles = existsSync(options.output)
      ? parseFacultyDataModule(readFileSync(options.output, 'utf8'))
      : []
    const profiles = await collectOfficialFaculty(
      officialFacultySources,
      new Date().toISOString().slice(0, 10),
      fallbackProfiles
    )
    writeFileSync(options.output, facultyDataModule(profiles), 'utf8')
    process.stdout.write(`${JSON.stringify({
      output: options.output,
      profiles: profiles.length,
      colleges: [...new Set(profiles.map(profile => profile.college))].length
    })}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  }
}
