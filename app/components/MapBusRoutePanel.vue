<script setup lang="ts">
import type { BusRouteSnapshot, BusSnapshot } from '~~/app/composables/useMapBusPositions'
import type { MobileSheetState } from '~~/app/utils/map-presentation'
import { haversineMeters } from '~~/app/utils/walk-route'
import { CAMPUS_SPEED_BUMPS } from '~~/shared/utils/campus-speed-bumps'
import { computeBusProgress, computeStopToStop, travelSecondsAlongPolyline } from '~~/shared/utils/bus-route-progress'
import { buildSegmentProfile } from '~~/shared/utils/bus-segment-speeds'

const props = defineProps<{
  routes: BusRouteSnapshot[]
  buses: BusSnapshot[]
  fetchedAt: string | null
  open: boolean
  /** 桌面端距地图左缘的距离；左侧地点栏展开时要让开 18rem。 */
  leftOffset?: string
  /** 用户实时位置（WGS84）；提供后每辆车显示「距您 X 米」。 */
  userLocation?: { lng: number, lat: number } | null
  variant?: 'floating' | 'sheet'
  state?: MobileSheetState
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'select-route': [routeId: string]
  'sheet-raise': []
  'sheet-expand': []
  'sheet-collapse': []
  'sheet-back': []
  'open-sheet': []
  'sheet-drag-start': [event: PointerEvent]
}>()

const STOP_ROW_HEIGHT = 32
/** 站点圆点中心相对行顶的偏移（圆点 top 9px + 半径 7.5px）。 */
const STOP_DOT_CENTER = 16.5
/** 校园减速带总数（校园口径，与具体线路无关）。 */
const campusSpeedBumpCount = CAMPUS_SPEED_BUMPS.length
/** 校车冬令时运营时段，用于空车时的收车态文案。 */
const SERVICE_OPEN_MINUTES = 7 * 60 + 20
const SERVICE_CLOSE_MINUTES = 21 * 60 + 20
const SERVICE_HOURS_LABEL = '运营时段 07:20–21:20（冬令时） · 末班车 21:10'

/** 上海时区分钟数（不依赖浏览器本地时区）。 */
function shanghaiMinutes(epochMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(epochMs))
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

const clockNow = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  clockTimer = setInterval(() => {
    clockNow.value = Date.now()
  }, 60_000)
})
onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})

const inServiceHours = computed(() => {
  const minutes = shanghaiMinutes(clockNow.value)
  return minutes >= SERVICE_OPEN_MINUTES && minutes < SERVICE_CLOSE_MINUTES
})
const emptyBusesText = computed(() => (inServiceHours.value ? '暂无在线车辆' : '已收车'))

const selectedRouteId = ref('')
/** 用户点过方向按钮后不再自动改选，避免和手选打架。 */
const routePickedByUser = ref(false)
/** 挂载前不要向父组件 emit（会在渲染阶段改父状态），挂载后补一次。 */
const panelMounted = ref(false)
onMounted(() => {
  panelMounted.value = true
  if (selectedRouteId.value) emit('select-route', selectedRouteId.value)
})

/** 该方向当前有几辆车（地图与面板要显示同一方向，默认方向优先选有车的）。 */
function routeBusCount(routeId: string): number {
  return props.buses.reduce((count, bus) => (bus.routeId === routeId ? count + 1 : count), 0)
}

/** 线路集合与「哪些方向有车」的变化签名：每 150ms 的车位刷新不触发重选。 */
const routeSignature = computed(() => props.routes.map(route => route.routeId).join('|'))
const busRouteSignature = computed(() => [...new Set(props.buses.map(bus => bus.routeId))].sort().join('|'))

watch([routeSignature, busRouteSignature], () => {
  const routes = props.routes
  if (!routes.length) return
  const current = routes.find(route => route.routeId === selectedRouteId.value)
  const withBus = routes.find(route => routeBusCount(route.routeId) > 0)
  // 首次挂载 / 线路数据换了一批：选有车的方向，都没有车就用第一条。
  if (!current) {
    selectRoute((withBus ?? routes[0]!).routeId)
    return
  }
  // 当前方向没车、另一方向有车：自动切过去，地图和简略图跟着一起换。
  if (!routePickedByUser.value && withBus && withBus.routeId !== current.routeId && routeBusCount(current.routeId) === 0) {
    selectRoute(withBus.routeId)
  }
}, { immediate: true })

