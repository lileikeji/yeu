import { randomUUID } from 'node:crypto'
import { and, eq, gte, isNull, or } from 'drizzle-orm'
import type { DatabaseClient } from '../database/client'
import { visitorBans } from '../database/schema'
import { assertRateLimit } from './rate-limit'

/**
 * Escalation from "rate-limited (429)" to "IP banned".
 *
 * A single IP bursting far past the per-minute budgets (a crawler pulling
 * the whole site quickly) keeps hitting 429s. After enough strikes inside a
 * short window we write a real `visitor_bans` row so the existing
 * visitor-ban middleware returns 403 for everything from that IP — not just
 * the public API routes.
 *
 * Normal visitors never get here: the 1200 req/min public baseline is far
 * above any human rate, so a strike means genuine abuse traffic.
 */

/** How many 429s inside the strike window trigger an auto-ban. */
export const AUTO_BAN_STRIKE_LIMIT = 3

/** Strikes are counted inside this rolling-ish window (fixed window is fine). */
export const AUTO_BAN_STRIKE_WINDOW_MS = 10 * 60 * 1000

/** Banned for this long once escalated. */
export const AUTO_BAN_DURATION_MS = 24 * 60 * 60 * 1000

/** Distinguishes automated bans from admin/honeypot bans in ops screens. */
export const AUTO_BAN_REASON = 'auto_high_frequency'

/**
 * Record one 429 strike for an IP; when the strike count crosses the limit,
 * write an active IP ban and return true.
 *
 * Uses the same SQLite bucket table as rate limiting (key `auto-ban:<ip>`),
 * so multi-worker deployments share state consistently. If the table is
 * unavailable the strike is best-effort ignored (rate limiting still guards).
 */
export function recordAutoBanStrike(
  client: DatabaseClient,
  ip: string,
  now = Date.now()
): boolean {
  if (ip === 'unknown' || !ip) return false

  try {
    // Count strikes in a fixed window; reset when the window expires.
    const row = client.sqlite.prepare(`
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
      RETURNING hit_count
    `).get(`auto-ban:${ip}`, now + AUTO_BAN_STRIKE_WINDOW_MS, now, now, now + AUTO_BAN_STRIKE_WINDOW_MS) as {
      hit_count: number
    } | undefined

    if (!row || Number(row.hit_count) < AUTO_BAN_STRIKE_LIMIT) return false
  } catch {
    return false
  }

  try {
    // Skip if an active ban already exists (do not duplicate or extend).
    const existing = client.db.select({ id: visitorBans.id }).from(visitorBans).where(and(
      eq(visitorBans.scope, 'ip'),
      eq(visitorBans.value, ip),
      eq(visitorBans.isActive, true),
      or(isNull(visitorBans.expiresAt), gte(visitorBans.expiresAt, now))
    )).get()
    if (existing) return false

    client.db.insert(visitorBans).values({
      id: randomUUID(),
      scope: 'ip',
      value: ip,
      reason: AUTO_BAN_REASON,
      isActive: true,
      bannedByAdminId: null,
      expiresAt: now + AUTO_BAN_DURATION_MS,
      createdAt: now,
      updatedAt: now
    }).run()
    return true
  } catch {
    return false
  }
}
