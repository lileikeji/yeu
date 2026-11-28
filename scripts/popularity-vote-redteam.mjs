#!/usr/bin/env node
/**
 * 人气奖投票「刷票」红队脚本 —— 只在本机/预发的隔离库上跑
 *
 * 它按真实前端的协议走完整个链路：
 *   1. GET  /api/public/competition/popularity/state   （领设备 cookie、pageTicket、revision）
 *   2. 解 SHA-256 前导零 bit 的 PoW
 *   3. 等待服务端要求的停留时长
 *   4. POST /api/public/competition/popularity/vote    （带 cookie、d 令牌、pageTicket、pow、env）
 *
 * 每个 profile 是一种刷票手法；跑完直接读 SQLite，统计「真正被计票的有效票」与
 * 「被拦截 / 被隔离」的数量，并打印服务端风控给出的每条命中理由。
 *
 * 用法：
 *   node scripts/popularity-vote-redteam.mjs --profile all --reset true \
 *     --base http://127.0.0.1:3011 --origin http://127.0.0.1:3011 \
 *     --db .tmp/vote-redteam/vote-test.sqlite --singer <singerId>
 *
 * profile：
 *   honest              单个正常用户投一票（对照组，应计票）
 *   device-overrun      同一台设备连投 5 次（应只留 1 票）
 *   bot-ua              python-requests UA（应被 UA 规则拦）
 *   no-cookie           不回传 cookie，只带 d 令牌（应被设备 cookie 校验拦）
 *   fast-submit         领票后 450ms 立刻提交（应被停留时长拦）
 *   no-pow              不算 PoW（应被挑战校验拦）
 *   ticket-race         设备 A 的 pageTicket 换设备 B 提交（应被票据与设备绑定拦）
 *   rotate-same-ip      10 个新身份、同一 IP、同一硬件环境（应被同 IP 聚集 + 连坐隔离）
 *   rotate-ip-same-env  10 个新身份、换 IP、同一硬件环境（看同硬件规则能否兜住）
 *   rotate-ip-vary-env  10 个新身份、换 IP、打散硬件环境（预期能计票 —— 需要加固的口子）
 *
 * 退出码：0 跑完；2 参数/环境错误。
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const POW_BITS = 14
const DEFAULTS = {
  base: 'http://127.0.0.1:3011',
  origin: '',
  db: '.tmp/vote-redteam/vote-test.sqlite',
  count: 10,
  concurrency: 1,
  dwellMs: 1250,
  reset: 'false',
  json: ''
}

function parseArgs(argv) {
  const out = { ...DEFAULTS, profile: 'all', singer: '', event: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    out[name] = value
    out[name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value
  }
  out.count = Math.max(1, Number(out.count) || DEFAULTS.count)
  out.concurrency = Math.max(1, Number(out.concurrency) || 1)
  out.dwellMs = Number(out.dwellMs) || DEFAULTS.dwellMs
  out.origin = out.origin || out.base
  return out
}

const args = parseArgs(process.argv.slice(2))

// 只允许本机/内网目标，避免把脚本指向真实线上投票页
const targetUrl = new URL(args.base)
const isLocalTarget = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(targetUrl.hostname)
  || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(targetUrl.hostname)
if (!isLocalTarget && String(args.allowRemote) !== 'true') {
  console.error(`[guard] ${targetUrl.hostname} 不是本机/内网地址。真要对预发环境跑，加 --allow-remote true。`)
  process.exit(2)
}

const SINGER = args.singer
if (!SINGER) {
  console.error('[guard] 缺少 --singer <singerId>')
  process.exit(2)
}

// ---------------------------------------------------------------- HTTP 客户端

class Jar {
  constructor() { this.cookies = new Map() }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    for (const line of list) {
      const [pair] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }
  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
  }
}

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S9180) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const UA_BOT = 'python-requests/2.32.3'

const BASE_ENV = {
  tz: 'Asia/Shanghai',
  lang: 'zh-CN',
  screen: '393x852',
  touch: 5,
  cores: 8,
  mem: 8,
  dpr: 300,
  gpu: 'apple-gpu',
  fp: 'e3b0c44298fc1c14',
  wd: false
}

function variedEnv(index) {
  const gpus = ['mali-g78', 'adreno-650', 'apple-gpu', 'mali-g710', 'adreno-730']
  const screens = ['393x852', '412x915', '360x800', '430x932', '384x854']
  const tzs = ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi']
  return {
    tz: tzs[index % tzs.length],
    lang: index % 2 === 0 ? 'zh-CN' : 'zh-Hans-CN',
    screen: screens[index % screens.length],
    touch: index % 3 === 0 ? 10 : 5,
    cores: [4, 6, 8, 12][index % 4],
    mem: [4, 6, 8, 12][index % 4],
    dpr: [200, 250, 300, 350][index % 4],
    gpu: gpus[index % gpus.length],
    fp: `fp${index.toString(36).padStart(6, '0')}`,
    wd: false
  }
}

function platformOf(ua) {
  if (ua === UA_IOS) return 'iOS'
  if (ua === UA_ANDROID) return 'Android'
  if (ua === UA_WIN) return 'Windows'
  return 'Other'
}

function browserHeaders({ ua = UA_IOS, ip = '', extra = {} } = {}) {
  const headers = {
    'user-agent': ua,
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'sec-ch-ua-platform': `"${platformOf(ua)}"`,
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'sec-fetch-site': 'same-origin',
    origin: args.origin,
    referer: `${args.origin}/competition/popularity`,
    ...extra
  }
  if (ip) headers['x-forwarded-for'] = ip
  return headers
}

async function state(jar, { ua = UA_IOS, ip = '' } = {}) {
  const hit = { phase: 'state', status: 0, code: '', blockCode: '' }
  const headers = browserHeaders({ ua, ip })
  const cookie = jar.header()
  if (cookie) headers.cookie = cookie
  const res = await fetch(`${args.base}/api/public/competition/popularity/state`, { headers })
  jar.absorb(res)
  hit.status = res.status
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = null }
  if (!res.ok) {
    hit.code = body?.data?.code || body?.code || ''
    hit.blockCode = body?.data?.blockCode || ''
    hit.message = body?.data?.message || body?.message || text.slice(0, 120)
    return { hit, body: null }
  }
  return { hit, body }
}

function leadingZeroBits(digest, bits) {
  const full = Math.floor(bits / 8)
  const rem = bits % 8
  for (let i = 0; i < full; i += 1) if (digest[i] !== 0) return false
  if (rem > 0) {
    const mask = (0xff << (8 - rem)) & 0xff
    if ((digest[full] & mask) !== 0) return false
  }
  return true
}

function solvePow(pageTicket, singerId, bits = POW_BITS) {
  for (let i = 0; i < 5_000_000; i += 1) {
    const nonce = i.toString(36)
    const digest = createHash('sha256').update(`${pageTicket}|${singerId}|${nonce}`).digest()
    if (leadingZeroBits(digest, bits)) return nonce
  }
  throw new Error('PoW 未解出')
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function vote(jar, {
  pageTicket,
  revision,
  deviceToken,
  singerId = SINGER,
  env = BASE_ENV,
  ua = UA_IOS,
  ip = '',
  withCookie = true,
  usePow = true,
  extraBody = {}
} = {}) {
  const hit = { phase: 'vote', status: 0, code: '', blockCode: '', message: '' }
  let pow = ''
  if (usePow && pageTicket) {
    const started = Date.now()
    pow = solvePow(pageTicket, singerId)
    hit.powMs = Date.now() - started
  }
  const headers = browserHeaders({ ua, ip, extra: { 'content-type': 'application/json' } })
  if (withCookie) {
    const cookie = jar.header()
    if (cookie) headers.cookie = cookie
  }
  const payload = { singerId, revision, pageTicket, d: deviceToken, pow, env, ...extraBody }
  const res = await fetch(`${args.base}/api/public/competition/popularity/vote`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  jar.absorb(res)
  hit.status = res.status
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { parsed = null }
  hit.code = parsed?.data?.code || parsed?.code || ''
  hit.blockCode = parsed?.data?.blockCode || ''
  hit.message = parsed?.data?.message || parsed?.message || (res.ok ? '' : text.slice(0, 120))
  return { hit, body: parsed }
}

/** 一次完整的「领身份 → 等停留 → 投票」访客链路 */
async function castAsGuest(options = {}) {
  const jar = new Jar()
  const ua = options.ua ?? UA_IOS
  const ip = options.ip ?? ''
  const dwell = options.dwellMs ?? args.dwellMs
  const fetchedAt = Date.now()
  const { hit: stateHit, body: stateBody } = await state(jar, { ua, ip })
  if (stateHit.status !== 200) return { stateHit, voteHit: null, stateBody: null }
  const wait = Math.max(0, dwell - (Date.now() - fetchedAt))
  if (wait > 0) await sleep(wait)
  const { hit: voteHit } = await vote(jar, {
    pageTicket: stateBody.pageTicket,
    revision: stateBody.revision ?? 0,
    deviceToken: stateBody.deviceToken,
    env: options.env ?? BASE_ENV,
    ua,
    ip,
    withCookie: options.withCookie !== false,
    usePow: options.usePow !== false
  })
  return { stateHit, stateBody, voteHit }
}