const selectedRoute = computed(() =>
  props.routes.find(route => route.routeId === selectedRouteId.value) ?? null
)

const routeBuses = computed(() =>
  selectedRoute.value
    ? props.buses.filter(bus => bus.routeId === selectedRoute.value!.routeId)
    : []
)

interface BusMarker {
  busId: string
  busName: string
  top: number
  /** 横向缩略图进度比例 0..1（段号+段内进度 归一化）。 */
  anchorRatio: number
  statusText: string
  isAtSite: boolean
  /** 到站态文案：终点「候客中」，其余「已到站」。 */
  atSiteLabel: string
  /** 到站态详情：终点「约 2 分钟后返程」，其余站名。 */
  atSiteDetail: string
  nextStopName: string
  distanceText: string
  /** 到下一站预计时间文案（含「约」；到站时为空）。 */
  etaText: string
  /** 车到用户直线距离（无定位时为空）。 */
  userDistanceText: string
  stopsRemaining: number
}

function formatMeters(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`
}

/** ETA 文案：秒 → 「X 分钟」（<1 分钟按 1 分钟计）。 */
function formatEtaText(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`
}

/** 站点列表容器实测高度 → 每站实际行高：容器够高均分拉伸，不够按最小行高滚动。 */
const rowsWrapRef = ref<HTMLElement | null>(null)
const listHeight = ref(0)
const rowHeight = computed(() => {
  const count = selectedRoute.value?.stops.length ?? 0
  if (!count) return STOP_ROW_HEIGHT
  return Math.max(STOP_ROW_HEIGHT, listHeight.value / count)
})

let rowsResizeObserver: ResizeObserver | null = null
watch(rowsWrapRef, (el) => {
  rowsResizeObserver?.disconnect()
  rowsResizeObserver = null
  listHeight.value = el?.clientHeight ?? 0
  if (!el) return
  rowsResizeObserver = new ResizeObserver(() => {
    listHeight.value = el.clientHeight
  })
  rowsResizeObserver.observe(el)
}, { immediate: true, flush: 'post' })
onUnmounted(() => {
  rowsResizeObserver?.disconnect()
  rowsResizeObserver = null
})

/** 分段实测车速表 → 沿线车速切片；表里没有该线路时返回 undefined，ETA 退回老算法。 */
const segmentProfile = computed(() => {
  const route = selectedRoute.value
  if (!route) return undefined
  const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
  const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
  return buildSegmentProfile(route.routeId, stops, polyline)
})

const busMarkers = computed<BusMarker[]>(() => {
  const route = selectedRoute.value
  if (!route) return []
  const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
  const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
  return routeBuses.value.map((bus) => {
    const progress = computeBusProgress({ lng: bus.lng, lat: bus.lat }, stops, polyline, { isAtSite: bus.isAtSite, profile: segmentProfile.value })
    const atStopIndex = progress?.atStopIndex ?? null
    const isTerminal = atStopIndex !== null && atStopIndex === route.stops.length - 1
    const nextStopName = progress ? (route.stops[progress.nextStopIndex]?.siteName ?? '') : bus.siteName
    const distanceText = progress && atStopIndex === null ? formatMeters(progress.distanceToNextStopMeters) : ''
    const segmentAnchor = progress
      ? (atStopIndex !== null ? atStopIndex : progress.segmentIndex + Math.min(0.92, Math.max(0.08, progress.progress)))
      : 0
    return {
      busId: bus.busId,
      busName: bus.busName,
      top: segmentAnchor * rowHeight.value + STOP_DOT_CENTER,
      anchorRatio: route.stops.length > 1
        ? Math.min(1, Math.max(0, segmentAnchor / (route.stops.length - 1)))
        : 0,
      isAtSite: atStopIndex !== null,
      atSiteLabel: isTerminal ? '候客中' : '已到站',
      atSiteDetail: isTerminal ? '约 2 分钟后返程' : (route.stops[atStopIndex ?? 0]?.siteName ?? bus.siteName),
      nextStopName,
      distanceText,
      etaText: progress && atStopIndex === null && progress.etaSeconds > 0
        ? `约 ${formatEtaText(progress.etaSeconds)}`
        : '',
      userDistanceText: props.userLocation
        ? formatMeters(haversineMeters({ lng: bus.lng, lat: bus.lat }, props.userLocation))
        : '',
      stopsRemaining: progress?.stopsRemaining ?? 0,
      statusText: atStopIndex !== null
        ? `已到站 · ${route.stops[atStopIndex]?.siteName ?? bus.siteName}`
        : (progress ? `距 ${nextStopName} 约 ${distanceText}` : bus.siteName)
    }
  })
})

