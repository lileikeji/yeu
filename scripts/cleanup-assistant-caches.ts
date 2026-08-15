import './load-env'
import { lt } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '../server/database/client'
import { assistantAnswerCache, assistantWebKnowledge } from '../server/database/schema'

/**
 * Delete expired assistant caches (answer cache + web-knowledge cache).
 *
 * Both tables carry an expires_at timestamp; without maintenance the rows
 * accumulate forever (the answer cache alone was observed at ~94% expired).
 * Run daily from cron alongside `pnpm memory:cleanup`.
 */
const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'

try {
  const client = getDatabase(databasePath)
  const now = Date.now()

  const answerCacheResult = client.db.delete(assistantAnswerCache)
    .where(lt(assistantAnswerCache.expiresAt, now))
    .run()

  const webCacheResult = client.db.delete(assistantWebKnowledge)
    .where(lt(assistantWebKnowledge.expiresAt, now))
    .run()

  process.stdout.write(JSON.stringify({
    database: client.path,
    deletedAnswerCacheRows: answerCacheResult.changes,
    deletedWebKnowledgeRows: webCacheResult.changes
  }) + '\n')
} finally {
  closeDatabase(databasePath)
}
