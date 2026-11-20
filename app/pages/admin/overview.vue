<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { catmullRomPath, toCurvePoints } from '~~/app/utils/curve'
import { resampleSeries, settleSeries } from '~~/app/utils/spring'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '数据看板',
  robots: 'noindex, nofollow'
})

interface OverviewKpi {
  key: string
  label: string
  value: number
  previous: number
  delta: number | null
  series: number[]
}

interface OverviewPayload {
  generatedAt: string
  range: { days: number, startAt: string }
  kpis: OverviewKpi[]
  trend: { labels: string[], visits: number[], visitors: number[] }
  contentByKind: { label: string, value: number }[]
  contentByStatus: { label: string, value: number }[]
  publishedTotal: number
  totalContents: number
  topPaths: { label: string, value: number }[]
  auditActions: { label: string, value: number }[]
  recruitFunnel: { label: string, value: number }[]
  hourly: number[]
  heatmapStart: string
  heatmapWeeks: number
  heatmap: { week: number, day: number, value: number }[]
}

const ranges = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' }
]

const days = ref(30)
const showTable = ref(false)
const data = ref<OverviewPayload | null>(null)
const loading = ref(true)
const errorMessage = ref('')

/* 图形过渡用的固定取样点数：7/30/90 天点数不同，先统一长度才谈得上过渡 */
const TREND_SAMPLES = 56
const SPARK_SAMPLES = 24
const SPRING_TUNE = 55

const reduceMotion = ref(false)
const shownTrend = ref<{ visits: number[], visitors: number[] } | null>(null)
const shownSparks = ref<Record<string, number[]>>({})
let stopTrend: (() => void) | null = null
const stopSparks = new Map<string, () => void>()

onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

onBeforeUnmount(() => {
  stopTrend?.()
  stopSparks.forEach(stop => stop())
})

function animateTrend(payload: OverviewPayload) {
  const visits = resampleSeries(payload.trend.visits, TREND_SAMPLES)
  const visitors = resampleSeries(payload.trend.visitors, TREND_SAMPLES)
  const target = [...visits, ...visitors]
  const previous = shownTrend.value
    ? [...shownTrend.value.visits, ...shownTrend.value.visitors]
    : target.map(() => 0)
  stopTrend?.()
  if (reduceMotion.value) {
    shownTrend.value = { visits, visitors }
    return
  }
  stopTrend = settleSeries(previous, target, (values) => {
    shownTrend.value = {
      visits: values.slice(0, TREND_SAMPLES),
      visitors: values.slice(TREND_SAMPLES)
    }
  }, { tune: SPRING_TUNE })
}

function animateSparks(payload: OverviewPayload) {
  payload.kpis.forEach((kpi) => {
    const target = resampleSeries(kpi.series, SPARK_SAMPLES)
    const previous = shownSparks.value[kpi.key]?.length === SPARK_SAMPLES
      ? shownSparks.value[kpi.key]!
      : target.map(() => 0)
    stopSparks.get(kpi.key)?.()
    if (reduceMotion.value) {
      shownSparks.value[kpi.key] = target
      return
    }
    stopSparks.set(kpi.key, settleSeries(previous, target, (values) => {
      shownSparks.value[kpi.key] = values
    }, { tune: SPRING_TUNE }))
  })
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const payload = await adminFetch<OverviewPayload>(`/api/admin/overview?days=${days.value}`)
    data.value = payload
    animateTrend(payload)
    animateSparks(payload)
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '数据看板加载失败')
  } finally {
    loading.value = false
  }
}

function pickRange(value: number) {
  if (days.value === value) return
  days.value = value
  load()
}

onMounted(load)

const totalVisits = computed(() => data.value?.trend.visits.reduce((sum, value) => sum + value, 0) ?? 0)
const peakDay = computed(() => {
  const trend = data.value?.trend
  if (!trend || trend.visits.length === 0) return { label: '—', value: 0 }
  let index = 0
  trend.visits.forEach((value, i) => {
    if (value > trend.visits[index]!) index = i
  })
  return { label: trend.labels[index] || '—', value: trend.visits[index] || 0 }
})

