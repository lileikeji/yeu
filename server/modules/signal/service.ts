/**
 * signal 模块的读写入口。
 *
 * 数据来源就两处，都是站内已有的：
 * - contents(kind='notice')：通知，带信源关联，正文可能很长。
 * - knowledge_documents(status='ready')：抓取入库的网页/PDF/Word，官方站点居多。
 *
 * 整条链路是全量重建、无人工审核：拉候选 → 双评分筛 → 聚簇 → 算热度 → 落表。
 * 事件 id 与 slug 都由条目身份推导，所以同一份数据重跑结果稳定，日报的去重记录才不会错位。
 */
import { createHash } from 'node:crypto'
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  contents,
  contentSources,
  knowledgeDocuments,
  signalEventItems,
  signalEvents,
  signalReports,
  sources
} from '../../database/schema'
import { activePublicContentCondition } from '../content/visibility'
import { clusterSignalItems, titleSimilarity } from './clustering'
import { computeSignalHeat, signalTrend } from './heat'
import type { SignalHeatParticipant, SignalTrend } from './heat'
import { buildDailyReport, buildPeriodReport } from './report'
import type { SignalReportEventInput, SignalReportPayload } from './report'
import { decideSignalScore, isUsableSignalTitle, signalCategoryFor } from './scoring'
import { signalTierFor, signalTierLabel, signalTierThreshold } from './tiers'
import type { SignalSourceLevel, SignalTier } from './tiers'
import { signalDayKeysInPeriod, signalPeriodKey, signalPeriodRange } from './time'
import type { SignalReportKind } from './time'

export const SIGNAL_DEFAULT_LOOKBACK_DAYS = 400
export const SIGNAL_MAX_CANDIDATES = 9000
/** 正文只截取前这么多字参与打分，够用且不会把内存顶爆。 */
const SCORING_BODY_CHARS = 6000

export type SignalItemKind = 'notice' | 'document'

