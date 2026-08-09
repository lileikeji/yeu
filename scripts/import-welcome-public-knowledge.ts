import './load-env'
import { createHash, randomUUID } from 'node:crypto'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { compileOfficialKnowledgeDocuments } from '../server/modules/knowledge/document-compiler'
import {
  parseWelcomeFiles,
  parseWelcomeGuides,
  WELCOME_PUBLIC_ENDPOINTS,
  WELCOME_SYSTEM_ORIGIN,
  type WelcomePublicGuide
} from '../server/modules/knowledge/welcome-public'
import { parseOfficialLegacyOffice } from './crawl-official-knowledge'

const TOKEN_ENV = 'WELCOME_SYSTEM_TOKEN'
const DATABASE_PATH = process.argv[2] || process.env.DATABASE_URL || 'data/yeu.sqlite'
const WELCOME_PUBLIC_PAGE = `${WELCOME_SYSTEM_ORIGIN}/student/index.html#/userGuide`

interface ImportedDocument {
  id: string
  inserted: boolean
}

function normalizedHash(value: string): string {
  return createHash('sha256').update(value.normalize('NFKC')).digest('hex')
}

async function fetchJson(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${WELCOME_SYSTEM_ORIGIN}${path}`, {
    headers: { Authorization: token, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`welcome public endpoint returned HTTP ${response.status}`)
  return response.json()
}

function upsertDocument(client: DatabaseClient, input: {
  kind: 'api' | 'document'
  title: string
  originalUrl: string
  mimeType: string
  text: string
  metadata: Record<string, unknown>
  publicCitation: boolean
}, now: number): ImportedDocument {
  const hash = normalizedHash(input.text)
  const existing = client.sqlite.prepare(`
    SELECT id FROM knowledge_documents WHERE original_url = ? AND content_hash = ? LIMIT 1
  `).get(input.originalUrl, hash) as { id: string } | undefined
  const metadataJson = JSON.stringify({
    importer: 'welcome-public-knowledge',
    importerVersion: 1,
    privacyScope: 'public-common-only',
    publicCitation: input.publicCitation,
    extractedCharacters: input.text.length,
    ...input.metadata
  })
  if (existing) {
    client.sqlite.prepare(`
      UPDATE knowledge_documents SET title = ?, metadata_json = ?, processed_at = ?, updated_at = ? WHERE id = ?
    `).run(input.title, metadataJson, now, now, existing.id)
    return { id: existing.id, inserted: false }
  }

  let documentId = ''
  client.sqlite.transaction(() => {
    const proposedSourceId = randomUUID()
    client.sqlite.prepare(`
      INSERT INTO sources (
        id, title, url, platform, publisher_name, source_level, is_official,
        published_at, accessed_at, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, '仰恩大学官方迎新系统', '仰恩大学', 'A', 1, NULL, ?, ?, 'active', ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        platform = excluded.platform,
        publisher_name = excluded.publisher_name,
        source_level = 'A',
        is_official = 1,
        accessed_at = excluded.accessed_at,
        notes = excluded.notes,
        status = 'active',
        updated_at = excluded.updated_at
    `).run(
      proposedSourceId,
      input.title,
      input.originalUrl,
      now,
      '仅导入官方迎新系统公共指南和公共附件；不读取个人信息、个人报到状态或个人分配结果。',
      now,
      now
    )
    const source = client.sqlite.prepare('SELECT id FROM sources WHERE url = ?').get(input.originalUrl) as { id: string }
    client.sqlite.prepare(`
      UPDATE knowledge_documents SET status = 'archived', updated_at = ?
      WHERE original_url = ? AND status = 'ready'
    `).run(now, input.originalUrl)
    documentId = randomUUID()
    client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, storage_path, mime_type,
        content_hash, extracted_text, metadata_json, status, captured_at,
        processed_at, created_by_admin_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'ready', ?, ?, NULL, ?, ?)
    `).run(
      documentId,
      source.id,
      input.kind,
      input.title,
      input.originalUrl,
      input.mimeType,
      hash,
      input.text,
      metadataJson,
      now,
      now,
      now,
      now
    )
  })()
  return { id: documentId, inserted: true }
}

function guideUrl(guide: WelcomePublicGuide): string {
  return `${WELCOME_PUBLIC_PAGE}?guide=${encodeURIComponent(String(guide.order))}`
}

async function main(): Promise<void> {
  const token = process.env[TOKEN_ENV]?.trim()
  if (!token?.startsWith('Bearer ')) {
    throw new Error(`${TOKEN_ENV} must contain the temporary Bearer token`)
  }

  const [guidePayload, filePayload] = await Promise.all([
    fetchJson(WELCOME_PUBLIC_ENDPOINTS.guides, token),
    fetchJson(WELCOME_PUBLIC_ENDPOINTS.files, token)
  ])
  const guides = parseWelcomeGuides(guidePayload)
  const files = parseWelcomeFiles(filePayload)
  const client = getDatabase(DATABASE_PATH)
  runMigrations(client)
  const now = Date.now()
  const imported: ImportedDocument[] = []

  for (const guide of guides) {
    imported.push(upsertDocument(client, {
      kind: 'api',
      title: guide.title,
      originalUrl: guideUrl(guide),
      mimeType: 'text/html',
      text: guide.text,
      publicCitation: false,
      metadata: { resourceType: 'guide', order: guide.order, sourceUpdatedAt: guide.updatedAt }
    }, now))
  }

  for (const file of files) {
    const response = await fetch(file.url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`welcome attachment returned HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const parsed = await parseOfficialLegacyOffice(bytes, file.url, file.title)
    imported.push(upsertDocument(client, {
      kind: 'document',
      title: file.title,
      originalUrl: file.url,
      mimeType: parsed.mimeType,
      text: parsed.text,
      publicCitation: true,
      metadata: { resourceType: 'attachment', order: file.order, extractionMethod: parsed.extractionMethod }
    }, now))
  }

  const documentIds = imported.map(item => item.id)
  const compile = compileOfficialKnowledgeDocuments(client, { documentIds })
  const report = {
    guides: guides.length,
    attachments: files.length,
    insertedDocuments: imported.filter(item => item.inserted).length,
    unchangedDocuments: imported.filter(item => !item.inserted).length,
    compiledDocuments: compile.documents,
    claimsForReview: compile.claimsInserted + compile.claimsUpdated
  }
  console.log(JSON.stringify(report, null, 2))
  closeDatabase(DATABASE_PATH)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'welcome public import failed')
  process.exitCode = 1
})
