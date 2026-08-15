import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { lt } from 'drizzle-orm'
import { assistantAnswerCache, assistantWebKnowledge } from '../server/database/schema'

test('expired answer and web caches are deleted, fresh ones stay', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-cache-cleanup-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const now = Date.now()
    // expired + fresh answer cache rows
    client.sqlite.prepare(`
      INSERT INTO assistant_answer_cache (id, cache_key, query, response_json, knowledge_revision, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run('ac-expired', 'k1', 'q1', '{}', now - 1000, now - 2000, now)
    client.sqlite.prepare(`
      INSERT INTO assistant_answer_cache (id, cache_key, query, response_json, knowledge_revision, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run('ac-fresh', 'k2', 'q2', '{}', now + 1000, now - 2000, now)
    // expired + fresh web knowledge rows
    client.sqlite.prepare(`
      INSERT INTO assistant_web_knowledge (id, query_hash, query, title, url, snippet, source_host, status, fetched_at, expires_at, created_at, updated_at)
      VALUES (?, 'h1', 'q1', 't1', 'https://a.example/1', 's1', 'a.example', 'active', ?, ?, ?, ?)
    `).run('wk-expired', now - 2000, now - 1000, now - 2000, now)
    client.sqlite.prepare(`
      INSERT INTO assistant_web_knowledge (id, query_hash, query, title, url, snippet, source_host, status, fetched_at, expires_at, created_at, updated_at)
      VALUES (?, 'h2', 'q2', 't2', 'https://a.example/2', 's2', 'a.example', 'active', ?, ?, ?, ?)
    `).run('wk-fresh', now - 2000, now + 1000, now - 2000, now)

    // run the cleanup logic in-process
    client.db.delete(assistantAnswerCache).where(lt(assistantAnswerCache.expiresAt, now)).run()
    client.db.delete(assistantWebKnowledge).where(lt(assistantWebKnowledge.expiresAt, now)).run()

    const ac = client.sqlite.prepare('SELECT id FROM assistant_answer_cache').all() as Array<{ id: string }>
    assert.deepEqual(ac.map(row => row.id), ['ac-fresh'])
    const wk = client.sqlite.prepare('SELECT id FROM assistant_web_knowledge').all() as Array<{ id: string }>
    assert.deepEqual(wk.map(row => row.id), ['wk-fresh'])
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
