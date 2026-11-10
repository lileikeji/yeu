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
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'focus-stop': [point: { lng: number, lat: number }]
  'focus-vehicle': [payload: { plate: string, point: [number, number], nextStation: string, distanceToNext?: number }]
  'select-direction': [line: ApiBusLineDirection]
  'change-line': [line: string]
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
  <!-- 收起态：地图左下角浮钮 -->
  <UButton
    v-if="!open"
    icon="i-lucide-bus"
    label="公交线路"
    color="neutral"
    variant="solid"
    class="absolute bottom-20 left-3 z-30 shadow-lg md:bottom-6 md:left-[var(--transit-left,1rem)]"
    :style="{ '--transit-left': leftOffset ?? '1rem' }"
    @click="emit('update:open', true)"
  />

  <section
    v-else
    class="absolute inset-x-3 bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 md:inset-x-auto md:bottom-6 md:left-[var(--transit-left,1rem)] md:top-auto md:z-50 md:max-h-[62vh] md:w-80 max-md:landscape:inset-x-auto max-md:landscape:left-2 max-md:landscape:w-60"
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
        :class="selectedDirection === direction.id ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''"
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
              class="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-600 px-1.5 py-px text-[10px] font-medium text-white"
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
            <UIcon name="i-lucide-navigation" class="size-3 shrink-0 text-sky-500" />
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
