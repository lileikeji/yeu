<script setup lang="ts">
import type {
  ApiSignalEventDetail,
  ApiSignalListResponse,
  ApiSignalReportListResponse
} from '~~/shared/types/server'

type SignalDetail = ApiSignalEventDetail

useSeoMeta({
  title: '校园热度',
  description: '把学校各站点最新发布的通知聚成事件，按热度排序：新生报到、住宿缴费、奖助学金这类要先办的事排前面。'
})

const { data } = await useFetch<ApiSignalListResponse>('/api/public/signal', {
  query: { limit: 200 },
  default: () => ({ events: [], generatedAt: '' })
})
const { data: reportData } = await useFetch<ApiSignalReportListResponse>('/api/public/signal/reports', {
  query: { kind: 'daily', limit: 3 },
  default: () => ({ kind: 'daily', reports: [] })
})

const events = computed(() => data.value?.events ?? [])
const reports = computed(() => reportData.value?.reports ?? [])

const route = useRoute()
const router = useRouter()

function hashSlug(): string {
  // 生产环境首屏的 route.hash 可能被 hydration 抹成空串，浏览器地址栏才是准的。
  const source = import.meta.client ? window.location.hash : String(route.hash ?? '')
  const raw = source.replace(/^#/, '')
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

// 地图卡片跳过来时带 #slug：只显示这一条，和筛选器一样可一键还原。
// hash 只有浏览器端可见，先留空再在挂载后读取，避免 SSR 与客户端首帧不一致。
const focusSlug = ref('')
const focusEvent = computed(() => {
  if (!focusSlug.value) return null
  return events.value.find(event =>
    event.slug === focusSlug.value || event.id === focusSlug.value
  ) ?? null
})

const activeCategory = ref('全部')
const searchQuery = ref('')
const searchActive = computed(() => normalizeHotSearch(searchQuery.value).length > 0)
const searchedEvents = computed(() => filterHotEvents(events.value, searchQuery.value))
const categories = computed(() => {
  const seen: string[] = []
  for (const event of events.value) {
    if (event.category && !seen.includes(event.category)) seen.push(event.category)
  }
  return ['全部', ...seen]
})

const visibleEvents = computed(() => {
  if (focusSlug.value) return focusEvent.value ? [focusEvent.value] : []
  if (searchActive.value) return searchedEvents.value
  if (activeCategory.value === '全部') return events.value
  return events.value.filter(event => event.category === activeCategory.value)
})

function resetFocus(): void {
  focusSlug.value = ''
  activeCategory.value = '全部'
  searchQuery.value = ''
  void router.replace({ hash: '' })
}

function clearSearch(): void {
  searchQuery.value = ''
}

watch(() => route.hash, () => {
  focusSlug.value = hashSlug()
})

onMounted(() => {
  focusSlug.value = hashSlug()
  if (!focusSlug.value) return
  void nextTick(() => {
    document.getElementById(focusSlug.value)?.scrollIntoView({ block: 'start' })
  })
})

type SignalListRow
  = | { type: 'event', event: ApiSignalListResponse['events'][number] }
    | { type: 'more', count: number }
    | { type: 'notice-more', count: number }

const NOTICE_PREVIEW_COUNT = 5

const showAllNotices = ref(false)
const showNews = ref(false)
const noticeEvents = computed(() => visibleEvents.value.filter(event => event.channel === 'notice'))
const newsEvents = computed(() => visibleEvents.value.filter(event => event.channel !== 'notice'))

// 通知公告排前面，校园动态默认折叠：两者混在一起会把「要办事的」淹掉。
// 通知也只露前 5 条，一百多条铺下来要滚很久。
const listRows = computed<SignalListRow[]>(() => {
  if (focusSlug.value) {
    return focusEvent.value ? [{ type: 'event', event: focusEvent.value }] : []
  }
  if (searchActive.value) {
    return visibleEvents.value.map(event => ({ type: 'event', event }))
  }
  const rows: SignalListRow[] = []
  const notices = showAllNotices.value
    ? noticeEvents.value
    : noticeEvents.value.slice(0, NOTICE_PREVIEW_COUNT)
  for (const event of notices) rows.push({ type: 'event', event })
  if (noticeEvents.value.length > NOTICE_PREVIEW_COUNT) {
    rows.push({ type: 'notice-more', count: noticeEvents.value.length })
  }
  if (newsEvents.value.length > 0) {
    rows.push({ type: 'more', count: newsEvents.value.length })
    if (showNews.value) {
      for (const event of newsEvents.value) rows.push({ type: 'event', event })
    }
  }
  return rows
})

const expanded = ref<string | null>(null)
const details = ref<Record<string, SignalDetail>>({})
const loading = ref<string | null>(null)

async function toggle(slug: string): Promise<void> {
  if (expanded.value === slug) {
    expanded.value = null
    return
  }
  expanded.value = slug
  if (details.value[slug]) return
  loading.value = slug
  try {
    const detail = await $fetch<SignalDetail>(`/api/public/signal/${slug}`)
    details.value = { ...details.value, [slug]: detail }
  } catch {
    expanded.value = null
  } finally {
    loading.value = null
  }
}

const trendLabel = SIGNAL_TREND_LABEL
const trendClass = SIGNAL_TREND_CLASS
const tierClass = SIGNAL_TIER_CLASS
const heatText = signalHeatText
const dayText = signalRelativeTime
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900">
      <div class="page-shell py-4 md:py-5">
        <div class="max-w-2xl">
          <p class="section-kicker">
            校园热度
          </p>
          <h1 class="mt-1 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
            最近有什么新消息
          </h1>
          <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            把教务处、各学院站点的通知和消息聚成一件件事，同一件事多个来源只算一条。时间取官网原文的发布日期，不是入库时间；排序先看热度，再看谁更近。
          </p>

          <div
            v-if="!focusSlug"
            class="mt-4"
          >
            <label
              for="hot-search"
              class="sr-only"
            >搜索通知、活动或地点</label>
            <div class="relative">
              <UIcon
                name="i-lucide-search"
                class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="hot-search"
                v-model="searchQuery"
                type="search"
                enterkeyhint="search"
                autocomplete="off"
                placeholder="搜索通知、活动或地点，如「宏船楼」"
                class="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] pl-9 pr-20 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:bg-zinc-900 dark:text-zinc-100"
              >
              <button
                v-if="searchActive"
                type="button"
                class="absolute right-2 top-1/2 min-h-8 -translate-y-1/2 rounded-md px-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                @click="clearSearch"
              >
                清除
              </button>
            </div>
            <p
              v-if="searchActive"
              class="mt-2 text-xs text-zinc-500 dark:text-zinc-400"
            >
              找到 {{ searchedEvents.length }} 条{{ searchedEvents.length ? '，已按热度排序' : '' }}
            </p>
          </div>
        </div>
      </div>
    </header>

    <section
      v-if="focusSlug"
      class="page-shell pt-4 md:pt-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/50">
        <div class="min-w-0">
          <p class="text-xs text-emerald-700 dark:text-emerald-300">
            已定位到地图点过来的这条
          </p>
          <p class="mt-0.5 truncate text-sm font-semibold text-emerald-950 dark:text-emerald-100">
            {{ focusEvent?.title || '没有找到这条消息' }}
          </p>
        </div>
        <button
          type="button"
          class="min-h-9 shrink-0 rounded-md border border-emerald-300 bg-[var(--surface)] px-3 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-200"
          @click="resetFocus"
        >
          查看全部
        </button>
      </div>
    </section>

    <section
      v-if="!focusSlug && !searchActive && reports.length"
      class="page-shell pt-4 md:pt-5"
    >
      <div class="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 dark:bg-zinc-900">
        <div class="flex items-center justify-between gap-3">
          <p class="section-kicker">
            今日简报
          </p>
          <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ dayText(reports[0]!.generatedAt) }}生成</span>
        </div>
        <p class="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-100">
          {{ reports[0]!.title }}
        </p>
        <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          共 {{ reports[0]!.stats.events }} 条：先列通知公告，再列最近几天的校园动态。
        </p>
        <ul
          v-if="reports[0]!.lead.length"
          class="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3"
        >
          <li
            v-for="item in reports[0]!.lead.slice(0, 2)"
            :key="item.eventId"
            class="flex items-baseline gap-2 text-sm"
          >
            <span class="shrink-0 text-xs text-emerald-700 dark:text-emerald-400">头条</span>
            <a
              :href="`#${item.slug}`"
              class="line-clamp-1 text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-200"
            >{{ item.title }}</a>
          </li>
        </ul>
      </div>
    </section>

    <section class="page-shell py-4 md:py-5">
      <div
        v-if="!focusSlug && !searchActive"
        class="-mx-1 flex snap-x gap-1 overflow-x-auto pb-1"
      >
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          class="min-h-9 shrink-0 snap-start rounded-full px-3 text-sm"
          :class="category === activeCategory
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'"
          @click="activeCategory = category"
        >
          {{ category }}
        </button>
      </div>

      <p
        v-if="!visibleEvents.length"
        class="mt-6 rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        {{ focusSlug
          ? '这条消息可能已经被新的抓取结果替换，点上面的「查看全部」看当前列表。'
          : searchActive
            ? `没有找到包含「${searchQuery.trim()}」的消息。换个关键词，或清除搜索看全部。`
            : '这一类暂时没有新消息。换个分类，或者过一会儿再来看看。' }}
      </p>

      <ul class="mt-3 space-y-2">
        <li
          v-for="(row, index) in listRows"
          :id="row.type === 'event' ? row.event.slug : undefined"
          :key="row.type === 'event' ? row.event.id : `more-${index}`"
          :class="row.type === 'event'
            ? 'scroll-mt-24 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 dark:bg-zinc-900'
            : 'flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--line)] px-4 py-3'"
        >
          <template v-if="row.type === 'notice-more'">
            <span class="text-sm text-zinc-600 dark:text-zinc-300">通知公告 · 共 {{ row.count }} 条</span>
            <button
              type="button"
              class="min-h-8 shrink-0 rounded-md px-2 text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
              @click="showAllNotices = !showAllNotices"
            >
              {{ showAllNotices ? '收起' : `展开全部 ${row.count} 条` }}
            </button>
          </template>
          <template v-else-if="row.type === 'more'">
            <span class="text-sm text-zinc-600 dark:text-zinc-300">校园动态 · {{ row.count }} 条（宣讲、讲堂、活动这类）</span>
            <button
              type="button"
              class="min-h-8 shrink-0 rounded-md px-2 text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
              @click="showNews = !showNews"
            >
              {{ showNews ? '收起' : '展开' }}
            </button>
          </template>
          <template v-else>
            <div class="flex items-start justify-between gap-3">
              <h2 class="line-clamp-2 text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-100">
                <NuxtLink
                  :to="`/hot/${encodeURIComponent(row.event.slug)}`"
                  class="underline-offset-2 hover:underline"
                >{{ row.event.title }}</NuxtLink>
              </h2>
              <span
                class="shrink-0 rounded-md px-2 py-0.5 text-xs"
                :class="trendClass[row.event.trend]"
              >
                {{ trendLabel[row.event.trend] }}
              </span>
            </div>

            <p
              v-if="row.event.summary"
              class="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300"
            >
              {{ row.event.summary }}
            </p>

            <div
              v-if="row.event.places?.length"
              class="mt-2 flex flex-wrap items-center gap-1.5"
            >
              <span class="text-xs text-zinc-500 dark:text-zinc-400">涉及地点</span>
              <NuxtLink
                v-for="tag in row.event.places"
                :key="tag.slug"
                :to="`/map?place=${encodeURIComponent(tag.slug)}`"
                class="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-zinc-700 underline-offset-2 hover:border-[var(--accent)] hover:underline dark:text-zinc-200"
              >{{ tag.name }}</NuxtLink>
            </div>

            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span
                class="rounded px-1.5 py-0.5"
                :class="tierClass[row.event.tier]"
              >{{ row.event.tierLabel }}</span>
              <span>{{ row.event.category }}</span>
              <span>{{ row.event.sourceCount }} 个来源 · {{ row.event.itemCount }} 条</span>
              <span>热度 {{ heatText(row.event.heat) }}</span>
              <span>{{ dayText(row.event.lastSeenAt) }}发布</span>
              <NuxtLink
                :to="`/hot/${encodeURIComponent(row.event.slug)}`"
                class="ml-auto min-h-8 rounded-md px-2 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
              >
                查看详情
              </NuxtLink>
              <button
                type="button"
                class="min-h-8 rounded-md px-2 text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
                @click="toggle(row.event.slug)"
              >
                {{ expanded === row.event.slug ? '收起摘要' : '展开摘要' }}
              </button>
            </div>

            <div
              v-if="expanded === row.event.slug"
              class="mt-3 border-t border-[var(--line)] pt-3"
            >
              <p
                v-if="loading === row.event.slug"
                class="text-sm text-zinc-500 dark:text-zinc-400"
              >
                正在取原文…
              </p>
              <ul
                v-else
                class="space-y-2"
              >
                <li
                  v-for="item in details[row.event.slug]?.items ?? []"
                  :key="item.id"
                  class="text-sm leading-6"
                >
                  <a
                    :href="item.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                  >
                    {{ item.title }}
                  </a>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    {{ item.sourceTitle }}<span v-if="item.isOfficial"> · 官方</span>
                    <span v-if="item.publishedAt"> · {{ dayText(item.publishedAt) }}</span>
                  </p>
                </li>
              </ul>
            </div>
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>
