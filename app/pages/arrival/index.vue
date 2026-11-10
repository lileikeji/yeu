<script setup lang="ts">
import type { ArrivalRoute, ArrivalRouteStep } from '~~/data/arrival-routes'
import { formatOfflineSnapshotTime, useOfflineSnapshot } from '~/composables/useOfflineSnapshot'

interface ArrivalRoutesPayload {
  routes: ArrivalRoute[]
  defaultRouteId: string
}

useSeoMeta({
  title: '到校动线：泉州站、机场、自驾到仰恩大学',
  description: '按「我现在在」选出发地，看到仰恩大学的逐段动线：每段耗时区间、费用、雨天/夜间/行李提示，以及来源与核验时间。'
})

const route = useRoute()
const router = useRouter()

// 动线数据单独成 chunk：弱网下拉不到 chunk 时，退回上次打开时存下的副本。
const { data: routesPayload, stale, savedAt, error } = await useOfflineSnapshot<ArrivalRoutesPayload>(
  'arrival:routes',
  loadArrivalRoutes
)
if (error.value || !routesPayload.value) {
  throw createError({ statusCode: 503, statusMessage: '到校动线暂时加载不出来' })
}

const routes = computed(() => routesPayload.value?.routes ?? [])
const defaultRouteId = computed(() => routesPayload.value?.defaultRouteId ?? '')
const offlineSavedAtLabel = computed(() => formatOfflineSnapshotTime(savedAt.value))
// 服务端也按 ?from= 直出，深链首屏不会先闪第一条再切走。
const selectedId = ref(readRouteIdFromQuery() ?? defaultRouteId.value)
const copyState = ref<'idle' | 'copied' | 'manual'>('idle')

const activeRoute = computed<ArrivalRoute | null>(
  () => routes.value.find(item => item.id === selectedId.value) ?? null
)

const routePlainText = computed(() => activeRoute.value ? buildRouteText(activeRoute.value) : '')

async function loadArrivalRoutes(): Promise<ArrivalRoutesPayload> {
  const { arrivalRoutes, defaultArrivalRoute } = await import('~~/data/arrival-routes')
  return { routes: arrivalRoutes, defaultRouteId: defaultArrivalRoute.id }
}

function readRouteIdFromQuery(): string | null {
  const raw = route.query.from
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !value) return null
  return routes.value.some(item => item.id === value) ? value : null
}

function applyRouteFromQuery(): void {
  const fromQuery = readRouteIdFromQuery()
  if (fromQuery && fromQuery !== selectedId.value) {
    selectedId.value = fromQuery
    copyState.value = 'idle'
  }
}

function formatDuration(range: readonly [number, number]): string {
  return range[0] === range[1] ? `${range[0]} 分钟` : `${range[0]}–${range[1]} 分钟`
}

function formatCost(range: readonly [number, number]): string {
  return range[0] === range[1] ? `${range[0]} 元` : `${range[0]}–${range[1]} 元`
}

function stepCostText(step: ArrivalRouteStep): string | null {
  return step.costCny ? formatCost(step.costCny) : null
}

function buildRouteText(item: ArrivalRoute): string {
  const lines = [`${item.from} → 仰恩大学`, item.fromDetail, '']
  item.steps.forEach((step, index) => {
    const cost = step.costCny ? `，${formatCost(step.costCny)}` : ''
    lines.push(`${index + 1}. ${step.title}（${formatDuration(step.durationMin)}${cost}）`)
    lines.push(`   ${step.detail}`)
    if (step.tip) lines.push(`   提示：${step.tip}`)
  })
  lines.push('')
  const totalCost = item.totalCostCny ? `，${formatCost(item.totalCostCny)}` : '，费用以现场为准'
  lines.push(`合计：约 ${formatDuration(item.totalDurationMin)}${totalCost}`)
  item.notes.forEach((note) => {
    lines.push(`· ${note}`)
  })
  lines.push('')
  lines.push(`来源：${item.sources.map(source => `${source.label} ${source.url}（核验 ${source.verifiedAt}）`).join('；')}`)
  return lines.join('\n')
}

function selectRoute(id: string): void {
  if (selectedId.value === id) return
  selectedId.value = id
  copyState.value = 'idle'
  void router.replace({ query: { ...route.query, from: id } })
}

async function copyRoute(): Promise<void> {
  copyState.value = 'idle'
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable')
    await navigator.clipboard.writeText(routePlainText.value)
    copyState.value = 'copied'
  } catch {
    // 静默降级：不弹错、不打断阅读，只把纯文本展开成可手动选择的内容。
    copyState.value = 'manual'
  }
}

onMounted(() => {
  applyRouteFromQuery()
})

watch(() => route.query.from, () => {
  applyRouteFromQuery()
})
</script>

