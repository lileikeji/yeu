<script setup lang="ts">
import type {
  ApiBusDeparturesDirection,
  ApiBusLineDirection,
  ApiBusLiveDirection,
  ApiBusLiveResponse,
  ApiBusDeparturesResponse
} from '~~/shared/types/server'
import { etaSeconds, formatEta, projectAlong, stopAlongs, vehicleAlong } from '~~/shared/utils/transit-schematic'

const props = defineProps<{
  directions: ApiBusLineDirection[]
  fetchedAt: string | null
  open: boolean
  /** 桌面端距地图左缘的距离；左侧地点栏展开时要让开 18rem。 */
  leftOffset?: string
  /** 掌上公交实时车辆（20 秒刷新）。 */
  live?: ApiBusLiveResponse | null
  /** 全天发车时刻表。 */
  departures?: ApiBusDeparturesResponse | null
  liveError?: string
  /** 当前只看某一个方向（方向 id）；空串表示双向都画。 */
  selectedDirection?: string
  /** 「我」的当前位置（已转成 GCJ-02）；没定位时为空。 */
  location?: { lng: number, lat: number } | null
  /** sheet = 手机底部面板里的视图；overlay = 桌面浮层（默认，行为不变）。 */
  variant?: 'overlay' | 'sheet'
  /** sheet 变体：时刻表抽屉是否展开（由页面持有，返回栈要用）。 */
  drawerOpen?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'focus-stop': [point: { lng: number, lat: number }]
  'focus-vehicle': [payload: { plate: string, point: [number, number], nextStation: string, distanceToNext?: number }]
  'select-direction': [line: ApiBusLineDirection]
  'change-line': [line: string]
  /** sheet 变体：头部「‹ 我的地图」退回上一层。 */
  'back': []
  /** sheet 变体：底栏「时刻表 ›」开关抽屉。 */
  'update:drawerOpen': [value: boolean]
}>()

const LINE_ORDER = ['K2', 'K6'] as const
const LINE_COLORS: Record<string, string> = { K2: '#1a6cf5', K6: '#e8590c' }

const ALL = 'all'
const selectedLine = ref<string>(ALL)
const expandedId = ref<string>('')

