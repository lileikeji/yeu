import type { z } from 'zod'
import type { adminKnowledgeLibraryQuerySchema } from '../../../shared/schemas/server'
import { cleanSearchTerm } from '../../../shared/utils/like-search'
import type { DatabaseClient } from '../../database/client'

type LibraryQuery = z.infer<typeof adminKnowledgeLibraryQuerySchema>

interface CountRow {
  value: number
}

interface GroupRow {
  key: string
  value: number
}

interface GraphItemRow {
  id: string
  label: string
  description: string
  community: string
  kind: string
  collection: 'entries' | 'web' | 'documents'
  url: string | null
  status: string
  capturedAt: number
}

// Keep the landscape legible while totals and the full library remain available elsewhere.
const GRAPH_ITEMS_PER_COLLECTION = 24

function scalar(client: DatabaseClient, sql: string, params: unknown[] = []): number {
  return Number((client.sqlite.prepare(sql).get(...params) as CountRow | undefined)?.value ?? 0)
}

export function knowledgeLibrarySummary(client: DatabaseClient) {
  const entries = scalar(client, 'SELECT count(*) AS value FROM assistant_knowledge_entries')
  const activeEntries = scalar(client, 'SELECT count(*) AS value FROM assistant_knowledge_entries WHERE is_active = 1')
  const web = scalar(client, 'SELECT count(*) AS value FROM assistant_web_knowledge')
  const activeWeb = scalar(client, 'SELECT count(*) AS value FROM assistant_web_knowledge WHERE status = \'active\'')
  const documents = scalar(client, 'SELECT count(*) AS value FROM knowledge_documents')
  const readyDocuments = scalar(client, 'SELECT count(*) AS value FROM knowledge_documents WHERE status = \'ready\'')
  const claims = scalar(client, 'SELECT count(*) AS value FROM knowledge_claims')
  const publishedClaims = scalar(client, 'SELECT count(*) AS value FROM knowledge_claims WHERE review_status = \'published\'')
  const structured = scalar(client, 'SELECT (SELECT count(*) FROM contents) + (SELECT count(*) FROM places) + (SELECT count(*) FROM procedures) AS value')
  const sources = scalar(client, 'SELECT count(*) AS value FROM sources')
  return {
    retrievalTotal: entries + web + documents + claims,
    systemTotal: entries + web + documents + claims + structured,
    entries,
    activeEntries,
    web,
    activeWeb,
    documents,
    readyDocuments,
    claims,
    publishedClaims,
    structured,
    sources
  }
}

function searchClause(query: LibraryQuery, columns: string[]): { sql: string, params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []
  const term = cleanSearchTerm(query.q ?? '')
  if (term) {
    conditions.push(`(${columns.map(column => `${column} LIKE ?`).join(' OR ')})`)
    for (const _column of columns) params.push(`%${term}%`)
  }
  if (query.category) {
    conditions.push('category = ?')
    params.push(query.category)
  }
  if (query.status) {
    conditions.push('status = ?')
    params.push(query.status)
  }
  return { sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params }
}

export function listKnowledgeLibrary(client: DatabaseClient, query: LibraryQuery) {
  const offset = (query.page - 1) * query.pageSize
  if (query.collection === 'entries') {
    const normalized = { ...query, status: query.status === 'active' ? '1' : query.status === 'inactive' ? '0' : undefined }
    const where = searchClause(normalized, ['title', 'question', 'answer', 'category'])
    const sqlWhere = where.sql.replace('status = ?', 'is_active = ?')
    const rows = client.sqlite.prepare(`
      SELECT id, title, question AS subtitle, answer AS body, category, kind,
        CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END AS status,
        public_url AS url, confidence, imported_at AS capturedAt
      FROM assistant_knowledge_entries${sqlWhere}
      ORDER BY imported_at DESC, title ASC LIMIT ? OFFSET ?
    `).all(...where.params, query.pageSize, offset)
    const total = scalar(client, `SELECT count(*) AS value FROM assistant_knowledge_entries${sqlWhere}`, where.params)
    return { items: rows, total, summary: knowledgeLibrarySummary(client) }
  }

  if (query.collection === 'web') {
    const where = searchClause(query, ['title', 'query', 'snippet', 'source_host'])
    const sqlWhere = where.sql.replace('category = ?', 'source_host = ?')
    const rows = client.sqlite.prepare(`
      SELECT id, title, query AS subtitle, snippet AS body, source_host AS category,
        'webpage' AS kind, status, url, NULL AS confidence, fetched_at AS capturedAt
      FROM assistant_web_knowledge${sqlWhere}
      ORDER BY fetched_at DESC LIMIT ? OFFSET ?
    `).all(...where.params, query.pageSize, offset)
    const total = scalar(client, `SELECT count(*) AS value FROM assistant_web_knowledge${sqlWhere}`, where.params)
    return { items: rows, total, summary: knowledgeLibrarySummary(client) }
  }

  const where = searchClause(query, ['title', 'extracted_text', 'kind'])
  const sqlWhere = where.sql.replace('category = ?', 'kind = ?')
  const rows = client.sqlite.prepare(`
    SELECT id, title, kind AS subtitle, substr(extracted_text, 1, 700) AS body,
      kind AS category, kind, status, original_url AS url, NULL AS confidence,
      captured_at AS capturedAt
    FROM knowledge_documents${sqlWhere}
    ORDER BY captured_at DESC LIMIT ? OFFSET ?
  `).all(...where.params, query.pageSize, offset)
  const total = scalar(client, `SELECT count(*) AS value FROM knowledge_documents${sqlWhere}`, where.params)
  return { items: rows, total, summary: knowledgeLibrarySummary(client) }
}