<template>
  <div class="bg-zinc-50 text-zinc-950 dark:bg-zinc-800/60 dark:text-zinc-100">
    <header class="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          新生报到 · 到校动线
        </p>
        <div class="mt-2 max-w-3xl">
          <h1 class="text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
            从车站到宿舍，一条一条走
          </h1>
          <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
            先选你现在的位置，再按时间轴走。耗时和费用都给区间；班次、发车时刻和精确票价以现场与官方公告为准，本页不写死。
          </p>
        </div>
      </div>
    </header>

    <div class="page-shell page-section">
      <div class="mx-auto w-full max-w-3xl">
        <div
          v-if="stale"
          role="status"
          class="surface-panel mb-5 flex items-start gap-2.5 px-3.5 py-2.5 text-sm text-zinc-600 dark:text-zinc-300"
        >
          <UIcon
            name="i-lucide-cloud-off"
            class="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <p>
            现在连不上网，下面是你上次打开时保存的内容（{{ offlineSavedAtLabel }}）。学校通知可能有更新，恢复网络后刷新一次。
          </p>
        </div>
        <section aria-labelledby="arrival-origin-heading">
          <h2
            id="arrival-origin-heading"
            class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >
            我现在在
          </h2>
          <div
            class="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label="选择出发地"
          >
            <UButton
              v-for="item in routes"
              :key="item.id"
              :label="item.from"
              :color="selectedId === item.id ? 'primary' : 'neutral'"
              :variant="selectedId === item.id ? 'soft' : 'ghost'"
              class="min-h-11 shrink-0"
              :aria-pressed="selectedId === item.id"
              @click="selectRoute(item.id)"
            />
          </div>
        </section>

        <section
          v-if="activeRoute"
          class="mt-6"
          aria-live="polite"
        >
          <div class="surface-panel p-4 md:p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
                  {{ activeRoute.from }} → 仰恩大学
                </h2>
                <p class="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {{ activeRoute.fromDetail }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-start gap-2">
                <UButton
                  :icon="copyState === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
                  :label="copyState === 'copied' ? '已复制' : '复制这条路线'"
                  color="neutral"
                  variant="outline"
                  class="min-h-11"
                  @click="copyRoute"
                />
                <span class="text-xs text-zinc-500 dark:text-zinc-400">
                  分享链接：?from={{ activeRoute.id }}
                </span>
              </div>
            </div>

            <dl class="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
              <div class="flex items-center gap-1.5">
                <dt class="text-zinc-500 dark:text-zinc-400">
                  全程约
                </dt>
                <dd class="font-semibold text-emerald-700 dark:text-emerald-400">
                  {{ formatDuration(activeRoute.totalDurationMin) }}
                </dd>
              </div>
              <div class="flex items-center gap-1.5">
                <dt class="text-zinc-500 dark:text-zinc-400">
                  费用
                </dt>
                <dd class="font-semibold text-emerald-700 dark:text-emerald-400">
                  {{ activeRoute.totalCostCny ? formatCost(activeRoute.totalCostCny) : '以现场为准' }}
                </dd>
              </div>
            </dl>

            <ul class="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              <li
                v-for="note in activeRoute.notes"
                :key="note"
                class="flex gap-2"
              >
                <span
                  class="mt-2 size-1 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                <span>{{ note }}</span>
              </li>
            </ul>

            <div
              v-if="copyState === 'manual'"
              class="mt-4"
            >
              <label
                for="arrival-route-text"
                class="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                浏览器没让页面写剪贴板，长按选择下面的文字复制
              </label>
              <textarea
                id="arrival-route-text"
                :value="routePlainText"
                readonly
                rows="8"
                class="mt-2 w-full rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
            </div>
          </div>

          <h2 class="section-kicker mt-8">
            逐段动线
          </h2>
          <ol class="mt-3">
            <li
              v-for="(step, index) in activeRoute.steps"
              :key="step.title"
              class="relative pb-3 pl-9 last:pb-0"
            >
              <span
                class="absolute left-0 top-0 grid size-6 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                aria-hidden="true"
              >
                {{ index + 1 }}
              </span>
              <span
                v-if="index < activeRoute.steps.length - 1"
                class="absolute left-3 top-6 h-[calc(100%-1.5rem)] w-px bg-emerald-200 dark:bg-emerald-900"
                aria-hidden="true"
              />
              <div class="surface-panel p-4">
                <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  {{ step.title }}
                </h3>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span class="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
                    <UIcon
                      name="i-lucide-clock"
                      class="size-3.5"
                    />
                    {{ formatDuration(step.durationMin) }}
                  </span>
                  <span
                    v-if="stepCostText(step)"
                    class="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800"
                  >
                    <UIcon
                      name="i-lucide-banknote"
                      class="size-3.5"
                    />
                    {{ stepCostText(step) }}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {{ step.detail }}
                </p>
                <p
                  v-if="step.tip"
                  class="mt-2 border-l-2 border-emerald-300 pl-3 text-xs leading-5 text-zinc-600 dark:border-emerald-800 dark:text-zinc-300"
                >
                  <span class="font-semibold text-emerald-700 dark:text-emerald-400">提示：</span>{{ step.tip }}
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section
          v-if="activeRoute"
          class="mt-10"
          aria-labelledby="arrival-sources-heading"
        >
          <p class="section-kicker">
            来源与核验时间
          </p>
          <h2
            id="arrival-sources-heading"
            class="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >
            这条线用到的官方入口
          </h2>
          <ul class="mt-3 space-y-2">
            <li
              v-for="source in activeRoute.sources"
              :key="source.url"
              class="surface-panel flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <a
                :href="source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
              >
                {{ source.label }}
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5"
                />
              </a>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                核验 {{ source.verifiedAt }}
              </span>
            </li>
          </ul>
          <p class="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            本页不写班次号、发车时刻和精确票价；公交线路、票价、报到点与进校安排都可能临时调整，出发前再核对一次官方公告和当天实时公交。
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
