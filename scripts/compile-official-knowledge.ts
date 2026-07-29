import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { compileOfficialKnowledgeDocuments } from '../server/modules/knowledge/document-compiler'

const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
const client = getDatabase(databasePath)

try {
  runMigrations(client)
  const report = compileOfficialKnowledgeDocuments(client)
  process.stdout.write(`${JSON.stringify({ databasePath: client.path, ...report })}\n`)
} finally {
  closeDatabase(databasePath)
}

