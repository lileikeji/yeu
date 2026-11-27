<script setup lang="ts">
import type { CompetitionPopularityVisitReport } from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'

const loading = ref(false)
const loadError = ref('')
const report = ref<CompetitionPopularityVisitReport | null>(null)
const range = ref<'today' | '24h' | '7d' | '30d' | 'all'>('today')
const source = ref<'' | 'wechat' | 'direct' | 'miniapp'>('')
const keyword = ref('')
const page = ref(1)

const summary = computed(() => report.value?.summary ?? null)

const statCards = computed(() => {
  const data = summary.value
  if (!data) return []
  return [
    { label: '累计访问', value: data.visitsAll, hint: `独立访客 ${data.visitorsAll}` },
    { label: '今日访问', value: data.visitsToday, hint: `公众号进入 ${data.ticketVisitsToday}` },
    { label: '新关注', value: data.followsAll, hint: `今日 +${data.followsToday}` },
    { label: '有效投票', value: data.votesAll, hint: `今日 +${data.votesToday}` }
  ]
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const query = new URLSearchParams({ range: range.value, page: String(page.value), pageSize: '50' })
    if (source.value) query.set('source', source.value)
    if (keyword.value.trim()) query.set('q', keyword.value.trim())
    const data = await adminFetch<{ report: CompetitionPopularityVisitReport }>(
      `/api/admin/competition/popularity/visits?${query.toString()}`
    )
    report.value = data.report
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载访问记录失败'
  } finally {
    loading.value = false
  }
}

