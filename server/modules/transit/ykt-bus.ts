// 云一卡通（YKTPreview）校车定位协议客户端
// 协议逆向自 wx.leyunykt.com YKTPreview 前端 app.js，实测链路见
// E:/nixiang/work/leyunykt-bus/阶段报告-校车定位协议.md。
//   open_ticket = yktkey 反替换 → Base64 → AES-128-CBC(key/iv 固定) → JSON{addr,ticket}
//   请求体 = 8 位 UTF8 长度前缀 + JSON + "SIGN_VAL" + base64(RSA-SHA256(JSON))
//   响应体 = 8 位长度前缀 + retcode(4 位) + JSON + "SIGN_VAL" + 签名（客户端不验签）
// 本模块不依赖 Nuxt 运行时，纯函数部分可被 scripts/ykt-bus-protocol.test.ts 直接测试。
import { createDecipheriv, createSign } from 'node:crypto'
import { buildShapeThroughStops, refineShapeWithRoads, repairChordsWithRoads } from './campus-shape-refine'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../../shared/utils/coordinate-convert'
import campusBoundary from '../../../data/seeds/osm-campus-boundary.json'
import busRouteGps from '../../../data/seeds/bus-route-gps.json'
import busRouteManual from '../../../data/seeds/bus-route-manual.json'
import { parseAmapPolyline } from '../directions/amap'
import { WEST_DEPARTURE_STOP_NAME, WEST_GATE, westApproach } from './campus-west-departure'

const WEST_GATE_LNG = WEST_GATE.lng
const WEST_GATE_LAT = WEST_GATE.lat

const AES_KEY = '***REMOVED***' // 16 字节 = aes-128-cbc
const AES_IV = '***REMOVED***'
const API_ID = '***REMOVED***'
const ACCESS_TOKEN = '***REMOVED***'
const COMMON = '?DirectProcessData=true&DisablePacketHeader=false&PacketHeaderMode=1&PacketVer=2'
const SIGN_SEP = 'SIGN_VAL'
const REQUEST_TIMEOUT_MS = 15_000

/** 伪装微信客户端 UA：OAuth2 换票接口校验微信内置浏览器。 */
const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21C62 MicroMessenger/8.0.49(0x18003133) NetType/WIFI Language/zh_CN'
const ROUTES_TTL_MS = 10 * 60 * 1000
const POSITIONS_TTL_MS = 5_000

// ---------- 线路沿路形状（主：手绘链投影；备：高德算路；24h 缓存） ----------
/**
 * 形状源优先级：
 * 1. 手绘链（data/seeds/ding-route-chain.json，来自校园叮叮车手绘路网，GCJ→WGS84）——
 *    站点投影切片，同步零外呼；天然贴路，无算路直线弦/校外绕环（实证：我方 7 站到链 mean 17.7m/max 34m）。
 *    不做校界裁剪：链本身是校内道路，裁剪反而可能剪出新弦。
 * 2. 高德 walking/driving 算路（链不覆盖该线路时回退，站点直连为末级回退）。
 */
const AMAP_WALKING_ENDPOINT = 'https://restapi.amap.com/v3/direction/walking'
const AMAP_DRIVING_ENDPOINT = 'https://restapi.amap.com/v3/direction/driving'
/**
 * 算路方式：walking 优先（校园步道贴路概率高），失败退 driving，再退站点直连。
 * 校车实际走车行道时把这里翻成 'driving' 即可。
 */
const SHAPE_PROVIDER: 'walking' | 'driving' = 'driving'
const SHAPE_TTL_MS = 24 * 60 * 60 * 1000
// 有段算路失败（退化成直连弦）时只缓存 2 分钟，让下一轮快照自愈。
const SHAPE_DEGRADED_TTL_MS = 2 * 60 * 1000
// 高德 Web 服务 QPS 限流：段间间隔与失败重试延时。
const SEGMENT_GAP_MS = 250
const SEGMENT_RETRY_DELAY_MS = 600
const SHAPE_TIMEOUT_MS = 8_000

// YKT 原始坐标是 GCJ-02（逆地理实证：新区图书馆站原值反查落「仰恩大学图书馆」17m，
// 当 WGS84 转换后偏 426m）。快照出口统一逆成真 WGS84，coordinateSystem 恒为 'wgs84'。
export const YKT_COORDINATE_SYSTEM = 'wgs84'

/** YKT 原始坐标（GCJ-02）→ WGS84（迭代逆变换，见 shared/utils/coordinate-convert）。 */
export function toWgs84Point(longitude: number, latitude: number): { longitude: number, latitude: number } {
  return gcj02ToWgs84(longitude, latitude)
}

const YKT_KEY_MAP: Array<[string, string]> = [
  ['yktkey2b', '+'],
  ['yktkey3d', '='],
  ['yktkey2f', '/'],
  ['yktkey20', ' '],
  ['yktkey3f', '?'],
  ['yktkey25', '%'],
  ['yktkey23', '#'],
  ['yktkey26', '&']
]