// ------------------------------------------------------------------- profiles

function ipFor(index) {
  // TEST-NET-2/3 段，明确不可路由，只用于本机 XFF 模拟
  return index % 2 === 0 ? `198.51.100.${10 + (index % 200)}` : `203.0.113.${10 + (index % 200)}`
}

// 每次都用全新且互不相同的硬件环境指纹：envHash 由 tz/lang/screen/touch/cores/mem/dpr/gpu 组成，
// 全部是客户端自报字段，攻击方可以一票一个值，永远不触发「同硬件」类规则。
let envCounter = 0
function uniqueEnv() {
  envCounter += 1
  const seed = `${Date.now().toString(36)}${envCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return {
    tz: 'Asia/Shanghai',
    lang: 'zh-CN',
    screen: `${360 + (envCounter * 7) % 90}x${760 + (envCounter * 11) % 170}`,
    touch: 5,
    cores: [4, 6, 8, 12][envCounter % 4],
    mem: [4, 6, 8, 12][envCounter % 4],
    dpr: 200 + (envCounter * 13) % 150,
    gpu: `gpu-${seed}`,
    fp: seed,
    wd: false
  }
}

// 每个 profile 用各自的模拟 IP，避免限流桶互相污染（限流器在进程内存里，--reset 清不掉）
const IP = {
  honest: '198.51.100.200',
  overrun: '198.51.100.201',
  botUa: '198.51.100.202',
  noCookie: '198.51.100.203',
  fast: '198.51.100.204',
  noPow: '198.51.100.205',
  ticketA: '198.51.100.206',
  ticketB: '198.51.100.207',
  singleIp: '198.51.100.7',
  crowd: '198.51.100.9'
}

const PROFILES = {
  async honest() {
    const { stateHit, voteHit } = await castAsGuest({ ip: IP.honest })
    return [stateHit, voteHit]
  },

  async 'device-overrun'() {
    const jar = new Jar()
    const hits = []
    let revision = 0
    let deviceToken = ''
    for (let i = 0; i < 5; i += 1) {
      const fetchedAt = Date.now()
      const { hit: stateHit, body: stateBody } = await state(jar, { ip: IP.overrun })
      if (stateHit.status !== 200) { hits.push(stateHit); continue }
      revision = stateBody.revision ?? revision
      deviceToken = stateBody.deviceToken ?? deviceToken
      const wait = Math.max(0, args.dwellMs - (Date.now() - fetchedAt))
      if (wait > 0) await sleep(wait)
      const { hit } = await vote(jar, {
        pageTicket: stateBody.pageTicket,
        revision,
        deviceToken,
        ip: IP.overrun
      })
      hits.push(hit)
      if (hit.status !== 200) break
    }
    return hits
  },

  async 'bot-ua'() {
    const { stateHit, voteHit } = await castAsGuest({ ua: UA_BOT, ip: IP.botUa })
    return [stateHit, voteHit]
  },

  async 'no-cookie'() {
    const { stateHit, voteHit } = await castAsGuest({ withCookie: false, ip: IP.noCookie })
    return [stateHit, voteHit]
  },

  async 'fast-submit'() {
    const { stateHit, voteHit } = await castAsGuest({ dwellMs: 450, ip: IP.fast })
    return [stateHit, voteHit]
  },

  async 'no-pow'() {
    const { stateHit, voteHit } = await castAsGuest({ usePow: false, ip: IP.noPow })
    return [stateHit, voteHit]
  },

  async 'ticket-race'() {
    // 设备 A 领票，换设备 B 的 cookie 提交
    const jarA = new Jar()
    const { hit: stateHit, body: stateBody } = await state(jarA, { ip: IP.ticketA })
    if (stateHit.status !== 200) return [stateHit]
    const jarB = new Jar()
    await state(jarB, { ip: IP.ticketB })
    await sleep(args.dwellMs)
    const { hit } = await vote(jarB, {
      pageTicket: stateBody.pageTicket,
      revision: stateBody.revision ?? 0,
      deviceToken: stateBody.deviceToken,
      ip: IP.ticketB
    })
    return [stateHit, hit]
  },

  async 'rotate-same-ip'() {
    const hits = []
    const count = Math.min(args.count, 200)
    for (let i = 0; i < count; i += 1) {
      const { stateHit, voteHit } = await castAsGuest({ ip: IP.singleIp, env: BASE_ENV })
      hits.push({ ...stateHit, index: i })
      if (voteHit) hits.push({ ...voteHit, index: i })
    }
    return hits
  },

  async 'rotate-ip-same-env'() {
    const hits = []
    const count = Math.min(args.count, 200)
    for (let i = 0; i < count; i += 1) {
      const { stateHit, voteHit } = await castAsGuest({ ip: ipFor(i), env: BASE_ENV })
      hits.push({ ...stateHit, index: i })
      if (voteHit) hits.push({ ...voteHit, index: i })
    }
    return hits
  },

  async 'rotate-ip-vary-env'() {
    const hits = []
    const count = Math.min(args.count, 200)
    const uas = [UA_IOS, UA_ANDROID, UA_WIN]
    let cursor = 0
    const worker = async () => {
      while (cursor < count) {
        const index = cursor
        cursor += 1
        const { stateHit, voteHit } = await castAsGuest({
          ip: ipFor(index),
          env: variedEnv(index),
          ua: uas[index % uas.length]
        })
        hits.push({ ...stateHit, index })
        if (voteHit) hits.push({ ...voteHit, index })
      }
    }
    await Promise.all(Array.from({ length: Math.min(args.concurrency, count) }, worker))
    return hits
  },

  /**
   * 同一个出口 IP、每票换新指纹、严格等间隔提交：这是脚本刷票最典型的机器节拍。
   * 加固后应该被等距节拍证据实时冻结，用来证明收紧方向没被放松。
   */
  async 'rotate-same-ip-timed'() {
    const hits = []
    const count = Math.min(args.count, 30)
    const pace = Number(args.paceMs) || 5000
    for (let i = 0; i < count; i += 1) {
      if (i > 0) await sleep(pace)
      const { stateHit, voteHit } = await castAsGuest({
        ip: IP.singleIp,
        env: uniqueEnv(),
        ua: UA_IOS,
        dwellMs: 2600
      })
      hits.push({ ...stateHit, index: i })
      if (voteHit) hits.push({ ...voteHit, index: i })
    }
    return hits
  },

  /**
   * 正常观众模拟：礼堂/宿舍共用同一个出口 IP，但每台手机是独立设备、独立指纹、自然间隔投票。
   * 这是加固后的误伤基线——这个 profile 只要出现冻结票，就说明收紧过头了。
   */
  async 'campus-crowd'() {
    const hits = []
    const count = Math.min(args.count, 200)
    const uas = [UA_IOS, UA_ANDROID, UA_WIN]
    const meanGap = Number(args.paceMs) || 8000
    for (let i = 0; i < count; i += 1) {
      const { stateHit, voteHit } = await castAsGuest({
        ip: IP.crowd,
        env: uniqueEnv(),
        ua: uas[i % uas.length],
        dwellMs: 2400 + Math.floor(Math.random() * 2600)
      })
      hits.push({ ...stateHit, index: i })
      if (voteHit) hits.push({ ...voteHit, index: i })
      // 真实观众是「排队扫码」的泊松到达：间隔指数分布，绝大多数间隔不规律。
      if (i + 1 < count) await sleep(Math.round(-meanGap * Math.log(1 - Math.random())))
    }
    return hits
  },

  /**
   * 开票瞬间的校园网洪峰：同一个出口 IP、并发 4 路、每票一台新手机（新 env/新 fp）。
   * 用来验证出口限流不会把整场观众挡成 429——这个 profile 必须 0×429、0 冻结。
   */
  async 'campus-rush'() {
    const hits = []
    const count = Math.min(args.count, 500)
    const uas = [UA_IOS, UA_ANDROID, UA_WIN]
    let cursor = 0
    const worker = async () => {
      while (cursor < count) {
        const index = cursor
        cursor += 1
        const { stateHit, voteHit } = await castAsGuest({
          ip: IP.crowd,
          env: uniqueEnv(),
          ua: uas[index % uas.length],
          dwellMs: 2400 + Math.floor(Math.random() * 2600)
        })
        hits.push({ ...stateHit, index })
        if (voteHit) hits.push({ ...voteHit, index })
        await sleep(1500 + Math.floor(Math.random() * 2000))
      }
    }
    await Promise.all(Array.from({ length: Math.min(args.concurrency, count) }, worker))
    return hits
  },

  /**
   * 全伪装：一票一个 IP、一票一个全新硬件指纹、停留时长在 2.6-4.5s 之间随机抖动。
   * 这是现实里「专业刷票」的最低成本形态：只有 UA 列表和真实浏览器一致就行。
   * 加 --loop true 会一直刷到 Ctrl+C（配合 --concurrency 就是一台机器的产能）。
   */
  async 'rotate-unique-env-timed'() {
    const hits = []
    const infinite = String(args.loop) === 'true'
    const count = infinite ? Number.POSITIVE_INFINITY : Math.min(args.count, 500)
    const uas = [UA_IOS, UA_ANDROID, UA_WIN]
    const pace = Number(args.paceMs) || 0
    let cursor = 0
    const worker = async () => {
      while (cursor < count) {
        const index = cursor
        cursor += 1
        const dwell = Math.max(2600 + Math.floor(Math.random() * 1900), pace)
        const { stateHit, voteHit } = await castAsGuest({
          ip: ipFor(index),
          env: uniqueEnv(),
          ua: uas[index % uas.length],
          dwellMs: dwell
        })
        hits.push({ ...stateHit, index })
        if (voteHit) hits.push({ ...voteHit, index })
        if (infinite && index % 10 === 9) {
          console.log(`  ...已提交 ${index + 1} 票（${((Date.now() - startedAt) / 1000).toFixed(0)}s）`)
        }
      }
    }
    const startedAt = Date.now()
    await Promise.all(Array.from({ length: Math.min(args.concurrency, infinite ? args.concurrency : count) }, worker))
    return hits
  }
}

// ------------------------------------------------------------------ DB 核对

let EVENT = String(args.event || '')

function ballotsAgg(db) {
  return db.prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN voided = 0 AND quarantined = 0 THEN 1 ELSE 0 END), 0) AS effective,
           COALESCE(SUM(CASE WHEN quarantined = 1 AND voided = 0 THEN 1 ELSE 0 END), 0) AS quarantined,
           COALESCE(SUM(CASE WHEN voided = 1 THEN 1 ELSE 0 END), 0) AS voided
    FROM competition_popularity_ballots
    WHERE event_id = ?
  `).get(EVENT)
}

