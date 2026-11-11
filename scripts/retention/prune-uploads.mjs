#!/usr/bin/env node
/**
 * 孤儿上传回收：删除上传目录里「超过 N 天且数据库没有任何引用」的图片。
 *
 * 背景：`/api/place-moments/images` 保持匿名可用，攻击者可以用 30 次/小时/IP 往
 * 共享上传目录写文件，而此前没有任何回收入口。本脚本挂在 `yeu-retention.timer`
 * （03:25）上跑，默认 7 天。
 *
 * 安全口径：
 * - 只处理 `isUploadedImageFilename` 形状的文件（UUID v4 + png/jpg/webp），其他
 *   文件一律不动；
 * - 引用集合从数据库里「所有文本列里出现过的 /uploads/<uuid>.<ext>」反查，而不是
 *   写死某几张表。这样 contents.body、place_moments.images、place_merchants.
 *   qr_code_url、audit_logs.entity_id 里的 admin 媒体都能覆盖到；
 * - 大表（埋点、聊天、助手运行记录、会话、邮件内联图）整体跳过，避免每天全表扫；
 * - 数据库打不开时直接失败退出，不做任何删除；
 * - `--dry-run` 只报告，不删。
 *
 * 用法：
 *   node /opt/yeu-ops/prune-uploads.mjs [--days 7] [--dry-run] [--dir PATH]
 * 环境变量：NUXT_DATABASE_PATH、NUXT_UPLOAD_DIR、NUXT_UPLOAD_RETENTION_DAYS。
 */
import { existsSync, readdirSync, rmSync, statSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DAY_MS = 24 * 60 * 60 * 1000

/** 这些表内容里不会出现上传路径，或者行数太大（几十万行）不值得每天扫。 */
const SKIPPED_TABLES = new Set([
  'visitor_events',
  'visitor_bans',
  'rate_limit_buckets',
  'chat_messages',
  'admin_sessions',
  'user_sessions',
  'assistant_runs',
  'assistant_web_knowledge',
  'assistant_memory',
  'competition_email_images'
])

const SKIPPED_TABLE_PREFIXES = ['assistant_', 'sqlite_', '__drizzle']

const UPLOADED_FILENAME = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)/gi
const UPLOADED_FILENAME_EXACT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i

function retentionDaysFromEnv(value) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : null
}

