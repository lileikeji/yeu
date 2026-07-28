import type { z } from 'zod'
import type { adminKnowledgeLibraryQuerySchema } from '../../../shared/schemas/server'
import { cleanSearchTerm } from '../../../shared/utils/like-search'
import type { DatabaseClient } from '../../database/client'

type LibraryQuery = z.infer<typeof adminKnowledgeLibraryQuerySchema>

interface CountRow {
  value: number
}

type GraphConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' | 'UNVERIFIED'
type GraphNodeType = 'entity' | 'topic' | 'source' | 'comparison' | 'synthesis' | 'query'

interface GraphItemRow {
  id: string
  label: string
  content: string
  summary: string
  communityLabel: string
  kind: string
  collection: 'entries' | 'web' | 'documents'
  url: string | null
  status: string
  capturedAt: number
  confidence: number | null
}

interface LandscapeNode {
  id: string
  label: string
  type: GraphNodeType
  community: string
  content: string
  summary: string
  source_path: string
  path: string
  source: string
  confidence: GraphConfidence
  type_confidence: GraphConfidence
  weight: number
  collection: GraphItemRow['collection']
  itemId: string
  category: string
  url: string | null
  status: string
  capturedAt: number
}

interface LandscapeEdge {
  id: string
  from: string
  to: string
  relation_type: '实现' | '依赖' | '对比' | '矛盾' | '衍生'
  confidence: GraphConfidence
  type: GraphConfidence
  weight: number
}

const GRAPH_NODE_LIMIT = 1900
const COMMUNITY_LIMITS: Record<GraphItemRow['collection'], number> = {
  entries: 12,
  documents: 6,
  web: 8
}

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

function stableGraphId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function graphConfidence(item: GraphItemRow): GraphConfidence {
  if (item.collection === 'documents') return 'EXTRACTED'
  if (item.collection === 'web') {
    return /(^|\.)yeu\.edu\.cn$/i.test(item.communityLabel) ? 'EXTRACTED' : 'UNVERIFIED'
  }
  const score = Number(item.confidence ?? 0)
  if (score >= 90) return 'EXTRACTED'
  if (score >= 75) return 'INFERRED'
  if (score >= 50) return 'AMBIGUOUS'
  return 'UNVERIFIED'
}

function graphNodeType(item: GraphItemRow): GraphNodeType {
  const kind = item.kind.toLowerCase()
  if (item.collection !== 'entries') return 'source'
  if (/synthesis|summary|digest|综合|汇总/.test(kind)) return 'synthesis'
  if (/query|question|问答/.test(kind)) return 'query'
  if (/compare|comparison|对比/.test(kind)) return 'comparison'
  if (/教师|教职工|人物|老师|教授|主任|校长/.test(`${item.communityLabel} ${item.label}`)) return 'entity'
  return 'topic'
}

function weakestConfidence(left: GraphConfidence, right: GraphConfidence): GraphConfidence {
  const rank: Record<GraphConfidence, number> = {
    EXTRACTED: 0,
    INFERRED: 1,
    AMBIGUOUS: 2,
    UNVERIFIED: 3
  }
  return rank[left] >= rank[right] ? left : right
}