function maxSeq(db) {
  const row = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM competition_popularity_vote_logs WHERE event_id = ?').get(EVENT)
  return Number(row?.seq) || 0
}

function parseReasons(json) {
  if (!json) return []
  try {
    const list = JSON.parse(json)
    return Array.isArray(list) ? list.map(String) : [String(list)]
  } catch {
    return [String(json).slice(0, 80)]
  }
}

function logsSince(db, seq) {
  const rows = db.prepare(`
    SELECT seq, action, block_code AS blockCode, suspicion_score AS score,
           dwell_ms AS dwellMs, ip_hash AS ipHash, env_hash AS envHash,
           suspicion_reasons_json AS reasonsJson, cookie_present AS cookie, ua_summary AS ua
    FROM competition_popularity_vote_logs
    WHERE event_id = ? AND seq > ?
    ORDER BY seq ASC
  `).all(EVENT, seq)
  return rows.map(row => ({
    seq: row.seq,
    action: row.action,
    blockCode: row.blockCode || undefined,
    score: row.score,
    dwellMs: row.dwellMs,
    ua: row.ua,
    cookie: row.cookie === 1,
    ipHash: row.ipHash ? row.ipHash.slice(0, 8) : null,
    envHash: row.envHash ? row.envHash.slice(0, 8) : null,
    reasons: parseReasons(row.reasonsJson)
  }))
}

