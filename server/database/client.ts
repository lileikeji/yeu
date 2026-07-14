import { mkdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>
export type SqliteConnection = InstanceType<typeof BetterSqlite3>

export interface DatabaseClient {
  db: AppDatabase
  sqlite: SqliteConnection
  path: string
}

const clients = new Map<string, DatabaseClient>()

export function resolveDatabasePath(databasePath: string, cwd = process.cwd()): string {
  if (databasePath === ':memory:') {
    return databasePath
  }

  if (isAbsolute(databasePath)) return databasePath

  // `nuxt preview` may execute the generated server with `.output` as cwd.
  // Runtime paths remain project-relative so preview and production use the
  // same migrated database as development and maintenance scripts.
  const projectRoot = basename(cwd) === '.output' ? dirname(cwd) : cwd
  return resolve(projectRoot, databasePath)
}

export function getDatabase(databasePath: string): DatabaseClient {
  const resolvedPath = resolveDatabasePath(databasePath)
  const existing = clients.get(resolvedPath)

  if (existing) {
    return existing
  }

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true })
  }

  const sqlite = new BetterSqlite3(resolvedPath)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('synchronous = NORMAL')

  const client: DatabaseClient = {
    sqlite,
    db: drizzle(sqlite, { schema }),
    path: resolvedPath
  }

  clients.set(resolvedPath, client)
  return client
}

export function closeDatabase(databasePath?: string): void {
  if (databasePath) {
    const resolvedPath = resolveDatabasePath(databasePath)
    const client = clients.get(resolvedPath)
    client?.sqlite.close()
    clients.delete(resolvedPath)
    return
  }

  for (const client of clients.values()) {
    client.sqlite.close()
  }

  clients.clear()
}