function grouped(client: DatabaseClient, sql: string, limit: number): GroupRow[] {
  return client.sqlite.prepare(sql).all(limit) as GroupRow[]
}

export function getKnowledgeLandscapeGraph(client: DatabaseClient) {
  const summary = knowledgeLibrarySummary(client)
  const nodes: Array<Record<string, unknown>> = [
    { id: 'root', label: '仰恩数字山水', type: 'root', count: summary.systemTotal },
    { id: 'entries', label: '内置知识', type: 'collection', count: summary.entries, collection: 'entries' },
    { id: 'documents', label: '官网正文', type: 'collection', count: summary.documents, collection: 'documents' },
    { id: 'web', label: '网页资料缓存', type: 'collection', count: summary.web, collection: 'web' },
    { id: 'structured', label: '系统功能数据', type: 'collection', count: summary.structured },
    { id: 'claims', label: '审核事实', type: 'collection', count: summary.claims }
  ]
  const edges = ['entries', 'documents', 'web', 'structured', 'claims']
    .map(target => ({ source: 'root', target }))

  for (const row of grouped(client, `
    SELECT category AS key, count(*) AS value FROM assistant_knowledge_entries
    WHERE is_active = 1 GROUP BY category ORDER BY value DESC LIMIT ?
  `, 8)) {
    const id = `entry:${row.key}`
    nodes.push({ id, label: row.key, type: 'topic', count: Number(row.value), collection: 'entries', filter: row.key })
    edges.push({ source: 'entries', target: id })
  }

  for (const row of grouped(client, `
    SELECT source_host AS key, count(*) AS value FROM assistant_web_knowledge
    WHERE status = 'active' GROUP BY source_host ORDER BY value DESC LIMIT ?
  `, 6)) {
    const id = `web:${row.key}`
    nodes.push({ id, label: row.key, type: 'source', count: Number(row.value), collection: 'web', filter: row.key })
    edges.push({ source: 'web', target: id })
  }

  for (const row of grouped(client, `
    SELECT kind AS key, count(*) AS value FROM knowledge_documents
    WHERE status = 'ready' GROUP BY kind ORDER BY value DESC LIMIT ?
  `, 5)) {
    const id = `document:${row.key}`
    nodes.push({ id, label: row.key, type: 'document', count: Number(row.value), collection: 'documents', filter: row.key })
    edges.push({ source: 'documents', target: id })
  }

  const structuredGroups = [
    ['structured:contents', '校园内容', scalar(client, 'SELECT count(*) AS value FROM contents')],
    ['structured:places', '地点与路线', scalar(client, 'SELECT count(*) AS value FROM places')],
    ['structured:procedures', '办事流程', scalar(client, 'SELECT count(*) AS value FROM procedures')]
  ] as const
  for (const [id, label, value] of structuredGroups) {
    nodes.push({ id, label, type: 'structured', count: value })
    edges.push({ source: 'structured', target: id })
  }

  const graphItems = [
    ...client.sqlite.prepare(`
      SELECT id, coalesce(nullif(title, ''), question) AS label,
        substr(answer, 1, 320) AS description, category AS community, kind,
        'entries' AS collection, public_url AS url,
        CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END AS status,
        imported_at AS capturedAt
      FROM assistant_knowledge_entries
      WHERE is_active = 1
      ORDER BY confidence DESC, imported_at DESC
      LIMIT ?
    `).all(GRAPH_ITEMS_PER_COLLECTION),
    ...client.sqlite.prepare(`
      SELECT id, title AS label, substr(snippet, 1, 320) AS description,
        source_host AS community, 'webpage' AS kind, 'web' AS collection,
        url, status, fetched_at AS capturedAt
      FROM assistant_web_knowledge
      WHERE status = 'active'
      ORDER BY fetched_at DESC
      LIMIT ?
    `).all(GRAPH_ITEMS_PER_COLLECTION),
    ...client.sqlite.prepare(`
      SELECT id, title AS label, substr(extracted_text, 1, 320) AS description,
        kind AS community, kind, 'documents' AS collection, original_url AS url,
        status, captured_at AS capturedAt
      FROM knowledge_documents
      WHERE status = 'ready'
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(GRAPH_ITEMS_PER_COLLECTION)
  ] as GraphItemRow[]

  const nodeIds = new Set(nodes.map(node => String(node.id)))
  for (const item of graphItems) {
    const id = `item:${item.collection}:${item.id}`
    const groupPrefix = item.collection === 'entries'
      ? 'entry'
      : item.collection === 'documents' ? 'document' : 'web'
    const groupId = `${groupPrefix}:${item.community}`
    nodes.push({
      ...item,
      id,
      type: item.collection === 'entries'
        ? 'topic'
        : item.collection === 'documents' ? 'document' : 'source',
      count: 1,
      itemId: item.id
    })
    edges.push({
      source: nodeIds.has(groupId) ? groupId : item.collection,
      target: id
    })
  }

  return {
    summary,
    nodes,
    edges,
    visibleItems: graphItems.length,
    generatedAt: new Date().toISOString()
  }
}
