import type { H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'

interface RateLimitBucket {
  count: number
  resetAt: number
}

const memoryBuckets = new Map<string, RateLimitBucket>()

/** Occasional cleanup: about 1% of SQLite-backed checks. */
const SQLITE_CLEANUP_PROBABILITY = 0.01

function rejectLimited(event: H3Event, resetAt: number): never {
  const now = Date.now()
  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000))
  setHeader(event, 'Retry-After', retryAfter)
  throw createError({
    statusCode: 429,
    statusMessage: 'Too many requests',
    data: { code: 'RATE_LIMITED' }
  })
}

function assertRateLimitMemory(
  event: H3Event,
  key: string,
  limit: number,
  windowMs: number
): void {
  const now = Date.now()
  const current = memoryBuckets.get(key)

  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  if (current.count >= limit) {
    rejectLimited(event, current.resetAt)
  }

  current.count += 1

  if (memoryBuckets.size > 2000) {
    for (const [bucketKey, bucket] of memoryBuckets) {
      if (bucket.resetAt <= now) {
        memoryBuckets.delete(bucketKey)
      }
    }
  }
}

function maybeCleanupExpiredBuckets(client: DatabaseClient, now: number): void {
  if (Math.random() >= SQLITE_CLEANUP_PROBABILITY) return
  try {
    client.sqlite
      .prepare('DELETE FROM rate_limit_buckets WHERE reset_at <= ?')
      .run(now)
  } catch {
    // Table may not exist yet during partial bootstrap; ignore.
  }
}

function assertRateLimitSqlite(
  event: H3Event,
  key: string,
  limit: number,
  windowMs: number,
  client: DatabaseClient
): void {
  const now = Date.now()
  const nextResetAt = now + windowMs

  let row: { hit_count: number, reset_at: number } | undefined
  try {
    // Atomic fixed window: reset when previous window expired, else increment.
    row = client.sqlite.prepare(`
      INSERT INTO rate_limit_buckets (bucket_key, hit_count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET
        hit_count = CASE
          WHEN rate_limit_buckets.reset_at <= ? THEN 1
          ELSE rate_limit_buckets.hit_count + 1
        END,
        reset_at = CASE
          WHEN rate_limit_buckets.reset_at <= ? THEN ?
          ELSE rate_limit_buckets.reset_at
        END
      RETURNING hit_count, reset_at
    `).get(key, nextResetAt, now, now, nextResetAt) as {
      hit_count: number
      reset_at: number
    }
  } catch {
    // Fallback if migration has not been applied yet.
    assertRateLimitMemory(event, key, limit, windowMs)
    return
  }

  maybeCleanupExpiredBuckets(client, now)

  if (!row) {
    assertRateLimitMemory(event, key, limit, windowMs)
    return
  }

  if (row.hit_count > limit) {
    rejectLimited(event, row.reset_at)
  }
}

/**
 * Fixed-window rate limit. When `client` is provided, buckets are stored in
 * SQLite so multi-process workers sharing the same database stay consistent.
 * Without a client (unit tests / early bootstrap), falls back to process memory.
 */
export function assertRateLimit(
  event: H3Event,
  key: string,
  limit: number,
  windowMs: number,
  client?: DatabaseClient
): void {
  if (client) {
    assertRateLimitSqlite(event, key, limit, windowMs, client)
    return
  }
  assertRateLimitMemory(event, key, limit, windowMs)
}

/** Test helper: clear in-memory buckets only. */
export function clearMemoryRateLimitBucketsForTests(): void {
  memoryBuckets.clear()
}