function formatTime(value: number): string {
  const date = new Date(value)
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function sourceLabel(row: { source: string, hasTicket: boolean }): string {
  if (row.source === 'miniapp') return '小程序'
  if (row.hasTicket) return '公众号链接'
  return '直接打开'
}

function changeRange(next: typeof range.value) {
  range.value = next
  page.value = 1
  load()
}

function changePage(next: number) {
  page.value = next
  load()
}

watch(source, () => changeRange(range.value))
onMounted(load)
</script>

<template>
  <div class="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          投票页访问日志
        </h3>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          手机型号 / 系统 / 浏览器 / IP 全部记录，公众号链接与直接打开分开统计。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
          <button
            v-for="option in ([['today', '今天'], ['24h', '24 小时'], ['7d', '7 天'], ['30d', '30 天'], ['all', '全部']] as const)"
            :key="option[0]"
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="range === option[0]
              ? 'bg-zinc-900 text-white dark:bg-zinc-700'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="changeRange(option[0])"
          >
            {{ option[1] }}
          </button>
        </div>
        <select
          v-model="source"
          class="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
        >
          <option value="">
            全部来源
          </option>
          <option value="wechat">
            公众号链接
          </option>
          <option value="direct">
            直接打开
          </option>
          <option value="miniapp">
            小程序
          </option>
        </select>
        <input
          v-model="keyword"
          type="search"
          placeholder="IP / 机型"
          class="w-32 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
          @keydown.enter="changeRange(range)"
        >
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="load"
        >
          刷新
        </UButton>
      </div>
    </div>

    <div
      v-if="statCards.length"
      class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <div
        v-for="card in statCards"
        :key="card.label"
        class="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
      >
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          {{ card.label }}
        </p>
        <p class="mt-0.5 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {{ card.value }}
        </p>
        <p class="text-[11px] text-zinc-400">
          {{ card.hint }}
        </p>
      </div>
    </div>

    <p
      v-if="summary"
      class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
    >
      <span>区间访问 {{ summary.rangePv }}</span>
      <span>区间访客 {{ summary.rangeUv }}</span>
      <span>公众号进入 {{ summary.rangeTicketPv }}</span>
      <span>直接打开 {{ summary.rangeDirectPv }}</span>
      <span>微信内置浏览器 {{ summary.rangeWechatUaPv }}</span>
      <span v-if="summary.rangeBotPv">机器流量 {{ summary.rangeBotPv }}</span>
    </p>

    <p
      v-if="loadError"
      class="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {{ loadError }}
    </p>

    <div class="mt-3 grid gap-3 lg:grid-cols-2">
      <div>
        <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          机型 Top
        </p>
        <ul class="mt-1 space-y-1 text-xs">
          <li
            v-for="device in summary?.topDevices ?? []"
            :key="device.label"
            class="flex items-center justify-between gap-2"
          >
            <span class="truncate text-zinc-700 dark:text-zinc-300">{{ device.label }}</span>
            <span class="tabular-nums text-zinc-500">{{ device.hits }} 次 / {{ device.visitors }} 人</span>
          </li>
          <li
            v-if="!summary?.topDevices?.length"
            class="text-zinc-400"
          >
            暂无数据
          </li>
        </ul>
      </div>
      <div>
        <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          浏览器 Top
        </p>
        <ul class="mt-1 space-y-1 text-xs">
          <li
            v-for="browser in summary?.topBrowsers ?? []"
            :key="browser.label"
            class="flex items-center justify-between gap-2"
          >
            <span class="truncate text-zinc-700 dark:text-zinc-300">{{ browser.label }}</span>
            <span class="tabular-nums text-zinc-500">{{ browser.hits }} 次</span>
          </li>
          <li
            v-if="!summary?.topBrowsers?.length"
            class="text-zinc-400"
          >
            暂无数据
          </li>
        </ul>
      </div>
    </div>

    <div class="mt-3 overflow-x-auto">
      <table class="w-full min-w-[960px] text-sm">
        <thead class="text-left text-xs text-zinc-500 dark:text-zinc-400">
          <tr>
            <th class="py-2 pr-3 font-medium">
              时间
            </th>
            <th class="py-2 pr-3 font-medium">
              来源
            </th>
            <th class="py-2 pr-3 font-medium">
              机型
            </th>
            <th class="py-2 pr-3 font-medium">
              系统
            </th>
            <th class="py-2 pr-3 font-medium">
              浏览器
            </th>
            <th class="py-2 pr-3 font-medium">
              IP
            </th>
            <th class="py-2 pr-3 font-medium">
              地区
            </th>
            <th class="py-2 font-medium">
              页面
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <tr
            v-for="row in report?.rows ?? []"
            :key="row.id"
            class="align-top"
          >
            <td class="whitespace-nowrap py-2 pr-3 text-xs tabular-nums text-zinc-500">
              {{ formatTime(row.createdAt) }}
            </td>
            <td class="py-2 pr-3 text-xs">
              <span
                class="rounded-full px-2 py-0.5 font-medium"
                :class="row.hasTicket
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'"
              >
                {{ sourceLabel(row) }}
              </span>
            </td>
            <td class="py-2 pr-3 text-xs text-zinc-700 dark:text-zinc-300">
              {{ row.deviceLabel }}
            </td>
            <td class="py-2 pr-3 text-xs text-zinc-500">
              {{ row.osLabel || '—' }}
            </td>
            <td class="py-2 pr-3 text-xs text-zinc-500">
              {{ row.browserLabel || '—' }}
            </td>
            <td class="select-all py-2 pr-3 text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
              {{ row.ip }}
            </td>
            <td class="py-2 pr-3 text-xs text-zinc-500">
              {{ row.locationLabel }}
            </td>
            <td class="py-2 text-xs text-zinc-500">
              {{ row.page }}
            </td>
          </tr>
          <tr v-if="!report?.rows?.length">
            <td
              colspan="8"
              class="py-6 text-center text-xs text-zinc-400"
            >
              还没有访问记录
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="report && report.pagination.pages > 1"
      class="mt-3 flex items-center justify-between text-xs text-zinc-500"
    >
      <span>共 {{ report.pagination.total }} 条</span>
      <div class="flex gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          :disabled="report.pagination.page <= 1"
          @click="changePage(report.pagination.page - 1)"
        >
          上一页
        </UButton>
        <span class="self-center tabular-nums">{{ report.pagination.page }} / {{ report.pagination.pages }}</span>
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          :disabled="report.pagination.page >= report.pagination.pages"
          @click="changePage(report.pagination.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>
</template>