const trendVisits = computed(() => shownTrend.value?.visits ?? [])
const trendVisitors = computed(() => shownTrend.value?.visitors ?? [])
const trendMax = computed(() => Math.max(
  10,
  ...(data.value?.trend.visits || [0]),
  ...(data.value?.trend.visitors || [0]),
  ...trendVisits.value,
  ...trendVisitors.value
))
const contentTotal = computed(() => (data.value?.contentByKind || []).reduce((sum, item) => sum + item.value, 0))
const funnelTop = computed(() => data.value?.recruitFunnel[0]?.value || 0)
const heatMax = computed(() => Math.max(1, ...(data.value?.heatmap || []).map(cell => cell.value)))
const hourlyMax = computed(() => Math.max(1, ...(data.value?.hourly || [1])))
const pathsMax = computed(() => Math.max(1, ...(data.value?.topPaths || []).map(item => item.value)))
const actionsMax = computed(() => Math.max(1, ...(data.value?.auditActions || []).map(item => item.value)))

const kindPalette = ['#b4232c', '#d97706', '#0f766e', '#4f46e5', '#7c3aed']
const kindItems = computed(() => (data.value?.contentByKind || []).map((item, index) => ({
  label: item.label,
  value: item.value,
  color: kindPalette[index % kindPalette.length]
})))
const hotKind = ref<string | null>(null)
const donutStyle = computed(() => {
  const items = kindItems.value
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1
  let cursor = 0
  const stops: string[] = []
  items.forEach((item) => {
    const start = (cursor / total) * 100
    cursor += item.value
    const end = (cursor / total) * 100
    const dim = hotKind.value !== null && hotKind.value !== item.label
    stops.push((dim ? item.color + '38' : item.color) + ' ' + start.toFixed(2) + '% ' + end.toFixed(2) + '%')
  })
  return { background: 'conic-gradient(' + stops.join(', ') + ')' }
})
const donutCenter = computed(() => {
  const hit = kindItems.value.find(item => item.label === hotKind.value)
  if (hit) return { value: hit.value, caption: hit.label }
  return { value: contentTotal.value, caption: '已发布 ' + formatNumber(data.value?.publishedTotal || 0) }
})

function onDonutMove(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const dx = event.clientX - (rect.left + rect.width / 2)
  const dy = event.clientY - (rect.top + rect.height / 2)
  const radius = Math.min(rect.width, rect.height) / 2
  const distance = Math.hypot(dx, dy)
  if (distance > radius || distance < radius * 0.42) {
    hotKind.value = null
    return
  }
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360
  const total = kindItems.value.reduce((sum, item) => sum + item.value, 0) || 1
  let cursor = 0
  let hit: string | null = null
  kindItems.value.forEach((item) => {
    const start = (cursor / total) * 360
    cursor += item.value
    const end = (cursor / total) * 360
    if (hit === null && angle >= start && angle < end) hit = item.label
  })
  hotKind.value = hit
}

const activeHour = ref<number | null>(null)
function onHourKey(event: KeyboardEvent) {
  const key = event.key
  if (key === 'Escape') {
    activeHour.value = null
    return
  }
  if (key === 'Home') {
    event.preventDefault()
    activeHour.value = 0
    return
  }
  if (key === 'End') {
    event.preventDefault()
    activeHour.value = 23
    return
  }
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return
  event.preventDefault()
  const step = key === 'ArrowRight' ? 1 : -1
  const current = activeHour.value
  activeHour.value = current === null ? (step > 0 ? 0 : 23) : (current + step + 24) % 24
}

