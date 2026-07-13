import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { DatabaseClient } from './client'

export function runMigrations(client: DatabaseClient): void {
  migrate(client.db, {
    migrationsFolder: resolve(process.cwd(), 'server/database/migrations')
  })
}
