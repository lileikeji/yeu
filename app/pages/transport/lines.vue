<script setup lang="ts">
import type {
  ApiBusDeparturesResponse,
  ApiBusLineDirection,
  ApiBusLinesResponse,
  ApiBusLiveDirection,
  ApiBusLiveResponse
} from '~~/shared/types/server'
import type { AMapMap, AMapMarker, AMapPolyline } from '~~/map/providers/amap/types'
import { loadAMap } from '~~/map/providers/amap/loader'

useSeoMeta({
  title: 'K2 / K6 公交线路图',
  description: '泉州公交 K2、K6 往返仰恩大学第三校区的实际道路走向、全部站点与首末班时间。'
})

const LINE_COLORS: Record<string, string> = {
  K2: '#1a6cf5',
  K6: '#e8590c'
}

// 线路数据要带票据 + 解密，只能在浏览器里取（服务端渲染时没有访客票据）。
const data = ref<ApiBusLinesResponse | null>(null)
const status = ref<'pending' | 'success' | 'error'>('pending')

async function loadLines(): Promise<void> {
  try {
    data.value = await fetchTransit<ApiBusLinesResponse>('/api/public/transit/lines')
    status.value = 'success'
  } catch {
    status.value = 'error'
  }
}

const lineNames = computed<string[]>(() => {
  const names = new Set((data.value?.lines ?? []).map(item => item.line))
  return [...names]
})

const activeLine = ref('K2')
const showBothDirections = ref(false)
/** 当前展示的方向索引（0 = 去程，1 = 回程；双向时只看第一条做高亮基准）。 */
const activeDirection = ref(0)
const selectedStopSeq = ref<number | null>(null)

/** 掌上公交的实时车辆与发车时刻（来自 /api/public/transit/live、/departures）。 */
const liveData = ref<ApiBusLiveResponse | null>(null)
const departures = ref<ApiBusDeparturesResponse | null>(null)
const liveError = ref('')
const liveUpdatedAt = ref('')
const liveLoading = ref(false)
const showVehicles = ref(true)

/** 把两条来源的站名抹平成可比较的形式（高德快照里 K6 用的是简称）。 */
function normStation(name: string): string {
  return name
    .replace('福厦铁路泉州站', '泉州站')
    .replace('仰恩大学第三校区', '仰恩')
    .replace(/（[^）]*）/g, '')
    .trim()
}

function matchLive(direction: ApiBusLineDirection | null): ApiBusLiveDirection | null {
  if (!direction || !liveData.value) return null
  const from = normStation(direction.from)
  const to = normStation(direction.to)
  return liveData.value.directions.find(item =>
    item.line === direction.line
    && normStation(item.from) === from
    && normStation(item.to) === to
  ) ?? null
}

function matchDeparture(direction: ApiBusLineDirection | null) {
  if (!direction || !departures.value) return null
  const from = normStation(direction.from)
  const to = normStation(direction.to)
  return departures.value.directions.find(item =>
    item.line === direction.line
    && normStation(item.from) === from
    && normStation(item.to) === to
  ) ?? null
}

const primaryLive = computed(() => matchLive(primaryDirection.value))
const primaryDeparture = computed(() => matchDeparture(primaryDirection.value))
const onlineVehicleCount = computed(() =>
  (liveData.value?.directions ?? [])
    .filter(item => item.line === activeLine.value)
    .reduce((sum, item) => sum + item.vehicles.length, 0)
)

const directionsForActiveLine = computed<ApiBusLineDirection[]>(() =>
  (data.value?.lines ?? []).filter(item => item.line === activeLine.value)
)

const visibleDirections = computed<ApiBusLineDirection[]>(() => {
  const list = directionsForActiveLine.value
  if (showBothDirections.value) return list
  const picked = list[activeDirection.value]
  return picked ? [picked] : list.slice(0, 1)
})

const primaryDirection = computed<ApiBusLineDirection | null>(() => visibleDirections.value[0] ?? null)

const mapEl = ref<HTMLElement | null>(null)
const mapReady = ref(false)
const mapError = ref('')

let amap: Awaited<ReturnType<typeof loadAMap>> | null = null
let map: AMapMap | null = null
let overlays: Array<AMapPolyline | AMapMarker> = []

interface StopHit {
  line: string
  seq: number
  name: string
  lng: number
  lat: number
  direction: string
}

function labelContent(text: string, tone: 'start' | 'end'): HTMLElement {
  const el = document.createElement('div')
  el.textContent = text
  el.style.cssText = [
    'padding:2px 6px',
    'border-radius:6px',
    'font-size:11px',
    'line-height:16px',
    'font-weight:600',
    'color:#fff',
    'white-space:nowrap',
    'background:' + (tone === 'end' ? 'rgba(17,24,39,.88)' : 'rgba(5,102,84,.9)'),
    'box-shadow:0 2px 6px rgba(0,0,0,.25)'
  ].join(';')
  return el
}

