import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DAY_MS = 24 * 60 * 60 * 1000

function retentionDays(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error(`${name} must be an integer between 1 and 3650`)
  }
  return value
}

function loadBetterSqlite3() {
  const outputPackage = resolve('.output/server/package.json')
  const require = createRequire(existsSync(outputPackage)
    ? pathToFileURL(outputPackage)
    : import.meta.url)
  return require('better-sqlite3')
}

function cleanupSensitiveData(sqlite, now) {
  const visitorEventDays = retentionDays('NUXT_VISITOR_EVENT_RETENTION_DAYS', 90)
  const visitorDays = retentionDays('NUXT_VISITOR_RETENTION_DAYS', 180)
  const assistantIdentityDays = retentionDays('NUXT_ASSISTANT_IDENTITY_RETENTION_DAYS', 30)
  const assistantRunDays = retentionDays('NUXT_ASSISTANT_RUN_RETENTION_DAYS', 180)
  const deletedChatDays = retentionDays('NUXT_DELETED_CHAT_RETENTION_DAYS', 90)
  const chatDays = retentionDays('NUXT_CHAT_RETENTION_DAYS', 365)

  return sqlite.transaction(() => ({
    expiredRateLimits: sqlite.prepare(
      'DELETE FROM rate_limit_buckets WHERE reset_at < ?'
    ).run(now - DAY_MS).changes,
    expiredWebKnowledge: sqlite.prepare(
      'DELETE FROM assistant_web_knowledge WHERE expires_at < ?'
    ).run(now - 30 * DAY_MS).changes,
    minimizedAssistantRuns: sqlite.prepare(`
      UPDATE assistant_runs
      SET query = '', ip_address = NULL
      WHERE created_at < ? AND (query <> '' OR ip_address IS NOT NULL)
    `).run(now - assistantIdentityDays * DAY_MS).changes,
    expiredAssistantRuns: sqlite.prepare(
      'DELETE FROM assistant_runs WHERE created_at < ?'
    ).run(now - assistantRunDays * DAY_MS).changes,
    expiredVisitorEvents: sqlite.prepare(
      'DELETE FROM visitor_events WHERE created_at < ?'
    ).run(now - visitorEventDays * DAY_MS).changes,
    expiredVisitors: sqlite.prepare(
      'DELETE FROM visitors WHERE last_seen_at < ?'
    ).run(now - visitorDays * DAY_MS).changes,
    expiredDeletedChats: sqlite.prepare(
      'DELETE FROM chat_messages WHERE deleted_at IS NOT NULL AND deleted_at < ?'
    ).run(now - deletedChatDays * DAY_MS).changes,
    expiredChats: sqlite.prepare(
      'DELETE FROM chat_messages WHERE created_at < ?'
    ).run(now - chatDays * DAY_MS).changes,
    expiredAdminSessions: sqlite.prepare(
      'DELETE FROM admin_sessions WHERE expires_at < ?'
    ).run(now).changes,
    expiredUserSessions: sqlite.prepare(
      'DELETE FROM user_sessions WHERE expires_at < ?'
    ).run(now).changes
  }))()
}

const configuredPath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
const databasePath = isAbsolute(configuredPath) ? configuredPath : resolve(configuredPath)
const BetterSqlite3 = loadBetterSqlite3()
const sqlite = new BetterSqlite3(databasePath)

try {
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  const result = cleanupSensitiveData(sqlite, Date.now())
  process.stdout.write(JSON.stringify({ database: databasePath, ...result }) + '\n')
} finally {
  sqlite.close()
}
