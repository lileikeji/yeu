import { createHash, randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, like, sql } from 'drizzle-orm'
import type { ApiAssistantResponse, ApiAssistantRetrievalPath, ApiAssistantStage } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import { assistantRuns } from '../../database/schema'

/** AI 检索的调用来源，后台按这个维度分类。 */
export type AssistantChannel = 'web' | 'miniapp' | 'qq' | 'wechat'

interface AssistantRunContext {
  requestId: string
  query: string
  ipAddress?: string | null
  channel?: AssistantChannel
}

export interface AssistantRunListQuery {
  page: number
  pageSize: number
  retrievalPath?: string
  success?: boolean
  q?: string
  channel?: string
}

function queryHash(query: string): string {
  return createHash('sha256').update(query.trim().toLocaleLowerCase('zh-CN')).digest('hex')
}

function stageDuration(response: ApiAssistantResponse, stage: ApiAssistantStage): number {
  return (response.trace ?? [])
    .filter(item => item.stage === stage)
    .reduce((total, item) => total + item.durationMs, 0)
}

export function recordAssistantSuccess(
  client: DatabaseClient,
  context: AssistantRunContext,
  response: ApiAssistantResponse
): void {
  // 证据不足的「没找到 / 无法确认」也是 200，但它不是一次有效回答。把它记成
  // success 会让后台成功率掩盖答非所问——运维看板必须能看出这一类。
  const gap = response.evidenceGap === true
  client.db.insert(assistantRuns).values({
    id: randomUUID(),
    requestId: context.requestId,
    queryHash: queryHash(context.query),
    query: context.query.trim().slice(0, 300),
    mode: response.mode,
    channel: context.channel ?? 'web',
    retrievalPath: response.retrievalPath ?? (response.mode === 'local' ? 'local_database' : 'web_search'),
    usedWebSearch: response.usedWebSearch,
    cacheHit: response.cacheHit ?? false,
    success: !gap,
    errorCode: gap ? 'NO_EVIDENCE' : null,
    analysisMs: stageDuration(response, 'query_analysis'),
    featureApiMs: stageDuration(response, 'feature_api'),
    databaseMs: stageDuration(response, 'local_database'),
    webCacheMs: stageDuration(response, 'web_cache'),
    webSearchMs: stageDuration(response, 'web_search'),
    answerMs: stageDuration(response, 'answer_generation'),
    totalMs: response.totalDurationMs ?? 0,
    firstTokenMs: response.firstTokenMs ?? 0,
    citationCount: response.citations.length,
    ipAddress: context.ipAddress?.slice(0, 100) || null,
    createdAt: Date.now()
  }).onConflictDoNothing({ target: assistantRuns.requestId }).run()
}

export function recordAssistantFailure(
  client: DatabaseClient,
  context: AssistantRunContext,
  errorCode: string,
  totalMs: number
): void {
  client.db.insert(assistantRuns).values({
    id: randomUUID(),
    requestId: context.requestId,
    queryHash: queryHash(context.query),
    query: context.query.trim().slice(0, 300),
    mode: 'error',
    channel: context.channel ?? 'web',
    retrievalPath: 'error',
    success: false,
    errorCode: errorCode.slice(0, 80),
    totalMs: Math.max(0, totalMs),
    ipAddress: context.ipAddress?.slice(0, 100) || null,
    createdAt: Date.now()
  }).onConflictDoNothing({ target: assistantRuns.requestId }).run()
}

export function listAssistantRuns(client: DatabaseClient, query: AssistantRunListQuery) {
  const conditions = []
  if (query.retrievalPath) {
    conditions.push(eq(assistantRuns.retrievalPath, query.retrievalPath as ApiAssistantRetrievalPath | 'error'))
  }
  if (typeof query.success === 'boolean') conditions.push(eq(assistantRuns.success, query.success))
  if (query.q?.trim()) conditions.push(like(assistantRuns.query, `%${query.q.trim().slice(0, 100)}%`))
  if (query.channel) conditions.push(eq(assistantRuns.channel, query.channel as AssistantChannel))
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize

  const rows = client.db.select().from(assistantRuns)
    .where(where)
    .orderBy(desc(assistantRuns.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const aggregate = client.db.select({
    total: count(),
    successCount: sql<number>`coalesce(sum(case when ${assistantRuns.success} = 1 then 1 else 0 end), 0)`,
    webSearchCount: sql<number>`coalesce(sum(case when ${assistantRuns.retrievalPath} = 'web_search' then 1 else 0 end), 0)`,
    cacheHitCount: sql<number>`coalesce(sum(case when ${assistantRuns.cacheHit} = 1 then 1 else 0 end), 0)`,
    averageMs: sql<number>`coalesce(avg(${assistantRuns.totalMs}), 0)`
  }).from(assistantRuns).where(where).get()
  const total = aggregate?.total ?? 0
  const p95Offset = Math.max(0, Math.ceil(total * 0.95) - 1)
  const p95Ms = total > 0
    ? (client.db.select({ value: assistantRuns.totalMs }).from(assistantRuns)
        .where(where)
        .orderBy(asc(assistantRuns.totalMs))
        .limit(1)
        .offset(p95Offset)
        .get()?.value ?? 0)
    : 0

  const channelRows = client.db.select({
    channel: assistantRuns.channel,
    total: count()
  }).from(assistantRuns).where(where).groupBy(assistantRuns.channel).all()

  return {
    items: rows.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString()
    })),
    channels: channelRows
      .map(row => ({ channel: row.channel, total: Number(row.total) }))
      .sort((left, right) => right.total - left.total),
    total,
    page: query.page,
    pageSize: query.pageSize,
    stats: {
      total,
      successRate: total ? (aggregate?.successCount ?? 0) / total : 0,
      webSearchRate: total ? (aggregate?.webSearchCount ?? 0) / total : 0,
      cacheHitRate: total ? (aggregate?.cacheHitCount ?? 0) / total : 0,
      averageMs: Math.round(aggregate?.averageMs ?? 0),
      p95Ms
    }
  }
}