/** 抓取页只记录入库时间，正文里写着的日期才是真发布时间。 */
const DOCUMENT_DATE_RE = /(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/gu
/** 校内 CMS 的文章地址带发布日期：/2026/0831/c1178a58277/page.htm。 */
const DOCUMENT_URL_DATE_RE = /\/(20\d{2})\/(\d{2})(\d{2})\//

export function documentPublishedAt(title: string, text: string, capturedAt: number, url?: string): number {
  // 地址里的日期是站点自己给的发布时间，比正文里随手提到的日期可靠。
  const urlMatch = url ? DOCUMENT_URL_DATE_RE.exec(url) : null
  if (urlMatch) {
    const [, year, month, day] = urlMatch
    const timestamp = Date.parse(`${year}-${month}-${day}T00:00:00+08:00`)
    if (Number.isFinite(timestamp) && timestamp <= capturedAt) return timestamp
  }
  const head = `${title} ${text.slice(0, 1500)}`
  // 正文里第一个出现的完整日期基本就是页面顶部的发布时间；取最大会把文末「截止日期」当成发布日。
  for (const match of head.matchAll(DOCUMENT_DATE_RE)) {
    const [, year, month, day] = match
    if (!year || !month || !day) continue
    const timestamp = Date.parse(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+08:00`)
    if (Number.isFinite(timestamp) && timestamp <= capturedAt) return timestamp
  }
  // 只写到年份的旧文（「2014年上半年…」）也算旧：取当年 1 月 1 日，直接落到回看窗口外。
  const yearOnly = /(20\d{2})\s*年/u.exec(head)
  const capturedYear = new Date(capturedAt).getUTCFullYear()
  if (yearOnly && Number(yearOnly[1]) < capturedYear) return Date.parse(`${yearOnly[1]}-01-01T00:00:00+08:00`)
  // 一点日期都没有的，宁可不要：拿抓取时间冒充发布时机，用户一眼就看出来不对。
  return 0
}

export interface SignalCandidate {
  itemKind: SignalItemKind
  itemId: string
  url: string
  title: string
  summary: string
  body: string
  publishedAt: number
  sourceId: string | null
  sourceTitle: string
  isOfficial: boolean
  sourceLevel: SignalSourceLevel
  hasAttachment: boolean
}

interface ScoredCandidate extends SignalCandidate {
  tier: SignalTier
  score: number
  scoreA: number
  scoreB: number
  category: string
  hits: string[]
}

export interface BuiltSignalItem {
  itemKind: SignalItemKind
  itemId: string
  sourceId: string | null
  url: string
  title: string
  excerpt: string
  publishedAt: number
  score: number
  scoreA: number
  scoreB: number
  tier: SignalTier
  similarity: number
  isPrimary: boolean
}

export interface BuiltSignalEvent {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  heat: number
  heatPrev: number
  trend: SignalTrend
  sourceCount: number
  itemCount: number
  score: number
  tier: SignalTier
  firstSeenAt: number
  lastSeenAt: number
  metadata: {
    threshold: number
    scoreA: number
    scoreB: number
    sources: string[]
    keywords: string[]
  }
  items: BuiltSignalItem[]
}

export interface PreviousSignalEvent {
  firstSeenAt: number
  heat: number
  sourceCount: number
  reportedAt: number | null
}

export interface BuildSignalOptions {
  now?: number
  lookbackDays?: number
  maxCandidates?: number
  /** 只算不写库。 */
  dryRun?: boolean
}

export interface BuildSignalResult {
  candidates: number
  rejected: number
  events: number
  items: number
  persisted: boolean
}

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 抓回来的正文常带「发布时间：… 浏览次数：… 学院地址：…」这类页面噪声，摘要里不该出现。 */
const PAGE_NOISE_RE = /(发布(?:时间|者)|浏览(?:次数|量)|点击(?:次数|量)|学院地址|学院电话|联系电话|邮政编码|信息公众号|供稿|审核|编辑|摄影|字体|来源)[：:][^。；;]{0,80}/gu
const MARKDOWN_LINK_RE = /\[[^\]]*\]\([^)]*\)/g
const NAV_LINE_RE = /网站首页|学校主页|部门概况|部门简介|办事指南|联系我们|教务部首页|当前位置|返回列表|岗位职责|下载专区|常用链接|教学资讯/

const PAGE_CHROME_RE = /最热更新|上一篇|下一篇|分享到|打印本页|关闭窗口|当前位置|返回列表|友情链接/g
const DATE_HIT_RE = /20\d{2}\s*[-/年]\s*\d{1,2}/g

function stripPageNoise(text: string): string {
  return text
    .split(String.fromCharCode(10))
    .filter(line => !NAV_LINE_RE.test(line))
    .join(String.fromCharCode(10))
    .replace(MARKDOWN_LINK_RE, ' ')
    .replace(PAGE_NOISE_RE, ' ')
}

function excerptOf(candidate: SignalCandidate): string {
  const source = candidate.summary || candidate.body || ''
  // 先去噪声再折叠空白：标签值以行结尾，折完就没有行边界了。
  let raw = oneLine(stripPageNoise(source))
  // 「最热更新」之后基本是站内导航列表，砍掉。
  const chromeAt = raw.search(/最热更新|上一篇|下一篇|友情链接/)
  if (chromeAt >= 0) raw = raw.slice(0, chromeAt)
  raw = oneLine(raw.replace(/日期[：:]\s*20\d{2}[-/]\d{1,2}[-/]\d{1,2}[^\s]*/g, ' '))
  const title = oneLine(candidate.title)
  const body = raw.startsWith(title) ? oneLine(raw.slice(title.length)) : raw
  // 开头 80 字里堆着两个以上日期，说明抓到的是一张「最新公告列表」页，没有正文可摘。
  if ((body.slice(0, 80).match(DATE_HIT_RE)?.length ?? 0) >= 2) return ''
  const sentences = body.replace(/^\d{1,2}:\d{2}\s*/, '').split(/[。！？；]/).map(part => part.trim()).filter(Boolean)
  const scored = sentences.filter((sentence) => {
    if (PAGE_CHROME_RE.test(sentence)) return false
    if ((sentence.match(DATE_HIT_RE)?.length ?? 0) >= 2) return false
    // 「通知公告 教学文件 国家文件 …」这种一串栏目名的，是面包屑不是正文。
    const shortTokens = sentence.split(' ').filter(token => token.length > 0 && token.length <= 6).length
    const looksLikeBreadcrumb = shortTokens >= 4 && sentence.length < 80 && !/[，。：；]/.test(sentence)
    return !looksLikeBreadcrumb
  })
  // 优先挑去掉标点数字后还剩 8 个字以上的句子，剩下的当作兜底。
  const rich = scored.filter(sentence => sentence.replace(/[\s\d\p{P}]/gu, '').length >= 8)
  const picked = (rich.length ? rich : scored).slice(0, 2).join('。').replace(/^[”"’'、，。；：\s]+/, '')
  // 挑不出像正文的句子就不给摘要，宁可空着也不贴面包屑。
  return picked.length >= 20 ? picked.slice(0, 120) : ''
}

function attachmentOf(kind: string): boolean {
  return kind === 'pdf' || kind === 'document' || kind === 'spreadsheet'
}

function collectNoticeCandidates(client: DatabaseClient, cutoff: number, limit: number): SignalCandidate[] {
  const rows = client.db.select({
    id: contents.id,
    title: contents.title,
    summary: contents.summary,
    body: contents.body,
    publishedAt: contents.publishedAt,
    sourceId: contentSources.sourceId,
    sourceTitle: sources.title,
    isOfficial: sources.isOfficial,
    sourceLevel: sources.sourceLevel
  })
    .from(contents)
    .leftJoin(contentSources, and(eq(contentSources.contentId, contents.id), eq(contentSources.isPrimary, true)))
    .leftJoin(sources, eq(sources.id, contentSources.sourceId))
    .where(and(
      eq(contents.kind, 'notice'),
      eq(contents.status, 'published'),
      gte(contents.publishedAt, cutoff),
      activePublicContentCondition()
    ))
    .orderBy(desc(contents.publishedAt))
    .limit(limit)
    .all()

  const candidates: SignalCandidate[] = []
  for (const row of rows) {
    if (!row.publishedAt || !isUsableSignalTitle(row.title)) continue
    candidates.push({
      itemKind: 'notice',
      itemId: row.id,
      url: `/notices/${row.id}`,
      title: row.title,
      summary: row.summary,
      body: (row.body ?? '').slice(0, SCORING_BODY_CHARS),
      publishedAt: row.publishedAt,
      sourceId: row.sourceId ?? null,
      sourceTitle: row.sourceTitle ?? '',
      isOfficial: Boolean(row.isOfficial),
      sourceLevel: (row.sourceLevel as SignalSourceLevel | null) ?? 'E',
      hasAttachment: false
    })
  }
  return candidates
}

function collectDocumentCandidates(client: DatabaseClient, cutoff: number, limit: number): SignalCandidate[] {
  const rows = client.db.select({
    id: knowledgeDocuments.id,
    kind: knowledgeDocuments.kind,
    title: knowledgeDocuments.title,
    originalUrl: knowledgeDocuments.originalUrl,
    extractedText: knowledgeDocuments.extractedText,
    capturedAt: knowledgeDocuments.capturedAt,
    sourceId: knowledgeDocuments.sourceId,
    sourceTitle: sources.title,
    isOfficial: sources.isOfficial,
    sourceLevel: sources.sourceLevel
  })
    .from(knowledgeDocuments)
    .leftJoin(sources, eq(sources.id, knowledgeDocuments.sourceId))
    .where(and(
      eq(knowledgeDocuments.status, 'ready'),
      isNotNull(knowledgeDocuments.originalUrl),
      gte(knowledgeDocuments.capturedAt, cutoff),
      inArray(knowledgeDocuments.kind, ['webpage', 'pdf', 'document', 'spreadsheet'])
    ))
    .orderBy(desc(knowledgeDocuments.capturedAt))
    .limit(limit)
    .all()

  const candidates: SignalCandidate[] = []
  for (const row of rows) {
    const text = (row.extractedText ?? '').trim()
    if (text.length < 60 || !row.originalUrl) continue
    // 标题得像一句话，也不能是制度文本/目录页（办法、指南、清单、条文摘录）。
    if (!isUsableSignalTitle(row.title)) continue
    const publishedAt = documentPublishedAt(row.title, text, row.capturedAt, row.originalUrl)
    if (!publishedAt || publishedAt < cutoff) continue
    candidates.push({
      itemKind: 'document',
      itemId: row.id,
      url: row.originalUrl,
      title: row.title,
      summary: text.slice(0, 200),
      body: text.slice(0, SCORING_BODY_CHARS),
      publishedAt,
      sourceId: row.sourceId ?? null,
      sourceTitle: row.sourceTitle ?? '',
      isOfficial: Boolean(row.isOfficial),
      sourceLevel: (row.sourceLevel as SignalSourceLevel | null) ?? 'E',
      hasAttachment: attachmentOf(row.kind)
    })
  }
  return candidates
}

export function collectSignalCandidates(client: DatabaseClient, options: BuildSignalOptions = {}): SignalCandidate[] {
  const now = options.now ?? Date.now()
  const lookbackDays = options.lookbackDays ?? SIGNAL_DEFAULT_LOOKBACK_DAYS
  const cutoff = now - lookbackDays * 24 * 60 * 60 * 1000
  const limit = Math.max(1, options.maxCandidates ?? SIGNAL_MAX_CANDIDATES)

  const candidates = [
    ...collectNoticeCandidates(client, cutoff, limit),
    ...collectDocumentCandidates(client, cutoff, limit)
  ]
  return candidates.sort((left, right) => right.publishedAt - left.publishedAt).slice(0, limit)
}

function scoreCandidate(candidate: SignalCandidate, now: number): ScoredCandidate | null {
  const tier = signalTierFor({ isOfficial: candidate.isOfficial, sourceLevel: candidate.sourceLevel })
  const decision = decideSignalScore({
    title: candidate.title,
    summary: candidate.summary,
    body: candidate.body,
    publishedAt: candidate.publishedAt,
    itemKind: candidate.itemKind,
    tier,
    isOfficial: candidate.isOfficial,
    hasAttachment: candidate.hasAttachment
  }, now)
  if (!decision.passed) return null
  return {
    ...candidate,
    tier,
    score: decision.score,
    scoreA: decision.scoreA,
    scoreB: decision.scoreB,
    category: signalCategoryFor(candidate.title),
    hits: decision.hits
  }
}

function slugFor(title: string): string {
  const ascii = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // 中文标题里的 ASCII 往往只剩年份（「...2026...」→ 2026），这种 slug 既没意义又容易撞，
  // 至少要够长且带字母才直接用，否则退回哈希。
  if (ascii.length >= 8 && /[a-z]/.test(ascii)) return ascii.slice(0, 60)
  return `hot-${sha1(title).slice(0, 8)}`
}

function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${sha1(`${base}:${taken.size}`).slice(0, 6)}`
}

function toEvent(
  group: ScoredCandidate[],
  now: number,
  taken: Set<string>,
  previous?: PreviousSignalEvent
): BuiltSignalEvent {
  const representative = group[0]!
  // 同一来源可能就同一件事发了几条，只算一次，取它最新那条的时间。
  const latestBySource = new Map<string, number>()
  const sourceTitles: string[] = []
  let firstSeenAt = representative.publishedAt
  let lastSeenAt = representative.publishedAt
  let score = 0
  let scoreA = 0
  let scoreB = 0

  for (const candidate of group) {
    const sourceKey = candidate.sourceId ?? `${candidate.itemKind}:${candidate.itemId}`
    const previous = latestBySource.get(sourceKey)
    if (previous === undefined) {
      latestBySource.set(sourceKey, candidate.publishedAt)
      if (candidate.sourceTitle && !sourceTitles.includes(candidate.sourceTitle)) sourceTitles.push(candidate.sourceTitle)
    } else if (candidate.publishedAt > previous) {
      latestBySource.set(sourceKey, candidate.publishedAt)
    }
    if (candidate.publishedAt < firstSeenAt) firstSeenAt = candidate.publishedAt
    if (candidate.publishedAt > lastSeenAt) lastSeenAt = candidate.publishedAt
  }

  const participants: SignalHeatParticipant[] = [...latestBySource.entries()].map(([key, at]) => ({ key, at }))

  const items: BuiltSignalItem[] = group.map((candidate, index) => {
    if (index === 0) {
      score = candidate.score
      scoreA = candidate.scoreA
      scoreB = candidate.scoreB
    }
    return {
      itemKind: candidate.itemKind,
      itemId: candidate.itemId,
      sourceId: candidate.sourceId,
      url: candidate.url,
      title: candidate.title,
      excerpt: excerptOf(candidate),
      publishedAt: candidate.publishedAt,
      score: candidate.score,
      scoreA: candidate.scoreA,
      scoreB: candidate.scoreB,
      tier: candidate.tier,
      similarity: index === 0 ? 1 : titleSimilarity(representative.title, candidate.title),
      isPrimary: index === 0
    }
  })

  // 跨天重建时沿用第一次被看到的时间，涨跌跟上一份快照比，而不是每次都从零开始。
  const carriedFirstSeenAt = previous ? Math.min(previous.firstSeenAt, firstSeenAt) : firstSeenAt
  const heat = computeSignalHeat(participants, carriedFirstSeenAt, now)
  const trend = signalTrend(latestBySource.size, previous?.sourceCount ?? null, carriedFirstSeenAt, now)
  const slug = uniqueSlug(slugFor(representative.title), taken)
  taken.add(slug)

  return {
    id: `sig_${sha1(`signal:${representative.itemKind}:${representative.itemId}`).slice(0, 24)}`,
    slug,
    title: representative.title,
    summary: excerptOf(representative),
    category: representative.category,
    heat: heat.heat,
    heatPrev: previous ? previous.heat : heat.heatPrev,
    trend,
    sourceCount: latestBySource.size,
    itemCount: items.length,
    score,
    tier: representative.tier,
    firstSeenAt: carriedFirstSeenAt,
    lastSeenAt,
    metadata: {
      threshold: signalTierThreshold(representative.tier),
      scoreA,
      scoreB,
      sources: sourceTitles.slice(0, 12),
      keywords: [...new Set(group.flatMap(candidate => candidate.hits))].slice(0, 12)
    },
    items
  }
}

/** 纯构建：不写库，方便脚本 --dry-run 和测试。 */
function readPreviousEvents(client: DatabaseClient): Map<string, PreviousSignalEvent> {
  const rows = client.db.select({
    id: signalEvents.id,
    firstSeenAt: signalEvents.firstSeenAt,
    heat: signalEvents.heat,
    sourceCount: signalEvents.sourceCount,
    reportedAt: signalEvents.reportedAt
  }).from(signalEvents).all()
  return new Map(rows.map(row => [row.id, {
    firstSeenAt: row.firstSeenAt,
    heat: row.heat,
    sourceCount: row.sourceCount,
    reportedAt: row.reportedAt
  }]))
}

export function buildSignalSnapshot(
  client: DatabaseClient,
  options: BuildSignalOptions = {}
): { events: BuiltSignalEvent[], result: BuildSignalResult } {
  const now = options.now ?? Date.now()
  const candidates = collectSignalCandidates(client, options)
  const scored: ScoredCandidate[] = []
  for (const candidate of candidates) {
    const decision = scoreCandidate(candidate, now)
    if (decision) scored.push(decision)
  }

  const groups = clusterSignalItems(scored.map(candidate => ({
    id: `${candidate.itemKind}:${candidate.itemId}`,
    title: candidate.title,
    publishedAt: candidate.publishedAt,
    score: candidate.score,
    candidate
  })))

  const previous = readPreviousEvents(client)
  const taken = new Set<string>()
  const events = groups.map((group) => {
    const members = group.map(entry => entry.candidate)
    const id = `sig_${sha1(`signal:${members[0]!.itemKind}:${members[0]!.itemId}`).slice(0, 24)}`
    return toEvent(members, now, taken, previous.get(id))
  })
  events.sort((left, right) => right.heat - left.heat || right.lastSeenAt - left.lastSeenAt)

  return {
    events,
    result: {
      candidates: candidates.length,
      rejected: candidates.length - scored.length,
      events: events.length,
      items: events.reduce((total, event) => total + event.items.length, 0),
      persisted: false
    }
  }
}

export function persistSignalSnapshot(client: DatabaseClient, events: BuiltSignalEvent[], now = Date.now()): void {
  client.sqlite.transaction(() => {
    const previous = readPreviousEvents(client)
    client.db.delete(signalEvents).run()
    for (const event of events) {
      client.db.insert(signalEvents).values({
        id: event.id,
        slug: event.slug,
        title: event.title,
        summary: event.summary,
        category: event.category,
        status: 'published',
        heat: event.heat,
        heatPrev: event.heatPrev,
        trend: event.trend,
        sourceCount: event.sourceCount,
        itemCount: event.itemCount,
        score: event.score,
        tier: event.tier,
        firstSeenAt: Math.min(event.firstSeenAt, previous.get(event.id)?.firstSeenAt ?? event.firstSeenAt),
        lastSeenAt: event.lastSeenAt,
        reportedAt: previous.get(event.id)?.reportedAt ?? null,
        metadataJson: JSON.stringify(event.metadata),
        createdAt: now,
        updatedAt: now
      }).run()
      for (const item of event.items) {
        client.db.insert(signalEventItems).values({
          id: `sei_${sha1(`${event.id}:${item.itemKind}:${item.itemId}`).slice(0, 24)}`,
          eventId: event.id,
          itemKind: item.itemKind,
          itemId: item.itemId,
          sourceId: item.sourceId,
          url: item.url,
          title: item.title,
          excerpt: item.excerpt,
          publishedAt: item.publishedAt,
          score: item.score,
          scoreA: item.scoreA,
          scoreB: item.scoreB,
          tier: item.tier,
          similarity: item.similarity,
          isPrimary: item.isPrimary,
          createdAt: now
        }).run()
      }
    }
  })()
}

export function rebuildSignalIndex(client: DatabaseClient, options: BuildSignalOptions = {}): BuildSignalResult {
  const now = options.now ?? Date.now()
  const { events, result } = buildSignalSnapshot(client, { ...options, now })
  if (!options.dryRun) persistSignalSnapshot(client, events, now)
  return { ...result, persisted: !options.dryRun }
}

interface SignalEventRow {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  heat: number
  heatPrev: number
  trend: string
  sourceCount: number
  itemCount: number
  score: number
  tier: string
  firstSeenAt: number
  lastSeenAt: number
  reportedAt: number | null
  metadataJson: string
}

function parseMetadata(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export interface SignalEventSummary {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  heat: number
  trend: SignalTrend
  sourceCount: number
  itemCount: number
  score: number
  tier: SignalTier
  tierLabel: string
  firstSeenAt: string
  lastSeenAt: string
}

function toSummary(row: SignalEventRow): SignalEventSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    heat: row.heat,
    trend: row.trend as SignalTrend,
    sourceCount: row.sourceCount,
    itemCount: row.itemCount,
    score: row.score,
    tier: row.tier as SignalTier,
    tierLabel: signalTierLabel(row.tier as SignalTier),
    firstSeenAt: new Date(row.firstSeenAt).toISOString(),
    lastSeenAt: new Date(row.lastSeenAt).toISOString()
  }
}

const EVENT_COLUMNS = {
  id: signalEvents.id,
  slug: signalEvents.slug,
  title: signalEvents.title,
  summary: signalEvents.summary,
  category: signalEvents.category,
  heat: signalEvents.heat,
  heatPrev: signalEvents.heatPrev,
  trend: signalEvents.trend,
  sourceCount: signalEvents.sourceCount,
  itemCount: signalEvents.itemCount,
  score: signalEvents.score,
  tier: signalEvents.tier,
  firstSeenAt: signalEvents.firstSeenAt,
  lastSeenAt: signalEvents.lastSeenAt,
  reportedAt: signalEvents.reportedAt,
  metadataJson: signalEvents.metadataJson
}

export function listHotSignalEvents(client: DatabaseClient, limit = 20): SignalEventSummary[] {
  const rows = client.db.select(EVENT_COLUMNS)
    .from(signalEvents)
    .where(eq(signalEvents.status, 'published'))
    .orderBy(desc(signalEvents.heat), desc(signalEvents.lastSeenAt))
    .limit(Math.min(Math.max(limit, 1), 300))
    .all()
  return rows.map(toSummary)
}

export interface SignalEventDetail extends SignalEventSummary {
  metadata: Record<string, unknown>
  items: Array<{
    id: string
    itemKind: SignalItemKind
    itemId: string
    url: string
    title: string
    excerpt: string
    sourceTitle: string
    isOfficial: boolean
    publishedAt: string | null
    score: number
    isPrimary: boolean
  }>
}

export function getSignalEventBySlug(client: DatabaseClient, slug: string): SignalEventDetail | null {
  const row = client.db.select(EVENT_COLUMNS)
    .from(signalEvents)
    .where(and(eq(signalEvents.slug, slug), eq(signalEvents.status, 'published')))
    .limit(1)
    .get()
  if (!row) return null

  const itemRows = client.db.select({
    id: signalEventItems.id,
    itemKind: signalEventItems.itemKind,
    itemId: signalEventItems.itemId,
    url: signalEventItems.url,
    title: signalEventItems.title,
    excerpt: signalEventItems.excerpt,
    publishedAt: signalEventItems.publishedAt,
    score: signalEventItems.score,
    isPrimary: signalEventItems.isPrimary,
    sourceTitle: sources.title,
    isOfficial: sources.isOfficial
  })
    .from(signalEventItems)
    .leftJoin(sources, eq(sources.id, signalEventItems.sourceId))
    .where(eq(signalEventItems.eventId, row.id))
    .orderBy(desc(signalEventItems.isPrimary), desc(signalEventItems.publishedAt))
    .all()

  return {
    ...toSummary(row),
    metadata: parseMetadata(row.metadataJson),
    items: itemRows.map(item => ({
      id: item.id,
      itemKind: item.itemKind as SignalItemKind,
      itemId: item.itemId,
      url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      sourceTitle: item.sourceTitle ?? '',
      isOfficial: Boolean(item.isOfficial),
      publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
      score: item.score,
      isPrimary: Boolean(item.isPrimary)
    }))
  }
}

function reportedAtMap(client: DatabaseClient, before: number): Map<string, number> {
  const rows = client.db.select({ generatedAt: signalReports.generatedAt, payloadJson: signalReports.payloadJson })
    .from(signalReports)
    .orderBy(desc(signalReports.generatedAt))
    .limit(14)
    .all()
  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.generatedAt > before) continue
    const payload = parseMetadata(row.payloadJson) as unknown as SignalReportPayload
    const items = [
      ...(Array.isArray(payload.lead) ? payload.lead : []),
      ...(Array.isArray(payload.sections) ? payload.sections.flatMap(section => section.items ?? []) : [])
    ]
    for (const item of items) {
      if (!item?.eventId) continue
      const previous = map.get(item.eventId)
      if (previous === undefined || row.generatedAt > previous) map.set(item.eventId, row.generatedAt)
    }
  }
  return map
}

