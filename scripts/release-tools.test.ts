import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readReleaseVersion } from '../server/utils/release-version'

const tools = await import(pathToFileURL(resolve('scripts/release-tools.mjs')).href)

function fixture(sql: string) {
  const root = mkdtempSync(join(tmpdir(), 'yeu-release-test-'))
  const migrations = join(root, 'migrations')
  mkdirSync(join(migrations, 'meta'), { recursive: true })
  writeFileSync(join(migrations, 'meta/_journal.json'), JSON.stringify({ entries: [{ tag: '0000_test', when: 1 }] }))
  writeFileSync(join(migrations, '0000_test.sql'), sql)
  return { root, migrations, database: join(root, 'database.sqlite') }
}

test('实际迁移失败时事务回滚，已有业务数据保留', async () => {
  const f = fixture('CREATE TABLE items(id integer PRIMARY KEY, value text NOT NULL);')
  try {
    await tools.migrateDatabase(f.database, f.migrations)
    const db = new DatabaseSync(f.database)
    db.exec('INSERT INTO items VALUES(1,\'keep\'),(2,\'keep\')')
    db.close()
    writeFileSync(join(f.migrations, 'meta/_journal.json'), JSON.stringify({ entries: [{ tag: '0000_test', when: 1 }, { tag: '0001_broken', when: 2 }] }))
    writeFileSync(join(f.migrations, '0001_broken.sql'), 'ALTER TABLE items ADD COLUMN extra text;--> statement-breakpoint\nCREATE UNIQUE INDEX unique_value ON items(value);')
    await assert.rejects(tools.migrateDatabase(f.database, f.migrations), /UNIQUE/)
    const restored = new DatabaseSync(f.database)
    assert.equal(restored.prepare('SELECT value FROM items').get()?.value, 'keep')
    assert.equal(restored.prepare('PRAGMA table_info(items)').all().length, 2)
    restored.close()
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('表重建迁移默认被拒，只有显式放行标记才执行并保留数据', async () => {
  const f = fixture('CREATE TABLE items(id integer PRIMARY KEY, value text NOT NULL);')
  try {
    await tools.migrateDatabase(f.database, f.migrations)
    const db = new DatabaseSync(f.database)
    db.exec('INSERT INTO items VALUES(1,\'keep\')')
    db.close()
    writeFileSync(
      join(f.migrations, 'meta/_journal.json'),
      JSON.stringify({ entries: [{ tag: '0000_test', when: 1 }, { tag: '0001_rebuild', when: 2 }] })
    )
    // 需要重建表才能把 CHECK 从 1 列放宽到 2 列，SQLite 只能 DROP + RENAME。
    const rebuild = [
      'CREATE TABLE __new_items(id integer PRIMARY KEY, value text NOT NULL, extra text);--> statement-breakpoint',
      'INSERT INTO __new_items(id, value) SELECT id, value FROM items;--> statement-breakpoint',
      'DROP TABLE items;--> statement-breakpoint',
      'ALTER TABLE __new_items RENAME TO items;'
    ].join('\n')
    writeFileSync(join(f.migrations, '0001_rebuild.sql'), rebuild)
    await assert.rejects(tools.migrateDatabase(f.database, f.migrations), /破坏兼容性的迁移.*0001_rebuild/)
    const untouched = new DatabaseSync(f.database)
    assert.equal(untouched.prepare('PRAGMA table_info(items)').all().length, 2)
    untouched.close()
    writeFileSync(
      join(f.migrations, '0001_rebuild.sql'),
      `-- yeu:allow-table-rebuild items\n${rebuild}`
    )
    assert.deepEqual(await tools.migrateDatabase(f.database, f.migrations), { applied: 1 })
    const rebuilt = new DatabaseSync(f.database)
    assert.equal(rebuilt.prepare('PRAGMA table_info(items)').all().length, 3)
    assert.equal(rebuilt.prepare('SELECT value FROM items').get()?.value, 'keep')
    rebuilt.close()
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('只读闸门拒绝缺列；不能通过 baseline 隐藏结构缺失', async () => {
  const f = fixture('CREATE TABLE items(id integer PRIMARY KEY, required text NOT NULL);')
  try {
    const db = new DatabaseSync(f.database)
    db.exec('CREATE TABLE items(id integer PRIMARY KEY)')
    db.close()
    const before = readFileSync(f.database)
    await assert.rejects(tools.migrateDatabase(f.database, f.migrations, 'check'), /业务列不兼容/)
    assert.deepEqual(readFileSync(f.database), before)
    await assert.rejects(tools.migrateDatabase(f.database, f.migrations, 'baseline'), /业务列不兼容/)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('手工结构验证通过后 baseline 只补账本，重复执行不增加记录', async () => {
  const f = fixture('CREATE TABLE items(id integer PRIMARY KEY, value text NOT NULL);')
  try {
    const db = new DatabaseSync(f.database)
    db.exec('CREATE TABLE items(id integer PRIMARY KEY, value text NOT NULL); INSERT INTO items VALUES(1,\'keep\')')
    db.close()
    assert.equal((await tools.migrateDatabase(f.database, f.migrations, 'baseline')).applied, 1)
    assert.equal((await tools.migrateDatabase(f.database, f.migrations, 'baseline')).applied, 0)
    const checked = new DatabaseSync(f.database)
    assert.equal(checked.prepare('SELECT value FROM items').get()?.value, 'keep')
    assert.equal(checked.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()?.n, 1)
    checked.close()
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('实际迁移目录可从空库构建并通过只读结构检查', async () => {
  const root = mkdtempSync(join(tmpdir(), 'yeu-full-schema-'))
  try {
    const database = join(root, 'fresh.sqlite')
    const migrations = resolve('server/database/migrations')
    assert.ok((await tools.migrateDatabase(database, migrations)).applied >= 39)
    await tools.migrateDatabase(database, migrations, 'check')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('已部署摘要对比拒绝不 bump 的检索改动和历史 SQL 篡改', () => {
  const previous = { retrieval: { hash: 'old', version: 'v1' }, migrations: [{ tag: '0000', hash: 'one' }] }
  assert.throws(() => tools.checkRetrieval(previous, { ...previous, retrieval: { hash: 'new', version: 'v1' } }), /未 bump/)
  assert.throws(() => tools.checkRetrieval(previous, { ...previous, migrations: [{ tag: '0000', hash: 'two' }] }), /历史迁移/)
  tools.checkRetrieval(previous, { ...previous, retrieval: { hash: 'new', version: 'v2' } })
})

test('结构正确但迁移账本被篡改时，只读发布闸门仍拒绝', async () => {
  const f = fixture('CREATE TABLE items(id integer PRIMARY KEY);')
  try {
    await tools.migrateDatabase(f.database, f.migrations)
    const db = new DatabaseSync(f.database)
    db.exec('UPDATE __drizzle_migrations SET hash=\'tampered\'')
    db.close()
    await assert.rejects(tools.migrateDatabase(f.database, f.migrations, 'check'), /迁移账本/)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('兼容历史 Windows CRLF 迁移哈希，同时保持源码修改拦截', async () => {
  const sql = 'CREATE TABLE items(id integer PRIMARY KEY);\n'
  const f = fixture(sql)
  try {
    await tools.migrateDatabase(f.database, f.migrations)
    const db = new DatabaseSync(f.database)
    const oldHash = createHash('sha256').update(sql.replace(/\n/g, '\r\n')).digest('hex')
    db.prepare('UPDATE __drizzle_migrations SET hash=?').run(oldHash)
    db.close()
    await tools.migrateDatabase(f.database, f.migrations, 'check')
    writeFileSync(join(f.migrations, '0000_test.sql'), `${sql}-- changed source\n`)
    await assert.rejects(tools.migrateDatabase(f.database, f.migrations, 'check'), /迁移账本/)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('公开版本只返回提交、release 和时间，非法元数据拒绝读取', () => {
  const root = mkdtempSync(join(tmpdir(), 'yeu-version-'))
  try {
    mkdirSync(join(root, '.output'))
    const value = { commit: 'a'.repeat(40), release: '20261009-test', builtAt: '2026-10-09T00:00:00Z', native: 'private' }
    writeFileSync(join(root, '.output/release.json'), JSON.stringify(value))
    assert.deepEqual(readReleaseVersion(root), { commit: value.commit, release: value.release, builtAt: value.builtAt })
    writeFileSync(join(root, '.output/release.json'), JSON.stringify({ ...value, commit: 'short' }))
    assert.throws(() => readReleaseVersion(root))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('CLI 入口判定解开符号链接：经由 current 软链调用不再静默退出', () => {
  const root = mkdtempSync(join(tmpdir(), 'yeu-entry-'))
  try {
    const modulePath = join(root, 'release-tools.mjs')
    writeFileSync(modulePath, 'console.log(\'ran\')\n')
    const linkPath = join(root, 'current')
    symlinkSync(modulePath, linkPath, 'file')
    const moduleUrl = pathToFileURL(modulePath).href
    // 生产布局：argv[1] 走软链，import.meta.url 是真实路径。直接比较 resolve() 会漏。
    assert.equal(tools.isEntryPoint(linkPath, moduleUrl), true)
    assert.equal(tools.isEntryPoint(modulePath, moduleUrl), true)
    assert.equal(tools.isEntryPoint(join(root, 'other.mjs'), moduleUrl), false)
    assert.equal(tools.isEntryPoint(undefined, moduleUrl), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
