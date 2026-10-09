import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const retrievalPaths = [
  'server/modules/assistant', 'server/api/public/assistant',
  'server/api/public/assistant.stream.post.ts', 'server/utils/assistant-config.ts',
  'shared/utils/assistant-query.ts'
]
const hash = value => createHash('sha256').update(value).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))

export function retrievalMetadata(root) {
  const files = []
  function visit(path) {
    const absolute = join(root, path)
    if (!existsSync(absolute)) return
    if (readdirSafe(absolute)) {
      for (const entry of readdirSync(absolute).sort()) visit(`${path}/${entry}`)
    } else if (!path.includes('.test.')) {
      files.push([path, hash(readFileSync(absolute))])
    }
  }
  for (const path of retrievalPaths) visit(path)
  const source = readFileSync(join(root, 'server/modules/assistant/service.ts'), 'utf8')
  const version = source.match(/const ASSISTANT_CACHE_VERSION = ['"]([^'"]+)['"]/)?.[1]
  if (!version) throw new Error('缺少 ASSISTANT_CACHE_VERSION')
  return { version, hash: hash(JSON.stringify(files)) }
}

function readdirSafe(path) {
  try {
    readdirSync(path)
    return true
  } catch (error) {
    if (error.code === 'ENOTDIR') return false
    throw error
  }
}

export function checkRetrieval(previous, candidate) {
  if (previous.retrieval.hash !== candidate.retrieval.hash
    && previous.retrieval.version === candidate.retrieval.version) {
    throw new Error('检索代码已变更，但 ASSISTANT_CACHE_VERSION 未 bump')
  }
  for (const entry of previous.migrations) {
    const next = candidate.migrations.find(item => item.tag === entry.tag)
    if (!next || next.hash !== entry.hash) throw new Error(`历史迁移被修改或删除：${entry.tag}`)
  }
}

export function checkLegacyRetrieval(output, candidate) {
  const versions = new Set()
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.mjs')) {
        for (const match of readFileSync(file, 'utf8').matchAll(/['"](rag-v[0-9]+-[a-z0-9-]+)['"]/g)) versions.add(match[1])
      }
    }
  }
  visit(join(output, 'server'))
  if (versions.size !== 1 || versions.has(candidate.retrieval.version)) {
    throw new Error('旧版本缺少检索摘要；首次接入发布闸门必须 bump 缓存版本')
  }
}

export function migrationFiles(directory) {
  return json(join(directory, 'meta/_journal.json')).entries.map((entry) => {
    if (!/^\d{4}_[a-z0-9_]+$/.test(entry.tag)) throw new Error('迁移 tag 非法')
    const sql = readFileSync(join(directory, `${entry.tag}.sql`), 'utf8')
    const normalized = sql.replace(/\r\n/g, '\n')
    const legacyHashes = [...new Set([hash(sql), hash(normalized), hash(normalized.replace(/\n/g, '\r\n'))])]
    return { tag: entry.tag, when: entry.when, hash: hash(normalized), legacyHashes, sql }
  })
}

export function createRelease(root, output, release, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^\d{8}-[a-z0-9-]+$/.test(release)) {
    throw new Error('发布提交号或 release 非法')
  }
  const directory = join(output, 'deploy')
  mkdirSync(directory, { recursive: true })
  cpSync(join(root, 'server/database/migrations'), join(directory, 'migrations'), { recursive: true })
  cpSync(join(root, 'scripts/release-tools.mjs'), join(directory, 'release-tools.mjs'))
  const native = 'server/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  const manifest = {
    commit, release, builtAt: new Date().toISOString(),
    platform: process.platform, arch: process.arch,
    node: process.version, abi: process.versions.modules,
    retrieval: retrievalMetadata(root),
    migrations: migrationFiles(join(directory, 'migrations')).map(({ tag, when, hash }) => ({ tag, when, hash })),
    native: { path: native, hash: hash(readFileSync(join(output, native))) }
  }
  writeFileSync(join(output, 'release.json'), `${JSON.stringify(manifest)}\n`)
  return manifest
}

