import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const tools = await import(pathToFileURL(resolve('scripts/release-tools.mjs')).href)

test('备份可恢复到独立目录，摘要及数据库完整性一致', async () => {
  const root = mkdtempSync(join(tmpdir(), 'yeu-backup-test-'))
  try {
    const source = join(root, 'backup.sqlite')
    const db = new DatabaseSync(source)
    db.exec('CREATE TABLE items(id integer PRIMARY KEY, value text); INSERT INTO items VALUES(1,\'fixture\')')
    db.close()
    const result = await tools.verifyBackup(source)
    assert.equal(result.integrity, 'ok')
    assert.match(result.sha256, /^[a-f0-9]{64}$/)
    assert.equal(result.tables, 1)
    const original = new DatabaseSync(source, { readOnly: true })
    assert.equal(original.prepare('SELECT value FROM items').get()?.value, 'fixture')
    original.close()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('损坏备份拒绝通过恢复验证', async () => {
  const root = mkdtempSync(join(tmpdir(), 'yeu-backup-test-'))
  try {
    const source = join(root, 'backup.sqlite')
    const fs = await import('node:fs')
    fs.writeFileSync(source, 'not a SQLite backup')
    await assert.rejects(tools.verifyBackup(source), /database|数据库/i)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
