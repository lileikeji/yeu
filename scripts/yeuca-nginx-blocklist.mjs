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
import Database from 'better-sqlite3'

const dbPath = process.env.YEU_DB_PATH || '/data/yeu/shared/data/yeu.sqlite'
const outFile = process.env.YEU_BLOCKLIST_FILE || '/data/yeu/shared/yeuca-blocklist.conf'
const shouldReload = process.argv.includes('--reload')

function renderBans() {
  if (!existsSync(dbPath)) {
    console.error(`[yeuca-blocklist] 库不存在：${dbPath}`)
    return null
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    let rows = []
    try {
      rows = db.prepare(`
        SELECT ip, reason FROM yeuca_ip_bans
        WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY updated_at DESC
      `).all(Date.now())
    } catch (err) {
      // 迁移还没跑过的时候表不存在，此时黑名单就是空的，不该让定时任务红。
      if (String(err?.message || '').includes('no such table')) rows = []
      else throw err
    }
    const lines = [
      '# 由 scripts/yeuca-nginx-blocklist.mjs 生成，改这里没用。',
      `# 生成时间 ${new Date().toISOString()}，共 ${rows.length} 条`
    ]
    for (const row of rows) {
      // 只接受 IPv4/IPv6 字面量，避免任何形式的配置注入。
      if (!/^[0-9a-fA-F:.]+$/.test(row.ip)) continue
      lines.push(`deny ${row.ip}; # ${String(row.reason || '').replace(/[\r\n#]/g, ' ').slice(0, 60)}`)
    }
    return `${lines.join('\n')}\n`
  } finally {
    db.close()
  }
}

const content = renderBans()
if (content === null) process.exit(1)

const previous = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
const next = content.replace(/^# 生成时间.*$/m, '# 生成时间 (unchanged)')
const prevNormalized = previous.replace(/^# 生成时间.*$/m, '# 生成时间 (unchanged)')

if (previous && next === prevNormalized) {
  console.log('[yeuca-blocklist] 无变化')
  process.exit(0)
}

const tmp = `${outFile}.tmp`
writeFileSync(tmp, content, { mode: 0o644 })
renameSync(tmp, outFile)
console.log(`[yeuca-blocklist] 已写入 ${outFile}`)

if (shouldReload) {
  try {
    execFileSync('nginx', ['-t'], { stdio: 'inherit' })
    execFileSync('nginx', ['-s', 'reload'], { stdio: 'inherit' })
    console.log('[yeuca-blocklist] nginx 已重载')
  } catch (err) {
    console.error('[yeuca-blocklist] nginx 重载失败：', err?.message || err)
    process.exit(2)
  }
}