function reportEventInputs(client: DatabaseClient): SignalReportEventInput[] {
  return client.db.select(EVENT_COLUMNS)
    .from(signalEvents)
    .where(eq(signalEvents.status, 'published'))
    .all()
    .map(row => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      heat: row.heat,
      sourceCount: row.sourceCount,
      itemCount: row.itemCount,
      tier: row.tier,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt
    }))
}

function readReport(client: DatabaseClient, kind: SignalReportKind, periodKey: string): SignalReportPayload | null {
  const row = client.db.select({ payloadJson: signalReports.payloadJson })
    .from(signalReports)
    .where(and(eq(signalReports.kind, kind), eq(signalReports.periodKey, periodKey)))
    .limit(1)
    .get()
  if (!row) return null
  return parseMetadata(row.payloadJson) as unknown as SignalReportPayload
}

/** 生成（或取回）某一天的日报；同日只出一份。 */
export function ensureDailyReport(
  client: DatabaseClient,
  now = Date.now(),
  options: { refresh?: boolean } = {}
): SignalReportPayload {
  const periodKey = signalPeriodKey('daily', now)
  const existing = options.refresh ? null : readReport(client, 'daily', periodKey)
  if (existing) return existing

  // refresh 时不算今天这份报告的「已报」，否则重建后条目全被判成老消息，日报会空掉。
  const reportedAt = reportedAtMap(client, options.refresh ? signalPeriodRange('daily', periodKey).start : now)
  const payload = buildDailyReport({
    events: reportEventInputs(client),
    periodKey,
    generatedAt: now,
    reportedAt
  })
  persistReport(client, payload)

  const reportedIds = [...payload.lead, ...payload.sections.flatMap(section => section.items)].map(item => item.eventId)
  if (reportedIds.length > 0) {
    client.db.update(signalEvents)
      .set({ reportedAt: now, updatedAt: now })
      .where(inArray(signalEvents.id, reportedIds))
      .run()
  }
  return payload
}

