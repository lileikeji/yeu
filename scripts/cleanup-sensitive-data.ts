import './load-env'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeDatabase, getDatabase } from '../server/database/client'
import type { SqliteConnection } from '../server/database/client'

export const DAY_MS = 24 * 60 * 60 * 1000

export function retentionDays(
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error(`${name} must be an integer between 1 and 3650`)
  }
  return value
}

export interface RetentionConfig {
  visitorEventDays: number
  visitorDays: number
  assistantIdentityDays: number
  assistantRunDays: number
  deletedChatDays: number
  chatDays: number
}

export interface CleanupResult {
  expiredRateLimits: number
  expiredWebKnowledge: number
  minimizedAssistantRuns: number
  expiredAssistantRuns: number
  expiredVisitorEvents: number
  expiredVisitors: number
  expiredDeletedChats: number
  expiredChats: number
  expiredAdminSessions: number
  expiredUserSessions: number
}

export function loadRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  return {
    visitorEventDays: retentionDays('NUXT_VISITOR_EVENT_RETENTION_DAYS', 90, env),
    visitorDays: retentionDays('NUXT_VISITOR_RETENTION_DAYS', 180, env),
    assistantIdentityDays: retentionDays('NUXT_ASSISTANT_IDENTITY_RETENTION_DAYS', 30, env),
    assistantRunDays: retentionDays('NUXT_ASSISTANT_RUN_RETENTION_DAYS', 180, env),
    deletedChatDays: retentionDays('NUXT_DELETED_CHAT_RETENTION_DAYS', 90, env),
    chatDays: retentionDays('NUXT_CHAT_RETENTION_DAYS', 365, env)
  }
}

export function cleanupSensitiveData(
  sqlite: SqliteConnection,
  now: number,
  retention: RetentionConfig
): CleanupResult {
  const cleanup = sqlite.transaction(() => {
    const expiredRateLimits = sqlite.prepare(
      'DELETE FROM rate_limit_buckets WHERE reset_at < ?'
    ).run(now - DAY_MS)
    const expiredWebKnowledge = sqlite.prepare(
      'DELETE FROM assistant_web_knowledge WHERE expires_at < ?'
    ).run(now - 30 * DAY_MS)
    const minimizedAssistantRuns = sqlite.prepare(`
      UPDATE assistant_runs
      SET query = '', ip_address = NULL
      WHERE created_at < ? AND (query <> '' OR ip_address IS NOT NULL)
    `).run(now - retention.assistantIdentityDays * DAY_MS)
    const expiredAssistantRuns = sqlite.prepare(
      'DELETE FROM assistant_runs WHERE created_at < ?'
    ).run(now - retention.assistantRunDays * DAY_MS)
    const expiredVisitorEvents = sqlite.prepare(
      'DELETE FROM visitor_events WHERE created_at < ?'
    ).run(now - retention.visitorEventDays * DAY_MS)
    const expiredVisitors = sqlite.prepare(
      'DELETE FROM visitors WHERE last_seen_at < ?'
    ).run(now - retention.visitorDays * DAY_MS)
    const expiredDeletedChats = sqlite.prepare(
      'DELETE FROM chat_messages WHERE deleted_at IS NOT NULL AND deleted_at < ?'
    ).run(now - retention.deletedChatDays * DAY_MS)
    const expiredChats = sqlite.prepare(
      'DELETE FROM chat_messages WHERE created_at < ?'
    ).run(now - retention.chatDays * DAY_MS)
    const expiredAdminSessions = sqlite.prepare(
      'DELETE FROM admin_sessions WHERE expires_at < ?'
    ).run(now)
    const expiredUserSessions = sqlite.prepare(
      'DELETE FROM user_sessions WHERE expires_at < ?'
    ).run(now)

    return {
      expiredRateLimits: expiredRateLimits.changes,
      expiredWebKnowledge: expiredWebKnowledge.changes,
      minimizedAssistantRuns: minimizedAssistantRuns.changes,
      expiredAssistantRuns: expiredAssistantRuns.changes,
      expiredVisitorEvents: expiredVisitorEvents.changes,
      expiredVisitors: expiredVisitors.changes,
      expiredDeletedChats: expiredDeletedChats.changes,
      expiredChats: expiredChats.changes,
      expiredAdminSessions: expiredAdminSessions.changes,
      expiredUserSessions: expiredUserSessions.changes
    }
  })

  return cleanup()
}

async function main(): Promise<void> {
  const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
  try {
    const client = getDatabase(databasePath)
    const cleanup = cleanupSensitiveData(client.sqlite, Date.now(), loadRetentionConfig())

    process.stdout.write(JSON.stringify({
      database: client.path,
      ...cleanup
    }) + '\n')
  } finally {
    closeDatabase(databasePath)
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main()
}