function graphItems(client: DatabaseClient): GraphItemRow[] {
  return [
    ...client.sqlite.prepare(`
      SELECT id, coalesce(nullif(title, ''), question) AS label,
        substr(answer, 1, 2400) AS content, substr(answer, 1, 420) AS summary,
        coalesce(nullif(category, ''), '校园知识') AS communityLabel, kind,
        'entries' AS collection, public_url AS url,
        CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END AS status,
        imported_at AS capturedAt, confidence
      FROM assistant_knowledge_entries
      WHERE is_active = 1
      ORDER BY confidence DESC, imported_at DESC
    `).all(),
    ...client.sqlite.prepare(`
      SELECT id, coalesce(nullif(title, ''), query) AS label,
        substr(snippet, 1, 1600) AS content, substr(snippet, 1, 420) AS summary,
        coalesce(nullif(source_host, ''), '其他网页') AS communityLabel,
        'webpage' AS kind, 'web' AS collection, url, status,
        fetched_at AS capturedAt, NULL AS confidence
      FROM assistant_web_knowledge
      WHERE status = 'active'
      ORDER BY fetched_at DESC
    `).all(),
    ...client.sqlite.prepare(`
      SELECT id, coalesce(nullif(title, ''), '未命名正文') AS label,
        substr(extracted_text, 1, 2400) AS content,
        substr(extracted_text, 1, 420) AS summary,
        coalesce(nullif(kind, ''), 'document') AS communityLabel, kind,
        'documents' AS collection, original_url AS url, status,
        captured_at AS capturedAt, NULL AS confidence
      FROM knowledge_documents
      WHERE status = 'ready'
      ORDER BY captured_at DESC
    `).all()
  ] as GraphItemRow[]
}

function communityLabels(items: GraphItemRow[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = `${item.collection}:${item.communityLabel}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const preferred = new Set<string>()
  for (const collection of ['entries', 'documents', 'web'] as const) {
    const ranked = [...counts.entries()]
      .filter(([key]) => key.startsWith(`${collection}:`))
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
      .slice(0, COMMUNITY_LIMITS[collection])
    for (const [key] of ranked) preferred.add(key)
  }

  const collectionLabels = { entries: '校园知识', documents: '官网正文', web: '网页资料' }
  return new Map(items.map((item) => {
    const key = `${item.collection}:${item.communityLabel}`
    return [key, preferred.has(key) ? item.communityLabel : `${collectionLabels[item.collection]}·其他`]
  }))
}

function buildLandscapeNodes(items: GraphItemRow[]): LandscapeNode[] {
  const labels = communityLabels(items)
  return items.slice(0, GRAPH_NODE_LIMIT).map((item) => {
    const sourceKey = `${item.collection}:${item.communityLabel}`
    const category = labels.get(sourceKey) ?? item.communityLabel
    const confidence = graphConfidence(item)
    const sourcePath = `library://${item.collection}/${item.id}`
    return {
      id: `knowledge:${item.collection}:${item.id}`,
      label: item.label.trim() || '未命名资料',
      type: graphNodeType(item),
      community: `community:${item.collection}:${stableGraphId(category)}`,
      content: item.content ?? '',
      summary: item.summary ?? '',
      source_path: sourcePath,
      path: sourcePath,
      source: item.url ?? collectionSourceLabel(item.collection),
      confidence,
      type_confidence: confidence,
      weight: Math.max(1, Math.min(12, 1 + Math.log2(Math.max(2, item.content?.length ?? 0)))),
      collection: item.collection,
      itemId: item.id,
      category,
      url: item.url,
      status: item.status,
      capturedAt: item.capturedAt
    }
  })
}

function collectionSourceLabel(collection: GraphItemRow['collection']): string {
  if (collection === 'entries') return '站内知识'
  if (collection === 'documents') return '官网正文'
  return '网页资料'
}

function buildLandscapeEdges(nodes: LandscapeNode[]): LandscapeEdge[] {
  const edges: LandscapeEdge[] = []
  const communities = new Map<string, LandscapeNode[]>()
  for (const node of nodes) {
    const members = communities.get(node.community) ?? []
    members.push(node)
    communities.set(node.community, members)
  }

  const seen = new Set<string>()
  const addEdge = (from: LandscapeNode, to: LandscapeNode, relation: LandscapeEdge['relation_type'], weight: number) => {
    if (from.id === to.id) return
    const pair = [from.id, to.id].sort().join('|')
    if (seen.has(pair)) return
    seen.add(pair)
    const confidence = weakestConfidence(from.confidence, to.confidence)
    edges.push({
      id: `relation:${stableGraphId(`${pair}:${relation}`)}`,
      from: from.id,
      to: to.id,
      relation_type: relation,
      confidence,
      type: confidence,
      weight
    })
  }

  for (const members of communities.values()) {
    members.sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label, 'zh-CN'))
    for (let index = 1; index < members.length; index += 1) {
      const parent = members[Math.floor((index - 1) / 3)]
      if (parent) addEdge(parent, members[index]!, '衍生', 1)
    }
  }

  const exactTitle = new Map<string, LandscapeNode>()
  for (const node of nodes) {
    const key = node.label.replace(/[\s\p{P}\p{S}]+/gu, '').toLocaleLowerCase('zh-CN')
    if (key.length < 3) continue
    const previous = exactTitle.get(key)
    if (previous && previous.community !== node.community) addEdge(previous, node, '对比', 1.35)
    else exactTitle.set(key, node)
  }

  return edges
}