function dotContent(color: string, active: boolean): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'width:' + (active ? '12px' : '8px'),
    'height:' + (active ? '12px' : '8px'),
    'border-radius:50%',
    'background:' + (active ? color : 'var(--surface)'),
    'border:2px solid ' + color,
    'box-sizing:border-box'
  ].join(';')
  return el
}

function busContent(color: string, plate: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'display:flex', 'align-items:center', 'gap:3px',
    'padding:2px 6px', 'border-radius:999px',
    'font-size:11px', 'line-height:16px', 'font-weight:700',
    'color:#fff', 'white-space:nowrap',
    'background:' + color,
    'box-shadow:0 2px 8px rgba(0,0,0,.35)',
    'border:2px solid rgba(255,255,255,.9)'
  ].join(';')
  el.textContent = '🚌 ' + plate.replace('闽C', '')
  return el
}

let busOverlays: AMapMarker[] = []

function clearBusOverlays() {
  if (map && busOverlays.length) map.remove(busOverlays)
  busOverlays = []
}

/** 只画当前可见方向的车；每 20 秒重画一次。 */
function drawVehicles() {
  if (!amap || !map || !mapReady.value) return
  clearBusOverlays()
  if (!showVehicles.value) return

  visibleDirections.value.forEach((direction) => {
    const live = matchLive(direction)
    if (!live) return
    const color = LINE_COLORS[direction.line] ?? '#1a6cf5'
    live.vehicles.forEach((vehicle) => {
      const marker = new amap!.Marker({
        position: vehicle.point,
        offset: new amap!.Pixel(-24, -12),
        content: busContent(color, vehicle.plate || '在途'),
        zIndex: 200,
        title: `${vehicle.plate} · 下一站 ${vehicle.nextStation}`,
        extData: { vehicle }
      })
      marker.on('click', () => {
        map!.setZoomAndCenter(15, vehicle.point)
      })
      map!.add(marker)
      busOverlays.push(marker)
    })
  })
}

function clearOverlays() {
  if (map && overlays.length) map.remove(overlays)
  overlays = []
}

function drawDirections() {
  if (!amap || !map) return
  clearOverlays()
  const list = visibleDirections.value
  list.forEach((direction, directionIndex) => {
    const color = LINE_COLORS[direction.line] ?? '#1a6cf5'
    const dimmed = directionIndex > 0
    const polyline = new amap!.Polyline({
      path: direction.polyline,
      strokeColor: color,
      strokeWeight: dimmed ? 4 : 6,
      strokeOpacity: dimmed ? 0.45 : 0.92,
      lineJoin: 'round',
      lineCap: 'round',
      showDir: !dimmed,
      zIndex: dimmed ? 40 : 50
    })
    map!.add(polyline)
    overlays.push(polyline)

    direction.stops.forEach((stop, index) => {
      const isFirst = index === 0
      const isLast = index === direction.stops.length - 1
      const isSelected = selectedStopSeq.value === stop.seq
      const marker = new amap!.Marker({
        position: [stop.lng, stop.lat],
        offset: new amap!.Pixel(-6, -6),
        content: dotContent(color, isSelected || isFirst || isLast),
        zIndex: isFirst || isLast ? 120 : 110,
        title: `${direction.line} · ${stop.name}`,
        extData: { stop }
      })
      marker.on('click', () => {
        selectedStopSeq.value = stop.seq
        if (!showBothDirections.value) activeDirection.value = directionIndex
      })
      map!.add(marker)
      overlays.push(marker)
      if (isFirst || isLast) {
        const label = new amap!.Marker({
          position: [stop.lng, stop.lat],
          offset: new amap!.Pixel(9, -26),
          content: labelContent(stop.name, isLast ? 'end' : 'start'),
          zIndex: 130,
          bubble: true
        })
        map!.add(label)
        overlays.push(label)
      }
    })
  })

  map.setFitView(overlays as never[], false, [40, 40, 40, 40], 15)
  drawVehicles()
}

function focusVehicle(point: [number, number]) {
  map?.setZoomAndCenter(15, point)
}

function focusStop(hit: StopHit) {
  selectedStopSeq.value = hit.seq
  map?.setZoomAndCenter(14, [hit.lng, hit.lat])
}

