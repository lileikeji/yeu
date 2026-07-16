import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import test from 'node:test'
import {
  createApp,
  createError,
  eventHandler,
  setHeader,
  toNodeListener
} from 'h3'
import BetterSqlite3 from 'better-sqlite3'
import {
  assertRateLimit,
  clearMemoryRateLimitBucketsForTests
} from '../server/utils/rate-limit'
import type { DatabaseClient } from '../server/database/client'

Object.defineProperty(globalThis, 'setHeader', {
  configurable: true,
  value: setHeader
})

Object.defineProperty(globalThis, 'createError', {
  configurable: true,
  value: createError
})

async function withApp(
  handler: Parameters<typeof eventHandler>[0],
  run: (url: string) => Promise<void>
): Promise<void> {
  const app = createApp().use(eventHandler(handler))
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
}

test('memory rate limiting returns Retry-After with 429', async () => {
  clearMemoryRateLimitBucketsForTests()
  const key = `test-mem-${Date.now()}-${Math.random()}`
  await withApp((event) => {
    assertRateLimit(event, key, 1, 10_000)
    return { ok: true }
  }, async (url) => {
    const first = await fetch(url)
    const limited = await fetch(url)

    assert.equal(first.status, 200)
    assert.equal(limited.status, 429)
    const body = await limited.json() as {
      statusCode?: number
      statusMessage?: string
      data?: { code?: string }
    }
    assert.equal(body.statusCode, 429)
    assert.equal(body.statusMessage, 'Too many requests')
    assert.equal(body.data?.code, 'RATE_LIMITED')
    assert.match(limited.headers.get('retry-after') || '', /^\d+$/)
    assert.ok(Number(limited.headers.get('retry-after')) >= 1)
  })
})

test('sqlite rate limiting is shared across handlers using the same database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-rate-limit-'))
  const dbPath = join(directory, 'rate.sqlite')
  const sqlite = new BetterSqlite3(dbPath)
  sqlite.exec(`
    CREATE TABLE rate_limit_buckets (
      bucket_key text PRIMARY KEY NOT NULL,
      hit_count integer NOT NULL,
      reset_at integer NOT NULL
    );
  `)
  const client = {
    sqlite,
    db: {} as DatabaseClient['db'],
    path: dbPath
  } satisfies DatabaseClient

  try {
    const key = `test-sqlite-${Date.now()}-${Math.random()}`
    await withApp((event) => {
      assertRateLimit(event, key, 2, 10_000, client)
      return { ok: true }
    }, async (url) => {
      assert.equal((await fetch(url)).status, 200)
      assert.equal((await fetch(url)).status, 200)
      const limited = await fetch(url)
      assert.equal(limited.status, 429)
      assert.equal(
        (sqlite.prepare(
          'SELECT hit_count FROM rate_limit_buckets WHERE bucket_key = ?'
        ).get(key) as { hit_count: number }).hit_count,
        3
      )
    })
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