async function openDatabase(path, readonly = false) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path, { readOnly: readonly, allowExtension: true })
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
  return db
}

function schema(db) {
  const tables = db.prepare('SELECT name,sql FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\' AND name != \'__drizzle_migrations\' ORDER BY name').all()
  return Object.fromEntries(tables.map(({ name, sql }) => {
    const virtualModule = sql.match(/\bUSING\s+(\w+)/i)?.[1]?.toLowerCase() ?? null
    const tokenizer = virtualModule ? sql.match(/\btokenize\s*=\s*['"]([^'"]+)['"]/i)?.[1] ?? null : null
    const quoted = `"${name.replaceAll('"', '""')}"`
    const columns = virtualModule === 'vec0' ? [] : db.prepare(`PRAGMA table_info(${quoted})`).all().map(({ name, type, notnull, pk, dflt_value }) => ({ name, type: type.toLowerCase(), notnull, pk, default: dflt_value }))
    const unique = virtualModule
      ? []
      : db.prepare(`PRAGMA index_list(${quoted})`).all().filter(index => index.unique && !index.partial).map(index =>
          db.prepare(`PRAGMA index_info("${index.name.replaceAll('"', '""')}")`).all().map(column => column.name).join(','))
    const foreignKeys = virtualModule
      ? []
      : db.prepare(`PRAGMA foreign_key_list(${quoted})`).all().map(({ table, from, to, on_update, on_delete }) =>
          [table, from, to, on_update, on_delete].join(':'))
    return [name, { columns, unique, foreignKeys, virtualModule, tokenizer }]
  }))
}

export function assertSchema(expected, actual) {
  for (const [table, contract] of Object.entries(expected)) {
    const present = actual[table]
    if (!present) throw new Error(`缺少业务表：${table}`)
    if (contract.virtualModule !== present.virtualModule || contract.tokenizer !== present.tokenizer) {
      throw new Error(`虚拟表或分词器不兼容：${table}`)
    }
    for (const column of contract.columns) {
      const found = present.columns.find(item => item.name === column.name)
      if (!found || JSON.stringify(found) !== JSON.stringify(column)) throw new Error(`业务列不兼容：${table}.${column.name}`)
    }
    for (const index of contract.unique) {
      if (!present.unique.includes(index)) throw new Error(`缺少唯一约束：${table}(${index})`)
    }
    for (const key of contract.foreignKeys) {
      if (!present.foreignKeys.includes(key)) throw new Error(`缺少外键约束：${table}:${key}`)
    }
  }
}