/** 到站板：各站最快预计到达（沿线里程投影，各车取最小；已过站不计）。 */
const stopArrivals = computed<string[]>(() => {
  const route = selectedRoute.value
  if (!route) return []
  const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
  const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
  const best = route.stops.map(() => Number.POSITIVE_INFINITY)
  for (const bus of routeBuses.value) {
    const progress = computeBusProgress({ lng: bus.lng, lat: bus.lat }, stops, polyline, { isAtSite: bus.isAtSite, profile: segmentProfile.value })
    if (!progress) continue
    for (let index = 0; index < route.stops.length; index++) {
      const stopAlong = progress.stopDistancesAlong[index]
      if (stopAlong == null || stopAlong <= progress.distanceAlong) continue
      const eta = travelSecondsAlongPolyline(polyline, progress.distanceAlong, stopAlong, segmentProfile.value)
      if (eta < best[index]!) best[index] = eta
    }
  }
  return best.map(value => (Number.isFinite(value) ? `约 ${formatEtaText(value)}` : ''))
})

/** 两站查询（A→B）：起终点下标，默认首站→末站，切换线路时重置。 */
function selectRoute(routeId: string): void {
  selectedRouteId.value = routeId
  if (panelMounted.value) emit('select-route', routeId)
}

/** 用户手点方向：从此不再自动改选。 */
function pickRoute(routeId: string): void {
  routePickedByUser.value = true
  selectRoute(routeId)
}

const tripFromIndex = ref(0)
const tripToIndex = ref(0)
watch(selectedRouteId, () => {
  tripFromIndex.value = 0
  tripToIndex.value = Math.max(0, (selectedRoute.value?.stops.length ?? 1) - 1)
}, { immediate: true })

const tripResult = computed(() => {
  const route = selectedRoute.value
  if (!route || route.stops.length < 2) return null
  const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
  const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
  return computeStopToStop(stops, polyline, tripFromIndex.value, tripToIndex.value, { profile: segmentProfile.value })
})

const tripResultText = computed(() => {
  const result = tripResult.value
  if (!result) return ''
  if (result.distanceMeters === 0) return '选择不同站点'
  const parts = [`约 ${formatMeters(result.distanceMeters)}`]
  if (result.stopsBetween > 0) parts.push(`途经 ${result.stopsBetween} 站`)
  parts.push(`约 ${formatEtaText(result.etaSeconds)}`)
  return parts.join(' · ')
})

/** 明细默认收起（手机省空间），桌面端展开。 */
const detailsOpen = ref(false)
onMounted(() => {
  if (window.matchMedia('(min-width: 768px)').matches) detailsOpen.value = true
})

/** 横向缩略图：进度比例(0..1) → CSS left，站点刻度与车标共用同一坐标系。 */
function stripLeft(ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio))
  return `calc(0.75rem + ${clamped} * (100% - 1.5rem))`
}

const updatedAtText = computed(() => {
  if (!props.fetchedAt) return ''
  const date = new Date(props.fetchedAt)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
})
/* ---------- 面板第三视图（sheet 变体）：折叠条 / 标题 / 车辆卡文案 ---------- */

const isSheet = computed(() => props.variant === 'sheet')
const sheetState = computed<MobileSheetState>(() => props.state ?? 'half')
const sheetStops = computed(() => selectedRoute.value?.stops ?? [])
/** 面板只展示排在第一位的车（与线路条首个车标一致），其余车辆数量折进文案。 */
const leadBus = computed(() => busMarkers.value[0] ?? null)
/** 折叠条右侧胶囊：`约 4 分钟` → `4′`。 */
const collapsedEta = computed(() => {
  const bus = leadBus.value
  if (!bus) return ''
  if (bus.isAtSite) return '到站'
  return bus.etaText.replace(/^约\s*/, '').replace(/\s*分钟$/, '′')
})
const collapsedTitle = computed(() => {
  const bus = leadBus.value
  if (!bus) return '叮叮车 · ' + emptyBusesText.value
  const eta = collapsedEta.value
  return eta ? (eta === '到站' ? '叮叮车 ' + eta : '叮叮车 ' + eta + ' 到') : '叮叮车'
})
const collapsedDetail = computed(() => {
  const bus = leadBus.value
  if (!bus) return SERVICE_HOURS_LABEL
  const where = bus.isAtSite ? bus.atSiteLabel + ' · ' + bus.atSiteDetail : '下一站 ' + bus.nextStopName
  return bus.busName + ' · ' + where
})
const vehicleLine = computed(() => {
  const bus = leadBus.value
  if (!bus) return emptyBusesText.value + ' · ' + SERVICE_HOURS_LABEL
  const more = busMarkers.value.length > 1 ? ' · 另 ' + (busMarkers.value.length - 1) + ' 辆在途' : ''
  return bus.busName + ' · ' + bus.statusText + more
})