/** 清空该赛事的选票与日志，让每个 profile 从干净夹具开始 */
function resetFixture(db) {
  for (const table of [
    'competition_popularity_vote_logs',
    'competition_popularity_ballots',
    'competition_popularity_follows',
    'competition_popularity_inspections'
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE event_id = ?`).run(EVENT)
  }
}

function delta(before, after) {
  return {
    newBallots: (after.total ?? 0) - (before.total ?? 0),
    effective: (after.effective ?? 0) - (before.effective ?? 0),
    quarantined: (after.quarantined ?? 0) - (before.quarantined ?? 0),
    voided: (after.voided ?? 0) - (before.voided ?? 0)
  }
}

// ------------------------------------------------------------------- main

async function main() {
  if (!fs.existsSync(args.db)) {
    console.error(`[guard] 数据库不存在：${args.db}，先跑 .tmp/vote-redteam/prepare-db.mjs`)
    process.exit(2)
  }
  const db = new Database(args.db)

  const settings = db.prepare('SELECT event_id, enabled, auth_mode, votes_per_voter, allow_change, auto_quarantine FROM competition_popularity_settings LIMIT 1').get()
  if (!settings || Number(settings.enabled) !== 1) {
    console.error('[guard] 投票未开启（enabled != 1），先跑 prepare-db.mjs')
    process.exit(2)
  }
  EVENT = EVENT || String(settings.event_id || '')
  if (!EVENT) {
    console.error('[guard] 无法确定赛事 id，用 --event <eventId> 指定')
    process.exit(2)
  }

  const names = args.profile === 'all' ? Object.keys(PROFILES) : [args.profile]
  for (const name of names) {
    if (!PROFILES[name]) {
      console.error(`[guard] 未知 profile：${name}`)
      process.exit(2)
    }
  }

  const report = { base: args.base, event: EVENT, singer: SINGER, settings, profiles: [] }

  for (const name of names) {
    if (String(args.reset) === 'true') resetFixture(db)
    const before = ballotsAgg(db)
    const seq0 = maxSeq(db)
    const startedAt = Date.now()
    const hits = (await PROFILES[name]()).filter(Boolean)
    await sleep(200)
    const after = ballotsAgg(db)
    const summary = {
      profile: name,
      elapsedMs: Date.now() - startedAt,
      attempts: hits.length,
      voteAttempts: hits.filter(h => h.phase === 'vote').length,
      ok: hits.filter(h => h.status === 200).length,
      statuses: countBy(hits.filter(h => h.status), h => String(h.status)),
      blockCodes: countBy(hits.filter(h => h.blockCode), h => h.blockCode),
      db: delta(before, after),
      logs: logsSince(db, seq0),
      hits: hits.map(h => ({
        index: h.index, phase: h.phase, status: h.status,
        code: h.code || undefined, blockCode: h.blockCode || undefined,
        message: h.message ? h.message.slice(0, 60) : undefined
      }))
    }
    report.profiles.push(summary)
    printProfile(summary)
  }

  report.finalLogs = logsSince(db, 0)
  db.close()

  if (args.json) {
    const out = path.resolve(args.json)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify(report, null, 2))
    console.log(`\n报告已写入 ${out}`)
  }
}

function countBy(list, keyFn) {
  const map = {}
  for (const item of list) {
    const key = keyFn(item)
    map[key] = (map[key] ?? 0) + 1
  }
  return map
}

function printProfile(summary) {
  const { db, statuses, blockCodes, logs } = summary
  const verdict = db.effective > 0 ? '计票通过' : '防线拦住'
  console.log(`\n=== ${summary.profile} → ${verdict} ===`)
  console.log(`  尝试 ${summary.attempts} 次（投票请求 ${summary.voteAttempts}），耗时 ${(summary.elapsedMs / 1000).toFixed(1)}s，HTTP 200 × ${summary.ok}`)
  console.log(`  状态码 ${JSON.stringify(statuses)}  拦截码 ${JSON.stringify(blockCodes)}`)
  console.log(`  新增选票 ${db.newBallots}：有效 ${db.effective} / 隔离 ${db.quarantined} / 作废 ${db.voided}`)
  for (const log of logs) {
    console.log(`  [seq ${log.seq}] ${log.action}${log.blockCode ? `/${log.blockCode}` : ''} score=${log.score ?? '-'} dwell=${log.dwellMs ?? '-'}ms ua=${log.ua ?? '-'} cookie=${log.cookie ? 'y' : 'n'} ip=${log.ipHash ?? '-'} env=${log.envHash ?? '-'}`)
    if (log.reasons.length) console.log(`      ${log.reasons.join(' / ')}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
