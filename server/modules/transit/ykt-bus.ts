// 云一卡通（YKTPreview）校车定位协议客户端
// 协议逆向自 wx.leyunykt.com YKTPreview 前端 app.js，实测链路见
// E:/nixiang/work/leyunykt-bus/阶段报告-校车定位协议.md。
//   open_ticket = yktkey 反替换 → Base64 → AES-128-CBC(key/iv 固定) → JSON{addr,ticket}
//   请求体 = 8 位 UTF8 长度前缀 + JSON + "SIGN_VAL" + base64(RSA-SHA256(JSON))
//   响应体 = 8 位长度前缀 + retcode(4 位) + JSON + "SIGN_VAL" + 签名（客户端不验签）
// 本模块不依赖 Nuxt 运行时，纯函数部分可被 scripts/ykt-bus-protocol.test.ts 直接测试。
import { createDecipheriv, createSign } from 'node:crypto'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../../shared/utils/coordinate-convert'
import campusBoundary from '../../../data/seeds/osm-campus-boundary.json'
import { parseAmapPolyline } from '../directions/amap'

const AES_KEY = '***REMOVED***' // 16 字节 = aes-128-cbc
const AES_IV = '***REMOVED***'
const API_ID = '***REMOVED***'
const ACCESS_TOKEN = '***REMOVED***'
const COMMON = '?DirectProcessData=true&DisablePacketHeader=false&PacketHeaderMode=1&PacketVer=2'
const SIGN_SEP = 'SIGN_VAL'
const REQUEST_TIMEOUT_MS = 15_000
const ROUTES_TTL_MS = 10 * 60 * 1000
const POSITIONS_TTL_MS = 5_000

// ---------- 线路沿路形状（高德算路，24h 缓存） ----------
const AMAP_WALKING_ENDPOINT = 'https://restapi.amap.com/v3/direction/walking'
const AMAP_DRIVING_ENDPOINT = 'https://restapi.amap.com/v3/direction/driving'
/**
 * 算路方式：walking 优先（校园步道贴路概率高），失败退 driving，再退站点直连。
 * 校车实际走车行道时把这里翻成 'driving' 即可。
 */
const SHAPE_PROVIDER: 'walking' | 'driving' = 'walking'
const SHAPE_TTL_MS = 24 * 60 * 60 * 1000
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

/** JSON → 长度前缀 + JSON + "SIGN_VAL" + base64(RSA-SHA256(JSON))。 */
export function buildSignedBody(params: Record<string, string>): string {
  const json = JSON.stringify(params)
  const signature = createSign('RSA-SHA256').update(json, 'utf8').sign(RSA_PRIVATE_KEY).toString('base64')
  const payload = json + SIGN_SEP + signature
  return Buffer.byteLength(payload, 'utf8').toString().padStart(8, '0') + payload
}

/** 响应体 → { ret, json }，ret 为 4 位返回码（'0000' 成功）。 */
export function parseSignedResponse(body: string): { ret: string; json: string } {
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

async function callYkt(addr: string, name: string, params: Record<string, string>): Promise<{ ret: string; json: string }> {
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
  if (sessionPromise && sessionTicketBlob === openTicket) return sessionPromise
  sessionTicketBlob = openTicket
  sessionPromise = initSession(openTicket)
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
  const ticket = textValue(info.ticket)
  if (!addr || !ticket) throw new Error('open_ticket 解密结果缺少 addr/ticket')
  const res = await callYkt(addr, 'YKTGetOpenInfo', {
    api_id: API_ID,
    access_token: ACCESS_TOKEN,
    open_id: '123',
    ticket
  })
  const body = JSON.parse(res.json) as Record<string, unknown>
  const userId = textValue(body.user_id)
  const openId = textValue(body.id || body.open_id)
  if (!userId || !openId) throw new Error('YKTGetOpenInfo 响应缺少 user_id/open_id')
  return { addr, ticket, userId, openId }
}

// ---------- 线路缓存（10 分钟） ----------

let routesCache: { fetchedAt: number; routes: YktBusRouteInfo[] } | null = null

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

let positionsCache: { fetchedAt: number; buses: YktBusVehicle[] } | null = null
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

// ---------- 线路沿路形状（高德算路，后台补全，不阻塞快照） ----------

const shapeCache = new Map<string, { fetchedAt: number; polyline: RouteShapePoint[] }>()
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

/** 逐相邻站点段算路拼整线；单段失败退化为直连段保持连续。 */
async function buildRouteShape(amapKey: string, stops: YktBusStopInfo[]): Promise<RouteShapePoint[]> {
  const segments: RouteShapePoint[][] = []
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i]!
    const to = stops[i + 1]!
    try {
      segments.push(await fetchSegmentShape(amapKey, { lng: from.lng, lat: from.lat }, { lng: to.lng, lat: to.lat }))
    } catch {
      segments.push([{ lng: from.lng, lat: from.lat }, { lng: to.lng, lat: to.lat }])
    }
  }
  return clipPolylineToCampus(stitchShapeSegments(segments))
}

/**
 * 后台补线路形状（24h 缓存）：完成前 route.polyline 为空，前端回退站点直连；
 * 快照接口因此永远不等算路。
 */
function ensureRouteShapes(amapKey: string, routes: YktBusRouteInfo[]): void {
  if (!amapKey) return
  for (const route of routes) {
    const key = `${route.routeId}|${route.stops.map(s => s.siteId).join(',')}`
    const cached = shapeCache.get(key)
    if (cached && Date.now() - cached.fetchedAt < SHAPE_TTL_MS) {
      route.polyline = cached.polyline
      continue
    }
    if (shapeInflight.has(key)) continue
    const promise = buildRouteShape(amapKey, route.stops)
      .then((polyline) => {
        shapeCache.set(key, { fetchedAt: Date.now(), polyline })
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