const lineNames = computed(() => {
  const present = [...new Set(props.directions.map(item => item.line))]
  return present.sort((a, b) => {
    const ai = LINE_ORDER.indexOf(a as typeof LINE_ORDER[number])
    const bi = LINE_ORDER.indexOf(b as typeof LINE_ORDER[number])
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
})

watch(lineNames, (names) => {
  if (selectedLine.value !== ALL && !names.includes(selectedLine.value)) selectedLine.value = ALL
}, { immediate: true })

function sameStop(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a)
}

function liveOf(direction: ApiBusLineDirection): ApiBusLiveDirection | null {
  const list = (props.live?.directions ?? []).filter(item => item.line === direction.line)
  return list.find(item => sameStop(item.from, direction.from) && sameStop(item.to, direction.to)) ?? null
}

function departuresOf(direction: ApiBusLineDirection): ApiBusDeparturesDirection | null {
  const list = (props.departures?.directions ?? []).filter(item => item.line === direction.line)
  return list.find(item => sameStop(item.from, direction.from) && sameStop(item.to, direction.to)) ?? null
}

function nextDeparture(direction: ApiBusLineDirection): string {
  return departuresOf(direction)?.next?.[0] ?? ''
}

function laterDepartures(direction: ApiBusLineDirection): string[] {
  return (departuresOf(direction)?.next ?? []).slice(1)
}

function onlineCount(direction: ApiBusLineDirection): number {
  return liveOf(direction)?.vehicles.length ?? 0
}

/** 在途车辆按离下一站由近到远排，最靠前的那辆在最上面。 */
function vehiclesOf(direction: ApiBusLineDirection): ApiBusLiveDirection['vehicles'] {
  const list = liveOf(direction)?.vehicles ?? []
  return [...list].sort((a, b) => (a.distanceToNext ?? 99999) - (b.distanceToNext ?? 99999))
}

/** 简略图：站点、在途车辆与「我」都投影到同一条沿线里程轴上（0→100%）。 */
interface Schematic {
  total: number
  ticks: Array<{ x: number, name: string, major: boolean }>
  buses: Array<{ x: number, plate: string, near: string, lane: number }>
  me: number | null
  myStop: { name: string, meters: number, eta: string } | null
}

const schematics = computed(() => {
  const result = new Map<string, Schematic>()
  for (const direction of props.directions) {
    const stops = direction.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
    const alongs = stopAlongs(stops)
    const total = alongs[alongs.length - 1] ?? 0
    if (total <= 0) continue
    const toPercent = (along: number): number => Math.max(0, Math.min(100, (along / total) * 100))

    const step = Math.max(1, Math.ceil(direction.stops.length / 9))
    const ticks = direction.stops
      .map((stop, index) => ({ x: toPercent(alongs[index] ?? 0), name: stop.name, major: index % step === 0 || index === direction.stops.length - 1 }))
      .filter(tick => tick.major)

    const laneUsed: number[] = []
    const buses = vehiclesOf(direction).map((vehicle) => {
      const index = direction.stops.findIndex(stop => sameStop(stop.name, vehicle.nextStation))
      const along = vehicleAlong(index >= 0 ? index : (vehicle.stationOrder || 1), vehicle.distanceToNext, alongs)
      const x = toPercent(along)
      // 挨得太近的车错开三层，避免完全叠在一起看不出有几辆。
      let lane = 0
      while (lane < 3 && laneUsed.some((used, slot) => slot % 3 === lane && Math.abs(used - x) < 3.2)) lane += 1
      if (lane >= 3) lane = 0
      laneUsed.push(x)
      return { x, plate: shortPlate(vehicle.plate), near: vehicle.nextStation, along, lane }
    })

    let me: number | null = null
    let myStop: Schematic['myStop'] = null
    if (props.location) {
      const projected = projectAlong(props.location, stops, alongs)
      me = toPercent(projected.along)
      const nearestIndex = alongs.reduce((best, along, index) => Math.abs(along - projected.along) < Math.abs(alongs[best]! - projected.along) ? index : best, 0)
      const nearest = direction.stops[nearestIndex]
      if (nearest) {
        const meters = Math.hypot((props.location.lng - nearest.lng) * 96_000, (props.location.lat - nearest.lat) * 110_540)
        const ahead = buses
          .map(bus => ({ along: bus.along, eta: etaSeconds(bus.along, projected.along, { stopsBetween: Math.max(0, nearestIndex - direction.stops.findIndex(stop => sameStop(stop.name, bus.near))) }) }))
          .filter(item => item.along <= projected.along)
          .sort((a, b) => a.eta - b.eta)[0]
        myStop = {
          name: nearest.name,
          meters: Math.round(meters),
          eta: ahead ? formatEta(ahead.eta) : '暂无在途车'
        }
      }
    }
    result.set(direction.id, { total, ticks, buses, me, myStop })
  }
  return result
})

function schematicOf(direction: ApiBusLineDirection): Schematic | null {
  return schematics.value.get(direction.id) ?? null
}

/** 「我」的到站文案：站名 + 距离 + 车还有多久。 */
function meStopText(direction: ApiBusLineDirection): string {
  const stop = schematicOf(direction)?.myStop
  if (!stop) return '未定位'
  return `${stop.name} 约 ${stop.meters} m · 车 ${stop.eta} 到`
}

function shortPlate(plate: string): string {
  return plate.replace(/^闽C/, '') || plate
}

function distanceText(meters: number | undefined): string {
  if (meters === undefined || !Number.isFinite(meters)) return ''
  if (meters <= 30) return '已到站'
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

const lineDirections = computed(() => selectedLine.value === ALL
  ? [...props.directions].sort((a, b) => lineNames.value.indexOf(a.line) - lineNames.value.indexOf(b.line))
  : props.directions.filter(item => item.line === selectedLine.value))

function selectLine(name: string): void {
  selectedLine.value = name
  expandedId.value = ''
  emit('change-line', name)
}

/** 手机上是整屏浮层，默认展开第一个方向，免得大片留白。 */
function autoExpandOnMobile(): void {
  if (typeof window === 'undefined' || window.innerWidth >= 768) return
  if (expandedId.value) return
  expandedId.value = lineDirections.value[0]?.id ?? ''
}

watch(() => props.open, (open) => {
  if (open) nextTick(autoExpandOnMobile)
}, { immediate: true })

/** 页面侧切了“只看某方向”时，标签页跟着走，避免标签写着全部但地图只有一条。 */
watch(() => props.selectedDirection, (id) => {
  if (!id) {
    selectedLine.value = ALL
    return
  }
  const hit = props.directions.find(item => item.id === id)
  if (hit) selectedLine.value = hit.line
})

function lineColor(line: string): string {
  return LINE_COLORS[line] ?? '#1a6cf5'
}

const selectedDirectionLabel = computed(() => {
  const hit = props.directions.find(item => item.id === props.selectedDirection)
  return hit ? `${hit.line} ${hit.from} → ${hit.to}` : ''
})

function clearDirection(): void {
  const hit = props.directions.find(item => item.id === props.selectedDirection)
  if (hit) emit('select-direction', hit)
}

function priceText(direction: ApiBusLineDirection): string {
  if (direction.totalPrice === null) return '票价未标注'
  if (direction.basicPrice === direction.totalPrice) return `全程 ${direction.totalPrice} 元`
  return `全程 ${direction.totalPrice} 元（起步 ${direction.basicPrice ?? '-'} 元）`
}

/** 点方向行 = 只看这一条（地图只留这条折线与它的车）；再点一次回到双向。 */
function toggleDirection(direction: ApiBusLineDirection): void {
  const selected = props.selectedDirection === direction.id
  expandedId.value = selected ? '' : direction.id
  emit('select-direction', direction)
}

// ── T-029：手机面板内的校外公交视图（variant="sheet"）──
// T-030：K2 / K6 不再上下堆两段。顶部分段单选，滚动体只画所选那条线。
const sheetLine = ref<string>('')

/** 地图上「只看这条」的方向 → 所属线路：面板挂载/换向时跟着它选线，别出现地图 K6、面板 K2。 */
function lineOfDirection(id: string | undefined): string | undefined {
  if (!id) return undefined
  return props.directions.find(item => item.id === id)?.line
}

watch(lineNames, (names) => {
  if (!names.length) {
    sheetLine.value = ''
    return
  }
  const preferred = lineOfDirection(props.selectedDirection)
  if (!names.includes(sheetLine.value)) sheetLine.value = (preferred && names.includes(preferred) ? preferred : names[0]) ?? ''
  const hit = props.directions.find(item => item.line === sheetLine.value && item.id === expandedId.value)
  if (!hit) expandedId.value = props.directions.find(item => item.line === sheetLine.value)?.id ?? ''
}, { immediate: true })

// 换方向（地图上选了另一个方向）时跟着换线；线路列表刷新不重置用户手选的线。
watch(() => props.selectedDirection, (id) => {
  const name = lineOfDirection(id)
  if (name && lineNames.value.includes(name)) sheetLine.value = name
})

/** 标题只报当前线：「校外公交 · K2」。 */
function resolveTransitSheetTitle(line: string): string {
  const name = line.trim()
  return name ? `校外公交 · ${name}` : '校外公交'
}

const sheetTitle = computed(() => resolveTransitSheetTitle(sheetLine.value))

/** 手上只有所选线一条；K6 不再同屏。 */
const sheetActiveGroup = computed(() => {
  const name = sheetLine.value || lineNames.value[0] || ''
  return { name, directions: props.directions.filter(item => item.line === name) }
})

/** 只认「06:30」这种整点分钟串；脏数据直接丢。 */
function normalizeDepartureTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** 时刻表按上午（<12:00）/ 下午两段排；升序、去重。 */
function groupDeparturesByHalfDay(times: string[]): { am: string[], pm: string[] } {
  const normalized = Array.from(new Set(times
    .map(item => normalizeDepartureTime(item))
    .filter((item): item is string => item !== null))).sort()
  const am: string[] = []
  const pm: string[] = []
  normalized.forEach((time) => {
    if (Number(time.slice(0, 2)) < 12) am.push(time)
    else pm.push(time)
  })
  return { am, pm }
}

/** 一格只有一种状态：下一班压过已过，未过的都是未来。 */
function resolveDepartureChipState(time: string, options: { next: string, past: boolean }): 'past' | 'next' | 'future' {
  if (options.next && time === options.next) return 'next'
  return options.past ? 'past' : 'future'
}

/** 站列默认只展开起终点与最近两站，中间折叠成一行「⋯ 中间 N 站」；点开后在视图内展开。 */
const sheetStopsExpanded = ref<Record<string, boolean>>({})

type SheetStopRow
  = | { kind: 'stop', key: string, stop: ApiBusLineDirection['stops'][number] }
    | { kind: 'fold', key: string, count: number }

function sheetStopRows(direction: ApiBusLineDirection): SheetStopRow[] {
  const stops = direction.stops
  if (!stops.length) return []
  if (sheetStopsExpanded.value[direction.id]) {
    return stops.map((stop, index) => ({ kind: 'stop', key: `stop-${direction.id}-${index}`, stop }))
  }
  const keep = new Set<number>([0, stops.length - 1])
  const location = props.location
  if (location) {
    stops
      .map((stop, index) => ({
        index,
        meters: Math.hypot((location.lng - stop.lng) * 96_000, (location.lat - stop.lat) * 110_540)
      }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 2)
      .forEach((item) => { keep.add(item.index) })
  }
  const rows: SheetStopRow[] = []
  let folded = 0
  const flush = (): void => {
    if (!folded) return
    rows.push({ kind: 'fold', key: `fold-${direction.id}-${rows.length}`, count: folded })
    folded = 0
  }
  stops.forEach((stop, index) => {
    if (!keep.has(index)) {
      folded += 1
      return
    }
    flush()
    rows.push({ kind: 'stop', key: `stop-${direction.id}-${index}`, stop })
  })
  flush()
  return rows
}

function toggleSheetStops(direction: ApiBusLineDirection): void {
  sheetStopsExpanded.value = {
    ...sheetStopsExpanded.value,
    [direction.id]: !sheetStopsExpanded.value[direction.id]
  }
}

/** 底栏与抽屉跟所选线走：优先地图上只看的方向，否则该线第一个方向。 */
const sheetActiveDirection = computed<ApiBusLineDirection | null>(() => {
  const list = sheetActiveGroup.value.directions
  return list.find(item => item.id === props.selectedDirection) ?? list[0] ?? null
})
const sheetNextBus = computed(() => sheetActiveDirection.value ? nextDeparture(sheetActiveDirection.value) : '')

const sheetTodayCount = computed(() => {
  const direction = sheetActiveDirection.value
  if (!direction) return 0
  const departures = departuresOf(direction)
  return departures ? departures.groups.reduce((total, group) => total + group.times.length, 0) : 0
})

function selectSheetLine(name: string): void {
  if (name === sheetLine.value) return
  sheetLine.value = name
  sheetStopsExpanded.value = {}
  expandedId.value = props.directions.find(item => item.line === name)?.id ?? ''
  emit('change-line', name)
}

/** 抽屉头右侧：「K2 回学校」。 */
function resolveLineEnds(list: Array<{ from: string, to: string }>): { school: string, city: string } {
  const names: string[] = []
  for (const item of list) {
    if (!names.includes(item.from)) names.push(item.from)
    if (!names.includes(item.to)) names.push(item.to)
  }
  const school = names.find(name => /仰恩大学|校区/.test(name)) ?? names[0] ?? ''
  const city = names.find(name => name !== school) ?? names[1] ?? ''
  return { school, city }
}

const sheetRouteEnds = computed(() => resolveLineEnds(sheetActiveGroup.value.directions))

const sheetLineCards = computed(() => lineNames.value.map((name) => {
  const list = props.directions.filter(item => item.line === name)
  const ends = resolveLineEnds(list)
  const home = list.find(item => sameStop(item.to, ends.school)) ?? list[0]
  const fare = home?.totalPrice
  const detail = [
    home?.distanceKm ? `${home.distanceKm} km` : '',
    fare === null || fare === undefined ? '' : `${fare} 元`,
    home?.endTime ? `末班 ${home.endTime}` : ''
  ].filter(Boolean).join(' · ')
  return { name, title: `${name} · ${ends.city || '—'}`, detail, active: name === sheetLine.value }
}))

const sheetDirectionSegments = computed(() => {
  const list = sheetActiveGroup.value.directions
  const ends = resolveLineEnds(list)
  return [...list]
    .sort((a, b) => Number(sameStop(a.to, ends.school)) - Number(sameStop(b.to, ends.school)))
    .map(direction => ({
      id: direction.id,
      label: sameStop(direction.to, ends.school) ? '回学校' : '去市区',
      direction,
      active: direction.id === sheetActiveDirection.value?.id
    }))
})

const sheetStartBadge = computed(() => sameStop(sheetActiveDirection.value?.from ?? '', sheetRouteEnds.value.school) ? '学校端' : '市区端')

const sheetDirectionWindow = computed(() => {
  const direction = sheetActiveDirection.value
  if (!direction) return ''
  const label = sameStop(direction.from, sheetRouteEnds.value.school) ? '学校端' : '市区端'
  return `${label} ${direction.startTime || '—'} 起 · ${direction.endTime || '—'} 末班`
})

const sheetActiveEndShort = computed(() => {
  const name = sheetActiveDirection.value?.to ?? ''
  return name.replace(/^仰恩大学/, '').replace(/^(福厦铁路|泉州)/, '') || name
})

const sheetVehicleCards = computed(() => {
  const direction = sheetActiveDirection.value
  if (!direction) return []
  const alongs = stopAlongs(direction.stops.map(stop => ({ lng: stop.lng, lat: stop.lat })))
  const total = alongs[alongs.length - 1] ?? 0
  if (total <= 0) return []
  const routeKm = direction.distanceKm ?? 0
  return vehiclesOf(direction)
    .map((vehicle) => {
      const index = direction.stops.findIndex(stop => sameStop(stop.name, vehicle.nextStation))
      const along = vehicleAlong(index >= 0 ? index : (vehicle.stationOrder || 1), vehicle.distanceToNext, alongs)
      const remainKm = Math.max(0, ((total - along) / total) * routeKm)
      return {
        plate: vehicle.plate,
        remainText: remainKm < 1 ? `${Math.round(remainKm * 1000)} m` : `${remainKm.toFixed(1)} km`,
        etaMinutes: Math.max(0, Math.round(etaSeconds(along, total) / 60))
      }
    })
    .sort((a, b) => a.etaMinutes - b.etaMinutes)
})

const sheetLeadVehicle = computed(() => sheetVehicleCards.value[0] ?? null)
const sheetOtherVehicles = computed(() => sheetVehicleCards.value.slice(1))

function rowIsStart(direction: { stops: Array<{ seq: number }> }, seq: number): boolean {
  return direction.stops[0]?.seq === seq
}

function rowIsEnd(direction: { stops: Array<{ seq: number }> }, seq: number): boolean {
  return direction.stops[direction.stops.length - 1]?.seq === seq
}

const sheetFreshness = computed(() => {
  // 实时快照优先，但计划数据的 fetchedAt 可能更新（live 尚未返回时），取两者较新的一份，
  // 否则头部会显示「更新 20435 分钟前」这种把面板当成坏数据的读数。
  const candidates: Array<{ value: string, ms: number }> = []
  for (const value of [props.live?.fetchedAt, props.fetchedAt]) {
    if (!value) continue
    const ms = new Date(value).getTime()
    if (Number.isFinite(ms)) candidates.push({ value, ms })
  }
  const at = candidates.sort((a, b) => b.ms - a.ms)[0]?.value
  if (!at) return ''
  const ms = sheetClock.value - new Date(at).getTime()
  if (!Number.isFinite(ms)) return ''
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `更新 ${seconds} 秒前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `更新 ${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `更新 ${hours} 小时前`
  // 计划数据的 fetchedAt 是构建期快照，隔天再看会变成「更新 20443 分钟前」这种像坏数据的读数。
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `更新于 ${month}-${day} ${clock}`
})

watch(() => props.live?.fetchedAt, () => {
  sheetClock.value = Date.now()
})

const sheetDirectionLabel = computed(() => {
  const direction = sheetActiveDirection.value
  if (!direction) return ''
  return `${direction.line} ${direction.to}`
})

const sheetTimetable = computed(() => {
  const direction = sheetActiveDirection.value
  if (!direction) return { am: [] as string[], pm: [] as string[] }
  const departures = departuresOf(direction)
  if (!departures) return { am: [] as string[], pm: [] as string[] }
  return groupDeparturesByHalfDay(departures.groups.flatMap(group => group.times))
})

const sheetTimetableSections = computed(() => [
  { key: 'am', label: '上午', times: sheetTimetable.value.am },
  { key: 'pm', label: '下午', times: sheetTimetable.value.pm }
].filter(section => section.times.length > 0))

/** 首末班：接口的 startTime / endTime 可能缺失，缺失时退回当日时刻表的首条与末条。 */
const sheetFirstLast = computed(() => {
  const direction = sheetActiveDirection.value
  const times = [...sheetTimetable.value.am, ...sheetTimetable.value.pm]
  return {
    first: direction?.startTime || times[0] || '—',
    last: direction?.endTime || times[times.length - 1] || '—'
  }
})

const sheetClock = ref(Date.now())
let sheetClockTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (sheetClockTimer) return
  sheetClockTimer = setInterval(() => {
    sheetClock.value = Date.now()
  }, 30_000)
})

onBeforeUnmount(() => {
  if (!sheetClockTimer) return
  clearInterval(sheetClockTimer)
  sheetClockTimer = null
})

/** 当前时刻 HH:mm（30s 刷一次）；时刻表只覆盖当天，用串比较就够。 */
const sheetNowHHmm = computed(() => {
  const now = new Date(sheetClock.value)
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
})

function isPastByClock(time: string): boolean {
  const normalized = normalizeDepartureTime(time)
  if (!normalized) return false
  return normalized < sheetNowHHmm.value
}
/** 下一班＝底栏与抽屉头同一源：先取当日时刻表第一条未过的，都没有才退回实时 next；实时 next 已过则留空，任何位置都不给过去时刻。 */
const sheetNextChipTime = computed(() => {
  const times = [...sheetTimetable.value.am, ...sheetTimetable.value.pm]
  const upcoming = times.find(time => !isPastByClock(time)) ?? ''
  if (upcoming) return upcoming
  const live = normalizeDepartureTime(sheetNextBus.value)
  return live && !isPastByClock(live) ? live : ''
})

function chipStateOf(time: string): 'past' | 'next' | 'future' {
  return resolveDepartureChipState(time, { next: sheetNextChipTime.value, past: isPastByClock(time) })
}

/** 下一班：线色实底 + 白字 + 2px 线色环，颜色只能走内联样式。 */
const nextChipStyle = computed(() => {
  const color = lineColor(sheetActiveGroup.value.name)
  return {
    backgroundColor: color,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 30%, transparent)`
  }
})

const chipElements = new Map<string, HTMLElement>()

function setChipRef(time: string, element: unknown): void {
  if (element instanceof HTMLElement) chipElements.set(time, element)
  else chipElements.delete(time)
}

/** 把下一班对到抽屉中线上；面板高度还在过渡时会被带偏，所以可重复调用。 */
function alignNextChip(): void {
  const drawer = document.querySelector<HTMLElement>('[aria-label="今日时刻表"]')
  const target = sheetNextChipTime.value
  if (!drawer || !target) return
  const chip = chipElements.get(target)
  if (!chip) return
  const chipRect = chip.getBoundingClientRect()
  const drawerRect = drawer.getBoundingClientRect()
  const height = drawerRect.height || drawer.clientHeight
  // 表头 sticky 在滚动容器内部，命中区要从表头下沿开始算，否则第一行会被压在表头底下。
  const header = drawer.firstElementChild
  const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0
  const visibleTop = headerHeight + 8
  const visibleBottom = height - 8
  const offset = chipRect.top - drawerRect.top
  if (offset >= visibleTop + 8 && offset + chipRect.height <= visibleBottom - 8) return
  const room = Math.max(0, visibleBottom - visibleTop - chipRect.height)
  drawer.scrollTop += offset - (visibleTop + room / 2)
}

/**
 * 抽屉一打开就把下一班滚到可视区中线：面板从 half 抬到 expanded 要 320ms，
 * 抽屉顶边一直在动，滚一次会被高度变化带偏，所以按过渡节奏补滚几次。
 */
function scrollNextChipIntoView(): void {
  alignNextChip()
  if (typeof window === 'undefined') return
  ;[120, 260, 420].forEach((delay) => {
    window.setTimeout(alignNextChip, delay)
  })
}

watch([() => props.drawerOpen, () => sheetNextChipTime.value, () => sheetTimetable.value], async () => {
  if (!props.drawerOpen) return
  await nextTick()
  scrollNextChipIntoView()
}, { flush: 'post' })
watch([() => props.variant, lineDirections], () => {
  if (props.variant !== 'sheet' || expandedId.value) return
  expandedId.value = lineDirections.value[0]?.id ?? ''
}, { immediate: true })

const snapshotText = computed(() => {
  if (!props.fetchedAt) return ''
  const date = new Date(props.fetchedAt)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
})
</script>

<template>
  <!-- T-029：手机面板内的校外公交视图。头部固定、内容滚动、底栏 48px，点开时刻表抽屉最长 268px。
       T-030：顶部两段选线路，滚动体只画所选线；时刻表按上午/下午四列重排。 -->
  <section
    v-if="variant === 'sheet'"
    class="flex h-full min-h-0 flex-col"
    aria-label="校外公交线路"
  >
    <header class="flex h-11 shrink-0 items-center gap-1 px-2">
      <button
        type="button"
        class="flex min-h-9 shrink-0 items-center rounded-md px-1.5 text-[13px] font-medium text-zinc-600 active:bg-zinc-100 dark:text-zinc-300 dark:active:bg-zinc-800"
        aria-label="返回我的地图"
        @click="emit('back')"
      >
        <UIcon
          name="i-lucide-chevron-left"
          class="size-4 shrink-0"
        />
        我的地图
      </button>
      <h2 class="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
        {{ sheetTitle }}
      </h2>
      <span
        v-if="sheetFreshness"
        class="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500"
      >
        {{ sheetFreshness }}
      </span>
    </header>

    <div class="mx-3 mb-2 grid shrink-0 grid-cols-2 gap-2">
      <button
        v-for="card in sheetLineCards"
        :key="card.name"
        type="button"
        class="h-[68px] rounded-[16px] border px-2.5 text-left"
        :class="card.active ? 'bg-[var(--surface)] dark:bg-zinc-900' : 'border-zinc-200 bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] dark:border-zinc-800 dark:bg-zinc-900/60'"
        :style="card.active ? { borderColor: lineColor(card.name), backgroundColor: lineColor(card.name) + '14' } : undefined"
        :aria-pressed="card.active"
        :aria-label="`选择 ${card.name}`"
        @click="selectSheetLine(card.name)"
      >
        <span class="flex items-center gap-1.5">
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: lineColor(card.name) }"
          />
          <span class="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{{ card.title }}</span>
        </span>
        <span class="mt-1 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ card.detail }}</span>
      </button>
    </div>

    <div
      v-show="!drawerOpen"
      class="mx-3 mb-2 flex shrink-0 items-center gap-2"
    >
      <div
        class="grid h-9 w-[148px] shrink-0 grid-cols-2 rounded-[10px] bg-zinc-100 p-0.5 dark:bg-zinc-800"
        aria-label="选择方向"
      >
        <button
          v-for="segment in sheetDirectionSegments"
          :key="segment.id"
          type="button"
          class="rounded-[8px] text-[11px] font-medium"
          :class="segment.active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500 dark:text-zinc-400'"
          :aria-pressed="segment.active"
          @click="toggleDirection(segment.direction)"
        >
          {{ segment.label }}
        </button>
      </div>
      <span class="ml-auto min-w-0 truncate text-right text-[11px] text-zinc-500 dark:text-zinc-400">{{ sheetDirectionWindow }}</span>
    </div>

    <div
      v-show="!drawerOpen"
      class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2"
      aria-label="线路与站点"
    >
      <div
        v-if="sheetLeadVehicle"
        class="mb-2 flex h-[56px] items-center gap-2 rounded-[14px] border px-2.5"
        :style="{ borderColor: lineColor(sheetActiveGroup.name) + '4d', backgroundColor: lineColor(sheetActiveGroup.name) + '0f' }"
      >
        <UIcon
          name="i-lucide-bus-front"
          class="size-6 shrink-0"
          :style="{ color: lineColor(sheetActiveGroup.name) }"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
            {{ sheetLeadVehicle.plate }}
          </p>
          <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            距{{ sheetActiveEndShort }} {{ sheetLeadVehicle.remainText }}
          </p>
          <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            预计 {{ sheetLeadVehicle.etaMinutes }} 分钟后到{{ sheetActiveEndShort }}
          </p>
        </div>
        <span
          class="shrink-0 leading-none tabular-nums"
          :style="{ color: lineColor(sheetActiveGroup.name) }"
        >
          <span class="text-[26px] font-extrabold">{{ sheetLeadVehicle.etaMinutes }}</span>
          <span class="text-[12px] font-semibold">′</span>
        </span>
      </div>

      <div
        v-if="sheetOtherVehicles.length"
        class="mb-2 flex flex-wrap gap-1"
      >
        <span
          v-for="vehicle in sheetOtherVehicles"
          :key="vehicle.plate"
          class="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {{ vehicle.plate }} · {{ vehicle.etaMinutes }}′
        </span>
      </div>

      <ol
        v-if="sheetActiveDirection"
        class="py-0.5"
        aria-label="站点"
      >
        <li
          v-for="row in sheetStopRows(sheetActiveDirection)"
          :key="row.key"
        >
          <button
            v-if="row.kind === 'stop'"
            type="button"
            class="flex min-h-8 w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs text-zinc-600 active:bg-green-50 dark:text-zinc-300 dark:active:bg-green-950/60"
            @click="emit('focus-stop', { lng: row.stop.lng, lat: row.stop.lat })"
          >
            <span class="w-4 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">{{ row.stop.seq }}</span>
            <span
              class="size-2 shrink-0 rounded-full border"
              :class="rowIsEnd(sheetActiveDirection, row.stop.seq) ? '' : 'border-zinc-300 bg-transparent dark:border-zinc-600'"
              :style="rowIsEnd(sheetActiveDirection, row.stop.seq) ? { backgroundColor: lineColor(sheetActiveDirection.line), borderColor: lineColor(sheetActiveDirection.line) } : undefined"
            />
            <span class="truncate">{{ row.stop.name }}</span>
            <span
              v-if="rowIsStart(sheetActiveDirection, row.stop.seq)"
              class="ml-auto shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500"
            >{{ sheetStartBadge }}</span>
            <span
              v-else-if="rowIsEnd(sheetActiveDirection, row.stop.seq)"
              class="ml-auto shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500"
            >末站</span>
          </button>
          <button
            v-else
            type="button"
            class="flex min-h-8 w-full items-center gap-1 rounded-md px-1 text-left text-[11px] text-zinc-400 active:bg-zinc-100 dark:text-zinc-500 dark:active:bg-zinc-800"
            :aria-label="`展开中间 ${row.count} 站`"
            @click="toggleSheetStops(sheetActiveDirection)"
          >
            <span class="w-4 shrink-0 text-right">⋯</span>
            <span>中间 {{ row.count }} 站（点开）</span>
          </button>
        </li>
      </ol>

      <p
        v-if="!directions.length"
        class="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500"
      >
        公交线路加载中…
      </p>
      <p
        v-else-if="!sheetActiveGroup.directions.length"
        class="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500"
      >
        这条线今天没有班次
      </p>
    </div>

    <div
      :inert="!drawerOpen"
      class="scrollbar-none min-h-0 overflow-y-auto overscroll-contain border-t border-zinc-100 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] px-3 pb-2 backdrop-blur-[3px] transition-[opacity] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950/90"
      :class="drawerOpen ? 'flex-1 opacity-100' : 'pointer-events-none max-h-0 flex-none border-t-0 !p-0 opacity-0'"
      aria-label="今日时刻表"
    >
      <div class="sticky top-0 z-10 -mx-3 flex items-baseline gap-1.5 border-b border-zinc-100/70 bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] px-3 pt-2 pb-1 backdrop-blur-[3px] dark:border-zinc-800/70 dark:bg-zinc-950/95">
        <span class="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">今日时刻</span>
        <span
          class="text-[12px] font-semibold"
          :style="{ color: lineColor(sheetActiveGroup.name) }"
        >{{ sheetDirectionLabel }}</span>
      </div>

      <div
        v-for="section in sheetTimetableSections"
        :key="section.key"
        class="mt-1.5"
      >
        <p class="text-[11px] text-zinc-400 dark:text-zinc-500">
          {{ section.label }}
        </p>
        <div class="mt-1 grid grid-cols-4 gap-1.5">
          <span
            v-for="time in section.times"
            :key="time"
            :ref="(element: unknown) => setChipRef(time, element)"
            class="flex h-8 items-center justify-center rounded-[10px] text-[12px] tabular-nums"
            :class="chipStateOf(time) === 'past'
              ? 'bg-zinc-100/70 text-zinc-400 line-through decoration-zinc-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:decoration-zinc-600'
              : chipStateOf(time) === 'next'
                ? 'font-semibold text-white'
                : 'bg-[var(--surface)] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'"
            :style="chipStateOf(time) === 'next' ? nextChipStyle : undefined"
            :aria-label="chipStateOf(time) === 'next' ? `下一班 ${time}` : undefined"
          >
            {{ time }}
          </span>
        </div>
      </div>

      <p
        v-if="!sheetTimetableSections.length"
        class="py-3 text-center text-[11px] text-zinc-400 dark:text-zinc-500"
      >
        时刻表加载中…
      </p>
      <p
        v-else
        class="pt-2 text-[10px] text-zinc-400 dark:text-zinc-500"
      >
        下一班 {{ sheetNextChipTime || '—' }} · 今日 {{ sheetTodayCount }} 班 · 灰色为已过
      </p>
    </div>

    <footer
      class="flex h-12 shrink-0 items-center gap-2 border-t border-zinc-100 px-3 dark:border-zinc-800"
    >
      <span class="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
        {{ drawerOpen ? `今日 ${sheetTodayCount} 班` : `下一班 ${sheetNextChipTime || '—'}` }}
      </span>
      <span class="text-[11px] text-zinc-500 dark:text-zinc-400">
        {{ drawerOpen ? `首班 ${sheetFirstLast.first} · 末班 ${sheetFirstLast.last}` : `· 今日 ${sheetTodayCount} 班` }}
      </span>
      <button
        type="button"
        class="ml-auto flex min-h-9 items-center rounded-md px-1.5 text-[11px] font-medium text-blue-600 active:bg-blue-50 dark:text-blue-400 dark:active:bg-blue-950/40"
        :aria-expanded="drawerOpen === true"
        :aria-label="drawerOpen ? '收起今日时刻表' : '打开今日时刻表'"
        @click="emit('update:drawerOpen', !drawerOpen)"
      >
        {{ drawerOpen ? '收起 ⌄' : '时刻表 ›' }}
      </button>
    </footer>
  </section>

  <!-- 收起态：地图左下角浮钮 -->
  <!-- 收起态浮钮只有桌面会挂载（挂载点 app/pages/map/index.vue 带 v-if="transitLinesOpen && panelIsDesktop"），
       所以只写 md: 定位，不再给手机补 bottom 值。 -->
  <UButton
    v-else-if="!open"
    icon="i-lucide-bus"
    label="公交线路"
    color="neutral"
    variant="solid"
    class="absolute z-30 shadow-lg md:bottom-6 md:left-[var(--transit-left,1rem)]"
    :style="{ '--transit-left': leftOffset ?? '1rem' }"
    @click="emit('update:open', true)"
  />

  <section
    v-else
    class="absolute inset-x-3 bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-[var(--surface)] shadow-xl dark:border-zinc-700 dark:bg-zinc-900 md:inset-x-auto md:bottom-6 md:left-[var(--transit-left,1rem)] md:top-auto md:z-50 md:max-h-[62vh] md:w-80 max-md:landscape:inset-x-auto max-md:landscape:left-2 max-md:landscape:w-60"
    :style="{ '--transit-left': leftOffset ?? '1rem' }"
    aria-label="校外公交线路"
  >
    <header class="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
      <UIcon
        name="i-lucide-bus"
        class="size-4 text-blue-600 dark:text-blue-400"
      />
      <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        校外公交
      </h2>
      <span
        v-if="snapshotText"
        class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500"
      >快照 {{ snapshotText }}</span>
      <UButton
        icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="收起公交面板"
        @click="emit('update:open', false)"
      />
    </header>

    <!-- 线路切换 -->
    <div class="flex shrink-0 gap-1 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
      <button
        v-for="name in [ALL, ...lineNames]"
        :key="name"
        type="button"
        class="min-h-9 flex-1 rounded-md px-2 py-1 text-xs font-semibold transition"
        :class="name === selectedLine
          ? 'text-white shadow-sm'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'"
        :style="name === selectedLine ? { backgroundColor: name === ALL ? '#3f3f46' : lineColor(name) } : undefined"
        @click="selectLine(name)"
      >
        {{ name === ALL ? '全部' : name }}
      </button>
    </div>

    <div
      v-if="selectedDirectionLabel"
      class="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-1 dark:border-zinc-800"
    >
      <span class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
        只看 {{ selectedDirectionLabel }}
      </span>
      <button
        type="button"
        class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
        @click="clearDirection"
      >
        显示双向
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <article
        v-for="direction in lineDirections"
        :key="direction.id"
        class="border-b border-zinc-100 transition-colors last:border-b-0 dark:border-zinc-800"
        :class="selectedDirection === direction.id ? 'bg-green-50/70 dark:bg-green-950/30' : ''"
      >
        <button
          type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          :aria-expanded="expandedId === direction.id"
          @click="toggleDirection(direction)"
        >
          <span
            class="mt-1 size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: lineColor(direction.line) }"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              {{ direction.from }} → {{ direction.to }}
            </span>
            <span
              v-if="selectedDirection === direction.id"
              class="mt-0.5 inline-flex items-center gap-1 rounded-full bg-green-600 px-1.5 py-px text-[10px] font-medium text-white"
            >
              <UIcon
                name="i-lucide-eye"
                class="size-2.5"
              />
              地图只看这条
            </span>
            <span class="mt-0.5 block text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
              首 {{ direction.startTime }} · 末 {{ direction.endTime }} · {{ direction.distanceKm }} km · {{ direction.stops.length }} 站<br>
              {{ priceText(direction) }}
            </span>
            <span
              v-if="nextDeparture(direction)"
              class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4"
            >
              <span class="font-semibold text-zinc-700 dark:text-zinc-200">
                下一班 {{ nextDeparture(direction) }}
              </span>
              <span
                v-if="laterDepartures(direction).length"
                class="text-zinc-400"
              >
                之后 {{ laterDepartures(direction).join(' · ') }}
              </span>
              <span
                v-if="onlineCount(direction)"
                class="rounded-full bg-emerald-50 px-1.5 py-px font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                在线 {{ onlineCount(direction) }} 辆
              </span>
            </span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="mt-0.5 size-3.5 shrink-0 text-zinc-400 transition-transform"
            :class="expandedId === direction.id ? 'rotate-90' : ''"
          />
        </button>

        <!-- 简略图：整段线路按里程铺开，车上在段内、我在站旁，都挂在同一条轴上 -->
        <div
          v-if="schematicOf(direction)"
          class="border-t border-dashed border-zinc-100 px-3 pb-2 pt-2.5 dark:border-zinc-800"
        >
          <div class="relative h-7">
            <div class="absolute inset-x-0 top-[13px] h-[3px] rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <span
              v-for="tick in schematicOf(direction)!.ticks"
              :key="tick.name"
              class="absolute top-[9px] h-2.5 w-px bg-zinc-400/70 dark:bg-zinc-500/70"
              :style="{ left: tick.x + '%' }"
              :title="tick.name"
            />
            <span
              v-for="bus in schematicOf(direction)!.buses"
              :key="bus.plate"
              class="absolute size-2 -translate-x-1/2 rounded-sm ring-1 ring-white/80"
              :style="{ left: bus.x + '%', top: `${1 + bus.lane * 5}px`, backgroundColor: lineColor(direction.line) }"
              :title="`${bus.plate} → ${bus.near}`"
            />
            <span
              v-if="schematicOf(direction)!.me !== null"
              class="absolute top-[7px] -translate-x-1/2"
              :style="{ left: schematicOf(direction)!.me + '%' }"
              title="我的位置"
            >
              <span class="block size-2.5 rounded-full border border-white bg-sky-500 ring-2 ring-sky-200 dark:ring-sky-900" />
            </span>
          </div>
          <p class="mt-1 flex items-center gap-1 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            <UIcon
              name="i-lucide-navigation"
              class="size-3 shrink-0 text-sky-500"
            />
            <span class="truncate">{{ meStopText(direction) }}</span>
          </p>
        </div>

        <!-- 在途车辆：车牌 + 到哪一站 + 还有多远，点一下地图跟过去 -->
        <ol
          v-if="vehiclesOf(direction).length"
          class="overscroll-y-contain border-t border-dashed border-zinc-100 pb-1 md:max-h-40 md:overflow-y-auto dark:border-zinc-800"
        >
          <li
            v-for="vehicle in vehiclesOf(direction)"
            :key="vehicle.plate"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
              @click="emit('focus-vehicle', { plate: vehicle.plate, point: vehicle.point, nextStation: vehicle.nextStation, distanceToNext: vehicle.distanceToNext })"
            >
              <span
                class="grid size-4 shrink-0 place-items-center rounded-sm text-[9px] font-bold text-white"
                :style="{ backgroundColor: lineColor(direction.line) }"
              >
                巴
              </span>
              <span class="min-w-0 flex-1 truncate text-[11px] text-zinc-700 dark:text-zinc-200">
                {{ shortPlate(vehicle.plate) }}
                <span class="text-zinc-400">→</span>
                {{ vehicle.nextStation || '在途' }}
              </span>
              <span
                class="shrink-0 text-[10px] tabular-nums"
                :class="(vehicle.distanceToNext ?? 9999) < 500 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
              >
                {{ distanceText(vehicle.distanceToNext) }}
              </span>
            </button>
          </li>
        </ol>

        <div
          v-if="expandedId === direction.id"
          class="pb-2"
        >
          <p class="px-3 pb-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
            点站名在地图上定位；下一班与在途车辆来自掌上公交，20 秒刷新。
          </p>
          <ol class="overscroll-y-contain md:max-h-72 md:overflow-y-auto">
            <li
              v-for="stop in direction.stops"
              :key="stop.seq"
            >
              <button
                type="button"
                class="flex min-h-8 w-full items-center gap-2 px-3 py-1 text-left text-xs text-zinc-600 transition-colors hover:bg-green-50 dark:text-zinc-300 dark:hover:bg-green-950/60"
                @click="emit('focus-stop', { lng: stop.lng, lat: stop.lat })"
              >
                <span class="w-4 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">{{ stop.seq }}</span>
                <span class="size-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span class="truncate">{{ stop.name }}</span>
              </button>
            </li>
          </ol>
        </div>
      </article>

      <p
        v-if="!directions.length"
        class="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500"
      >
        公交线路加载中…
      </p>
    </div>
  </section>
</template>
