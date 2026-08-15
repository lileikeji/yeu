import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'
import { cleanupExpiredSessionMemories } from '../server/modules/assistant/memory'

/**
 * Expire session-scoped assistant memories. Run daily from cron alongside
 * `pnpm feedback:cleanup` (see README). Entries older than their TTL are
 * removed; per-session caps are enforced at write time.
 */
const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'

try {
  const client = getDatabase(databasePath)
  const removedExpired = cleanupExpiredSessionMemories(client)
  const remaining = client.sqlite.prepare(
    'SELECT count(*) AS value FROM assistant_session_memory'
  ).get() as { value: number }
  process.stdout.write(JSON.stringify({
    database: client.path,
    removedExpired,
    remaining
  }) + '\n')
} finally {
  closeDatabase(databasePath)
}