// 前端 app.js 硬编码的客户端签名私钥（非服务端机密）。
const RSA_PRIVATE_KEY = [
  '-----BEGIN PRIVATE KEY-----',
  'MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAKamtwArkzoZVK9w',
  'ji5ewx4beB1xbI98vkOyMWWqeebw3dI2E7vT3RJ/ALkxJpN+KWT6zB/7+zu+mk4B',
  'IQdIyDCc1oGpnait8Q2+ROO31tKP1zthH4g7JHZMdqlFvmTK8m8o0IbKP8xdcmUF',
  'f5qpyRb3qq5cH8kUioPNXo+wMFwDAgMBAAECgYBlqdaBuBN8oe9Th2p1R0HooAFK',
  'lOMRNZwsWAxiZPkwtUfc8ThgoQKAQhIC58UMvS4reAQGjwXYkJI5e97WPsRARycc',
  'Ol3prUGLkkK2aGkAiKGmKN3hLeRO2AfYpY+fso17kkwNcFiDHEtmdnZ2NXcWxwOo',
  '9FTV0dTQgfTds7daYQJBANwusNXKJVIFCva5wmNkF8Wxu8QjTT2TtB1O6HkgZfUi',
  'VP4uhzQB2idOU/ws3Fh/MvIr+TbujCSzmj7LbD82Cd0CQQDBwsOtuez3S0+RYiU6',
  'iCLK872UgdbfGjEwHIE4I1Pho3ILpMq4MSs4bhHlNAeE94tCdqPHpJWXYbFyd/21',
  'vc9fAkEAizN1luPC7nTDtrJABAguw0yXcewDlC+CSpktfg6OhwjahQwzbBzTp8/s',
  'ZtyRvd1E/zfvydvMfBOUK6j92YS3fQJAcHKpwV7PqUzppoQA+xEasBH4igE4RE4d',
  'EcDZNU07Vw3WF+/RPkg6vwsSE6S4YHCRP0c/EZPwxOQLaVU9xoWbnQJBANtXYwiv',
  'o7GkNyz/zK2M7j6o24X3TKt85vqvNTLicZoaWhj9lQcVlDeMMj86fraFbrRZQ+T9',
  '+asbqyQY1RsB4W4=',
  '-----END PRIVATE KEY-----'
].join('\n')

export interface YktBusStopInfo {
  siteId: string
  siteName: string
  lng: number
  lat: number
  isOrigin: boolean
  isDestination: boolean
}

/** 线路形状折线点（WGS84，高德算路结果）。 */
export interface RouteShapePoint {
  lng: number
  lat: number
}

export interface YktBusRouteInfo {
  routeId: string
  routeName: string
  isBack: boolean
  stops: YktBusStopInfo[]
  /** 沿实际道路的走向折线（WGS84）；空数组表示算路不可用，前端回退站点直连。 */
  polyline: RouteShapePoint[]
}

export interface YktBusVehicle {
  busId: string
  busName: string
  routeId: string
  routeName: string
  siteId: string
  siteName: string
  lng: number
  lat: number
  isAtSite: boolean
  updatedAt: string
}

export interface YktBusSnapshot {
  coordinateSystem: typeof YKT_COORDINATE_SYSTEM
  fetchedAt: string
  routes: YktBusRouteInfo[]
  buses: YktBusVehicle[]
}

interface YktSession {
  addr: string
  ticket: string
  userId: string
  openId: string
}

// ---------- 纯协议函数（可单测） ----------

/** yktkey 反替换：前端对 open_ticket 做过的字符混淆还原。 */
export function pUnescape(value: string): string {
  let out = value
  for (const [from, to] of YKT_KEY_MAP) out = out.replaceAll(from, to)
  return out
}