function applySql(db, entries, validate = () => {}) {
  db.exec('CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)')
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const entry of entries) {
      for (const statement of entry.sql.split('--> statement-breakpoint')) {
        if (statement.trim()) db.exec(statement)
      }
      db.prepare('INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)').run(entry.hash, entry.when)
    }
    validate()
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export async function migrateDatabase(path, directory, mode = 'migrate') {
  const entries = migrationFiles(directory)
  const expected = await openDatabase(':memory:')
  const db = await openDatabase(path, mode === 'check')
  try {
    applySql(expected, entries)
    const contract = schema(expected)
    const table = db.prepare('SELECT 1 FROM sqlite_master WHERE name=\'__drizzle_migrations\'').get()
    const applied = table ? db.prepare('SELECT hash,created_at FROM __drizzle_migrations ORDER BY created_at').all() : []
    for (const item of applied) {
      if (!entries.some(entry => entry.when === item.created_at && entry.legacyHashes.includes(item.hash))) {
        throw new Error(`迁移账本与发布 SQL 不一致，拒绝发布或迁移：${item.created_at}`)
      }
    }
    if (mode === 'check') {
      assertSchema(contract, schema(db))
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库外键检查失败')
      return { applied: 0, pendingLedger: entries.filter(entry => entry.when > (applied.at(-1)?.created_at ?? 0)).length }
    }
    const last = applied.at(-1)?.created_at ?? 0
    const pending = entries.filter(entry => entry.when > last)
    if (mode === 'baseline') {
      assertSchema(contract, schema(db))
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库外键检查失败')
      // Only register already-verified manual migrations; do not execute their SQL.
      applySql(db, pending.map(entry => ({ ...entry, sql: '' })))
    } else {
      const before = schema(db)
      if (Object.keys(before).length && pending.some(entry => /\b(DROP\s+(TABLE|COLUMN)|RENAME\s+(TO|COLUMN))\b/i.test(entry.sql))) {
        throw new Error('包含破坏兼容性的迁移，需单独迁移与恢复方案')
      }
      applySql(db, pending, () => {
        assertSchema(contract, schema(db))
        assertSchema(before, schema(db))
        if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库外键检查失败')
      })
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库外键检查失败')
    return { applied: pending.length }
  } finally {
    db.close()
    expected.close()
  }
}

export async function verifyNative(output) {
  const manifest = json(join(output, 'release.json'))
  if (manifest.platform !== process.platform || manifest.arch !== process.arch || manifest.abi !== process.versions.modules) {
    throw new Error('构建平台、架构或 Node ABI 与目标运行时不兼容；必须使用 Linux 云端制品')
  }
  const native = join(output, manifest.native.path)
  if (hash(readFileSync(native)) !== manifest.native.hash) throw new Error('SQLite 原生模块摘要不匹配')
  const binding = createRequire(import.meta.url)(native)
  if (!binding.isInitialized) {
    binding.setErrorConstructor(Error)
    binding.isInitialized = true
  }
  const nativeDb = new binding.Database(':memory:', ':memory:', true, false, false, 5000, null, null)
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const extension = join(output, 'server/node_modules', `sqlite-vec-${platform}-${process.arch}`, process.platform === 'win32' ? 'vec0.dll' : 'vec0.so')
  const db = await openDatabase(':memory:')
  try {
    nativeDb.loadExtension(extension)
    nativeDb.exec('SELECT vec_version()')
    db.loadExtension(extension)
    db.prepare('SELECT vec_version()').get()
  } finally {
    nativeDb.close()
    db.close()
  }
}

export function docsOnly(root, base, head) {
  if (!/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head)) return false
  const files = execFileSync('git', ['diff', '--name-only', '-z', base, head], { cwd: root }).toString().split('\0').filter(Boolean)
  return files.length > 0 && files.every(path => path.startsWith('docs/') || ['README.md', 'AGENTS.md'].includes(path))
}

async function fileDigest(path) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}

