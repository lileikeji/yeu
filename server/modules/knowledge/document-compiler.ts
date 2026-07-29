import { createHash } from 'node:crypto'
import type { DatabaseClient } from '../../database/client'

interface DocumentRow {
  id: string
  sourceId: string | null
  title: string
  originalUrl: string | null
  extractedText: string
  metadataJson: string
}

interface KnowledgeChunk {
  id: string
  title: string
  statement: string
  keywords: string[]
  locator: string
}

export interface DocumentCompileReport {
  documents: number
  claimsInserted: number
  claimsUpdated: number
  claimsRemoved: number
  skipped: number
}

const AUTO_NOTE_PREFIX = 'auto:official-document:'
const MAX_CLAIMS_PER_DOCUMENT = 80
const MAX_STATEMENT_LENGTH = 900

function stableId(documentId: string, value: string): string {
  const digest = createHash('sha256')
    .update(`${documentId}\n${value.normalize('NFKC')}`)
    .digest('hex')
  return `docclaim:${documentId}:${digest.slice(0, 32)}`
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function looksLikeNavigation(value: string): boolean {
  if (/^(网站首页|网站首页\)?|设为首页|收藏本站|当前位置|首页|上一页|下一页|返回顶部|返回首页)/.test(value)) return true
  if (/^(图|图片|附件|下载|打印|关闭)\s*\d{0,3}\s*[:：]?$/i.test(value)) return true
  if (value.split(/[|｜>»]/).length >= 4 && value.length < 180) return true
  return false
}

function splitSentences(value: string): string[] {
  const sentences = value
    .replace(/([。！？；!?;])\s*/g, '$1\n')
    .split('\n')
    .map(item => item.trim())
    .filter(item => item.length >= 10)

  const result: string[] = []
  for (const sentence of sentences) {
    if (sentence.length <= MAX_STATEMENT_LENGTH) {
      result.push(sentence)
      continue
    }
    for (let offset = 0; offset < sentence.length; offset += MAX_STATEMENT_LENGTH) {
      const part = sentence.slice(offset, offset + MAX_STATEMENT_LENGTH).trim()
      if (part.length >= 12) result.push(part)
    }
  }
  return result
}

function keywordsFor(title: string, heading: string, statement: string): string[] {
  const value = `${title} ${heading} ${statement}`
  const candidates = value.match(/[\p{Script=Han}]{2,8}|[A-Za-z][A-Za-z0-9_-]{2,24}/gu) ?? []
  const blocked = new Set(['仰恩大学', '学校', '学院', '学生', '相关', '工作', '进行', '开展', '通过', '情况'])
  return [...new Set(candidates.filter(item => !blocked.has(item)))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 16)
}

function categoryFor(title: string, text: string): string {
  const value = `${title} ${text}`
  if (/奖学金|助学金|资助|贫困|综测|综合测评/.test(value)) return '奖助与综合测评'
  if (/宿舍|寝室|公寓|床垫|门禁|洗衣|热水/.test(value)) return '宿舍与生活'
  if (/报到|入学|新生|军训|开学|录取/.test(value)) return '报到与新生'
  if (/教务|课程|选课|考试|成绩|学分|转专业|毕业|学位/.test(value)) return '学业与教务'
  if (/学院|专业|系部|招生|培养方案/.test(value)) return '学院与专业'
  if (/教师|教职工|教授|副教授|讲师|老师/.test(value)) return '师资与人物'
  if (/社团|学生会|志愿|活动|比赛/.test(value)) return '校园活动'
  return '官网正文'
}