/** open_ticket → AES-128-CBC 解密 → JSON{addr,ticket,...}。 */
export function decryptOpenTicket(blob: string): Record<string, unknown> {
  const raw = Buffer.from(pUnescape(blob), 'base64')
  const decipher = createDecipheriv('aes-128-cbc', Buffer.from(AES_KEY), Buffer.from(AES_IV))
  const plain = Buffer.concat([decipher.update(raw), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as Record<string, unknown>
}

/** 从解密后的 url 字段提取 TPOpenId（微信 openId，换票凭证）。 */
export function extractTpOpenId(info: Record<string, unknown>): string {
  const url = textValue(info.url)
  if (!url) return ''
  try {
    return new URL(url).searchParams.get('TPOpenId') || ''
  } catch {
    return ''
  }
}

/** OAuth2 302 Location → open_ticket 参数。 */
export function parseTicketFromLocation(location: string, base: string): string {
  try {
    return new URL(location, base).searchParams.get('open_ticket') || ''
  } catch {
    return ''
  }
}

/** 用微信 UA 调 OAuth2 换取新 open_ticket（302 Location 带票）。 */
export async function mintOpenTicket(addr: string, tpOpenId: string): Promise<string> {
  const url = `${addr}/TP_API/DispApiServer/OAuth2?TPOpenId=${encodeURIComponent(tpOpenId)}&PageName=userBusRoute`
  const res = await fetch(url, {
    headers: { 'User-Agent': WECHAT_UA },
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  const location = res.headers.get('location') || ''
  const ticket = parseTicketFromLocation(location, addr)
  if (!ticket) throw new Error(`OAuth2 换票失败：HTTP ${res.status} 无 open_ticket`)
  return ticket
}

/** JSON → 长度前缀 + JSON + "SIGN_VAL" + base64(RSA-SHA256(JSON))。 */
export function buildSignedBody(params: Record<string, string>): string {
  const json = JSON.stringify(params)
  const signature = createSign('RSA-SHA256').update(json, 'utf8').sign(RSA_PRIVATE_KEY).toString('base64')
  const payload = json + SIGN_SEP + signature
  return Buffer.byteLength(payload, 'utf8').toString().padStart(8, '0') + payload
}

/** 响应体 → { ret, json }，ret 为 4 位返回码（'0000' 成功）。 */
export function parseSignedResponse(body: string): { ret: string, json: string } {
  const payload = body.slice(8)
  const sepIndex = payload.indexOf(SIGN_SEP)
  if (sepIndex < 0) throw new Error('YKT 响应缺少 SIGN_VAL 分隔符')
  const data = payload.slice(0, sepIndex)
  return { ret: data.slice(0, 4), json: data.slice(4) }
}

// ---------- 内部工具 ----------

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

function flagValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : []
}

function busParams(session: YktSession, extra: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    api_id: API_ID,
    open_id: session.openId,
    access_token: ACCESS_TOKEN,
    api_state: '',
    menu_tag: ''
  }
}

// ---------- 请求与会话 ----------

async function callYkt(addr: string, name: string, params: Record<string, string>): Promise<{ ret: string, json: string }> {
  const url = `${addr}/TP_API/DispApiServer/${name}${COMMON}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: buildSignedBody(params),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`YKT ${name} HTTP ${response.status}`)
  const parsed = parseSignedResponse(await response.text())
  if (parsed.ret !== '0000') throw new Error(`YKT ${name} ret=${parsed.ret}`)
  return parsed
}

let sessionPromise: Promise<YktSession> | null = null
let sessionTicketBlob = ''

async function ensureSession(openTicket: string): Promise<YktSession> {
  if (!openTicket) throw new Error('缺少 NUXT_YKT_OPEN_TICKET（云一卡通 open_ticket）')
  // 兼容整段 URL：取出 open_ticket 参数
  const blob = openTicket.startsWith('http')
    ? new URL(openTicket).searchParams.get('open_ticket') || ''
    : openTicket
  if (!blob) throw new Error('NUXT_YKT_OPEN_TICKET 缺少 open_ticket 参数')
  if (sessionPromise && sessionTicketBlob === blob) return sessionPromise
  sessionTicketBlob = blob
  sessionPromise = initSession(blob)
  try {
    return await sessionPromise
  } catch (error) {
    sessionPromise = null
    throw error
  }
}

async function initSession(openTicket: string): Promise<YktSession> {
  const info = decryptOpenTicket(openTicket)
  const addr = textValue(info.addr)
  let ticket = textValue(info.ticket)
  const tpOpenId = extractTpOpenId(info)
  if (!addr || !ticket) throw new Error('open_ticket 解密结果缺少 addr/ticket')
  const openParams = (tk: string) => ({
    api_id: API_ID,
    access_token: ACCESS_TOKEN,
    open_id: '123',
    ticket: tk
  })
  let body: Record<string, unknown>
  try {
    const res = await callYkt(addr, 'YKTGetOpenInfo', openParams(ticket))
    body = JSON.parse(res.json) as Record<string, unknown>
  } catch (error) {
    // 票过期/失效（ret=9000 等）：用 TPOpenId 自动换新票重试一次，免人工换 NUXT_YKT_OPEN_TICKET
    if (!tpOpenId) throw error
    const fresh = decryptOpenTicket(await mintOpenTicket(addr, tpOpenId))
    ticket = textValue(fresh.ticket)
    if (!ticket) throw error
    const res = await callYkt(addr, 'YKTGetOpenInfo', openParams(ticket))
    body = JSON.parse(res.json) as Record<string, unknown>
  }
  const userId = textValue(body.user_id)
  const openId = textValue(body.id || body.open_id)
  if (!userId || !openId) throw new Error('YKTGetOpenInfo 响应缺少 user_id/open_id')
  return { addr, ticket, userId, openId }
}

// ---------- 线路缓存（10 分钟） ----------

let routesCache: { fetchedAt: number, routes: YktBusRouteInfo[] } | null = null

async function ensureRoutes(session: YktSession, amapKey: string): Promise<YktBusRouteInfo[]> {
  if (routesCache && Date.now() - routesCache.fetchedAt < ROUTES_TTL_MS) {
    void ensureRouteShapes(amapKey, routesCache.routes)
    return routesCache.routes
  }
  const res = await callYkt(session.addr, 'YKTGetBusRouteInfo', busParams(session, { user_id: session.userId }))
  const routes: YktBusRouteInfo[] = []
  for (const entry of recordArray(JSON.parse(res.json))) {
    const routeId = textValue(entry.route_id)
    if (!routeId) continue
    const siteRes = await callYkt(session.addr, 'YKTGetBusSiteInfo', busParams(session, {
      user_id: session.userId,
      route_id: routeId
    }))
    const stops: YktBusStopInfo[] = []
    for (const site of recordArray(JSON.parse(siteRes.json))) {
      const siteId = textValue(site.site_id)
      const lng = numberValue(site.site_lng)
      const lat = numberValue(site.site_lat)
      if (!siteId || lng === null || lat === null) continue
      const wgs = toWgs84Point(lng, lat)
      stops.push({
        siteId,
        siteName: textValue(site.site_name),
        lng: wgs.longitude,
        lat: wgs.latitude,
        isOrigin: flagValue(site.is_first_site),
        isDestination: flagValue(site.is_end_site)
      })
    }
    routes.push({
      routeId,
      routeName: textValue(entry.route_name),
      isBack: flagValue(entry.is_back),
      stops,
      polyline: []
    })
  }
  if (!routes.length) throw new Error('YKTGetBusRouteInfo 未返回可用线路')
  routesCache = { fetchedAt: Date.now(), routes }
  void ensureRouteShapes(amapKey, routes)
  return routes
}

// ---------- 车辆位置缓存（5 秒，多客户端合并） ----------

let positionsCache: { fetchedAt: number, buses: YktBusVehicle[] } | null = null
let positionsPromise: Promise<YktBusVehicle[]> | null = null

async function fetchPositions(session: YktSession, routes: YktBusRouteInfo[]): Promise<YktBusVehicle[]> {
  const fetchedAt = new Date().toISOString()
  const perRoute = await Promise.all(routes.map(async (route) => {
    const res = await callYkt(session.addr, 'YKTGetBusCarInfo', busParams(session, {
      user_id: session.userId,
      route_id: route.routeId
    }))
    const stopsById = new Map(route.stops.map(stop => [stop.siteId, stop]))
    const vehicles: YktBusVehicle[] = []
    for (const group of recordArray(JSON.parse(res.json))) {
      const siteId = textValue(group.site_id)
      const siteName = stopsById.get(siteId)?.siteName ?? ''
      for (const item of recordArray(group.items)) {
        const busName = textValue(item.car_name)
        const lng = numberValue(item.car_lng)
        const lat = numberValue(item.car_lat)
        if (!busName || lng === null || lat === null) continue
        const wgs = toWgs84Point(lng, lat)
        vehicles.push({
          busId: `${route.routeId}:${busName}`,
          busName,
          routeId: route.routeId,
          routeName: route.routeName,
          siteId,
          siteName,
          lng: wgs.longitude,
          lat: wgs.latitude,
          isAtSite: flagValue(item.is_at_site),
          updatedAt: fetchedAt
        })
      }
    }
    return vehicles
  }))
  return perRoute.flat()
}

function ensurePositions(session: YktSession, routes: YktBusRouteInfo[]): Promise<YktBusVehicle[]> {
  if (positionsCache && Date.now() - positionsCache.fetchedAt < POSITIONS_TTL_MS) {
    return Promise.resolve(positionsCache.buses)
  }
  if (positionsPromise) return positionsPromise
  positionsPromise = fetchPositions(session, routes)
    .then((buses) => {
      positionsCache = { fetchedAt: Date.now(), buses }
      positionsPromise = null
      return buses
    })
    .catch((error) => {
      positionsPromise = null
      throw error
    })
  return positionsPromise
}

// ---------- 手绘链形状源（同步投影切片） ----------

interface BusRouteGpsSeed { points: RouteShapePoint[] }
// 实测轨迹（真实校车一次完整去程，来自 yx bus-rt GPS 日志）：贴路且与运营时长一致（2377m / 约 11-13 分钟）。
const CHAIN_POINTS: RouteShapePoint[] = (busRouteGps as BusRouteGpsSeed).points
/** 站点到链垂距超过此值视为链不覆盖该线路（实测我方站点 max 34m，留余量）。 */
const CHAIN_MAX_OFFSET_M = 120
// 平面米制参考纬度取链中点；校园尺度（<3km）下赤道近似误差可忽略。
const CHAIN_METRIC_LAT = CHAIN_POINTS[Math.floor(CHAIN_POINTS.length / 2)]!.lat
const CHAIN_M_LAT = 111_320
const CHAIN_M_LNG = 111_320 * Math.cos((CHAIN_METRIC_LAT * Math.PI) / 180)
/** 链累计里程（米），与投影同度量，保证 alongM 可直接用于切片。 */
const CHAIN_CUM: number[] = (() => {
  const cum = [0]
  for (let i = 1; i < CHAIN_POINTS.length; i += 1) {
    const a = CHAIN_POINTS[i - 1]!
    const b = CHAIN_POINTS[i]!
    cum.push(cum[i - 1]! + Math.hypot((b.lng - a.lng) * CHAIN_M_LNG, (b.lat - a.lat) * CHAIN_M_LAT))
  }
  return cum
})()

/** 点垂投到链：返回沿线里程与垂距（米）。 */
export function projectOnChain(point: RouteShapePoint): { alongM: number, offM: number } {
  const px = (point.lng - CHAIN_POINTS[0]!.lng) * CHAIN_M_LNG
  const py = (point.lat - CHAIN_POINTS[0]!.lat) * CHAIN_M_LAT
  let best = { alongM: 0, offM: Number.POSITIVE_INFINITY }
  for (let i = 1; i < CHAIN_POINTS.length; i += 1) {
    const a = CHAIN_POINTS[i - 1]!
    const b = CHAIN_POINTS[i]!
    const ax = (a.lng - CHAIN_POINTS[0]!.lng) * CHAIN_M_LNG
    const ay = (a.lat - CHAIN_POINTS[0]!.lat) * CHAIN_M_LAT
    const bx = (b.lng - CHAIN_POINTS[0]!.lng) * CHAIN_M_LNG
    const by = (b.lat - CHAIN_POINTS[0]!.lat) * CHAIN_M_LAT
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? -((px - ax) * dx + (py - ay) * dy) / len2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const offM = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (offM < best.offM) {
      const segLen = CHAIN_CUM[i]! - CHAIN_CUM[i - 1]!
      best = { alongM: CHAIN_CUM[i - 1]! + t * segLen, offM }
    }
  }
  return best
}

/** 按沿线里程切链（含 lo/hi 插值端点，内部顶点严格在区间内）。 */
function sliceChainBetween(lo: number, hi: number): RouteShapePoint[] {
  const at = (d: number): RouteShapePoint => {
    let i = 1
    while (i < CHAIN_CUM.length - 1 && CHAIN_CUM[i]! < d) i += 1
    const segLen = CHAIN_CUM[i]! - CHAIN_CUM[i - 1]!
    const t = segLen > 0 ? (d - CHAIN_CUM[i - 1]!) / segLen : 0
    const a = CHAIN_POINTS[i - 1]!
    const b = CHAIN_POINTS[i]!
    return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t }
  }
  const out: RouteShapePoint[] = [at(lo)]
  for (let i = 0; i < CHAIN_POINTS.length; i += 1) {
    const d = CHAIN_CUM[i]!
    if (d > lo && d < hi) out.push(CHAIN_POINTS[i]!)
  }
  out.push(at(hi))
  return out
}

/**
 * 站点序列 → 手绘链切片折线（方向跟随站点顺序，首末点吸附真实站点坐标保证与起终 chip 无缝）。
 * 任一站点离链过远（链不覆盖）返回 null，交回退路径。
 */
export function buildRouteShapeFromChain(stops: RouteShapePoint[]): RouteShapePoint[] | null {
  if (CHAIN_POINTS.length < 2 || stops.length < 2) return null
  const projections = stops.map(projectOnChain)
  // 只要求首末站落在链附近（发车点被挪到邮政旁，离链首 ~140 m，属正常）；
  // 中间站偶有偏出去 200 m 的（旧区公交上车点与链不重合），不能因此整条放弃实测链——
  // 一放弃就退回算路，高德在旧区会绕 3.6 km 或直接拉直线。
  if (projections[0]!.offM > 260 || projections[projections.length - 1]!.offM > 260) return null
  const first = projections[0]!.alongM
  const last = projections[projections.length - 1]!.alongM
  if (Math.abs(last - first) < 50) return null // 首末投影几乎重合，链方向不对，回退算路
  const lo = Math.min(first, last)
  const hi = Math.max(first, last)
  const slice = sliceChainBetween(lo, hi)
  if (last < first) slice.reverse()
  slice[0] = { lng: stops[0]!.lng, lat: stops[0]!.lat }
  slice[slice.length - 1] = { lng: stops[stops.length - 1]!.lng, lat: stops[stops.length - 1]!.lat }
  return bendTailToRoad(bendHeadToRoad(stitchShapeSegments([slice])))
}

/** 回程尾巴：跟头部对称，先沿横路走到发车点纬度，再往北进发车点。 */
export function bendTailToRoad(points: RouteShapePoint[]): RouteShapePoint[] {
  if (points.length < 2) return points
  const tail = points[points.length - 1]!
  const prev = points[points.length - 2]!
  if (haversineMeters(tail, WEST_GATE) > 30) return points
  const gap = haversineMeters(prev, tail)
  if (gap < 60) return points
  const corner = { lng: tail.lng, lat: prev.lat }
  if (haversineMeters(prev, corner) < 8 || haversineMeters(corner, tail) < 8) return points
  return [...points.slice(0, -1), corner, tail]
}

/**
 * 实测链首点常比「旧区发车点」更靠西（链从创业园开始采），直接连过去会斜穿楼群。
 * 旧区实际走法：沿南北向主路往南，再走东西向横路往西 —— 这里补一个折角点。
 */
export function bendHeadToRoad(points: RouteShapePoint[]): RouteShapePoint[] {
  if (points.length < 2) return points
  const head = points[0]!
  const next = points[1]!
  if (haversineMeters(head, WEST_GATE) > 30) return points
  const gap = haversineMeters(head, next)
  if (gap < 60) return points
  const corner = { lng: head.lng, lat: next.lat }
  if (haversineMeters(head, corner) < 8 || haversineMeters(corner, next) < 8) return points
  return [head, corner, ...points.slice(1)]
}

// ---------- 线路沿路形状（高德算路，后台补全，不阻塞快照） ----------

const shapeCache = new Map<string, { fetchedAt: number, polyline: RouteShapePoint[], complete: boolean }>()
const shapeInflight = new Map<string, Promise<void>>()

/** 拼接相邻段折线并去接缝重复点（可单测）。 */
export function stitchShapeSegments(segments: RouteShapePoint[][]): RouteShapePoint[] {
  const out: RouteShapePoint[] = []
  for (const segment of segments) {
    for (const point of segment) {
      const last = out[out.length - 1]
      if (last && last.lng === point.lng && last.lat === point.lat) continue
      out.push(point)
    }
  }
  return out
}

// ---------- 校界裁剪（校外段不要） ----------
// 校界来自 OSM relation 17685756（data/seeds/osm-campus-boundary.json，WGS84，3 片外环无洞）。
// 高德算路在旧区南门附近会绕出校外一圈（出去又回同一点的"棒棒糖"环），校车实际不走校外：
// 丢弃环外的中间点、邻接内点直连，首末点恒保留（站点锚点）。
type Ring = ReadonlyArray<readonly [number, number]>

const CAMPUS_RINGS: Ring[] = (campusBoundary.geometry.coordinates as unknown as number[][][][])
  .map(polygon => polygon[0] as unknown as Ring)

/** 射线法点在环内。 */
function pointInRing(ring: Ring, lng: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * 剪掉校外段：丢弃环外中间点（邻接内点直连），首末点恒保留，顺带去相邻重复点。
 * rings 可注入供单测；默认取 OSM 校界外环（无洞，3 片取并集）。
 */
export function clipPolylineToCampus(
  polyline: RouteShapePoint[],
  rings: Ring[] = CAMPUS_RINGS
): RouteShapePoint[] {
  const kept = polyline.filter((point, index) =>
    index === 0
    || index === polyline.length - 1
    || rings.some(ring => pointInRing(ring, point.lng, point.lat))
  )
  const out: RouteShapePoint[] = []
  for (const point of kept) {
    const last = out[out.length - 1]
    if (last && last.lng === point.lng && last.lat === point.lat) continue
    out.push(point)
  }
  return out
}

/** 高德算路响应取折线：route.paths[0].steps[].polyline（"lng,lat;lng,lat"，GCJ-02）。 */
function parseDirectionPolyline(payload: unknown): RouteShapePoint[] {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const route = (root.route && typeof root.route === 'object' ? root.route : {}) as Record<string, unknown>
  const paths = Array.isArray(route.paths) ? route.paths : []
  const path = (paths[0] && typeof paths[0] === 'object' ? paths[0] : {}) as Record<string, unknown>
  const steps = Array.isArray(path.steps) ? path.steps : []
  const points: RouteShapePoint[] = []
  for (const step of steps) {
    const row = (step && typeof step === 'object' ? step : {}) as Record<string, unknown>
    for (const p of parseAmapPolyline(row.polyline)) {
      points.push({ lng: p.longitude, lat: p.latitude })
    }
  }
  return points
}

/** 单段算路：主方式失败退另一方式；输入输出均 WGS84（请求/响应在内部转 GCJ-02）。 */
async function fetchSegmentShape(amapKey: string, from: RouteShapePoint, to: RouteShapePoint): Promise<RouteShapePoint[]> {
  const endpoints = SHAPE_PROVIDER === 'driving'
    ? [AMAP_DRIVING_ENDPOINT, AMAP_WALKING_ENDPOINT]
    : [AMAP_WALKING_ENDPOINT, AMAP_DRIVING_ENDPOINT]
  let lastError: unknown = null
  for (const endpoint of endpoints) {
    try {
      const origin = wgs84ToGcj02(from.lng, from.lat)
      const destination = wgs84ToGcj02(to.lng, to.lat)
      const url = new URL(endpoint)
      url.search = new URLSearchParams({
        key: amapKey,
        origin: `${origin.longitude},${origin.latitude}`,
        destination: `${destination.longitude},${destination.latitude}`
      }).toString()
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(SHAPE_TIMEOUT_MS)
      })
      if (!response.ok) throw new Error(`Amap shape HTTP ${response.status}`)
      const gcjPoints = parseDirectionPolyline(await response.json())
      if (gcjPoints.length < 2) throw new Error('Amap shape returned no usable polyline')
      return gcjPoints.map((p) => {
        const wgs = toWgs84Point(p.lng, p.lat)
        return { lng: wgs.longitude, lat: wgs.latitude }
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Amap shape failed')
}

/** 逐相邻站点段算路拼整线；失败的段做一次延时重试，仍失败才退化为直连段（并标记不完整以便短期重算）。 */
async function buildRouteShape(amapKey: string, stops: YktBusStopInfo[]): Promise<{ polyline: RouteShapePoint[], complete: boolean }> {
  const segments: RouteShapePoint[][] = []
  let complete = true
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i]!
    const to = stops[i + 1]!
    const start = { lng: from.lng, lat: from.lat }
    const end = { lng: to.lng, lat: to.lat }
    // 高德 Web 服务按 QPS 限流，串行段之间留出间隔，避免后面的段被拒后退化成直连弦。
    if (i > 0) await new Promise(resolve => setTimeout(resolve, SEGMENT_GAP_MS))
    let shape: RouteShapePoint[] | null = null
    // 高德对连续请求限流很敏感：同一段最多试三次，间隔递增，
    // 拿到算路就别退化直连（直连会在图上拉出横穿楼群的长弦）。
    for (let attempt = 0; attempt < 3 && !shape; attempt += 1) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, SEGMENT_RETRY_DELAY_MS * attempt))
      try {
        shape = await fetchSegmentShape(amapKey, start, end)
      } catch {
        shape = null
      }
    }
    if (shape) segments.push(shape)
    else {
      complete = false
      segments.push([start, end])
    }
  }
  return { polyline: repairLongChords(clipPolylineToCampus(stitchShapeSegments(segments))), complete }
}

/**
 * 后台补线路形状（24h 缓存）：完成前 route.polyline 为空，前端回退站点直连；
 * 快照接口因此永远不等算路。
 */

/**
 * 旧区实际发车点：YKT 起点是「旧区创业园」，实车从东苑门口三叉路口发车。
 * 接驳段算好后把起点站挪过去、折线前面接上这一段（幂等，失败保持原样）。
 */
async function applyWestDeparture(amapKey: string, routes: YktBusRouteInfo[]): Promise<void> {
  if (!amapKey) return
  for (const route of routes) {
    const first = route.stops[0]
    const second = route.stops[1]
    if (!first) continue
    if (first.siteName !== '旧区创业园' && first.siteName !== WEST_DEPARTURE_STOP_NAME) continue
    // 折线已经从发车点起头（逐站算路的结果）就不用再接一段，免得重叠。
    const headPoint = route.polyline[0]
    if (headPoint && haversineMeters(headPoint, WEST_GATE) < 40) continue
    const approach = await westApproach(amapKey, second ? { lng: second.lng, lat: second.lat } : { lng: first.lng, lat: first.lat })
    if (!approach) continue
    first.siteName = WEST_DEPARTURE_STOP_NAME
    first.lng = approach.start.lng
    first.lat = approach.start.lat
    // 实车不从创业园绕：接驳段直接连到下一站，原折线从最靠近下一站的点之后接上。
    const anchor = second ?? first
    let sliceIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    route.polyline.forEach((point, index) => {
      const distance = haversineMeters(point, anchor)
      if (distance < bestDistance) {
        bestDistance = distance
        sliceIndex = index
      }
    })
    const tail = route.polyline.slice(bestDistance < 60 ? sliceIndex + 1 : 0)
    const head = approach.polyline[approach.polyline.length - 1]!
    const rest = tail.length && haversineMeters(head, tail[0]!) < 20 ? tail.slice(1) : tail
    route.polyline = [...approach.polyline, ...rest]
  }
  for (const route of routes) {
    // 回程末端同样是发车点：尾巴离发车点太远就用车行算路接一段，
    // 不然最后一段会是从上一站斜切过来的长弦。
    const last = route.stops[route.stops.length - 1]
    const before = route.stops[route.stops.length - 2]
    if (!last || !before) continue
    if (last.siteName !== '旧区创业园' && last.siteName !== WEST_DEPARTURE_STOP_NAME) continue
    const tailPoint = route.polyline[route.polyline.length - 1]
    if (tailPoint && haversineMeters(tailPoint, WEST_GATE) < 40) continue
    const approach = await westApproach(amapKey, { lng: before.lng, lat: before.lat })
    if (!approach || approach.polyline.length < 2) continue
    // approach 是「发车点 → 上一站」，倒过来接到线尾。
    const reversed = [...approach.polyline].reverse().map(point => ({ ...point }))
    last.lng = approach.start.lng
    last.lat = approach.start.lat
    const head = route.polyline[route.polyline.length - 1]!
    const rest = reversed.filter(point => haversineMeters(point, head) > 5)
    route.polyline = [...route.polyline, ...rest]
  }
}

function haversineMeters(from: { lng: number, lat: number }, to: { lng: number, lat: number }): number {
  const rad = Math.PI / 180
  const dLat = (to.lat - from.lat) * rad
  const dLng = (to.lng - from.lng) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

function shapeLengthMeters(points: RouteShapePoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) total += haversineMeters(points[i - 1]!, points[i]!)
  return total
}

/**
 * 旧区两头的站点都该落在实车停靠的位置（邮政快递站旁），而不是「旧区创业园」：
 * 去程首站在创业园、回程末站也在创业园，两端都要挪过去，否则线尾会折进创业园。
 * 只改首个/末个站点，中间站不动。
 */
function normalizeWestStops(stops: YktBusStopInfo[]): void {
  if (!stops.length) return
  const fix = (stop: YktBusStopInfo | undefined) => {
    if (!stop) return
    if (stop.siteName !== '旧区创业园' && stop.siteName !== WEST_DEPARTURE_STOP_NAME) return
    stop.siteName = WEST_DEPARTURE_STOP_NAME
    stop.lng = WEST_GATE.lng
    stop.lat = WEST_GATE.lat
  }
  fix(stops[0])
  if (stops.length > 1) fix(stops[stops.length - 1])
}

/**
 * 实测链开头是「旧区创业园」那段绕行：把起点切到真正的发车点（邮政旁）。
 * 只在链首 1/4 范围内找最近点，避免整条链被截断。
 */
function trimHeadToGate(points: RouteShapePoint[]): RouteShapePoint[] {
  if (points.length < 4) return points
  const limit = Math.max(1, Math.floor(points.length / 4))
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < limit; i += 1) {
    const distance = haversineMeters(points[i]!, WEST_GATE)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }
  // 只有发车点已经贴在链上（≤25 m）才直接切；否则保留原链，
  // 交给 applyWestDeparture 用算路补一段真实道路的接驳，避免拉出斜穿楼群的长弦。
  if (bestIndex === 0 || bestDistance > 25) return points
  return [{ ...WEST_GATE }, ...points.slice(bestIndex + 1)]
}

/**
 * 算路失败的段会退化成直连，在图上就是横穿楼群的长弦。
 * 这里用实测链把长弦补成沿路折线：两端都落在链上（≤120 m）时，
 * 把两点之间的链上顶点插进去；补不出来就保持原样。
 */
function repairLongChords(points: RouteShapePoint[]): RouteShapePoint[] {
  if (points.length < 2 || CHAIN_POINTS.length < 2) return points
  const out: RouteShapePoint[] = [points[0]!]
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!
    const to = points[i]!
    const chord = haversineMeters(from, to)
    if (chord > 200) {
      const a = projectOnChain(from)
      const b = projectOnChain(to)
      if (a.offM <= CHAIN_MAX_OFFSET_M && b.offM <= CHAIN_MAX_OFFSET_M) {
        const lo = Math.min(a.alongM, b.alongM)
        const hi = Math.max(a.alongM, b.alongM)
        const fill = sliceChainBetween(lo, hi)
        const ordered = a.alongM <= b.alongM ? fill : [...fill].reverse()
        for (const point of ordered) {
          const last = out[out.length - 1]!
          if (haversineMeters(last, point) > 3) out.push(point)
        }
        continue
      }
    }
    out.push(to)
  }
  return out
}


/**
 * 实测链在发车点附近会缺一两个采样点：切到发车点后到下一个顶点可能是一百多米的长弦，
 * 画出来就斜穿楼群。这里用**实测 GPS 链**在这两点之间补顶点（高德在旧区这条路上
 * 算不出 140 米直连，会绕 3.6 km，所以只能用实测点）。
 */
function spliceGateApproach(polyline: RouteShapePoint[]): RouteShapePoint[] | null {
  if (CHAIN_POINTS.length < 2 || polyline.length < 2) return null
  const head = polyline[0]!
  const next = polyline[1]!
  if (haversineMeters(head, WEST_GATE) > 25) return null
  const gap = haversineMeters(head, next)
  if (gap < 60) return null
  const a = projectOnChain(head)
  const b = projectOnChain(next)
  if (b.offM > CHAIN_MAX_OFFSET_M * 3) return null
  const fill = sliceChainBetween(0, b.alongM)
  const ordered = a.alongM <= b.alongM ? fill : [...fill].reverse()
  const inserted: RouteShapePoint[] = []
  for (const point of ordered) {
    const last = inserted[inserted.length - 1] ?? head
    if (haversineMeters(last, point) > 3 && haversineMeters(point, next) > 5) inserted.push(point)
  }
  const candidate = inserted.length ? [head, ...inserted, ...polyline.slice(1)] : [head, ...polyline.slice(1)]
  // 补完仍有一段长弦，说明实测链在这个位置就是跳的：按「先南北、再东西」折一次，
  // 这样至少贴着两条路走，而不是斜穿楼群。
  const corners: RouteShapePoint[] = []
  for (let i = 1; i < candidate.length; i += 1) {
    const a = candidate[i - 1]!
    const b = candidate[i]!
    const gap = haversineMeters(a, b)
    if (gap <= 80) continue
    const dLat = Math.abs(a.lat - b.lat)
    // 旧区这条路：先沿南北向主路下去，再走东西向横路，所以先补「同经度、对方纬度」的拐点。
    const corner = dLat >= 25 ? { lng: a.lng, lat: b.lat } : { lng: b.lng, lat: a.lat }
    corners.push(corner)
  }
  if (!corners.length) return candidate.length > polyline.length ? candidate : null
  const merged: RouteShapePoint[] = [candidate[0]!]
  let ci = 0
  for (let i = 1; i < candidate.length; i += 1) {
    const a = candidate[i - 1]!
    const b = candidate[i]!
    if (ci < corners.length && haversineMeters(a, b) > 80) {
      merged.push(corners[ci]!)
      ci += 1
    }
    merged.push(b)
  }
  return merged
}

interface ManualStretch { id: string, points: [number, number][] }

/** 用户在高德上点出的路段：起止最近点之间整段替换成原始点，不插值、不算路。 */
function applyManualStretches(polyline: RouteShapePoint[]): RouteShapePoint[] {
  const stretches = (busRouteManual as unknown as { stretches?: ManualStretch[] }).stretches ?? []
  let result = polyline
  for (const stretch of stretches) {
    if (!result.length || stretch.points.length < 2) continue
    const points: RouteShapePoint[] = stretch.points.map(([lng, lat]) => ({ lng, lat }))
    const nearest = (target: RouteShapePoint): number => {
      let best = -1
      let bestDistance = Number.POSITIVE_INFINITY
      result.forEach((point, index) => {
        const distance = haversineMeters(point, target)
        if (distance < bestDistance) { bestDistance = distance; best = index }
      })
      return bestDistance <= 60 ? best : -1
    }
    const first = points[0]!
    const last = points[points.length - 1]!
    const start = nearest(first)
    const end = nearest(last)
    if (start < 0 || end < 0 || start === end) continue
    // 基准折线随高德算路会变，锚点可能落到别的路段；跨度过大时宁可不换，避免拉出长直弦。
    let stretchLength = 0
    for (let i = 1; i < points.length; i += 1) stretchLength += haversineMeters(points[i - 1]!, points[i]!)
    const anchorGap = haversineMeters(result[Math.min(start, end)]!, result[Math.max(start, end)]!)
    if (anchorGap > stretchLength * 2.5 + 80) continue
    const ordered = start <= end ? points : [...points].reverse()
    result = [...result.slice(0, Math.min(start, end)), ...ordered, ...result.slice(Math.max(start, end) + 1)]
  }
  return result
}

function ensureRouteShapes(amapKey: string, routes: YktBusRouteInfo[]): void {
  for (const route of routes) {
    normalizeWestStops(route.stops)
    const key = `${route.routeId}|${route.stops.map(s => s.siteId).join(',')}`
    const cached = shapeCache.get(key)
    const cachedTtl = cached && cached.complete !== false ? SHAPE_TTL_MS : SHAPE_DEGRADED_TTL_MS
    if (cached && Date.now() - cached.fetchedAt < cachedTtl) {
      route.polyline = cached.polyline
      continue
    }
    // 主源：高德算路（沿真实道路，后台补全，24h 缓存）。
    // 手绘链（竞品叮叮车路网）实测整体偏移，已弃用，仅保留 buildRouteShapeFromChain 供比对。
    // 主源：实测 GPS 轨迹切片（贴真实行驶路径，同步零外呼）。高德算路在校园里会绕远（3.29km vs 实测 2.38km），仅作回退。
    const tracedRaw = buildRouteShapeFromChain(route.stops)
    const traced = tracedRaw ? trimHeadToGate(tracedRaw) : null
    if (traced) {
      // 先按 2 分钟短缓存登记原链：细化没跑完/被限流时下一轮还会重试，
      // 否则 24 小时都不会再贴一次路。
      shapeCache.set(key, { fetchedAt: Date.now(), polyline: traced, complete: false })
      route.polyline = traced
      // 实测链只有 46 个点，采样点之间会拉直线切角：后台再用高德算路把它贴到车行道上，
      // 成功且没绕远就覆盖缓存，下一轮快照即拿到细化后的折线。
      const refineKey = `${key}|road`
      if (amapKey && !shapeInflight.has(refineKey)) {
        const tracedLength = shapeLengthMeters(traced)
        const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
        const refine = buildShapeThroughStops(amapKey, stops)
          .then(async (byStops) => {
            // 有一段算路失败（complete=false）就会留直线和弦，不能覆盖实测链。
            const usable = byStops?.complete === true && tracedLength > 0
              && shapeLengthMeters(byStops.polyline) >= tracedLength * 0.75
              && shapeLengthMeters(byStops.polyline) <= tracedLength * 1.45
            if (usable) {
              const spliced = await repairChordsWithRoads(amapKey, bendTailToRoad(bendHeadToRoad(spliceGateApproach(byStops.polyline) ?? byStops.polyline)))
              shapeCache.set(key, { fetchedAt: Date.now(), polyline: spliced, complete: byStops.complete })
              return
            }
            const refined = await refineShapeWithRoads(amapKey, traced)
            if (refined && refined.length > traced.length) {
              const spliced = await repairChordsWithRoads(amapKey, bendTailToRoad(bendHeadToRoad(spliceGateApproach(refined) ?? refined)))
              shapeCache.set(key, { fetchedAt: Date.now(), polyline: spliced, complete: true })
              return
            }
            const headFixed = await repairChordsWithRoads(amapKey, bendTailToRoad(bendHeadToRoad(spliceGateApproach(traced) ?? traced)))
            shapeCache.set(key, { fetchedAt: Date.now(), polyline: headFixed, complete: false })
          })
          .catch(() => {})
          .finally(() => {
            shapeInflight.delete(refineKey)
          })
        shapeInflight.set(refineKey, refine)
      }
      continue
    }
    if (!amapKey) continue
    if (shapeInflight.has(key)) continue
    const promise = buildRouteShape(amapKey, route.stops)
      .then(({ polyline, complete }) => {
        shapeCache.set(key, { fetchedAt: Date.now(), polyline, complete })
        route.polyline = polyline
      })
      .catch(() => {
        // 整体失败保持直连回退，下一轮快照重试。
      })
      .finally(() => {
        shapeInflight.delete(key)
      })
    shapeInflight.set(key, promise)
  }
  for (const route of routes) {
    if (route.polyline?.length) route.polyline = applyManualStretches(route.polyline)
  }
  // 形状合并完之后再接旧区接驳段，否则下一轮快照会用缓存形状覆盖掉。
  void applyWestDeparture(amapKey, routes)
}

// ---------- 对外入口 ----------

/** 拉取校车快照（线路 + 沿路形状 + 起终点 + 实时车位置）。 */
export async function getBusSnapshot(openTicket: string, options: { amapKey?: string } = {}): Promise<YktBusSnapshot> {
  const session = await ensureSession(openTicket)
  const routes = await ensureRoutes(session, String(options.amapKey ?? '').trim())
  const buses = await ensurePositions(session, routes)
  return {
    coordinateSystem: YKT_COORDINATE_SYSTEM,
    fetchedAt: new Date().toISOString(),
    routes,
    buses
  }
}