async function ensureMap() {
  if (map || !import.meta.client) return
  const config = useRuntimeConfig().public as { amapKey?: string, amapSecurityCode?: string }
  const key = String(config.amapKey || '').trim()
  const securityCode = String(config.amapSecurityCode || '').trim()
  if (!key) {
    mapError.value = '地图密钥未配置，站点列表仍可查看。'
    return
  }
  if (!mapEl.value) return
  try {
    amap = await loadAMap({ key, securityCode })
    map = new amap.Map(mapEl.value, {
      zoom: 11,
      center: [118.61, 25.0],
      viewMode: '2D',
      resizeEnable: true,
      showLabel: true
    })
    mapReady.value = true
    drawDirections()
  } catch {
    mapError.value = '地图加载失败，可以先看右侧站点列表。'
  }
}

watch([activeLine, activeDirection, showBothDirections], () => {
  if (mapReady.value) drawDirections()
})

watch(activeLine, () => {
  activeDirection.value = 0
  selectedStopSeq.value = null
})

const LIVE_INTERVAL_MS = 20_000
let liveTimer: ReturnType<typeof setInterval> | null = null

async function refreshLive(): Promise<void> {
  if (!import.meta.client || liveLoading.value) return
  liveLoading.value = true
  try {
    liveData.value = await fetchTransit<ApiBusLiveResponse>('/api/public/transit/live')
    liveUpdatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    liveError.value = ''
    drawVehicles()
  } catch (error) {
    liveError.value = (error as Error)?.message || '实时车辆暂时取不到'
  } finally {
    liveLoading.value = false
  }
}

async function loadDepartures(): Promise<void> {
  try {
    departures.value = await fetchTransit<ApiBusDeparturesResponse>('/api/public/transit/departures')
  } catch {
    // 时刻表拿不到就不展示，不影响线路图
  }
}

watch(showVehicles, () => drawVehicles())

onMounted(() => {
  void loadLines()
  if (status.value !== 'pending') void ensureMap()
  void refreshLive()
  void loadDepartures()
  liveTimer = setInterval(() => {
    void refreshLive()
  }, LIVE_INTERVAL_MS)
})

watch(status, (value) => {
  if (value !== 'pending') void ensureMap()
})

onBeforeUnmount(() => {
  if (liveTimer) clearInterval(liveTimer)
  liveTimer = null
  clearBusOverlays()
  clearOverlays()
  map?.destroy()
  map = null
})

function shortStop(name: string): string {
  return name
    .replace('福厦铁路泉州站', '泉州站')
    .replace('仰恩大学第三校区', '仰恩')
}

