import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../server/database/schema'
import {
  AUTO_BAN_DURATION_MS,
  AUTO_BAN_REASON,
  AUTO_BAN_STRIKE_LIMIT,
  recordAutoBanStrike
} from '../server/utils/auto-ban'
import type { DatabaseClient } from '../server/database/client'

function makeClient(): { client: DatabaseClient, directory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-auto-ban-'))
  const sqlite = new BetterSqlite3(join(directory, 'auto-ban.sqlite'))
  sqlite.exec(`
    CREATE TABLE rate_limit_buckets (
      bucket_key text PRIMARY KEY NOT NULL,
      hit_count integer NOT NULL,
      reset_at integer NOT NULL
    );
    CREATE TABLE visitor_bans (
      id text PRIMARY KEY NOT NULL,
      scope text NOT NULL,
      value text NOT NULL,
      reason text NOT NULL DEFAULT '',
      is_active integer NOT NULL DEFAULT 1,
      banned_by_admin_id text,
      expires_at integer,
      created_at integer,
      updated_at integer
    );
  `)
  const client = {
    sqlite,
    db: drizzle(sqlite, { schema }),
    path: join(directory, 'auto-ban.sqlite')
  } satisfies DatabaseClient
  return { client, directory }
}

function activeBans(client: DatabaseClient, ip: string): Array<{ reason: string | null, expiresAt: number | null }> {
  return client.sqlite.prepare(
    'SELECT reason, expires_at as expiresAt FROM visitor_bans WHERE scope = ? AND value = ? AND is_active = 1'
  ).all('ip', ip) as Array<{ reason: string | null, expiresAt: number | null }>
}

test('repeated 429 strikes escalate to an automatic IP ban', () => {
  const { client, directory } = makeClient()
  try {
    const ip = `10.0.${Math.floor(Math.random() * 200)}.1`
    const now = Date.now()

    // Strikes below the limit: no ban yet.
    for (let i = 1; i < AUTO_BAN_STRIKE_LIMIT; i++) {
      assert.equal(recordAutoBanStrike(client, ip, now + i * 1000), false, `strike ${i} must not ban`)
    }
    assert.equal(activeBans(client, ip).length, 0)

    // The strike that reaches the limit bans the IP for the full duration.
    assert.equal(recordAutoBanStrike(client, ip, now + AUTO_BAN_STRIKE_LIMIT * 1000), true)
    const bans = activeBans(client, ip)
    assert.equal(bans.length, 1)
    assert.equal(bans[0]?.reason, AUTO_BAN_REASON)
    assert.ok(bans[0]!.expiresAt! >= now + AUTO_BAN_DURATION_MS - 1000)

    // Further strikes do not duplicate or extend the ban.
    assert.equal(recordAutoBanStrike(client, ip, now + 60_000), false)
    assert.equal(activeBans(client, ip).length, 1)
  } finally {
    client.sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('strike window expiry resets the counter', () => {
  const { client, directory } = makeClient()
  try {
    const ip = `10.0.${Math.floor(Math.random() * 200)}.2`
    const now = Date.now()

    for (let i = 1; i < AUTO_BAN_STRIKE_LIMIT; i++) {
      recordAutoBanStrike(client, ip, now + i * 1000)
    }
    // Window (10 min) expires; a new strike starts counting from 1 again.
    const later = now + AUTO_BAN_STRIKE_LIMIT * 4 * 60 * 1000
    assert.equal(recordAutoBanStrike(client, ip, later), false)
    assert.equal(activeBans(client, ip).length, 0)
  } finally {
    client.sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('unknown or empty IPs never get banned', () => {
  const { client, directory } = makeClient()
  try {
    const now = Date.now()
    for (let i = 0; i < AUTO_BAN_STRIKE_LIMIT + 2; i++) {
      assert.equal(recordAutoBanStrike(client, 'unknown', now), false)
    }
    assert.equal(activeBans(client, 'unknown').length, 0)
  } finally {
    client.sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
