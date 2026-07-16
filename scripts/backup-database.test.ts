import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { backupDatabase, DatabaseBackupError } from './backup-database'

test('online backup captures WAL-visible data and writes verified hash metadata atomically', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-db-backup-'))
  const sourcePath = join(directory, 'source.sqlite')
  const outputPath = join(directory, 'backups', 'snapshot.sqlite')
  const source = new BetterSqlite3(sourcePath)
  try {
    source.pragma('journal_mode = WAL')
    source.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    source.prepare('INSERT INTO records (value) VALUES (?)').run('committed while source remains open')

    const result = await backupDatabase({
      databasePath: sourcePath,
      outputPath,
      now: Date.parse('2026-07-15T21:20:00+08:00'),
      cwd: directory
    })
    assert.equal(result.integrityCheck, 'ok')
    assert.equal(result.foreignKeyViolations, 0)
    assert.equal(result.sha256.length, 64)
    assert.ok(result.bytes > 0)
    assert.equal(existsSync(outputPath), true)
    assert.equal(existsSync(`${outputPath}.json`), true)
    assert.equal(readdirSync(join(directory, 'backups')).some(file => file.includes('.partial-')), false)

    const backup = new BetterSqlite3(outputPath, { readonly: true })
    assert.equal(
      (backup.prepare('SELECT value FROM records').get() as { value: string }).value,
      'committed while source remains open'
    )
    backup.close()

    const metadata = JSON.parse(readFileSync(`${outputPath}.json`, 'utf8')) as Record<string, unknown>
    assert.equal(metadata.sha256, result.sha256)
    assert.equal(metadata.outputPath, 'snapshot.sqlite')
    assert.equal(metadata.sourceFile, 'source.sqlite')
    assert.equal(String(metadata.outputPath).includes(directory), false)

    await assert.rejects(
      backupDatabase({ databasePath: sourcePath, outputPath, cwd: directory }),
      /already exists/
    )
  } finally {
    source.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('backup refuses missing sources, source overwrite and publicly served destinations', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-db-backup-guard-'))
  const sourcePath = join(directory, 'source.sqlite')
  const source = new BetterSqlite3(sourcePath)
  source.exec('CREATE TABLE safe (id INTEGER PRIMARY KEY)')
  source.close()
  try {
    await assert.rejects(
      backupDatabase({ databasePath: join(directory, 'missing.sqlite'), cwd: directory }),
      DatabaseBackupError
    )
    await assert.rejects(
      backupDatabase({ databasePath: sourcePath, outputPath: sourcePath, cwd: directory }),
      /must differ/
    )
    await assert.rejects(
      backupDatabase({
        databasePath: sourcePath,
        outputPath: join(directory, 'public', 'database.sqlite'),
        cwd: directory
      }),
      /must not be placed/
    )
    assert.equal(existsSync(join(directory, 'public', 'database.sqlite')), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
