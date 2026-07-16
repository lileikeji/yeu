import './load-env'
import { createHash, randomUUID } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'

interface BackupOptions {
  databasePath?: string
  outputPath?: string
  now?: number
  cwd?: string
}

interface CliIo {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export interface DatabaseBackupResult {
  sourceFile: string
  outputPath: string
  metadataPath: string
  createdAt: string
  bytes: number
  sha256: string
  schemaVersion: number
  migrationCount: number
  integrityCheck: 'ok'
  foreignKeyViolations: 0
  elapsedMs: number
}

export class DatabaseBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseBackupError'
  }
}

function assertBackup(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseBackupError(message)
}

function absolutePath(value: string, cwd: string): string {
  return isAbsolute(value) ? value : resolve(cwd, value)
}

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function timestampForPath(now: number): string {
  return new Date(now).toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolvePromise)
  })
  return hash.digest('hex')
}

function validateBackup(path: string): { schemaVersion: number, migrationCount: number } {
  const database = new BetterSqlite3(path, { readonly: true, fileMustExist: true })
  try {
    database.pragma('query_only = ON')
    const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>
    const foreignKeys = database.pragma('foreign_key_check') as unknown[]
    assertBackup(
      integrity.length === 1 && integrity[0]?.integrity_check === 'ok',
      `Backup integrity_check failed: ${JSON.stringify(integrity)}`
    )
    assertBackup(foreignKeys.length === 0, `Backup foreign_key_check found ${foreignKeys.length} violations`)
    const schemaVersion = database.pragma('user_version', { simple: true }) as number
    const hasMigrationTable = database.prepare(`
      SELECT 1 AS present FROM sqlite_master
      WHERE type = 'table' AND name = '__drizzle_migrations'
    `).get() !== undefined
    const migrationCount = hasMigrationTable
      ? (database.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get() as { count: number }).count
      : 0
    return { schemaVersion, migrationCount }
  } finally {
    database.close()
  }
}

function removeTransientSidecars(databasePath: string): void {
  for (const suffix of ['-shm', '-wal']) {
    const path = `${databasePath}${suffix}`
    if (existsSync(path)) rmSync(path, { force: true })
  }
}

export async function backupDatabase(options: BackupOptions = {}): Promise<DatabaseBackupResult> {
  const cwd = options.cwd ? absolutePath(options.cwd, process.cwd()) : process.cwd()
  const now = options.now ?? Date.now()
  assertBackup(Number.isInteger(now) && now >= 0, 'now must be a non-negative integer timestamp')

  const sourcePath = absolutePath(
    options.databasePath ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite',
    cwd
  )
  assertBackup(sourcePath !== ':memory:', 'In-memory databases cannot be backed up to a release artifact')
  assertBackup(existsSync(sourcePath), `Source database does not exist: ${sourcePath}`)

  const outputPath = absolutePath(
    options.outputPath ?? `./data/backups/yeu-${timestampForPath(now)}.sqlite`,
    cwd
  )
  const metadataPath = `${outputPath}.json`
  assertBackup(outputPath !== sourcePath, 'Backup output must differ from the source database')
  assertBackup(!existsSync(outputPath), `Backup output already exists: ${outputPath}`)
  assertBackup(!existsSync(metadataPath), `Backup metadata already exists: ${metadataPath}`)

  const unsafeRoots = [
    resolve(cwd, 'public'),
    resolve(cwd, '.output/public'),
    resolve(cwd, 'storage/uploads')
  ]
  assertBackup(
    !unsafeRoots.some(root => isWithin(root, outputPath)),
    'Backup output must not be placed in a public or uploaded-media directory'
  )

  mkdirSync(dirname(outputPath), { recursive: true })
  const suffix = `.partial-${randomUUID()}`
  const partialOutput = `${outputPath}${suffix}`
  const partialMetadata = `${metadataPath}${suffix}`
  let finalOutputCreated = false
  let finalMetadataCreated = false
  const startedAt = performance.now()
  const source = new BetterSqlite3(sourcePath, { readonly: true, fileMustExist: true })

  try {
    source.pragma('query_only = ON')
    await source.backup(partialOutput)
    const { schemaVersion, migrationCount } = validateBackup(partialOutput)
    removeTransientSidecars(partialOutput)
    const bytes = statSync(partialOutput).size
    assertBackup(bytes > 0, 'Backup file is empty')
    const sha256 = await sha256File(partialOutput)
    const createdAt = new Date(now).toISOString()
    const result: DatabaseBackupResult = {
      sourceFile: basename(sourcePath),
      outputPath,
      metadataPath,
      createdAt,
      bytes,
      sha256,
      schemaVersion,
      migrationCount,
      integrityCheck: 'ok',
      foreignKeyViolations: 0,
      elapsedMs: Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10)
    }
    writeFileSync(partialMetadata, `${JSON.stringify({
      ...result,
      outputPath: basename(outputPath),
      metadataPath: basename(metadataPath),
      commitSha: process.env.GIT_COMMIT_SHA || null
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    renameSync(partialOutput, outputPath)
    finalOutputCreated = true
    renameSync(partialMetadata, metadataPath)
    finalMetadataCreated = true
    return result
  } catch (error) {
    for (const path of [partialOutput, partialMetadata, `${partialOutput}-shm`, `${partialOutput}-wal`]) {
      if (existsSync(path)) rmSync(path, { force: true })
    }
    if (finalOutputCreated && existsSync(outputPath)) rmSync(outputPath, { force: true })
    if (finalMetadataCreated && existsSync(metadataPath)) rmSync(metadataPath, { force: true })
    throw error
  } finally {
    source.close()
  }
}

function usage(): string {
  return [
    'Usage: pnpm db:backup [--database PATH] [--output PATH]',
    '',
    'Creates an online SQLite backup, verifies integrity and foreign keys, then atomically publishes it with SHA-256 metadata.',
    'Existing outputs and public/static destinations are refused.'
  ].join('\n')
}

function parseCliArgs(argv: string[]): BackupOptions & { help: boolean } {
  const options: BackupOptions & { help: boolean } = { help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--database' || argument === '--output') {
      const value = argv[index + 1]
      assertBackup(value && !value.startsWith('-'), `${argument} requires a path`)
      if (argument === '--database') options.databasePath = value
      else options.outputPath = value
      index += 1
    } else throw new DatabaseBackupError(`Unknown argument: ${argument}`)
  }
  return options
}

export async function runCli(argv: string[], io: CliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
}): Promise<number> {
  try {
    const options = parseCliArgs(argv)
    if (options.help) {
      io.stdout(`${usage()}\n`)
      return 0
    }
    const result = await backupDatabase(options)
    io.stdout(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    io.stderr(`${JSON.stringify({ error: message }, null, 2)}\n`)
    return 1
  }
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