function parseArgs(argv) {
  const options = {
    days: retentionDaysFromEnv(process.env.NUXT_UPLOAD_RETENTION_DAYS) ?? 7,
    dryRun: false,
    directory: process.env.NUXT_UPLOAD_DIR?.trim() || ''
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--days') {
      const value = Number(argv[++index])
      if (!Number.isInteger(value) || value < 1 || value > 3650) {
        throw new Error('--days must be an integer between 1 and 3650')
      }
      options.days = value
    } else if (arg === '--dir') {
      options.directory = argv[++index] ?? ''
      if (!options.directory) throw new Error('--dir requires a path')
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

function loadBetterSqlite3() {
  // 生产 release 只发 .output；better-sqlite3 挂在 .output/server/node_modules 下，
  // 用它的 package.json 做解析根，和 scripts/cleanup-sensitive-data.mjs 同一手法。
  const outputPackage = resolve('.output/server/package.json')
  const require = createRequire(existsSync(outputPackage)
    ? pathToFileURL(outputPackage)
    : import.meta.url)
  return require('better-sqlite3')
}

function isTextColumn(column) {
  const type = String(column.type ?? '').toLowerCase()
  return type.includes('text') || type === '' || type === 'clob' || type === 'varchar'
}

/** 扫全库文本列，收集所有被引用的上传文件名。 */
function collectReferencedFilenames(db) {
  const referenced = new Set()
  const scannedColumns = []
  const tables = db.prepare(
    'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name'
  ).all()

  for (const { name } of tables) {
    if (SKIPPED_TABLES.has(name)) continue
    if (SKIPPED_TABLE_PREFIXES.some(prefix => name.startsWith(prefix))) continue
    const quoted = `"${name.replaceAll('"', '""')}"`
    let columns
    try {
      columns = db.prepare(`PRAGMA table_info(${quoted})`).all()
    } catch {
      continue
    }
    for (const column of columns) {
      if (!isTextColumn(column)) continue
      const columnName = `"${String(column.name).replaceAll('"', '""')}"`
      let rows
      try {
        // 引用有两种存法：`/uploads/<uuid>.png` 完整路径（place_moments.images、
        // qr_code_url）和裸文件名（audit_logs.entity_id 里的后台媒体）。只按
        // `%/uploads/%` 过滤会漏掉后者，把仍在引用的文件删掉，所以再兜一层扩展名。
        // 多匹配只会让文件多留一会儿（安全方向），漏匹配才会误删。
        rows = db.prepare(
          `SELECT ${columnName} AS value FROM ${quoted}
           WHERE ${columnName} LIKE '%uploads/%'
              OR ${columnName} LIKE '%.png%'
              OR ${columnName} LIKE '%.jpg%'
              OR ${columnName} LIKE '%.webp%'`
        ).all()
      } catch {
        continue
      }
      if (!rows.length) continue
      scannedColumns.push(`${name}.${column.name}`)
      for (const row of rows) {
        if (typeof row.value !== 'string') continue
        for (const match of row.value.matchAll(UPLOADED_FILENAME)) referenced.add(match[0].toLowerCase())
      }
    }
  }
  return { referenced, scannedColumns }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const configuredPath = process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
  const databasePath = isAbsolute(configuredPath) ? configuredPath : resolve(configuredPath)
  const directory = options.directory
    ? (isAbsolute(options.directory) ? options.directory : resolve(options.directory))
    : resolve('storage/uploads')

  const output = {
    database: databasePath,
    uploadDirectory: directory,
    retentionDays: options.days,
    dryRun: options.dryRun,
    scannedFiles: 0,
    referencedFiles: 0,
    deletedFiles: 0,
    deletedBytes: 0,
    keptReferenced: 0,
    keptRecent: 0,
    deleted: [],
    scannedColumns: []
  }

  if (!existsSync(databasePath)) {
    throw new Error(`Database does not exist: ${databasePath}`)
  }
  if (!existsSync(directory)) {
    // 目录不存在等于没有孤儿：不报警，直接 0。
    writeSync(1, `${JSON.stringify(output)}\n`)
    return
  }

  const BetterSqlite3 = loadBetterSqlite3()
  const db = new BetterSqlite3(databasePath)
  let referenced
  try {
    db.pragma('busy_timeout = 15000')
    const collected = collectReferencedFilenames(db)
    referenced = collected.referenced
    output.scannedColumns = collected.scannedColumns
  } finally {
    db.close()
  }
  output.referencedFiles = referenced.size

  const deadline = Date.now() - options.days * DAY_MS
  for (const entry of readdirSync(directory)) {
    if (!UPLOADED_FILENAME_EXACT.test(entry)) continue
    output.scannedFiles += 1
    if (referenced.has(entry.toLowerCase())) {
      output.keptReferenced += 1
      continue
    }
    const path = join(directory, entry)
    let stats
    try {
      stats = statSync(path)
    } catch {
      continue
    }
    if (!stats.isFile()) continue
    if (stats.mtimeMs > deadline) {
      output.keptRecent += 1
      continue
    }
    if (!options.dryRun) {
      try {
        rmSync(path, { force: true })
      } catch (error) {
        output.errors = [...(output.errors ?? []), `${entry}: ${error instanceof Error ? error.message : String(error)}`]
        continue
      }
    }
    output.deletedFiles += 1
    output.deletedBytes += stats.size
    if (output.deleted.length < 50) output.deleted.push(entry)
  }

  writeSync(1, `${JSON.stringify(output)}\n`)
}

try {
  main()
} catch (error) {
  writeSync(2, `prune-uploads failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
