<script setup lang="ts">
import type { BusRouteSnapshot, BusSnapshot } from '~~/app/composables/useMapBusPositions'
import { computeBusProgress } from '~~/shared/utils/bus-route-progress'

const props = defineProps<{
  routes: BusRouteSnapshot[]
  buses: BusSnapshot[]
  fetchedAt: string | null
  open: boolean
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

/** 每站行高（px），车标按 (段号 + 段内进度) × 行高 定位。 */
const STOP_ROW_HEIGHT = 56

const selectedRouteId = ref('')
watch(() => props.routes, (routes) => {
  if (!routes.some(route => route.routeId === selectedRouteId.value)) {
    selectedRouteId.value = routes[0]?.routeId ?? ''
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
  statusText: string
  isAtSite: boolean
  nextStopName: string
  distanceText: string
  stopsRemaining: number
}

function formatMeters(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`
}

const busMarkers = computed<BusMarker[]>(() => {
  const route = selectedRoute.value
  if (!route) return []
  const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
  const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
  return routeBuses.value.map((bus) => {
    const progress = computeBusProgress({ lng: bus.lng, lat: bus.lat }, stops, polyline, { isAtSite: bus.isAtSite })
    const atStopIndex = progress?.atStopIndex ?? null
    const nextStopName = progress ? (route.stops[progress.nextStopIndex]?.siteName ?? '') : bus.siteName
    const distanceText = progress && atStopIndex === null ? formatMeters(progress.distanceToNextStopMeters) : ''
    const segmentAnchor = progress
      ? (atStopIndex !== null ? atStopIndex : progress.segmentIndex + Math.min(0.92, Math.max(0.08, progress.progress)))
      : 0
    return {
      busId: bus.busId,
      busName: bus.busName,
      top: segmentAnchor * STOP_ROW_HEIGHT + 14,
      isAtSite: atStopIndex !== null,
      nextStopName,
      distanceText,
      stopsRemaining: progress?.stopsRemaining ?? 0,
      statusText: atStopIndex !== null
        ? `已到站 · ${route.stops[atStopIndex]?.siteName ?? bus.siteName}`
        : (progress ? `距 ${nextStopName} 约 ${distanceText}` : bus.siteName)
    }
  })
})

const updatedAtText = computed(() => {
  if (!props.fetchedAt) return ''
  const date = new Date(props.fetchedAt)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
})
</script>

<template>
  <!-- 收起态：地图右下角浮钮 -->
  <UButton
    v-if="!open"
    icon="i-lucide-bus-front"
    label="校车实时"
    color="primary"
    variant="solid"
    class="absolute bottom-[calc(var(--mobile-nav-height)+5rem)] right-3 z-30 shadow-lg md:bottom-6 md:right-4"
    @click="emit('update:open', true)"
  />

  <!-- 展开态：掌上公交式线路总览 -->
  <section
    v-else
    class="absolute inset-x-3 bottom-[calc(var(--mobile-nav-height)+5rem)] z-30 max-h-[46vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 md:inset-x-auto md:bottom-6 md:right-4 md:max-h-[62vh] md:w-80"
    aria-label="校车线路总览"
  >
    <header class="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <UIcon name="i-lucide-bus-front" class="size-4 text-orange-600" />
      <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">校车实时</h2>
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
      class="flex gap-1 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800"
    >
      <button
        v-for="route in routes"
        :key="route.routeId"
        type="button"
        class="min-h-9 flex-1 rounded-md px-2 py-1 text-xs font-semibold transition"
        :class="route.routeId === selectedRouteId
          ? 'bg-orange-600 text-white shadow-sm'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'"
        @click="selectedRouteId = route.routeId"
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

    <!-- 线路总览：站点竖排 + 车按进度浮在线上 -->
    <div
      v-if="selectedRoute"
      class="relative px-3 py-3"
    >
      <div class="relative">
        <!-- 站点主线 -->
        <div class="absolute bottom-3 left-[9px] top-3 w-[3px] rounded bg-zinc-200 dark:bg-zinc-700" />

        <!-- 站点行 -->
        <div
          v-for="(stop, index) in selectedRoute.stops"
          :key="stop.siteId"
          class="relative flex min-h-14 items-start gap-3 pl-7"
        >
          <span
            class="absolute left-[3px] top-[9px] size-[15px] rounded-full border-[3px] border-white dark:border-zinc-900"
            :class="stop.isOrigin || stop.isDestination
              ? 'bg-orange-600'
              : 'bg-zinc-400 dark:bg-zinc-500'"
            :style="{ zIndex: 2 }"
          />
          <div class="min-w-0 pb-3">
            <p class="truncate text-xs font-semibold leading-5 text-zinc-900 dark:text-zinc-100">
              {{ stop.siteName }}
            </p>
            <p
              v-if="stop.isOrigin"
              class="text-[10px] font-medium text-orange-600"
            >
              起点
            </p>
            <p
              v-else-if="stop.isDestination"
              class="text-[10px] font-medium text-orange-600"
            >
              终点
            </p>
          </div>
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
              ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950'
              : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800'"
          >
            <UIcon name="i-lucide-bus-front" class="size-3 shrink-0 text-orange-600" />
            <span class="truncate text-[10px] font-semibold text-zinc-900 dark:text-zinc-100">
              {{ marker.busName }}
            </span>
            <span
              class="shrink-0 text-[10px] font-semibold"
              :class="marker.isAtSite ? 'text-orange-600' : 'text-green-700 dark:text-green-400'"
            >
              {{ marker.isAtSite ? '已到站' : `约 ${marker.distanceText}` }}
            </span>
          </div>
        </div>
      </div>

      <!-- 车辆明细：预计距离全文 -->
      <div class="mt-2 rounded-md border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800/60">
        <p class="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
          车辆 · 预计距离
        </p>
        <ul class="mt-1 space-y-1">
          <li
            v-for="marker in busMarkers"
            :key="marker.busId"
            class="flex items-start gap-1.5 text-[11px] leading-4"
          >
            <UIcon name="i-lucide-bus-front" class="mt-0.5 size-3 shrink-0 text-orange-600" />
            <span class="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">
              <span class="font-semibold">{{ marker.busName }}</span>
              <template v-if="marker.isAtSite">
                · 已到站 · {{ marker.statusText.replace('已到站 · ', '') }}
              </template>
              <template v-else>
                · 距 {{ marker.nextStopName }} 约 <span class="font-semibold text-green-700 dark:text-green-400">{{ marker.distanceText }}</span>
                <span v-if="marker.stopsRemaining > 0" class="text-zinc-400 dark:text-zinc-500">（前方 {{ marker.stopsRemaining }} 站）</span>
              </template>
            </span>
          </li>
          <li
            v-if="!busMarkers.length"
            class="text-[11px] text-zinc-400 dark:text-zinc-500"
          >
            暂无在线车辆
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
