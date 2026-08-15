import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'
import { consolidateSessionMemories } from '../server/modules/assistant/memory'

/**
 * Offline session-memory consolidation (P6): merge near-duplicate extracted
 * facts/preferences within each session, keeping the newest statement of a
 * duplicate cluster. Run daily from cron after memory:cleanup. Dry-run by
 * default; pass --apply to persist deletions.
 */
const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
const apply = process.argv.includes('--apply')
const thresholdArg = process.argv.find(arg => arg.startsWith('--similarity='))
const similarityThreshold = thresholdArg ? Number(thresholdArg.split('=')[1]) : undefined

try {
  const client = getDatabase(databasePath)
  const report = consolidateSessionMemories(client, { apply, similarityThreshold })
  process.stdout.write(JSON.stringify({ database: client.path, apply, ...report }) + '\n')
} finally {
  closeDatabase(databasePath)
}