function routeTabLabel(route: BusRouteSnapshot): string {
  return route.isBack ? '回程' : '去程'
}

/** 线路条上的站点比例 0..1。 */
function stopRatio(index: number): number {
  const count = sheetStops.value.length
  return count > 1 ? index / (count - 1) : 0
}

/** 站列里车标的纵向位置：段号折成「行中心」百分比，等分拉伸后仍精确。 */
function markerBarTop(ratio: number): string {
  const count = sheetStops.value.length
  if (!count) return '0%'
  const anchor = Math.min(count - 1, Math.max(0, ratio * (count - 1)))
  return ((anchor + 0.5) / count * 100).toFixed(3) + '%'
}
</script>

<template>
  <!-- 地图面板第三视图（手机）：折叠 84 / 半屏 326 / 展开 ≤548，与地点列表、详情共用同一块可拖拽面板 -->
  <div
    v-if="isSheet"
    data-bus-sheet
    :data-bus-state="sheetState"
    :data-bus-stops="sheetStops.length"
    class="flex h-full min-h-0 w-full flex-col md:hidden"
  >
    <button
      v-if="sheetState === 'collapsed'"
      type="button"
      data-bus-collapsed-bar
      aria-label="展开叮叮车"
      class="relative flex h-full w-full items-center gap-2.5 px-4 text-left"
      @click="emit('sheet-raise')"
    >
      <span
        aria-hidden="true"
        class="pointer-events-none absolute left-1/2 top-[7px] h-1 w-9 -translate-x-1/2 rounded-full bg-[var(--bus-accent-line)]"
      />
      <span
        aria-hidden="true"
        class="grid size-[30px] shrink-0 place-items-center rounded-full bg-[var(--bus-accent-soft)] text-[15px] text-[var(--bus-accent)]"
      >🚌</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[13px] font-semibold leading-5 text-[var(--ink)]">{{ collapsedTitle }}</span>
        <span class="block truncate text-[11px] leading-4 text-[var(--muted-ink)]">{{ collapsedDetail }}</span>
      </span>
      <span
        v-if="collapsedEta"
        class="shrink-0 rounded-full bg-[var(--bus-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--bus-accent-ink)]"
      >{{ collapsedEta }}</span>
    </button>

    <template v-else>
      <!-- 标题行 44 -->
      <div class="relative flex h-11 shrink-0 items-end px-3 pb-1">
        <button
          type="button"
          data-sheet-drag-handle
          aria-label="上下拖动叮叮车面板"
          class="absolute left-1/2 top-1 h-5 w-16 -translate-x-1/2 touch-none rounded-md"
          @pointerdown="emit('sheet-drag-start', $event)"
        >
          <span
            aria-hidden="true"
            class="mx-auto block h-1 w-10 rounded-full bg-[var(--line)]"
          />
        </button>
        <p class="truncate text-[13px] font-semibold leading-5 text-[var(--ink)]">
          叮叮车
        </p>
      </div>

      <!-- 线路 tab 34 -->
      <div class="flex h-[34px] shrink-0 items-center gap-1.5 px-3">
        <button
          v-for="route in routes"
          :key="route.routeId"
          type="button"
          class="h-[26px] min-w-0 shrink-0 truncate rounded-full px-4 text-[12px] font-medium"
          :class="route.routeId === selectedRouteId
            ? 'bg-[var(--bus-accent)] text-[var(--bus-accent-ink)]'
            : 'bg-[var(--bus-accent-soft)] text-[var(--bus-accent)]'"
          :aria-pressed="route.routeId === selectedRouteId"
          @click="pickRoute(route.routeId)"
        >
          {{ routeTabLabel(route) }}
        </button>
      </div>

      <!-- 线路条 56：站点刻度 + 车辆锚点 -->
      <div
        aria-hidden="true"
        class="relative h-14 shrink-0 px-3"
      >
        <span class="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-[var(--bus-accent-line)]" />
        <span
          v-for="(stop, index) in sheetStops"
          :key="'tick-' + stop.siteId + index"
          class="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--bus-accent)]"
          :style="{ left: stripLeft(stopRatio(index)) }"
        />
        <span
          v-for="marker in busMarkers"
          :key="'strip-' + marker.busId"
          class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--bus-accent)] ring-2 ring-[var(--surface)]"
          :style="{ left: stripLeft(Math.min(0.96, Math.max(0.04, marker.anchorRatio))) }"
        />
      </div>

      <!-- 车辆卡 56 -->
      <div class="flex h-14 shrink-0 items-center gap-2 border-y border-[var(--line)] px-3">
        <span
          aria-hidden="true"
          class="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--bus-accent-soft)] text-[13px] text-[var(--bus-accent)]"
        >🚌</span>
        <p class="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">
          {{ vehicleLine }}
        </p>
      </div>

      <!-- 站行：最小 32，容器富余时等分拉伸；车标按行中心百分比定位 -->
      <div class="min-h-0 flex-1 overflow-hidden px-3">
        <div class="relative grid h-full auto-rows-[minmax(32px,1fr)]">
          <span
            aria-hidden="true"
            class="absolute bottom-3 left-[4px] top-3 w-px bg-[var(--bus-accent-line)]"
          />
          <div
            v-for="(stop, index) in sheetStops"
            :key="stop.siteId + index"
            class="relative flex min-h-0 items-center gap-2"
          >
            <span
              aria-hidden="true"
              class="relative z-10 size-2.5 shrink-0 rounded-full border-2 bg-[var(--surface)]"
              :style="{ borderColor: 'var(--bus-accent)' }"
            />
            <p
              class="min-w-0 truncate text-[12px]"
              :class="index === 0 ? 'font-semibold text-[var(--ink)]' : 'text-[var(--muted-ink)]'"
            >
              {{ stop.siteName }}
            </p>
          </div>
          <span
            v-for="marker in busMarkers"
            :key="'dot-' + marker.busId"
            aria-hidden="true"
            class="pointer-events-none absolute left-0 z-20 -translate-y-1/2"
            :style="{ top: markerBarTop(marker.anchorRatio) }"
          >
            <span class="block size-3.5 rounded-full bg-[var(--bus-accent)] ring-2 ring-[var(--surface)]" />
          </span>
        </div>
      </div>

      <!-- 底栏 44 -->
      <div class="flex h-11 shrink-0 items-center gap-1 px-3 pb-1">
        <button
          type="button"
          class="h-9 min-w-0 flex-1 truncate rounded-full bg-[var(--bus-accent-soft)] px-3 text-[12px] font-medium text-[var(--bus-accent)]"
          @click="sheetState === 'expanded' ? emit('sheet-collapse') : emit('sheet-expand')"
        >
          {{ sheetState === 'expanded' ? '收起全部站点' : '全部站点 ' + sheetStops.length }}
        </button>
        <button
          type="button"
          aria-label="切回地点列表"
          class="h-9 shrink-0 rounded-full px-3 text-[12px] font-medium text-[var(--muted-ink)]"
          @click="emit('sheet-back')"
        >
          地点
        </button>
      </div>
    </template>
  </div>

  <!-- 收起态（移动端）：仅 floating 变体；sheet 变体由上方折叠条承载 -->
  <UButton
    v-if="!isSheet && !open"
    icon="i-lucide-bus-front"
    label="校车实时"
    color="primary"
    variant="solid"
    class="map-bus-dock absolute right-3 z-30 shadow-lg md:hidden"
    @click="emit('open-sheet')"
  />

  <!-- 收起态（桌面端）：320px 白底单行条，跟随侧边栏宽度（见 leftOffset） -->
  <button
    v-if="!isSheet && !open"
    type="button"
    class="absolute bottom-20 right-3 z-30 hidden md:flex md:items-center md:gap-2 md:h-11 md:w-80 md:rounded-lg md:border md:border-zinc-200 md:bg-[var(--surface)] md:px-3 md:shadow-lg md:bottom-auto md:right-auto md:top-16 md:left-[var(--bus-left,19rem)] dark:md:border-zinc-700 dark:md:bg-zinc-900"
    :style="{ '--bus-left': leftOffset ?? '19rem' }"
    aria-label="展开校车线路总览"
    @click="emit('update:open', true)"
  >
    <UIcon
      name="i-lucide-bus-front"
      class="size-4 shrink-0 text-[var(--bus-accent)]"
    />
    <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">校车实时</span>
    <span class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">更新 {{ updatedAtText }}</span>
    <UIcon
      name="i-lucide-chevron-down"
      class="size-4 shrink-0 text-zinc-400"
    />
  </button>

  <!-- 展开态：移动端全屏浮层；桌面端 320px 竖面板，从单行条底边向下展开 -->
  <section
    v-else-if="!isSheet"
    class="map-bus-panel-enter absolute inset-x-3 top-2 bottom-2 z-50 flex flex-col overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-[var(--surface)] shadow-xl dark:border-zinc-700 dark:bg-zinc-900 md:top-16 md:bottom-auto md:right-auto md:left-[var(--bus-left,19rem)] md:z-20 md:max-h-[70vh] md:w-80 md:rounded-lg md:shadow-lg max-md:landscape:inset-x-auto max-md:landscape:right-2 max-md:landscape:w-60"
    :style="{ '--bus-left': leftOffset ?? '19rem' }"
    aria-label="校车线路总览"
  >
    <header class="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-zinc-100 bg-[var(--surface)] px-3 dark:border-zinc-800 dark:bg-zinc-900">
      <UIcon
        name="i-lucide-bus-front"
        class="size-4 text-[var(--bus-accent)]"
      />
      <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        校车实时
      </h2>
      <span class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">更新 {{ updatedAtText }}</span>
      <UButton
        icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="收起校车面板"
        @click="emit('update:open', false)"
      />
    </header>

    <!-- 线路切换 -->
    <div
      v-if="routes.length"
      class="flex gap-1 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800"
    >
      <button
        v-for="route in routes"
        :key="route.routeId"
        type="button"
        class="min-h-9 flex-1 rounded-md px-2 py-1 text-xs font-semibold transition"
        :class="route.routeId === selectedRouteId
          ? 'bg-[var(--bus-accent)] text-[var(--bus-accent-ink)] shadow-sm'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'"
        @click="pickRoute(route.routeId)"
      >
        {{ route.isBack ? '回程' : '去程' }} · {{ route.stops.length }} 站
      </button>
    </div>

    <p
      v-else
      class="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500"
    >
      暂无线路数据
    </p>

    <!-- 横向线路缩略图：一条线看全貌，车按进度在线上 -->
    <div
      v-if="selectedRoute"
      class="border-b border-zinc-100 px-3 pb-2 pt-1.5 dark:border-zinc-800"
    >
      <div class="relative h-[58px]">
        <!-- 车标浮在上方 -->
        <div
          v-for="marker in busMarkers"
          :key="marker.busId"
          class="absolute top-0 z-10 -translate-x-1/2"
          :style="{ left: stripLeft(Math.min(0.96, Math.max(0.04, marker.anchorRatio))) }"
        >
          <div
            class="flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold shadow-sm"
            :class="marker.isAtSite
              ? 'border-[var(--bus-accent-line)] bg-[var(--bus-accent-soft)] text-[var(--bus-accent)]'
              : 'border-zinc-200 bg-[var(--surface)] text-green-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-green-400'"
          >
            <UIcon
              name="i-lucide-bus-front"
              class="size-2.5 shrink-0"
            />
            {{ marker.isAtSite ? marker.atSiteLabel : `约 ${marker.distanceText}` }}
          </div>
        </div>

        <!-- 线路主线 -->
        <div class="absolute left-3 right-3 top-8 h-[3px] -translate-y-1/2 rounded bg-zinc-200 dark:bg-zinc-700" />

        <!-- 站点刻度 -->
        <div
          v-for="(stop, index) in selectedRoute.stops"
          :key="stop.siteId"
          class="absolute top-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white dark:border-zinc-900"
          :class="stop.isOrigin || stop.isDestination
            ? 'size-[11px] bg-[var(--bus-accent)]'
            : 'size-[7px] bg-zinc-400 dark:bg-zinc-500'"
          :style="{ left: stripLeft(selectedRoute.stops.length > 1 ? index / (selectedRoute.stops.length - 1) : 0.5) }"
        />

        <!-- 起终点名称 -->
        <div class="absolute bottom-0 left-0 max-w-[38%] truncate text-[9px] font-medium text-[var(--bus-accent)]">
          {{ selectedRoute.stops[0]?.siteName }}
        </div>
        <div class="absolute bottom-0 right-0 max-w-[38%] truncate text-right text-[9px] font-medium text-[var(--bus-accent)]">
          {{ selectedRoute.stops[selectedRoute.stops.length - 1]?.siteName }}
        </div>
      </div>
    </div>

    <!-- 线路总览：站点竖排 + 车按进度浮在线上 -->
    <div
      v-if="selectedRoute"
      class="flex min-h-0 flex-1 flex-col px-3 py-3"
    >
      <div
        ref="rowsWrapRef"
        class="relative min-h-0 flex-1 overflow-y-auto"
      >
        <!-- 站点主线 -->
        <div
          class="absolute left-[9px] w-[3px] rounded bg-zinc-200 dark:bg-zinc-700"
          :style="{ top: `${STOP_DOT_CENTER}px`, height: `${rowHeight * (selectedRoute.stops.length - 1)}px` }"
        />

        <!-- 站点行 -->
        <div
          v-for="(stop, stopIndex) in selectedRoute.stops"
          :key="stop.siteId"
          class="relative flex min-h-14 items-start gap-3 pl-7"
          :style="{ height: `${rowHeight}px` }"
        >
          <span
            class="absolute left-[3px] top-[9px] size-[15px] rounded-full border-[3px] border-white dark:border-zinc-900"
            :class="stop.isOrigin || stop.isDestination
              ? 'bg-[var(--bus-accent)]'
              : 'bg-zinc-400 dark:bg-zinc-500'"
            :style="{ zIndex: 2 }"
          />
          <div class="min-w-0 flex-1 pb-3">
            <p class="truncate text-xs font-semibold leading-5 text-zinc-900 dark:text-zinc-100">
              {{ stop.siteName }}
            </p>
            <p
              v-if="stop.isOrigin"
              class="text-[10px] font-medium text-[var(--bus-accent)]"
            >
              起点
            </p>
            <p
              v-else-if="stop.isDestination"
              class="text-[10px] font-medium text-[var(--bus-accent)]"
            >
              终点
            </p>
          </div>
          <!-- 到站板：该站最快预计到达 -->
          <span
            v-if="stopArrivals[stopIndex]"
            class="mt-0.5 shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          >
            {{ stopArrivals[stopIndex] }}到
          </span>
        </div>

        <!-- 车辆标记：按 (段号 + 段内进度) 浮在线上 -->
        <div
          v-for="marker in busMarkers"
          :key="marker.busId"
          class="absolute left-7 z-10 -translate-y-1/2"
          :style="{ top: `${marker.top}px` }"
        >
          <div
            class="flex max-w-[13.5rem] items-center gap-1 rounded-full border px-2 py-1 shadow-md"
            :class="marker.isAtSite
              ? 'border-[var(--bus-accent-line)] bg-[var(--bus-accent-soft)]'
              : 'border-zinc-200 bg-[var(--surface)] dark:border-zinc-700 dark:bg-zinc-800'"
          >
            <UIcon
              name="i-lucide-bus-front"
              class="size-3 shrink-0 text-[var(--bus-accent)]"
            />
            <span class="truncate text-[10px] font-semibold text-zinc-900 dark:text-zinc-100">
              {{ marker.busName }}
            </span>
            <span
              class="shrink-0 text-[10px] font-semibold"
              :class="marker.isAtSite ? 'text-[var(--bus-accent)]' : 'text-green-700 dark:text-green-400'"
            >
              {{ marker.isAtSite ? marker.atSiteLabel : `约 ${marker.distanceText}` }}
            </span>
            <span
              v-if="marker.etaText"
              class="shrink-0 text-[10px] font-semibold text-green-700 dark:text-green-400"
            >
              {{ marker.etaText }}
            </span>
            <span
              v-if="marker.userDistanceText"
              class="shrink-0 text-[10px] font-semibold text-blue-600 dark:text-blue-400"
            >
              距您 {{ marker.userDistanceText }}
            </span>
          </div>
        </div>
      </div>

      <!-- 两站查询（A→B）：任意两站间距离/途经站/预计时长 -->
      <details
        v-if="selectedRoute && selectedRoute.stops.length > 1"
        class="mt-2 shrink-0 rounded-md border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/60"
      >
        <summary class="cursor-pointer px-2 py-1.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 select-none">
          两站查询
          <span
            v-if="tripResultText"
            class="float-right font-semibold text-green-700 dark:text-green-400"
          >{{ tripResultText }}</span>
        </summary>
        <div class="space-y-1.5 px-2 pb-2">
          <p class="text-[10px] text-zinc-500 dark:text-zinc-400">
            含沿途 {{ campusSpeedBumpCount }} 处减速带（每处踩到近 0 再起步）与停站时间。
          </p>
          <div class="flex items-center gap-1">
            <select
              v-model.number="tripFromIndex"
              class="min-w-0 flex-1 rounded border border-zinc-200 bg-[var(--surface)] px-1 py-1 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option
                v-for="(stop, index) in selectedRoute.stops"
                :key="stop.siteId"
                :value="index"
              >
                {{ stop.siteName }}
              </option>
            </select>
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3 shrink-0 text-zinc-400"
            />
            <select
              v-model.number="tripToIndex"
              class="min-w-0 flex-1 rounded border border-zinc-200 bg-[var(--surface)] px-1 py-1 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option
                v-for="(stop, index) in selectedRoute.stops"
                :key="stop.siteId"
                :value="index"
              >
                {{ stop.siteName }}
              </option>
            </select>
          </div>
          <p
            v-if="tripResultText"
            class="text-[11px] font-semibold text-green-700 dark:text-green-400"
          >
            {{ tripResultText }}
          </p>
        </div>
      </details>

      <!-- 车辆明细：预计距离全文（手机默认收起省空间） -->
      <div class="mt-2 shrink-0 rounded-md border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/60">
        <button
          type="button"
          class="flex w-full items-center gap-1 px-2 py-1.5 text-left"
          @click="detailsOpen = !detailsOpen"
        >
          <UIcon
            :name="detailsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-3 shrink-0 text-zinc-500 dark:text-zinc-400"
          />
          <p class="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
            车辆 · 预计距离
          </p>
          <span class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">{{ busMarkers.length ? `${busMarkers.length} 辆` : emptyBusesText }}</span>
        </button>
        <ul
          v-show="detailsOpen"
          class="space-y-1 px-2 pb-2"
        >
          <li
            v-for="marker in busMarkers"
            :key="marker.busId"
            class="flex items-start gap-1.5 text-[11px] leading-4"
          >
            <UIcon
              name="i-lucide-bus-front"
              class="mt-0.5 size-3 shrink-0 text-[var(--bus-accent)]"
            />
            <span class="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">
              <span class="font-semibold">{{ marker.busName }}</span>
              <template v-if="marker.isAtSite">
                · {{ marker.atSiteLabel }} · {{ marker.atSiteDetail }}
              </template>
              <template v-else>
                · 距 {{ marker.nextStopName }} 约 <span class="font-semibold text-green-700 dark:text-green-400">{{ marker.distanceText }}</span>
                <span
                  v-if="marker.etaText"
                  class="font-semibold text-green-700 dark:text-green-400"
                >（{{ marker.etaText }}）</span>
                <span
                  v-if="marker.stopsRemaining > 0"
                  class="text-zinc-400 dark:text-zinc-500"
                >（前方 {{ marker.stopsRemaining }} 站）</span>
              </template>
              <template v-if="marker.userDistanceText">
                · 距您 约 <span class="font-semibold text-blue-600 dark:text-blue-400">{{ marker.userDistanceText }}</span>
              </template>
            </span>
          </li>
          <li
            v-if="!busMarkers.length"
            class="text-[11px] text-zinc-400 dark:text-zinc-500"
          >
            {{ emptyBusesText }}{{ inServiceHours ? '' : ` · ${SERVICE_HOURS_LABEL}` }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
/*
 * 展开/收起过渡：收起条 44px 与展开面板 header 44px 同高、同 x/y，
 * 切换点位不跳；这里只补一个淡入 + 轻微下移，避免瞬间替换显得生硬。
 */
.map-bus-panel-enter {
  animation: map-bus-panel-in 160ms ease-out;
}

@keyframes map-bus-panel-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-bus-panel-enter {
    animation: none;
  }
}
</style>