function formatDistance(meters: number | undefined): string {
  if (!meters || meters <= 0) return ''
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`
}

function formatPrice(value: number | null): string {
  return value === null ? '—' : `${value} 元`
}
</script>

<template>
  <div class="bg-zinc-50 text-zinc-950 dark:bg-zinc-800/60 dark:text-zinc-100">
    <div class="page-shell py-7 md:py-10">
      <header class="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <p class="text-xs font-semibold tracking-wide text-emerald-800 dark:text-emerald-300">
            校外公交
          </p>
          <h1 class="mt-1 text-2xl font-bold text-zinc-950 dark:text-zinc-50">
            K2 / K6 线路图
          </h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            折线是线路实际走的道路，不是站点直连。点站点看站序，点线路名切换 K2 / K6。
          </p>
        </div>
        <NuxtLink
          to="/transport"
          class="text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
        >
          返回到校交通
        </NuxtLink>
      </header>

      <div class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside class="order-2 space-y-3 lg:order-1">
          <div class="flex gap-2">
            <button
              v-for="name in lineNames"
              :key="name"
              type="button"
              class="min-h-11 flex-1 rounded-md border px-3 text-sm font-bold transition"
              :class="activeLine === name
                ? 'border-transparent text-white'
                : 'border-zinc-200 bg-[var(--surface)] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'"
              :style="activeLine === name ? { backgroundColor: LINE_COLORS[name] } : undefined"
              @click="activeLine = name"
            >
              {{ name }}
            </button>
          </div>

          <div
            v-if="directionsForActiveLine.length"
            class="bg-[var(--surface)] p-3 shadow-sm dark:bg-zinc-900"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex gap-1">
                <button
                  v-for="(direction, index) in directionsForActiveLine"
                  :key="direction.id"
                  type="button"
                  class="rounded-md px-2.5 py-1.5 text-xs font-semibold transition"
                  :class="!showBothDirections && activeDirection === index
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                  @click="showBothDirections = false; activeDirection = index"
                >
                  {{ shortStop(direction.from) }} → {{ shortStop(direction.to) }}
                </button>
              </div>
              <label class="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <input
                  v-model="showBothDirections"
                  type="checkbox"
                  class="size-3.5 accent-emerald-700"
                >
                双向
              </label>
            </div>

            <div class="mt-3 space-y-1 border-t border-zinc-100 pt-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              <p class="font-semibold text-zinc-900 dark:text-zinc-100">
                {{ primaryDirection?.from }} → {{ primaryDirection?.to }}
              </p>
              <p>
                首班 {{ primaryDirection?.startTime }} · 末班 {{ primaryDirection?.endTime }} ·
                {{ primaryDirection?.distanceKm }} km · {{ primaryDirection?.stops.length }} 站
              </p>
              <p>
                全程 {{ formatPrice(primaryDirection?.totalPrice ?? null) }}（起步 {{ formatPrice(primaryDirection?.basicPrice ?? null) }}）
              </p>
            </div>

            <div class="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <div class="flex items-baseline justify-between gap-2">
                <p class="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  下一班
                  <span
                    class="ml-1 text-sm tabular-nums"
                    :style="{ color: LINE_COLORS[activeLine] }"
                  >
                    {{ primaryDeparture?.next[0] ?? '—' }}
                  </span>
                </p>
                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <input
                    v-model="showVehicles"
                    type="checkbox"
                    class="size-3.5 accent-emerald-700"
                  >
                  显示车辆
                </label>
              </div>
              <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                <template v-if="primaryDeparture?.next.length">
                  之后 {{ primaryDeparture.next.slice(1).join(' · ') }}
                </template>
                <template v-else>
                  时刻表暂时取不到
                </template>
              </p>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                在线 {{ onlineVehicleCount }} 辆 · 本方向 {{ primaryLive?.vehicles.length ?? 0 }} 辆
                <span v-if="liveUpdatedAt"> · {{ liveUpdatedAt }} 更新</span>
                <span
                  v-if="liveError"
                  class="text-amber-700 dark:text-amber-300"
                > · {{ liveError }}</span>
              </p>
            </div>
          </div>

          <div
            v-if="showVehicles && primaryLive?.vehicles.length"
            class="bg-[var(--surface)] shadow-sm dark:bg-zinc-900"
          >
            <p class="border-b border-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              在途车辆 · 点车牌定位
            </p>
            <ul class="max-h-40 overflow-y-auto">
              <li
                v-for="vehicle in primaryLive.vehicles"
                :key="vehicle.plate + vehicle.stationOrder"
                class="border-b border-zinc-50 last:border-0 dark:border-zinc-800/60"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  @click="focusVehicle(vehicle.point)"
                >
                  <span class="shrink-0 font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{{ vehicle.plate }}</span>
                  <span class="truncate text-zinc-500 dark:text-zinc-400">
                    {{ vehicle.nextStation ? `下一站 ${vehicle.nextStation}` : '在途' }}
                  </span>
                  <span
                    v-if="vehicle.distanceToNext"
                    class="ml-auto shrink-0 tabular-nums text-zinc-400"
                  >
                    {{ formatDistance(vehicle.distanceToNext) }}
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <div class="bg-[var(--surface)] shadow-sm dark:bg-zinc-900">
            <p class="border-b border-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {{ shortStop(primaryDirection?.from ?? '') }} → {{ shortStop(primaryDirection?.to ?? '') }} · 站点顺序
            </p>
            <ol class="max-h-[42vh] overflow-y-auto lg:max-h-[52vh]">
              <li
                v-for="stop in primaryDirection?.stops ?? []"
                :key="`${primaryDirection?.id}-${stop.seq}`"
                class="border-b border-zinc-50 last:border-0 dark:border-zinc-800/60"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  :class="selectedStopSeq === stop.seq ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''"
                  @click="focusStop({ line: activeLine, seq: stop.seq, name: stop.name, lng: stop.lng, lat: stop.lat, direction: primaryDirection?.direction ?? '' })"
                >
                  <span class="w-6 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">
                    {{ stop.seq }}
                  </span>
                  <span
                    class="size-2 shrink-0 rounded-full border"
                    :style="{ borderColor: LINE_COLORS[activeLine], backgroundColor: stop.seq === 1 ? LINE_COLORS[activeLine] : 'var(--surface)' }"
                  />
                  <span class="truncate text-zinc-800 dark:text-zinc-100">{{ stop.name }}</span>
                </button>
              </li>
            </ol>
          </div>
        </aside>

        <div class="order-1 lg:order-2">
          <div class="relative overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
            <div
              ref="mapEl"
              class="h-[46vh] min-h-[320px] w-full lg:h-[66vh]"
            />
            <p
              v-if="mapError"
              class="absolute inset-x-0 bottom-0 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/90 dark:text-amber-100"
            >
              {{ mapError }}
            </p>
            <p
              v-else-if="!mapReady"
              class="absolute inset-0 flex items-center justify-center text-sm text-zinc-500"
            >
              地图加载中…
            </p>
          </div>
          <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            线路几何与站点来自掌上公交（快照 {{ data?.fetchedAt }}），与在途车辆同一套坐标；票价沿用高德公交线网。车辆每 20 秒刷新，时刻表由掌上公交按历史数据推算，仅供参考。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
