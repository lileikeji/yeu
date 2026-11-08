const { randomBytes, scrypt, randomUUID } = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')

// 用法：node scripts/force-reset-admin-password.cjs <新密码> [用户名] [数据库路径]
// 密码一律显式传入，脚本不内置默认值（开源前审计 2026-11）。
const password = process.argv[2]
const username = process.argv[3] || 'admin'
const dbPath = process.argv[4] || '/www/wwwroot/yeu/shared/data/yeu.sqlite'
if (!password) {
  console.error('缺少参数：<新密码>（可选 [用户名] [数据库路径]）')
  process.exit(1)
}

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEY_LENGTH = 64
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024

function deriveKey(pw, salt) {
  return new Promise((resolve, reject) => {
    scrypt(pw, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAX_MEMORY
    }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

async function hashPasswordNoMin(pw) {
  const salt = randomBytes(16)
  const key = await deriveKey(pw, salt)
  return 'scrypt$' + SCRYPT_N + '$' + SCRYPT_R + '$' + SCRYPT_P + '$' + salt.toString('base64url') + '$' + key.toString('base64url')
}

async function main() {
  const releaseRoot = fs.realpathSync('/www/wwwroot/yeu/current')
  const betterSqlite3Path = path.join(releaseRoot, 'node_modules', 'better-sqlite3')
  const Database = require(betterSqlite3Path)
  const hash = await hashPasswordNoMin(password)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  const now = Date.now()
  const existing = db.prepare('SELECT id, username, is_active FROM admin_users WHERE username = ?').get(username)
  let action
  if (existing) {
    const tx = db.transaction(() => {
      db.prepare('UPDATE admin_users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?')
        .run(hash, now, existing.id)
      const deleted = db.prepare('DELETE FROM admin_sessions WHERE admin_user_id = ?').run(existing.id)
      return deleted.changes
    })
    const sessionsDeleted = tx()
    action = 'updated id=' + existing.id + ' sessions_deleted=' + sessionsDeleted
  } else {
    const id = randomUUID()
    db.prepare('INSERT INTO admin_users (id, username, password_hash, display_name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .run(id, username, hash, username, now, now)
    action = 'created id=' + id
  }
  const row = db.prepare('SELECT id, username, is_active, length(password_hash) AS hash_len FROM admin_users WHERE username = ?').get(username)
  db.close()
  console.log(JSON.stringify({ ok: true, action, row, passwordLen: password.length, hashPrefix: hash.slice(0, 30) }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})