export function getKnowledgeLandscapeGraph(client: DatabaseClient) {
  const summary = knowledgeLibrarySummary(client)
  const allItems = graphItems(client)
  const nodes = buildLandscapeNodes(allItems)
  const edges = buildLandscapeEdges(nodes)
  const groupedNodes = new Map<string, LandscapeNode[]>()
  for (const node of nodes) {
    const members = groupedNodes.get(node.community) ?? []
    members.push(node)
    groupedNodes.set(node.community, members)
  }
  const nodeCommunity = new Map(nodes.map(node => [node.id, node.community]))
  const edgeWeightByCommunity = new Map<string, number>()
  for (const edge of edges) {
    const fromCommunity = nodeCommunity.get(edge.from)
    if (!fromCommunity || fromCommunity !== nodeCommunity.get(edge.to)) continue
    edgeWeightByCommunity.set(fromCommunity, (edgeWeightByCommunity.get(fromCommunity) ?? 0) + edge.weight)
  }
  const communities = [...groupedNodes.entries()]
    .map(([id, members], colorIndex) => ({
      id,
      label: members[0]?.category ?? '未分组',
      node_count: members.length,
      source_count: new Set(members.map(member => member.collection)).size,
      internal_edge_weight: edgeWeightByCommunity.get(id) ?? 0,
      is_primary: members.length >= Math.max(4, Math.ceil(nodes.length * 0.04)),
      is_weak: members.length < 3,
      recommended_start_node_id: members[0]?.id ?? null,
      color_index: colorIndex,
      members: members.map(member => member.id)
    }))
    .sort((left, right) => right.node_count - left.node_count || left.label.localeCompare(right.label, 'zh-CN'))

  const recommended = nodes
    .slice()
    .sort((left, right) => right.weight - left.weight || right.capturedAt - left.capturedAt)[0]

  return {
    meta: {
      build_date: new Date().toISOString(),
      wiki_title: '仰恩数字山水知识图谱',
      total_nodes: nodes.length,
      total_edges: edges.length,
      initial_view: nodes.slice(0, 180).map(node => node.id),
      degraded: allItems.length > GRAPH_NODE_LIMIT
    },
    nodes,
    edges,
    learning: {
      version: 1,
      entry: {
        recommended_start_node_id: recommended?.id ?? null,
        recommended_start_reason: recommended ? '优先从内容较完整、可信度较高的资料开始' : null,
        default_mode: 'global'
      },
      views: {
        path: {
          enabled: Boolean(recommended),
          start_node_id: recommended?.id ?? null,
          node_ids: recommended ? [recommended.id] : [],
          degraded: false
        },
        community: {
          enabled: communities.length > 0,
          community_id: communities[0]?.id ?? null,
          label: communities[0]?.label ?? null,
          node_ids: communities[0]?.members ?? [],
          is_weak: communities[0]?.is_weak ?? true,
          degraded: false
        },
        global: { enabled: true, node_ids: nodes.map(node => node.id), degraded: false }
      },
      communities
    },
    summary,
    visibleItems: nodes.length,
    truncatedItems: Math.max(0, allItems.length - nodes.length),
    generatedAt: new Date().toISOString()
  }
}
