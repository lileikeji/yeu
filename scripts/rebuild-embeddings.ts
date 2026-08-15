import './load-env'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  collectVectorIndexRows,
  pruneVectorIndex,
  upsertVectorIndex
} from '../server/modules/assistant/vector-search'
import { embeddingChunkId } from '../server/modules/assistant/embedding'

/**
 * Rebuild the assistant semantic (vector) index from current database content.
 *
 * Requires AI_EMBEDDING_BASE_URL / AI_EMBEDDING_API_KEY / AI_EMBEDDING_MODEL in
 * the environment (or .env). Preview mode (no --apply) only reports what would
 * be embedded. With --apply the index is upserted and stale rows are pruned.
 *
 * Usage:
 *   pnpm embeddings:rebuild            # preview
 *   pnpm embeddings:rebuild --apply    # embed + upsert + prune
 */

interface RebuildOptions {
  apply: boolean
  databasePath?: string
}

function parseCli(argv: string[]): RebuildOptions {
  let apply = false
  let databasePath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--apply') apply = true
    if (value === '--database') databasePath = argv[index + 1]
  }
  return { apply, databasePath }
}

function embeddingEnv(): { baseUrl: string, apiKey: string, model: string, timeoutMs: number } | null {
  const baseUrl = process.env.AI_EMBEDDING_BASE_URL?.trim() ?? ''
  const apiKey = process.env.AI_EMBEDDING_API_KEY?.trim() ?? ''
  const model = process.env.AI_EMBEDDING_MODEL?.trim() ?? 'text-embedding-v3'
  const timeoutMs = Math.max(5_000, Number(process.env.AI_EMBEDDING_TIMEOUT_MS) || 15_000)
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey, model, timeoutMs }
}

async function main(options: RebuildOptions): Promise<void> {
  const config = embeddingEnv()
  const databasePath = options.databasePath
    ?? process.env.NUXT_DATABASE_PATH
    ?? './data/yeu.sqlite'
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    if (!config) {
      process.stderr.write('AI_EMBEDDING_BASE_URL / AI_EMBEDDING_API_KEY are required to rebuild the vector index.\n')
      process.exitCode = 1
      return
    }
    const rows = collectVectorIndexRows(client)
    const uniqueChunks = new Set(rows.map(row => row.content)).size
    process.stdout.write(JSON.stringify({
      database: client.path,
      chunks: rows.length,
      uniqueTexts: uniqueChunks,
      sources: [...new Set(rows.map(row => row.sourceType))]
    }) + '\n')

    if (!options.apply) {
      process.stdout.write('Preview only. Re-run with --apply to embed and write the index.\n')
      return
    }
    if (rows.length === 0) return

    const result = await upsertVectorIndex(client, rows, {
      config,
      onProgress: (done, total) => {
        if (total >= 20 && done % 20 === 0) {
          process.stderr.write(`embedded ${done}/${total}\n`)
        }
      }
    })
    const pruned = pruneVectorIndex(client, new Set(rows.map(row => embeddingChunkId(row.sourceType, row.sourceId, row.chunkIndex))))
    process.stdout.write(JSON.stringify({
      applied: true,
      embedded: result.embedded,
      skipped: result.skipped,
      pruned
    }) + '\n')
  } finally {
    closeDatabase(databasePath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main(parseCli(process.argv.slice(2)))
}
