#!/usr/bin/env node
/**
 * 回填人气奖访问日志的 ip_hash（迁移 0100 之前的历史行）
 *
 * 迁移 0100 只给新写入的访问日志算 ip_hash：历史行的 ip 明文仍在表里，
 * 但 ip_hash 是 NULL。投票侧的「有投票无访问」弱比对按 ip_hash 反查，
 * 历史行 NULL 会让升级后 30 分钟内的老访问记录被漏判成「无访问」。
 * 本脚本用同一个 secret 重算并回填，写库前先自检算法与 secret 是否对得上。
 *
 * 用法：
 *   NUXT_ADMIN_SESSION_SECRET=<至少32字节> node scripts/backfill-popularity-visit-hash.mjs \
 *     --db data/yeu.sqlite [--days 30] [--dry-run] [--batch 500]
 *
 * 只回填 ip_hash。env_hash 依赖请求上下文（UA/时区/屏幕/核数等组合），
 * 离线无法重算，保持 NULL；它只用于选票侧比对，不参与访问日志判定。
 */
import Database from 'better-sqlite3'
import { createHmac } from 'node:crypto'

// 必须与 server/utils/security.ts:127 hashOpaqueToken 及
// server/utils/competition-popularity.ts:245 popularityIpHash 逐字节一致。
const IP_PURPOSE = 'competition-popularity-ip'

function popularityIpHash(secret, ip) {
  return createHmac('sha256', secret)
    .update(IP_PURPOSE)
    .update('\0')
    .update(ip)
    .digest('hex')
}

function parseArgs(argv) {
  const out = { db: '', days: 0, batch: 500, dryRun: false, secret: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    if (name === 'dry-run') { out.dryRun = true; continue }
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : ''
    if (name === 'db') out.db = value
    else if (name === 'days') out.days = Math.max(0, Number(value) || 0)
    else if (name === 'batch') out.batch = Math.max(50, Number(value) || 500)
    else if (name === 'secret') out.secret = value
  }
  return out
}

function fail(message, code = 2) {
  console.error(`[abort] ${message}`)
  process.exit(code)
}

const args = parseArgs(process.argv.slice(2))
const secret = args.secret || process.env.NUXT_ADMIN_SESSION_SECRET || ''
if (!args.db) fail('缺少 --db <数据库路径>')
if (Buffer.byteLength(secret) < 32) {
  fail('secret 缺失或不足 32 字节：用 --secret 或 NUXT_ADMIN_SESSION_SECRET 提供（与线上同一份）')
}

const db = new Database(args.db)
db.pragma('foreign_keys = ON')

const columns = db.prepare('PRAGMA table_info(competition_popularity_visits)').all().map(column => column.name)
if (!columns.includes('ip_hash')) {
  fail('表 competition_popularity_visits 没有 ip_hash 列，先跑迁移 0100')
}

// ---- 自检：库里已有非空 ip_hash 的行，用当前 secret 重算必须一致
const samples = db.prepare(
  `SELECT ip, ip_hash FROM competition_popularity_visits
   WHERE ip_hash IS NOT NULL AND ip IS NOT NULL AND ip <> '' AND ip <> 'unknown'
   LIMIT 5`
).all()
if (samples.length > 0) {
  const mismatch = samples.filter(row => popularityIpHash(secret, row.ip) !== row.ip_hash)
  if (mismatch.length > 0) {
    fail(`secret 与库内已有 ip_hash 不匹配（抽样 ${samples.length} 行，${mismatch.length} 行不一致）。`
      + '回填会写入与投票侧对不上的哈希，已中止。请确认使用的是线上同一份 NUXT_ADMIN_SESSION_SECRET。')
  }
  console.log(`[check] 抽样 ${samples.length} 行已存在 ip_hash，secret 一致`)
} else {
  console.log('[check] 库里还没有非空 ip_hash 可供自检，跳过（首次上线即回填属正常）')
}

const since = args.days > 0 ? Date.now() - args.days * 24 * 60 * 60 * 1000 : null
const where = `ip_hash IS NULL AND ip IS NOT NULL AND ip <> '' AND ip <> 'unknown'`
  + (since ? ' AND created_at >= ?' : '')
const whereParams = since ? [since] : []

const pending = Number(db.prepare(
  `SELECT count(*) AS n FROM competition_popularity_visits WHERE ${where}`
).get(...whereParams).n)

console.log(`[plan] 待回填 ${pending} 行${since ? `（最近 ${args.days} 天）` : '（全量）'}，批次 ${args.batch}${args.dryRun ? '，dry-run 不写库' : ''}`)

if (args.dryRun) {
  const preview = db.prepare(
    `SELECT id, ip, created_at FROM competition_popularity_visits WHERE ${where} ORDER BY created_at DESC LIMIT 5`
  ).all(...whereParams)
  for (const row of preview) {
    console.log(`  ${row.id} ip=${row.ip} at=${new Date(Number(row.created_at)).toISOString()} -> ${popularityIpHash(secret, row.ip).slice(0, 12)}…`)
  }
  db.close()
  process.exit(0)
}

const selectBatch = db.prepare(
  `SELECT id, ip FROM competition_popularity_visits WHERE ${where} ORDER BY created_at ASC LIMIT ?`
)
const update = db.prepare(
  'UPDATE competition_popularity_visits SET ip_hash = ? WHERE id = ? AND ip_hash IS NULL'
)
const writeBatch = db.transaction((rows) => {
  let changed = 0
  for (const row of rows) changed += update.run(popularityIpHash(secret, row.ip), row.id).changes
  return changed
})

let filled = 0
for (;;) {
  const rows = selectBatch.all(...whereParams, args.batch)
  if (rows.length === 0) break
  filled += writeBatch(rows)
  console.log(`[fill] 已回填 ${filled}/${pending}`)
}

const remaining = Number(db.prepare(
  `SELECT count(*) AS n FROM competition_popularity_visits WHERE ${where}`
).get(...whereParams).n)
db.close()

console.log(`[done] 回填 ${filled} 行，剩余 ${remaining} 行`)
if (remaining > 0) process.exit(1)
