import { assistantKnowledgeSeeds } from '../data/assistant-knowledge'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'

export interface SeedAssistantKnowledgeOptions {
  apply?: boolean
  databasePath?: string
  now?: number
}

export interface SeedAssistantKnowledgeResult {
  total: number
  applied: boolean
  databasePath: string
}

export function seedAssistantKnowledge(
  options: SeedAssistantKnowledgeOptions = {}
): SeedAssistantKnowledgeResult {
  const databasePath = options.databasePath
    ?? process.env.NUXT_DATABASE_PATH
    ?? './data/yeu.sqlite'
  const client = getDatabase(databasePath)

  try {
    runMigrations(client)
    if (!options.apply) {
      return {
        total: assistantKnowledgeSeeds.length,
        applied: false,
        databasePath: client.path
      }
    }

    const now = options.now ?? Date.now()
    const upsert = client.sqlite.prepare(`
      INSERT INTO assistant_knowledge_entries (
        id, kind, category, title, question, answer, keywords_json,
        public_url, confidence, source_note, is_active, imported_at,
        created_at, updated_at
      ) VALUES (
        @id, @kind, @category, @title, @question, @answer, @keywordsJson,
        @publicUrl, @confidence, @sourceNote, 1, @importedAt,
        @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        category = excluded.category,
        title = excluded.title,
        question = excluded.question,
        answer = excluded.answer,
        keywords_json = excluded.keywords_json,
        public_url = excluded.public_url,
        confidence = excluded.confidence,
        source_note = excluded.source_note,
        is_active = 1,
        imported_at = excluded.imported_at,
        updated_at = excluded.updated_at
    `)

    client.sqlite.transaction(() => {
      for (const entry of assistantKnowledgeSeeds) {
        upsert.run({
          id: entry.id,
          kind: entry.kind,
          category: entry.category,
          title: entry.title,
          question: entry.question,
          answer: entry.answer,
          keywordsJson: JSON.stringify(entry.keywords),
          publicUrl: entry.publicUrl ?? null,
          confidence: entry.confidence,
          sourceNote: entry.sourceNote,
          importedAt: now,
          createdAt: now,
          updatedAt: now
        })
      }
    })()

    return {
      total: assistantKnowledgeSeeds.length,
      applied: true,
      databasePath: client.path
    }
  } finally {
    closeDatabase(databasePath)
  }
}

function parseCli(argv: string[]) {
  let apply = false
  let databasePath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--apply') apply = true
    if (value === '--database') databasePath = argv[index + 1]
  }
  return { apply, databasePath }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = seedAssistantKnowledge(parseCli(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