function extractChunks(document: DocumentRow): KnowledgeChunk[] {
  const text = normalizeText(document.extractedText)
  if (text.length < 24) return []

  const lines = text.split('\n').map(item => item.trim()).filter(Boolean)
  let heading = ''
  const chunks: KnowledgeChunk[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (looksLikeNavigation(line)) continue
    const normalizedLine = line.replace(/^#{1,6}\s*/, '').trim()
    const isHeading = /^#{1,6}\s*/.test(line)
      || (normalizedLine.length >= 2 && normalizedLine.length <= 60 && !/[。！？；!?;：:，,、]$/.test(normalizedLine))
    if (isHeading && normalizedLine.length < 60) {
      heading = normalizedLine
      continue
    }

    const sentences = splitSentences(normalizedLine)
    for (const sentence of sentences) {
      const key = sentence.replace(/\s+/g, '')
      if (seen.has(key)) continue
      seen.add(key)
      const context = heading && !sentence.includes(heading)
        ? `【${heading}】${sentence}`
        : sentence
      const id = stableId(document.id, context)
      chunks.push({
        id,
        title: heading
          ? `${document.title}｜${heading}`.slice(0, 160)
          : `${document.title}｜正文要点`.slice(0, 160),
        statement: context,
        keywords: keywordsFor(document.title, heading, sentence),
        locator: heading || '正文'
      })
      if (chunks.length >= MAX_CLAIMS_PER_DOCUMENT) return chunks
    }
  }

  return chunks
}

function existingAutoClaims(client: DatabaseClient, documentId: string): Array<{ id: string }> {
  return client.sqlite.prepare(`
    SELECT kc.id
    FROM knowledge_claims kc
    INNER JOIN knowledge_claim_sources kcs ON kcs.claim_id = kc.id
    WHERE kcs.document_id = ? AND kc.source_note LIKE ?
  `).all(documentId, `${AUTO_NOTE_PREFIX}%`) as Array<{ id: string }>
}

function compileDocument(client: DatabaseClient, document: DocumentRow, now: number): { inserted: number, updated: number, removed: number } {
  const chunks = extractChunks(document)
  const category = categoryFor(document.title, document.extractedText)
  const note = `${AUTO_NOTE_PREFIX}${document.id}`
  const upsert = client.sqlite.prepare(`
    INSERT INTO knowledge_claims (
      id, category, title, statement, keywords_json, search_text,
      confidence_label, confidence_score, review_status, public_url, source_note,
      valid_from, valid_until, published_at, reviewed_at, reviewed_by_admin_id,
      created_by_admin_id, supersedes_claim_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'extracted', 88, 'published', ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      title = excluded.title,
      statement = excluded.statement,
      keywords_json = excluded.keywords_json,
      search_text = excluded.search_text,
      confidence_label = 'extracted',
      confidence_score = 88,
      review_status = 'published',
      public_url = excluded.public_url,
      source_note = excluded.source_note,
      published_at = coalesce(knowledge_claims.published_at, excluded.published_at),
      reviewed_at = excluded.reviewed_at,
      updated_at = excluded.updated_at
  `)
  const sourceUpsert = client.sqlite.prepare(`
    INSERT INTO knowledge_claim_sources (
      id, claim_id, source_id, document_id, evidence_quote, locator, is_primary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      document_id = excluded.document_id,
      evidence_quote = excluded.evidence_quote,
      locator = excluded.locator,
      is_primary = 1
  `)
  const existing = new Set(existingAutoClaims(client, document.id).map(item => item.id))
  const desired = new Set(chunks.map(chunk => chunk.id))
  let inserted = 0
  let updated = 0

  client.sqlite.transaction(() => {
    for (const chunk of chunks) {
      const existed = existing.has(chunk.id)
      const searchText = `${chunk.title} ${chunk.statement} ${chunk.keywords.join(' ')}`
      upsert.run(
        chunk.id,
        category,
        chunk.title,
        chunk.statement,
        JSON.stringify(chunk.keywords),
        searchText,
        document.originalUrl,
        note,
        now,
        now,
        now,
        now
      )
      sourceUpsert.run(
        `docsource:${chunk.id}`,
        chunk.id,
        document.sourceId,
        document.id,
        chunk.statement.slice(0, 1200),
        chunk.locator,
        now
      )
      if (existed) updated += 1
      else inserted += 1
    }

    const stale = [...existing].filter(id => !desired.has(id))
    if (stale.length > 0) {
      const placeholders = stale.map(() => '?').join(',')
      client.sqlite.prepare(`DELETE FROM knowledge_claims WHERE id IN (${placeholders})`).run(...stale)
    }
  })()

  return { inserted, updated, removed: Math.max(0, existing.size - desired.size) }
}

export function compileOfficialKnowledgeDocuments(
  client: DatabaseClient,
  options: { documentIds?: string[], limit?: number } = {}
): DocumentCompileReport {
  const where = options.documentIds?.length
    ? `AND id IN (${options.documentIds.map(() => '?').join(',')})`
    : ''
  const params = options.documentIds ?? []
  const limit = Math.max(1, Math.min(100_000, options.limit ?? 100_000))
  const documents = client.sqlite.prepare(`
    SELECT id, source_id AS sourceId, title, original_url AS originalUrl,
      extracted_text AS extractedText, metadata_json AS metadataJson
    FROM knowledge_documents
    WHERE status = 'ready' AND length(extracted_text) >= 24 ${where}
    ORDER BY captured_at ASC
    LIMIT ?
  `).all(...params, limit) as DocumentRow[]

  const report: DocumentCompileReport = {
    documents: documents.length,
    claimsInserted: 0,
    claimsUpdated: 0,
    claimsRemoved: 0,
    skipped: 0
  }
  if (!options.documentIds?.length) {
    client.sqlite.prepare(`
      DELETE FROM knowledge_claims
      WHERE source_note LIKE ?
        AND EXISTS (
          SELECT 1
          FROM knowledge_claim_sources kcs
          LEFT JOIN knowledge_documents kd ON kd.id = kcs.document_id
          WHERE kcs.claim_id = knowledge_claims.id
            AND kd.status <> 'ready'
        )
    `).run(`${AUTO_NOTE_PREFIX}%`)
  }
  for (const document of documents) {
    const result = compileDocument(client, document, Date.now())
    report.claimsInserted += result.inserted
    report.claimsUpdated += result.updated
    report.claimsRemoved += result.removed
    if (result.inserted === 0 && result.updated === 0) report.skipped += 1
  }
  return report
}
