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

const activeCategory = ref('全部')
const categories = computed(() => {
  const seen: string[] = []
  for (const event of events.value) {
    if (event.category && !seen.includes(event.category)) seen.push(event.category)
  }
  return ['全部', ...seen]
})

const visibleEvents = computed(() => {
  if (activeCategory.value === '全部') return events.value
  return events.value.filter(event => event.category === activeCategory.value)
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
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
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
        </div>
      </div>
    </header>

    <section
      v-if="reports.length"
      class="page-shell pt-4 md:pt-5"
    >
      <div class="rounded-xl border border-[var(--line)] bg-white p-4 dark:bg-zinc-900">
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
      </div>
    </section>

    <section class="page-shell py-4 md:py-5">
      <div class="-mx-1 flex snap-x gap-1 overflow-x-auto pb-1">
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
        这一类暂时没有新消息。换个分类，或者过一会儿再来看看。
      </p>

      <ul class="mt-3 space-y-2">
        <li
          v-for="(row, index) in listRows"
          :key="row.type === 'event' ? row.event.id : `more-${index}`"
          :class="row.type === 'event'
            ? 'rounded-xl border border-[var(--line)] bg-white p-4 dark:bg-zinc-900'
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
                {{ row.event.title }}
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

            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span
                class="rounded px-1.5 py-0.5"
                :class="tierClass[row.event.tier]"
              >{{ row.event.tierLabel }}</span>
              <span>{{ row.event.category }}</span>
              <span>{{ row.event.sourceCount }} 个来源 · {{ row.event.itemCount }} 条</span>
              <span>热度 {{ heatText(row.event.heat) }}</span>
              <span>{{ dayText(row.event.lastSeenAt) }}发布</span>
              <button
                type="button"
                class="ml-auto min-h-8 rounded-md px-2 text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
                @click="toggle(row.event.slug)"
              >
                {{ expanded === row.event.slug ? '收起原文' : '看原文' }}
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
