import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  banYeucaIp,
  detectYeucaBot,
  getYeucaVisitOverview,
  isYeucaIpBanned,
  recordYeucaVisit,
  unbanYeucaIp
} from '../server/modules/yeuca/visit-service'

function createTempClient() {
  const dir = mkdtempSync(join(tmpdir(), 'yeu-yeuca-visits-'))
  const dbPath = join(dir, 'visits.sqlite')
  const client = getDatabase(dbPath)
  runMigrations(client)
  return {
    client,
    cleanup: () => {
      closeDatabase(dbPath)
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

test('机器流量识别：浏览器放行，命令行与爬虫标记', () => {
  assert.equal(detectYeucaBot(CHROME_UA).isBot, false)

  const curl = detectYeucaBot('curl/8.4.0')
  assert.equal(curl.isBot, true)
  assert.equal(curl.isScanner, true)

  const googlebot = detectYeucaBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
  assert.equal(googlebot.isBot, true)
  assert.equal(googlebot.isScanner, false)

  const empty = detectYeucaBot('')
  assert.equal(empty.isBot, true)
  assert.equal(empty.botName, '空 UA')
})

test('访问记录写入后能在概览里按范围聚合', () => {
  const { client, cleanup } = createTempClient()
  try {
    recordYeucaVisit(client, { path: '/', action: 'page_view', ip: '203.0.113.7', userAgent: CHROME_UA, visitorId: 'visitor-a' })
    recordYeucaVisit(client, { path: '/join/', action: 'page_view', ip: '203.0.113.7', userAgent: CHROME_UA, visitorId: 'visitor-a' })
    recordYeucaVisit(client, { path: '/api/public/yeuca/site', action: 'api', method: 'GET', status: 200, durationMs: 12, ip: '198.51.100.9', userAgent: 'curl/8.4.0' })

    const overview = getYeucaVisitOverview(client, { range: '24h' })
    assert.equal(overview.summary.hits, 3)
    assert.equal(overview.summary.pageViews, 2)
    assert.equal(overview.summary.botHits, 1)
    assert.equal(overview.summary.ips, 2)
    assert.equal(overview.summary.visitors, 1)
    assert.equal(overview.summary.botRate, 33)
    assert.equal(overview.summary.series.length, 24)
    assert.equal(overview.summary.topPaths[0]?.path, '/')
    assert.equal(overview.rows.length, 3)
    // 明细按时间倒序，最新的在第一条。
    assert.equal(overview.rows[0]?.path, '/api/public/yeuca/site')
    assert.equal(overview.rows[0]?.status, 200)

    // 超出保留期的行不该进 30 天概览。
    client.sqlite.prepare(`
      INSERT INTO yeuca_visits (id, visitor_id, ip, user_agent, is_bot, bot_name, action, path, method, created_at)
      VALUES ('old-row', '', '192.0.2.1', ?, 0, '', 'page_view', '/old/', 'GET', ?)
    `).run(CHROME_UA, Date.now() - 40 * 24 * 60 * 60 * 1000)
    const month = getYeucaVisitOverview(client, { range: '30d' })
    assert.equal(month.summary.hits, 3)
    assert.equal(month.rows.some(row => row.path === '/old/'), false)
  } finally {
    cleanup()
  }
})

test('封禁与解封：命中判断、计数、概览同步', () => {
  const { client, cleanup } = createTempClient()
  try {
    recordYeucaVisit(client, { path: '/api/public/yeuca/recruit', action: 'api', ip: '198.51.100.9', userAgent: 'curl/8.4.0' })

    assert.equal(isYeucaIpBanned(client, '198.51.100.9'), false)
    const banned = banYeucaIp(client, { ip: '198.51.100.9', reason: '短时高频机器请求', hours: 2 })
    assert.equal(banned.isActive, true)
    assert.equal(banned.reason, '短时高频机器请求')
    assert.equal(isYeucaIpBanned(client, '198.51.100.9'), true)

    const overview = getYeucaVisitOverview(client, { range: '24h' })
    assert.equal(overview.summary.bans.some(row => row.ip === '198.51.100.9'), true)
    assert.equal(overview.summary.topIps[0]?.banned, true)

    unbanYeucaIp(client, '198.51.100.9')
    assert.equal(isYeucaIpBanned(client, '198.51.100.9'), false)
    const after = getYeucaVisitOverview(client, { range: '24h' })
    assert.equal(after.summary.bans.length, 0)
    assert.equal(after.summary.topIps[0]?.banned, false)

    // 过期封禁自动失效。
    banYeucaIp(client, { ip: '192.0.2.55', hours: 1 })
    client.sqlite.prepare('UPDATE yeuca_ip_bans SET expires_at = ? WHERE ip = ?').run(Date.now() - 1000, '192.0.2.55')
    assert.equal(isYeucaIpBanned(client, '192.0.2.55'), false)
  } finally {
    cleanup()
  }
})
