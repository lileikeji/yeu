import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

const migrateScript = resolve('scripts/db-migrate.ts')

function runMigration(envFile: string, databasePath?: string) {
  const env = { ...process.env, NUXT_ENV_FILE: envFile }
  delete env.NUXT_DATABASE_PATH
  if (databasePath) env.NUXT_DATABASE_PATH = databasePath

  return spawnSync(process.execPath, ['--import', 'tsx', migrateScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env
  })
}

test('maintenance CLI loads an explicit env file and preserves an existing process value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-load-env-'))

  try {
    const fromFileDatabase = join(directory, 'from-file.sqlite')
    const envFile = join(directory, 'maintenance.env')
    writeFileSync(envFile, `NUXT_DATABASE_PATH=${fromFileDatabase.replaceAll('\\', '/')}\n`)

    const fromFile = runMigration(envFile)
    assert.equal(fromFile.status, 0, fromFile.stderr)
    assert.equal(existsSync(fromFileDatabase), true)

    const ignoredFileDatabase = join(directory, 'ignored-file.sqlite')
    const overrideDatabase = join(directory, 'process-override.sqlite')
    const overrideEnvFile = join(directory, 'override.env')
    writeFileSync(overrideEnvFile, `NUXT_DATABASE_PATH=${ignoredFileDatabase.replaceAll('\\', '/')}\n`)

    const overridden = runMigration(overrideEnvFile, overrideDatabase)
    assert.equal(overridden.status, 0, overridden.stderr)
    assert.equal(existsSync(overrideDatabase), true)
    assert.equal(existsSync(ignoredFileDatabase), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
