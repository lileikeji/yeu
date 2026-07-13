import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'

const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'

try {
  const client = getDatabase(databasePath)
  runMigrations(client)
  process.stdout.write(`Database migrated: ${client.path}\n`)
} finally {
  closeDatabase(databasePath)
}
