import { desc, eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import { signalEvents } from '../../database/schema'

/**
 * 让站内问答也能查到「校园信号」：把已发布的事件按关键词匹配成候选证据。
 * 事件本身是派生数据（每次重建可重算），这里只读不写。
 */

export interface SignalEvidence {
  title: string
  url: string
  snippet: string
  source: 'site'
  text: string
  score: number
}

const SIGNAL_EVIDENCE_POOL = 300

const FRESH_INTENT_RE = /最近|最新|近期|这几天|这两天|近来|新消息|有什么新|有什么通知|热榜|热度|今天|本周/u

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function dayLabel(value: number): string {
  if (!value) return ''
  return new Date(value + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10)
}

function evidenceText(row: { title: string, summary: string, category: string }): string {
  return `${row.title} ${row.summary} ${row.category}`
}

export function hasSignalFreshIntent(query: string): boolean {
  return FRESH_INTENT_RE.test(query)
}

export function retrieveSignalEvidence(
  client: DatabaseClient,
  query: string,
  terms: string[],
  limit = 6
): SignalEvidence[] {
  const fresh = hasSignalFreshIntent(query)
  if (!fresh && terms.length === 0) return []

  const rows = client.db.select({
    slug: signalEvents.slug,
    title: signalEvents.title,
    summary: signalEvents.summary,
    category: signalEvents.category,
    heat: signalEvents.heat,
    sourceCount: signalEvents.sourceCount,
    itemCount: signalEvents.itemCount,
    lastSeenAt: signalEvents.lastSeenAt
  }).from(signalEvents)
    .where(eq(signalEvents.status, 'published'))
    .orderBy(desc(signalEvents.lastSeenAt))
    .limit(SIGNAL_EVIDENCE_POOL)
    .all()

  const now = Date.now()
  const scored = rows.map((row) => {
    const title = row.title.toLocaleLowerCase('zh-CN')
    const summary = row.summary.toLocaleLowerCase('zh-CN')
    let score = 0
    for (const term of terms) {
      if (title.includes(term)) score += term.length >= 3 ? 8 : 5
      if (summary.includes(term)) score += term.length >= 3 ? 4 : 2
    }
    if (fresh) {
      const days = Math.max(0, (now - row.lastSeenAt) / 86_400_000)
      // 问「最近有什么」时，热度比关键词更说明「哪件事值得看」。
      score += Math.max(0.5, 3 - days / 30) + Math.min(6, row.heat * 2)
    }
    const date = dayLabel(row.lastSeenAt)
    const meta = [
      row.category,
      `${row.sourceCount} 个来源`,
      `${row.itemCount} 条`,
      date ? `${date} 发布` : ''
    ].filter(Boolean).join(' · ')
    return {
      title: row.title,
      url: `/hot#${row.slug}`,
      snippet: `${row.summary}（${meta}）`,
      source: 'site' as const,
      text: evidenceText(row),
      score
    }
  }).filter(item => item.score > 0)

  scored.sort((left, right) => right.score - left.score)
  return scored.slice(0, limit)
}
