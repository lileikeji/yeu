#!/usr/bin/env node
/**
 * 把后台封禁表渲染成 nginx 黑名单片段。
 *
 * 为什么需要它：官网前台是静态页，nginx 直出，请求根本不到 Node。
 * 只在 Nuxt 里拦，对方换个路径照样刷页面。真正的拦截点在 nginx。
 *
 * 用法：
 *   node scripts/yeuca-nginx-blocklist.mjs            # 只渲染，不 reload
 *   node scripts/yeuca-nginx-blocklist.mjs --reload   # 变了就 nginx -t && reload
 *
 * 环境变量：
 *   YEU_DB_PATH        库文件，默认 /data/yeu/shared/data/yeu.sqlite
 *   YEU_BLOCKLIST_FILE 输出文件，默认 /data/yeu/shared/yeuca-blocklist.conf
 *
 * 在站点 server 块里加一行 include，之后由 systemd timer 定时跑：
 *   include /data/yeu/shared/yeuca-blocklist.conf;
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const dbPath = process.env.YEU_DB_PATH || '/data/yeu/shared/data/yeu.sqlite'
const outFile = process.env.YEU_BLOCKLIST_FILE || '/data/yeu/shared/yeuca-blocklist.conf'
const shouldReload = process.argv.includes('--reload')

const SQL = `
  SELECT ip, reason FROM yeuca_ip_bans
  WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
  ORDER BY updated_at DESC
`

/**
 * 读取封禁行。优先用内置 node:sqlite（定时任务跑在 /opt/yeu-ops，
 * 那里没有 node_modules，better-sqlite3 解析不到）；旧 Node 再退回 better-sqlite3。
 */
async function readBans() {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      return db.prepare(SQL).all(Date.now())
    } finally {
      db.close()
    }
  } catch (err) {
    if (/no such table/i.test(String(err?.message))) return []
    if (!/node:sqlite|Cannot find module/i.test(String(err?.message))) throw err
  }

  const { default: Database } = await import('better-sqlite3')
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(SQL).all(Date.now())
  } catch (err) {
    if (/no such table/i.test(String(err?.message))) return []
    throw err
  } finally {
    db.close()
  }
}

if (!existsSync(dbPath)) {
  console.error(`[yeuca-blocklist] 库不存在：${dbPath}`)
  process.exit(1)
}

const rows = await readBans()
const lines = [
  '# 由 scripts/yeuca-nginx-blocklist.mjs 生成，改这里没用。',
  `# 生成时间 ${new Date().toISOString()}，共 ${rows.length} 条`
]
for (const row of rows) {
  // 只接受 IPv4/IPv6 字面量，避免任何形式的配置注入。
  if (!/^[0-9a-fA-F:.]+$/.test(row.ip)) continue
  lines.push(`deny ${row.ip}; # ${String(row.reason || '').replace(/[\r\n#]/g, ' ').slice(0, 60)}`)
}
const content = `${lines.join('\n')}\n`

const previous = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
const normalize = text => text.replace(/^# 生成时间.*$/m, '# 生成时间 (unchanged)')

if (previous && normalize(previous) === normalize(content)) {
  console.log('[yeuca-blocklist] 无变化')
  process.exit(0)
}

const tmp = `${outFile}.tmp`
writeFileSync(tmp, content, { mode: 0o644 })
renameSync(tmp, outFile)
console.log(`[yeuca-blocklist] 已写入 ${outFile}`)

if (shouldReload) {
  // systemd 的 PATH 里没有宝塔的 nginx 目录，这里显式指定二进制。
  const nginx = process.env.NGINX_BIN || '/www/server/nginx/sbin/nginx'
  try {
    execFileSync(nginx, ['-t'], { stdio: 'inherit' })
    execFileSync(nginx, ['-s', 'reload'], { stdio: 'inherit' })
    console.log('[yeuca-blocklist] nginx 已重载')
  } catch (err) {
    console.error('[yeuca-blocklist] nginx 重载失败：', err?.message || err)
    process.exit(2)
  }
}