/** 周报/月报：把周期内的日报拼起来，不重新打分。 */
export function ensurePeriodReport(
  client: DatabaseClient,
  kind: Extract<SignalReportKind, 'weekly' | 'monthly'>,
  now = Date.now(),
  options: { refresh?: boolean } = {}
): SignalReportPayload {
  const periodKey = signalPeriodKey(kind, now)
  const existing = options.refresh ? null : readReport(client, kind, periodKey)
  if (existing) return existing

  const dailies: Array<{ periodKey: string, payload: SignalReportPayload }> = []
  for (const dayKey of signalDayKeysInPeriod(kind, periodKey)) {
    const payload = readReport(client, 'daily', dayKey)
    if (payload) dailies.push({ periodKey: dayKey, payload })
  }
  const payload = buildPeriodReport({ kind, periodKey, generatedAt: now, dailies })
  persistReport(client, payload)
  return payload
}

function persistReport(client: DatabaseClient, payload: SignalReportPayload): void {
  const itemCount = payload.lead.length + payload.sections.reduce((total, section) => total + section.items.length, 0)
  // 报告是派生视图：同一天重跑索引就该反映新口径，覆盖而不是留着上一版。
  client.db.insert(signalReports).values({
    id: `srep_${sha1(`signal-report:${payload.kind}:${payload.periodKey}`).slice(0, 24)}`,
    kind: payload.kind,
    periodKey: payload.periodKey,
    title: payload.title,
    payloadJson: JSON.stringify(payload),
    itemCount,
    generatedAt: payload.generatedAt
  }).onConflictDoUpdate({
    target: [signalReports.kind, signalReports.periodKey],
    set: {
      title: payload.title,
      payloadJson: JSON.stringify(payload),
      itemCount,
      generatedAt: payload.generatedAt
    }
  }).run()
}

export function listSignalReports(client: DatabaseClient, kind: SignalReportKind, limit = 10): SignalReportPayload[] {
  const rows = client.db.select({ payloadJson: signalReports.payloadJson })
    .from(signalReports)
    .where(eq(signalReports.kind, kind))
    .orderBy(desc(signalReports.generatedAt))
    .limit(Math.min(Math.max(limit, 1), 60))
    .all()
  return rows.map(row => parseMetadata(row.payloadJson) as unknown as SignalReportPayload)
}
