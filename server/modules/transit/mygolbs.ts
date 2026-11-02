import type {
  ApiBusDeparturesDirection,
  ApiBusDeparturesResponse,
  ApiBusLiveDirection,
  ApiBusLiveResponse,
  ApiBusVehicle
} from '../../../shared/types/server'

/**
 * 掌上公交（h5.mygolbs.com）校外公交数据源。
 *
 * 网页版自己就是 POST 一个 `ApiData.do` 表单，返回明文 JSON，不需要签名：
 *   CMD=102 线路搜索 → buslines[]
 *   CMD=103 线路详情 → 站点 + 逐点折线 + routeId + 票价说明
 *   CMD=104 实时车辆 → list[]（每辆车的 GPS、下一站、角度）
 *   CMD=116 发车时刻表 → list[]（按时间段分组，当前那班带 ●）
 *
 * 泉州的城市参数是网页里硬编码的 `CITYNAME=泉州市` / `CITYKEY=qg595803`。
 *
 * 缓存策略：实时 20 秒，时刻表 30 分钟，线路元信息 12 小时。上游挂掉时先用
 * 过期的实时数据兜底（最多 5 分钟），超时才抛错——页面不该因为上游抖一下变空白。
 */

const API_ENDPOINT = 'https://h5.mygolbs.com/ApiData.do'
const CITY_NAME = '泉州市'
const CITY_KEY = 'qg595803'

const LIVE_TTL_MS = 20_000
const LIVE_STALE_MS = 5 * 60_000
const DEPART_TTL_MS = 30 * 60_000
const META_TTL_MS = 12 * 60 * 60_000

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  accept: 'application/json, text/javascript, */*; q=0.01',
  'x-requested-with': 'XMLHttpRequest',
  referer: 'https://h5.mygolbs.com/',
  origin: 'https://h5.mygolbs.com',
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
} as const

/** 线路号 → 上游线路名。上游只认带「路」的写法。 */
const LINE_ALIASES: Record<string, string> = { K2: 'K2路', K6: 'K6路' }

type CacheEntry = { at: number, value: unknown }

const cache = new Map<string, CacheEntry>()

function cacheGet<T>(key: string, ttlMs: number): { value: T, fresh: boolean } | null {
  const hit = cache.get(key)
  if (!hit) return null
  const age = Date.now() - hit.at
  if (age > ttlMs) return null
  return { value: hit.value as T, fresh: age <= ttlMs }
}

function cachePeek<T>(key: string, staleMs: number): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > staleMs) return null
  return hit.value as T
}

async function post<T>(params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(params).toString()
  const raw = await $fetch<ArrayBuffer | string>(API_ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body,
    responseType: 'arrayBuffer',
    timeout: 8000
  })
  let text: string
  if (raw instanceof ArrayBuffer) {
    text = new TextDecoder('utf-8').decode(raw)
    if (text.includes('\uFFFD')) text = new TextDecoder('gb18030').decode(raw)
  } else {
    text = raw
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`mygolbs 返回了非 JSON 内容：${text.slice(0, 120)}`)
  }
}

type UpstreamRealtime = {
  status: number
  msg?: string
  hasReal?: number
  planTime?: string
  list?: Array<Record<string, unknown>>
}

type UpstreamDepart = {
  status: number
  list?: Array<{ group: string, times: string[], isNow?: number }>
}

type UpstreamDetail = {
  status: number
  routeId?: number
  beginTime?: string
  endTime?: string
  data?: Array<{ stationName?: string }>
}

type LineMeta = {
  routeId: number
  from: string
  to: string
  beginTime: string
  endTime: string
}

/** 线路方向元信息：routeId + 起终点 + 首末班。 */
async function lineMeta(line: string, direction: number): Promise<LineMeta> {
  const key = `meta:${line}:${direction}`
  const hit = cacheGet<LineMeta>(key, META_TTL_MS)
  if (hit) return hit.value

  const upstreamName = LINE_ALIASES[line] ?? line
  const detail = await post<UpstreamDetail>({
    CMD: '103',
    CITYNAME: CITY_NAME,
    CITYKEY: CITY_KEY,
    LINENAME: upstreamName,
    DIRECTION: String(direction)
  })
  if (detail.status !== 1 || !detail.routeId) {
    throw new Error(`线路详情获取失败：${line} dir=${direction}`)
  }
  const stations = (detail.data ?? []).map(item => item.stationName ?? '')
  const meta: LineMeta = {
    routeId: detail.routeId,
    from: stations[0] ?? '',
    to: stations[stations.length - 1] ?? '',
    beginTime: detail.beginTime ?? '',
    endTime: detail.endTime ?? ''
  }
  cache.set(key, { at: Date.now(), value: meta })
  return meta
}

