import './load-env'
import { initializeAdmin } from '../server/database/admin-bootstrap'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'

const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
const force = process.argv.includes('--reset-admin')

try {
  const client = getDatabase(databasePath)
  runMigrations(client)
  const result = await initializeAdmin(client, {
    username: process.env.NUXT_ADMIN_USERNAME || 'admin',
    password: process.env.NUXT_ADMIN_PASSWORD,
    passwordHash: process.env.NUXT_ADMIN_PASSWORD_HASH,
    force
  })
  process.stdout.write(`Database initialized: ${client.path}; admin ${result}\n`)
} finally {
  closeDatabase(databasePath)
}