function linePoints(values: number[], width: number, height: number, max: number): string {
  if (values.length === 0) return ''
  const step = values.length > 1 ? width / (values.length - 1) : width
  return values.map((value, index) => {
    const x = index * step
    const y = height - (value / max) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function sparkPoints(values: number[], width: number, height: number, max = Math.max(1, ...values)): string {
  if (values.length === 0) return ''
  return linePoints(values, width, height - 2, max)
}

function sparkSeries(kpi: OverviewKpi): number[] {
  return shownSparks.value[kpi.key] ?? []
}

/* ── 折线图上的读数 ─────────────────────────────────────
   曲线用 0..100 × 0..40 的坐标系画，SVG 被 preserveAspectRatio="none" 横向拉伸，
   所以圆点和参考线不能画在 SVG 里（会被拉成椭圆），只能作为同坐标系的 HTML 覆盖层，
   位置用百分比给。 */
/* 曲线画在 100×24 的归一化坐标里（比例贴近 h-56 的桌面尺寸，避免只按比例居中的渲染器
   把图缩到中间一截），SVG 再横向拉伸铺满卡片。拉伸会把描边一起拉粗，线宽按一单位 ≈ 9.33px
   折算：2px ≈ 0.21、1.6px ≈ 0.17、1px ≈ 0.107。改图高时这些数字要跟着改。 */
const visitCurve = computed(() => catmullRomPath(toCurvePoints(trendVisits.value, trendMax.value, 24)))
const visitorCurve = computed(() => catmullRomPath(toCurvePoints(trendVisitors.value, trendMax.value, 24)))

const scrubFraction = ref<number | null>(null)

const scrub = computed(() => {
  const payload = data.value
  const fraction = scrubFraction.value
  if (!payload || fraction === null) return null
  const labels = payload.trend.labels
  if (labels.length === 0) return null
  const index = Math.min(labels.length - 1, Math.max(0, Math.round(fraction * (labels.length - 1))))
  const shownCount = trendVisits.value.length
  const shownIndex = shownCount > 1 ? Math.round(fraction * (shownCount - 1)) : 0
  const y = (value: number) => (40 - (value / Math.max(1, trendMax.value)) * 40) / 40 * 100
  return {
    label: labels[index] ?? '',
    visits: payload.trend.visits[index] ?? 0,
    visitors: payload.trend.visitors[index] ?? 0,
    x: fraction * 100,
    visitsY: y(trendVisits.value[shownIndex] ?? 0),
    visitorsY: y(trendVisitors.value[shownIndex] ?? 0)
  }
})

function readFraction(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (rect.width === 0) return
  const fraction = (event.clientX - rect.left) / rect.width
  scrubFraction.value = Math.min(1, Math.max(0, fraction))
}

function onScrubMove(event: PointerEvent) {
  if (event.pointerType === 'mouse' || event.buttons > 0) readFraction(event)
}

function onScrubStart(event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  readFraction(event)
}

function onScrubKey(event: KeyboardEvent) {
  const payload = data.value
  if (!payload) return
  const step = 1 / Math.max(1, payload.trend.labels.length - 1)
  const current = scrubFraction.value ?? 0
  if (event.key === 'ArrowLeft') scrubFraction.value = Math.max(0, current - step)
  else if (event.key === 'ArrowRight') scrubFraction.value = Math.min(1, current + step)
  else if (event.key === 'Home') scrubFraction.value = 0
  else if (event.key === 'End') scrubFraction.value = 1
  else if (event.key === 'Escape') scrubFraction.value = null
  else return
  event.preventDefault()
}

/* 活跃度热力图：接口按 26 周 × 7 天（周日起）给出，这里补日期、月份刻度与读数 */
const heatStartMs = computed(() => {
  const raw = data.value?.heatmapStart
  if (!raw) return null
  const start = new Date(raw)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
})
const heatCells = computed(() => {
  const base = heatStartMs.value
  return (data.value?.heatmap || []).map((cell) => {
    const date = base === null ? null : new Date(base + (cell.week * 7 + cell.day) * 86400000)
    const label = date ? (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日' : ''
    return {
      key: cell.week + '-' + cell.day,
      week: cell.week,
      day: cell.day,
      value: cell.value,
      label,
      tip: label ? label + ' · ' + cell.value + ' 次' : cell.value + ' 次'
    }
  })
})
const heatMonths = computed(() => {
  const months: { week: number, label: string }[] = []
  let last = -1
  heatCells.value.forEach((cell) => {
    if (cell.day !== 0 || !cell.label) return
    const month = Number(cell.label.split(' ')[0])
    if (month === last) return
    last = month
    months.push({ week: cell.week, label: month + ' 月' })
  })
  return months
})
const heatTotal = computed(() => heatCells.value.reduce((sum, cell) => sum + cell.value, 0))
const heatPeak = computed(() => {
  let top = { value: 0, label: '' }
  heatCells.value.forEach((cell) => {
    if (cell.value > top.value) top = { value: cell.value, label: cell.label }
  })
  return top
})
const heatPeakLabel = computed(() => (heatPeak.value.value > 0 ? heatPeak.value.label + ' · ' + heatPeak.value.value + ' 次' : '暂无'))
const heatDaily = computed(() => {
  const days = heatCells.value.length || 1
  return (heatTotal.value / days).toFixed(1)
})

function heatClass(value: number): string {

  if (value <= 0) return 'bg-zinc-100 dark:bg-zinc-800'
  const ratio = value / heatMax.value
  if (ratio > 0.75) return 'bg-red-600 dark:bg-red-500'
  if (ratio > 0.5) return 'bg-red-500/70 dark:bg-red-500/70'
  if (ratio > 0.25) return 'bg-red-500/45 dark:bg-red-500/45'
  return 'bg-red-500/20 dark:bg-red-500/25'
}


function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

function deltaText(delta: number | null): string {
  if (delta === null) return '—'
  if (delta > 0) return `+${delta}%`
  return `${delta}%`
}

function deltaTone(delta: number | null): string {
  if (delta === null) return 'text-zinc-500 dark:text-zinc-400'
  if (delta > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (delta < 0) return 'text-red-600 dark:text-red-400'
  return 'text-zinc-500 dark:text-zinc-400'
}

function exportCsv() {
  const payload = data.value
  if (!payload) return
  const rows: string[][] = [['日期', '访问量', '独立访客']]
  payload.trend.labels.forEach((label, index) => {
    rows.push([label, String(payload.trend.visits[index] || 0), String(payload.trend.visitors[index] || 0)])
  })
  const csv = rows.map(row => row.join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `overview-${payload.range.days}d.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          数据看板
        </h1>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">
          访问、内容、纳新与后台操作的集中视图，数据来自本站访客与内容库。
        </p>
        <p
          v-if="data"
          class="text-xs text-zinc-500 dark:text-zinc-500"
        >
          统计区间 {{ data.range.days }} 天 · 生成于 {{ new Date(data.generatedAt).toLocaleString('zh-CN') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div
          class="inline-flex rounded-lg border border-zinc-200 bg-[var(--surface)] p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
          role="group"
          aria-label="统计区间"
        >
          <button
            v-for="range in ranges"
            :key="range.days"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm transition-colors"
            :class="days === range.days
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            :aria-pressed="days === range.days"
            @click="pickRange(range.days)"
          >
            {{ range.label }}
          </button>
        </div>
        <button
          type="button"
          class="rounded-lg border border-zinc-200 bg-[var(--surface)] px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          :disabled="!data"
          @click="exportCsv"
        >
          导出 CSV
        </button>
      </div>
    </header>

    <p
      v-if="errorMessage"
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div
      v-if="loading && !data"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-hidden="true"
    >
      <div
        v-for="i in 4"
        :key="i"
        class="h-28 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
      />
    </div>

    <template v-if="data">
      <section
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="关键指标"
      >
        <article
          v-for="kpi in data.kpis"
          :key="kpi.key"
          class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm text-zinc-600 dark:text-zinc-400">
              {{ kpi.label }}
            </p>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="deltaTone(kpi.delta)"
            >{{ deltaText(kpi.delta) }}</span>
          </div>
          <p class="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {{ formatNumber(kpi.value) }}
          </p>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            上一周期 {{ formatNumber(kpi.previous) }}
          </p>
          <svg
            v-if="kpi.series.length > 1"
            class="mt-3 h-8 w-full"
            viewBox="0 0 120 32"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              :points="sparkPoints(sparkSeries(kpi), 120, 32, Math.max(1, ...kpi.series))"
              fill="none"
              stroke="#b4232c"
              stroke-width="1.6"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </article>
      </section>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <figure class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 shadow-sm xl:col-span-7 dark:border-zinc-800 dark:bg-zinc-900">
          <figcaption class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">访问趋势</span>
          </figcaption>
          <div class="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
            <div class="flex items-center gap-4 text-zinc-600 dark:text-zinc-400">
              <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-red-600" aria-hidden="true"></span>访问量</span>
              <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true"></span>独立访客</span>
            </div>
            <p class="tabular-nums text-zinc-500 dark:text-zinc-400">
              <template v-if="scrub">{{ scrub.label }} · 访问 {{ formatNumber(scrub.visits) }} · 访客 {{ formatNumber(scrub.visitors) }}</template>
              <template v-else>合计 {{ formatNumber(totalVisits) }} 次 · 峰值 {{ peakDay.label }}（{{ formatNumber(peakDay.value) }}）</template>
            </p>
          </div>
          <div
            class="relative mt-2 h-56 w-full cursor-crosshair touch-pan-y select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 dark:focus-visible:ring-zinc-500/70"
            role="group"
            tabindex="0"
            aria-label="访问趋势曲线，左右方向键逐日读数，Esc 收起"
            @pointerdown="onScrubStart"
            @pointermove="onScrubMove"
            @pointerleave="scrubFraction = null"
            @keydown="onScrubKey"
          >
            <svg class="absolute inset-0 h-full w-full" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
              <line v-for="i in 4" :key="i" x1="0" :y1="(i - 1) * 6" x2="100" :y2="(i - 1) * 6" stroke="rgba(120,113,108,0.28)" stroke-width="0.107" />
              <path :d="visitorCurve" fill="none" stroke="#4f46e5" stroke-width="0.17" stroke-dasharray="0.54 0.43" stroke-linecap="round" stroke-linejoin="round" />
              <path :d="visitCurve" fill="none" stroke="#b4232c" stroke-width="0.21" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <i v-if="scrub" class="pointer-events-none absolute inset-y-0 w-px bg-zinc-400/60 dark:bg-zinc-500/60" :style="{ left: scrub.x + '%' }" aria-hidden="true" />
            <span v-if="scrub" class="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--surface)] ring-2 ring-[#4f46e5] dark:bg-zinc-100" :style="{ left: scrub.x + '%', top: scrub.visitorsY + '%' }" aria-hidden="true" />
            <span v-if="scrub" class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--surface)] ring-2 ring-[#b4232c] dark:bg-zinc-100" :style="{ left: scrub.x + '%', top: scrub.visitsY + '%' }" aria-hidden="true" />
          </div>
          <button type="button" class="mt-2 text-xs text-zinc-600 underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100" :aria-expanded="showTable" aria-controls="overview-trend-table" @click="showTable = !showTable">
            {{ showTable ? '收起数据表' : '查看数据表' }}
          </button>
          <div v-if="showTable" id="overview-trend-table" class="mt-2 max-h-48 overflow-auto">
            <table class="w-full text-left">
              <caption class="sr-only">按日访问量与独立访客</caption>
              <thead class="sticky top-0 bg-[var(--surface)] text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th scope="col" class="py-1">日期</th>
                  <th scope="col" class="py-1">访问量</th>
                  <th scope="col" class="py-1">独立访客</th>
                </tr>
              </thead>
              <tbody class="text-sm">
                <tr v-for="(label, index) in data.trend.labels" :key="label">
                  <td class="py-0.5">{{ label }}</td>
                  <td class="py-0.5 tabular-nums">{{ data.trend.visits[index] }}</td>
                  <td class="py-0.5 tabular-nums">{{ data.trend.visitors[index] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </figure>

        <figure class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 shadow-sm xl:col-span-5 dark:border-zinc-800 dark:bg-zinc-900">
          <figcaption class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            内容构成
          </figcaption>
          <div class="mt-4 flex items-center gap-5">
            <div
              class="donut-shell relative h-32 w-32 shrink-0 rounded-full"
              :style="donutStyle"
              role="img"
              aria-label="内容构成环形图，悬停扇区可在右侧图例中定位对应分类"
              @pointermove="onDonutMove"
              @pointerleave="hotKind = null"
            >
              <div class="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-[var(--surface)] text-center dark:bg-zinc-900">
                <span
                  :key="donutCenter.value"
                  class="donut-num text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50"
                >{{ formatNumber(donutCenter.value) }}</span>
                <span class="px-1 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">{{ donutCenter.caption }}</span>
              </div>
            </div>
            <ul
              class="min-w-0 flex-1 space-y-0.5 text-sm"
              @pointerleave="hotKind = null"
            >
              <li v-for="kind in kindItems" :key="kind.label">
                <button
                  type="button"
                  class="legend-row"
                  :class="hotKind === kind.label ? 'legend-row--on' : ''"
                  @pointerenter="hotKind = kind.label"
                  @focus="hotKind = kind.label"
                  @blur="hotKind = null"
                  @click="hotKind = hotKind === kind.label ? null : kind.label"
                >
                  <span class="legend-label">
                    <span class="legend-swatch" :style="{ background: kind.color }" aria-hidden="true" />
                    <span class="truncate">{{ kind.label }}</span>
                  </span>
                  <span class="legend-value">{{ formatNumber(kind.value) }}</span>
                </button>
              </li>
            </ul>
          </div>
          <div class="mt-4 space-y-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <div
              v-for="(item, index) in data.contentByStatus"
              :key="item.label"
              class="flex items-center gap-2 text-xs"
            >
              <span class="w-12 shrink-0 text-zinc-500 dark:text-zinc-400">{{ item.label }}</span>
              <div class="h-1.5 min-w-0 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded-full"
                  :class="index === 0 ? 'bg-emerald-600' : index === 1 ? 'bg-amber-500' : 'bg-zinc-400'"
                  :style="{ width: Math.max(2, (item.value / Math.max(1, data.totalContents)) * 100) + '%' }"
                />
              </div>
              <span class="w-6 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{{ item.value }}</span>
            </div>
          </div>
        </figure>

        <figure class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 shadow-sm xl:col-span-7 dark:border-zinc-800 dark:bg-zinc-900">
          <figcaption class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">访问活跃度</span>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">近 26 周 · 每格为一天</span>
          </figcaption>
          <div class="heat-shell mt-4">
            <div class="heat-months" aria-hidden="true">
              <span
                v-for="month in heatMonths"
                :key="month.week"
                class="heat-month"
                :style="{ gridColumn: month.week + 1 }"
              >{{ month.label }}</span>
            </div>
            <div class="heat-rows">
              <div class="heat-weekdays" aria-hidden="true">
                <span v-for="row in 7" :key="row">{{ row === 2 ? '一' : row === 4 ? '三' : row === 6 ? '五' : '' }}</span>
              </div>
              <div
                class="heat-grid"
                role="img"
                :aria-label="'近 26 周访问活跃度热力图，共 ' + heatTotal + ' 次'"
              >
                <span
                  v-for="cell in heatCells"
                  :key="cell.key"
                  class="heat-cell"
                  :class="heatClass(cell.value)"
                >
                  <span class="heat-tip">{{ cell.tip }}</span>
                </span>
              </div>
              <dl class="heat-summary">
                <div>
                  <dt>总计</dt>
                  <dd>{{ formatNumber(heatTotal) }} 次</dd>
                </div>
                <div>
                  <dt>峰值</dt>
                  <dd>{{ heatPeakLabel }}</dd>
                </div>
                <div>
                  <dt>日均</dt>
                  <dd>{{ heatDaily }} 次</dd>
                </div>
              </dl>
            </div>
            <div class="heat-legend-row mt-3 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span class="pr-0.5">少</span>
              <span class="heat-legend bg-zinc-100 dark:bg-zinc-800" />
              <span class="heat-legend bg-red-500/20" />
              <span class="heat-legend bg-red-500/45" />
              <span class="heat-legend bg-red-500/70" />
              <span class="heat-legend bg-red-600" />
              <span class="pl-0.5">多</span>
            </div>
          </div>
        </figure>


        <figure class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 shadow-sm xl:col-span-5 dark:border-zinc-800 dark:bg-zinc-900">
          <figcaption class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            热门页面
          </figcaption>
          <ul class="mt-4 space-y-3">
            <li
              v-for="item in data.topPaths"
              :key="item.label"
            >
              <div class="flex items-baseline justify-between gap-2 text-sm">
                <span class="truncate font-mono text-[13px] text-zinc-700 dark:text-zinc-300">{{ item.label }}</span>
                <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ formatNumber(item.value) }}</span>
              </div>
              <div class="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded-full bg-red-500"
                  :style="{ width: Math.max(2, (item.value / pathsMax) * 100) + '%' }"
                />
              </div>
            </li>
          </ul>
        </figure>

        <figure class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 shadow-sm xl:col-span-5 dark:border-zinc-800 dark:bg-zinc-900">
          <figcaption class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            后台操作分布
          </figcaption>
          <ul class="mt-4 space-y-3">
            <li
              v-for="item in data.auditActions"
              :key="item.label"
            >
              <div class="flex items-baseline justify-between gap-2 text-sm">
                <span class="text-zinc-700 dark:text-zinc-300">{{ item.label }}</span>
                <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ formatNumber(item.value) }}</span>
              </div>
              <div class="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded-full bg-indigo-500"
                  :style="{ width: Math.max(2, (item.value / actionsMax) * 100) + '%' }"
                />
              </div>
            </li>
          </ul>
        </figure>

        <figure class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 shadow-sm xl:col-span-12 dark:border-zinc-800 dark:bg-zinc-900">
          <figcaption class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">访问节律</span>
            <span class="tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
              <template v-if="activeHour === null">按小时聚合，峰值 {{ formatNumber(hourlyMax) }} 次</template>
              <template v-else>{{ activeHour }} 时 · {{ formatNumber(data.hourly[activeHour] || 0) }} 次</template>
            </span>
          </figcaption>
          <div
            class="hour-plot mt-4 flex h-32 items-end gap-1"
            role="group"
            aria-label="按小时聚合的访问节律柱状图，聚焦后可用左右方向键逐小时查看"
            tabindex="0"
            @keydown="onHourKey"
            @pointerleave="activeHour = null"
            @blur="activeHour = null"
          >
            <div
              v-for="(value, hour) in data.hourly"
              :key="hour"
              class="hour-col"
              :class="activeHour === null ? '' : activeHour === hour ? 'is-active' : 'is-dim'"
              @pointerenter="activeHour = hour"
            >
              <span v-if="activeHour === hour" class="hour-tip">{{ formatNumber(value) }}</span>
              <div
                class="hour-bar"
                :style="{ height: Math.max(2, (value / hourlyMax) * 100) + '%' }"
              />
            </div>
          </div>
          <p class="sr-only" aria-live="polite">
            {{ activeHour === null ? '' : activeHour + ' 时访问 ' + (data.hourly[activeHour] || 0) + ' 次' }}
          </p>
          <div class="mt-2 flex justify-between text-[11px] text-zinc-400">
            <span>0 时</span><span>6 时</span><span>12 时</span><span>18 时</span><span>23 时</span>
          </div>
        </figure>
      </div>
    </template>
  </div>
</template>

<style scoped>
.donut-shell { transition: none; }
.legend-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.2rem 0.4rem;
  border-radius: 0.5rem;
  color: #3f3f46;
  transition: background-color 200ms ease, color 200ms ease;
}
.dark .legend-row { color: #d4d4d8; }
.legend-row:hover { background: rgb(24 24 27 / 0.05); }
.dark .legend-row:hover { background: rgb(250 250 250 / 0.06); }
.legend-row--on {
  background: rgb(24 24 27 / 0.1);
  color: #111113;
  font-weight: 600;
}
.legend-row--on .legend-value { color: #111113; font-weight: 600; }
.dark .legend-row--on {
  background: rgb(250 250 250 / 0.12);
  color: #fafafa;
  box-shadow: inset 0 0 0 1px rgb(250 250 250 / 0.22);
}
.dark .legend-row--on .legend-value { color: #fafafa; }
.legend-row:focus-visible {
  outline: 2px solid #18181b;
  outline-offset: 1px;
}
.dark .legend-row:focus-visible { outline-color: #fafafa; }
.legend-label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}
.legend-swatch {
  width: 0.625rem;
  height: 0.625rem;
  flex: none;
  border-radius: 2px;
  transition: transform 200ms ease;
}
.legend-row--on .legend-swatch { transform: scale(1.2); }
.legend-value {
  color: #71717a;
  font-variant-numeric: tabular-nums;
}
.dark .legend-value { color: #a1a1aa; }
.donut-num {
  display: inline-block;
  animation: donut-pop 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes donut-pop {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .donut-num { animation: none; }
  .donut-shell { transition: none; }
  .legend-row, .legend-swatch { transition: none; }
}
.hour-plot:focus-visible {
  outline: 2px solid rgb(161 161 170 / 0.7);
  outline-offset: 2px;
}
.hour-col {
  position: relative;
  display: flex;
  flex: 1 1 0%;
  height: 100%;
  align-items: flex-end;
}
.hour-bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
  background: rgb(239 68 68 / 0.8);
  transition: background-color 160ms ease, opacity 160ms ease;
}
.hour-col.is-active .hour-bar { background: #dc2626; }
.hour-col.is-dim .hour-bar { opacity: 0.32; }
.hour-col.is-active::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: rgb(24 24 27 / 0.18);
}
.dark .hour-col.is-active::before { background: rgb(250 250 250 / 0.24); }
.hour-tip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -4px);
  padding: 1px 5px;
  border-radius: 4px;
  background: #18181b;
  color: #fafafa;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}
.dark .hour-tip {
  background: #fafafa;
  color: #18181b;
}
@media (prefers-reduced-motion: reduce) { .hour-bar { transition: none; } }
/* 活跃度热力图：月份刻度 + 星期栏 + 右侧读数，格子尺寸走 CSS 变量统一缩放 */
.heat-shell { --heat-cell: 16px; --heat-gap: 5px; }
.heat-months {
  display: grid;
  grid-template-columns: repeat(26, var(--heat-cell));
  gap: var(--heat-gap);
  margin-left: calc(var(--heat-cell) + 4px);
  height: 16px;
  color: #a1a1aa;
  font-size: 10px;
  line-height: 16px;
}
.heat-month { white-space: nowrap; }
.heat-rows { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; }
.heat-weekdays {
  display: grid;
  grid-template-rows: repeat(7, var(--heat-cell));
  gap: var(--heat-gap);
  width: calc(var(--heat-cell) - 2px);
  color: #a1a1aa;
  font-size: 10px;
  line-height: 1;
}
.heat-weekdays span { display: flex; align-items: center; justify-content: flex-end; }
.heat-grid {
  flex: 0 0 auto;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, var(--heat-cell));
  grid-auto-columns: var(--heat-cell);
  gap: var(--heat-gap);
}
.heat-legend-row { margin-left: calc(var(--heat-cell) + 4px); }
.heat-cell { position: relative; border-radius: 4px; transition: box-shadow 140ms ease; }
.heat-cell:hover { box-shadow: 0 0 0 1.5px rgb(24 24 27 / 0.55); }
.dark .heat-cell:hover { box-shadow: 0 0 0 1.5px rgb(250 250 250 / 0.6); }
.heat-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  translate: -50% 0;
  z-index: 10;
  padding: 3px 6px;
  border-radius: 6px;
  background: #18181b;
  color: #fafafa;
  font-size: 10px;
  line-height: 1.4;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}
.dark .heat-tip { background: #fafafa; color: #18181b; }
.heat-cell:hover .heat-tip { opacity: 1; }
.heat-legend { display: block; width: var(--heat-cell); height: var(--heat-cell); border-radius: 3px; }
.heat-summary {
  margin-left: auto;
  display: grid;
  gap: 0.5rem;
  min-width: 8.75rem;
  font-size: 12px;
  color: #71717a;
}
.dark .heat-summary { color: #a1a1aa; }
.heat-summary div { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.heat-summary dt { color: #a1a1aa; }
.heat-summary dd { font-variant-numeric: tabular-nums; color: #3f3f46; }
.dark .heat-summary dd { color: #e4e4e7; }
@media (max-width: 760px) {
  .heat-shell { --heat-cell: 10px; --heat-gap: 3px; }
  .heat-summary { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .heat-cell, .heat-tip { transition: none; }
}
</style>

