import assert from 'node:assert/strict'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import {
  cleanupSensitiveData,
  DAY_MS,
  loadRetentionConfig,
  retentionDays
} from './cleanup-sensitive-data'

function createDatabase(): BetterSqlite3.Database {
  const sqlite = new BetterSqlite3(':memory:')
  sqlite.exec(`
    CREATE TABLE rate_limit_buckets (bucket_key TEXT PRIMARY KEY, reset_at INTEGER NOT NULL);
    CREATE TABLE assistant_web_knowledge (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE assistant_runs (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE visitors (id TEXT PRIMARY KEY, last_seen_at INTEGER NOT NULL);
    CREATE TABLE visitor_events (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE
    );
    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE user_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  `)
  sqlite.pragma('foreign_keys = ON')
  return sqlite
}

test('retention config rejects unsafe values and accepts explicit overrides', () => {
  assert.equal(retentionDays('DAYS', 30, {}), 30)
  assert.equal(retentionDays('DAYS', 30, { DAYS: '45' }), 45)
  assert.throws(() => retentionDays('DAYS', 30, { DAYS: '0' }), /between 1 and 3650/)
  assert.throws(() => retentionDays('DAYS', 30, { DAYS: '2.5' }), /between 1 and 3650/)
  assert.equal(loadRetentionConfig({ NUXT_CHAT_RETENTION_DAYS: '120' }).chatDays, 120)
})

test('cleanup removes expired records while preserving recent records', () => {
  const sqlite = createDatabase()
  const now = Date.UTC(2026, 6, 27)
  const old = now - 400 * DAY_MS
  const identityOld = now - 40 * DAY_MS
  const recent = now - 2 * DAY_MS

  sqlite.prepare('INSERT INTO rate_limit_buckets VALUES (?, ?)').run('expired', old)
  sqlite.prepare('INSERT INTO rate_limit_buckets VALUES (?, ?)').run('recent', now + DAY_MS)
  sqlite.prepare('INSERT INTO assistant_web_knowledge VALUES (?, ?)').run('expired', old)
  sqlite.prepare('INSERT INTO assistant_web_knowledge VALUES (?, ?)').run('recent', recent)
  sqlite.prepare('INSERT INTO assistant_runs VALUES (?, ?, ?, ?)').run('expired', 'old query', '198.51.100.1', old)
  sqlite.prepare('INSERT INTO assistant_runs VALUES (?, ?, ?, ?)').run('anonymize', 'private query', '198.51.100.2', identityOld)
  sqlite.prepare('INSERT INTO assistant_runs VALUES (?, ?, ?, ?)').run('recent', 'recent query', '198.51.100.3', recent)
  sqlite.prepare('INSERT INTO visitors VALUES (?, ?)').run('expired', old)
  sqlite.prepare('INSERT INTO visitors VALUES (?, ?)').run('recent', recent)
  sqlite.prepare('INSERT INTO visitor_events VALUES (?, ?, ?)').run('expired', 'recent', old)
  sqlite.prepare('INSERT INTO visitor_events VALUES (?, ?, ?)').run('recent', 'recent', recent)
  sqlite.prepare('INSERT INTO chat_messages VALUES (?, ?, ?)').run('deleted', old, recent)
  sqlite.prepare('INSERT INTO chat_messages VALUES (?, ?, ?)').run('expired', null, old)
  sqlite.prepare('INSERT INTO chat_messages VALUES (?, ?, ?)').run('recent', null, recent)
  sqlite.prepare('INSERT INTO admin_sessions VALUES (?, ?)').run('expired', old)
  sqlite.prepare('INSERT INTO admin_sessions VALUES (?, ?)').run('recent', now + DAY_MS)
  sqlite.prepare('INSERT INTO user_sessions VALUES (?, ?)').run('expired', old)
  sqlite.prepare('INSERT INTO user_sessions VALUES (?, ?)').run('recent', now + DAY_MS)

  const result = cleanupSensitiveData(sqlite, now, loadRetentionConfig({}))

  assert.deepEqual(result, {
    expiredRateLimits: 1,
    expiredWebKnowledge: 1,
    minimizedAssistantRuns: 2,
    expiredAssistantRuns: 1,
    expiredVisitorEvents: 1,
    expiredVisitors: 1,
    expiredDeletedChats: 1,
    expiredChats: 1,
    expiredAdminSessions: 1,
    expiredUserSessions: 1
  })
  assert.deepEqual(
    sqlite.prepare('SELECT id, query, ip_address FROM assistant_runs ORDER BY id').all(),
    [
      { id: 'anonymize', query: '', ip_address: null },
      { id: 'recent', query: 'recent query', ip_address: '198.51.100.3' }
    ]
  )
  assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM visitor_events').get().count, 1)
  assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM chat_messages').get().count, 1)
  assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM admin_sessions').get().count, 1)
  assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM user_sessions').get().count, 1)
  sqlite.close()
})