function toVehicle(item: Record<string, unknown>): ApiBusVehicle | null {
  const lng = Number(item.bus_lng)
  const lat = Number(item.bus_lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const angle = Number(item.angle)
  const distance = Number(item.busToStationNiheDistance)
  return {
    plate: String(item.busNumber ?? ''),
    nextStation: String(item.stationName ?? ''),
    stationOrder: Number(item.index ?? 0),
    point: [lng, lat],
    angle: Number.isFinite(angle) ? Math.round(angle) : undefined,
    distanceToNext: Number.isFinite(distance) ? Math.round(distance) : undefined,
    statusType: item.statusType === undefined ? undefined : String(item.statusType)
  }
}

async function liveDirection(line: string, direction: number): Promise<ApiBusLiveDirection> {
  const key = `live:${line}:${direction}`
  const meta = await lineMeta(line, direction)
  const upstreamName = LINE_ALIASES[line] ?? line

  const hit = cacheGet<ApiBusLiveDirection>(key, LIVE_TTL_MS)
  if (hit) return hit.value

  let data: UpstreamRealtime
  try {
    data = await post<UpstreamRealtime>({
      CMD: '104',
      CITYNAME: CITY_NAME,
      CITYKEY: CITY_KEY,
      LINENAME: upstreamName,
      DIRECTION: String(direction),
      STATIONORDER: '0'
    })
  } catch (error) {
    const stale = cachePeek<ApiBusLiveDirection>(key, LIVE_STALE_MS)
    if (stale) return stale
    throw error
  }

  const vehicles = data.status === 1
    ? (data.list ?? []).map(toVehicle).filter((item): item is ApiBusVehicle => item !== null)
    : []

  const value: ApiBusLiveDirection = {
    line,
    direction,
    from: meta.from,
    to: meta.to,
    planTime: data.planTime ?? null,
    hasReal: data.hasReal === 1,
    vehicles
  }
  cache.set(key, { at: Date.now(), value })
  return value
}

/** 实时车辆位置；`line` 为空返回 K2 / K6 全部四个方向。 */
export async function busLiveFor(line?: string | null): Promise<ApiBusLiveResponse> {
  const lines = line ? [line.trim().toUpperCase()] : ['K2', 'K6']
  const directions: ApiBusLiveDirection[] = []
  const failures: string[] = []

  for (const item of lines) {
    for (const direction of [1, 2]) {
      try {
        directions.push(await liveDirection(item, direction))
      } catch (error) {
        failures.push(`${item}/${direction}: ${(error as Error).message}`)
      }
    }
  }

  if (!directions.length) {
    throw new Error(`实时公交全部失败：${failures.join('; ')}`)
  }

  return {
    provider: 'mygolbs',
    city: CITY_NAME,
    fetchedAt: new Date().toISOString(),
    directions
  }
}

function nextFromTimes(times: string[], now: Date, limit = 3): string[] {
  const clean = times.map(item => item.replace('●', '').trim()).filter(Boolean)
  const clock = now.toTimeString().slice(0, 5)
  const later = clean.filter(item => item >= clock)
  return (later.length ? later : clean.slice(0, limit)).slice(0, limit)
}

async function departuresDirection(line: string, direction: number): Promise<ApiBusDeparturesDirection> {
  const key = `dep:${line}:${direction}`
  const hit = cacheGet<ApiBusDeparturesDirection>(key, DEPART_TTL_MS)
  if (hit) return hit.value

  const meta = await lineMeta(line, direction)
  const upstream = await post<UpstreamDepart>({
    CMD: '116',
    CITYNAME: CITY_NAME,
    CITYKEY: '',
    DIRECTION: String(direction),
    ROUTEID: String(meta.routeId)
  })

  const groups = (upstream.list ?? []).map(item => ({
    group: item.group,
    times: item.times ?? [],
    isNow: item.isNow === 1
  }))
  const allTimes = groups.flatMap(item => item.times)
  const value: ApiBusDeparturesDirection = {
    line,
    direction,
    from: meta.from,
    to: meta.to,
    beginTime: meta.beginTime,
    endTime: meta.endTime,
    groups,
    next: nextFromTimes(allTimes, new Date())
  }
  cache.set(key, { at: Date.now(), value })
  return value
}

/** 发车时刻表；`line` 为空返回 K2 / K6 全部四个方向。 */
export async function busDeparturesFor(line?: string | null): Promise<ApiBusDeparturesResponse> {
  const lines = line ? [line.trim().toUpperCase()] : ['K2', 'K6']
  const directions: ApiBusDeparturesDirection[] = []

  for (const item of lines) {
    for (const direction of [1, 2]) {
      try {
        directions.push(await departuresDirection(item, direction))
      } catch {
        // 单个方向失败不影响其它方向
      }
    }
  }

  if (!directions.length) throw new Error('发车时刻表获取失败')

  return {
    provider: 'mygolbs',
    city: CITY_NAME,
    fetchedAt: new Date().toISOString(),
    directions,
    note: '时刻表由掌上公交按历史数据推算，仅供参考，请提前候车。'
  }
}
