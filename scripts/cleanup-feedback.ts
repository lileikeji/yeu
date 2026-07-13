import './load-env'
import { and, inArray, isNotNull, lt } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '../server/database/client'
import { feedback } from '../server/database/schema'

const DAY_MS = 24 * 60 * 60 * 1000
const TERMINAL_STATUSES = ['resolved', 'rejected', 'spam'] as const

function retentionDays(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error(`${name} must be an integer between 1 and 3650`)
  }

  return value
}

const databasePath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
const ipDays = retentionDays('NUXT_FEEDBACK_IP_RETENTION_DAYS', 30)
const contactDays = retentionDays('NUXT_FEEDBACK_CONTACT_RETENTION_DAYS', 90)
const recordDays = retentionDays('NUXT_FEEDBACK_RECORD_RETENTION_DAYS', 730)
const now = Date.now()

try {
  const client = getDatabase(databasePath)
  const ipResult = client.db.update(feedback).set({
    submitterIpHash: null
  }).where(and(
    isNotNull(feedback.submitterIpHash),
    lt(feedback.createdAt, now - ipDays * DAY_MS)
  )).run()

  const contactResult = client.db.update(feedback).set({
    contact: null
  }).where(and(
    isNotNull(feedback.contact),
    isNotNull(feedback.resolvedAt),
    inArray(feedback.status, [...TERMINAL_STATUSES]),
    lt(feedback.resolvedAt, now - contactDays * DAY_MS)
  )).run()

  const recordResult = client.db.delete(feedback).where(
    lt(feedback.createdAt, now - recordDays * DAY_MS)
  ).run()

  process.stdout.write(JSON.stringify({
    database: client.path,
    clearedIpHashes: ipResult.changes,
    clearedContacts: contactResult.changes,
    deletedRecords: recordResult.changes
  }) + '\n')
} finally {
  closeDatabase(databasePath)
}