export async function verifyBackup(source) {
  const bytes = statSync(source).size
  const space = statfsSync(tmpdir())
  if (space.bavail * space.bsize < bytes + 536870912) throw new Error('隔离恢复目录空间不足')
  const directory = mkdtempSync(join(resolve(tmpdir()), 'yeu-backup-restore-'))
  if (dirname(directory) !== resolve(tmpdir())) throw new Error('隔离恢复目录超出临时目录')
  const target = join(directory, 'restore.sqlite')
  const started = performance.now()
  try {
    cpSync(source, target)
    chmodSync(target, 0o600)
    const expected = await fileDigest(source)
    const actual = await fileDigest(target)
    if (actual !== expected) throw new Error('备份恢复文件摘要不匹配')
    const db = await openDatabase(target, true)
    let tables
    try {
      const integrity = db.prepare('PRAGMA integrity_check').all()
      if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new Error('备份完整性检查失败')
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('备份外键检查失败')
      tables = db.prepare('SELECT count(*) AS n FROM sqlite_master WHERE type=\'table\'').get().n
    } finally { db.close() }
    return { bytes, sha256: actual, integrity: 'ok', tables, restoreMilliseconds: Math.round(performance.now() - started) }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function retentionPlan(base, keep = 4) {
  if (!Number.isInteger(keep) || keep < 4) throw new Error('至少保留 4 个 release 和备份')
  const releasesPath = join(base, 'releases')
  const backupsPath = join(base, 'shared/backups')
  const newest = (directory, names) => names.sort((a, b) => statSync(join(directory, b)).mtimeMs - statSync(join(directory, a)).mtimeMs)
  const releases = newest(releasesPath, readdirSync(releasesPath, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d{8}-[a-z0-9-]+$/.test(entry.name)).map(entry => entry.name))
  const backups = newest(backupsPath, readdirSync(backupsPath).filter(name => /^yeu-before-\d{8}-[a-z0-9-]+\.sqlite$/.test(name)))
  const protectedReleases = new Set(releases.slice(0, keep))
  const protectedBackups = new Set(backups.slice(0, keep))
  protectedReleases.add(basename(readlinkSync(join(base, 'current'))))
  const markers = newest(releasesPath, readdirSync(releasesPath).filter(name => /^DEPLOYED-.*\.txt$/.test(name))).slice(0, keep)
  for (const marker of markers) {
    const fields = Object.fromEntries(readFileSync(join(releasesPath, marker), 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)))
    if (fields.rollback) protectedReleases.add(basename(fields.rollback))
    if (fields.db_backup) protectedBackups.add(basename(fields.db_backup))
  }
  for (const release of protectedReleases) protectedBackups.add(`yeu-before-${release}.sqlite`)
  return {
    automaticDeletion: false, offsiteVerificationRequired: true,
    protectedReleases: [...protectedReleases], protectedBackups: [...protectedBackups],
    candidateReleases: releases.filter(name => !protectedReleases.has(name)),
    candidateBackups: backups.filter(name => !protectedBackups.has(name))
  }
}

async function main([command, ...args]) {
  if (command === 'create') console.log(JSON.stringify(createRelease(process.cwd(), resolve(args[0]), args[1], args[2])))
  else if (command === 'native') await verifyNative(resolve(args[0]))
  else if (command === 'compare') checkRetrieval(json(args[0]), json(args[1]))
  else if (command === 'legacy-compare') checkLegacyRetrieval(args[0], json(args[1]))
  else if (command === 'backup-verify') console.log(JSON.stringify(await verifyBackup(args[0])))
  else if (command === 'retention-plan') console.log(JSON.stringify(retentionPlan(args[0], args[1] ? Number(args[1]) : 4)))
  else if (command === 'serve') {
    const root = resolve(args[0])
    const child = spawn('runuser', ['-u', 'yeu', '--preserve-environment', '--', process.execPath, join(root, '.output/server/index.mjs')], {
      cwd: root, stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production', NITRO_HOST: '127.0.0.1', NITRO_PORT: args[2], NUXT_DATABASE_PATH: args[1] }
    })
    process.on('SIGTERM', () => child.kill('SIGTERM'))
    child.on('error', (error) => {
      console.error(error.message)
      process.exitCode = 1
    })
    child.on('exit', (code) => {
      process.exitCode = code ?? 1
    })
  } else if (['db-check', 'db-migrate', 'db-baseline'].includes(command)) {
    console.log(JSON.stringify(await migrateDatabase(args[0], args[1], command.slice(3) === 'migrate' ? 'migrate' : command.slice(3))))
  } else if (command === 'version-check') {
    const input = readFileSync(0, 'utf8')
    const value = JSON.parse(input)
    if (value.commit !== args[0] || value.release !== args[1]) throw new Error('运行版本与本次发布不一致')
  } else if (command === 'docs-only') process.exitCode = docsOnly(process.cwd(), args[0], args[1]) ? 0 : 1
  else throw new Error(`未知 release 命令：${command}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
