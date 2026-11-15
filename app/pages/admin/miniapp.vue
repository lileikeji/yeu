<script setup lang="ts">
import { adminFetch } from '~~/app/utils/admin-request'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '小程序分析', robots: 'noindex, nofollow' })

type Bucket = { key: string, events: number, visitors: number }
type Analytics = {
  window: { hours: number, since: string, until: string }
  totals: { events: number, visitors: number }
  pages: Array<Bucket & { pathname: string }>
  events: Bucket[]
  sources: Bucket[]
  versions: Bucket[]
  devices: Bucket[]
  userAgents: Bucket[]
  api: Array<{
    route: string
    status: number | null
    requestCount: number
    errorCount: number
    latencyMs: { count: number, average: number, p50: number | null, p95: number | null, max: number | null }
  }>
  raw?: { userAgents: string[], ips: string[] }
}

const loading = ref(false)
const errorMessage = ref('')
const hours = ref(24)
const data = ref<Analytics | null>(null)

const eventLabels: Record<string, string> = {
  page_view: '页面浏览',
  module_view: '模块进入',
  search_submit: '发起搜索',
  result_click: '点开结果',
  map_marker_select: '点地图标记',
  open_location: '打开导航',
  route_plan: '规划步行路线',
  api_request: '接口调用',
  api_error: '接口错误',
  feedback_open: '打开反馈'
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatTime(value: number | null): string {
  if (value == null) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function eventLabel(key: string): string {
  return eventLabels[key] ?? key
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await adminFetch<Analytics>('/api/admin/miniapp/analytics', { query: { hours: hours.value } })
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '小程序分析暂时无法加载')
  } finally {
    loading.value = false
  }
}

function changeWindow(value: string): void {
  hours.value = Number(value)
  void load()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          小程序 / 访问分析
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
          看用户怎么使用值班台
        </h1>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="hours"
          class="h-10 rounded-md border border-zinc-300 bg-[var(--surface)] px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          @change="changeWindow(String(hours))"
        >
          <option :value="24">
            最近 24 小时
          </option>
          <option :value="72">
            最近 3 天
          </option>
          <option :value="168">
            最近 7 天
          </option>
          <option :value="720">
            最近 30 天
          </option>
        </select>
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          :loading="loading"
          @click="load"
        />
      </div>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
    />
    <div
      v-if="loading && !data"
      class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
    >
      正在整理小程序访问数据…
    </div>

    <template v-if="data">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs text-zinc-500">
            事件总量
          </p><p class="mt-2 text-3xl font-bold tabular-nums">
            {{ formatNumber(data.totals.events) }}
          </p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs text-zinc-500">
            独立访客
          </p><p class="mt-2 text-3xl font-bold tabular-nums">
            {{ formatNumber(data.totals.visitors) }}
          </p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs text-zinc-500">
            页面入口
          </p><p class="mt-2 text-3xl font-bold tabular-nums">
            {{ formatNumber(data.pages.length) }}
          </p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs text-zinc-500">
            接口错误事件
          </p><p class="mt-2 text-3xl font-bold tabular-nums">
            {{ formatNumber(data.api.reduce((sum, item) => sum + item.errorCount, 0)) }}
          </p>
        </div>
      </div>

      <div class="grid gap-5 xl:grid-cols-2">
        <section class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold">
              页面与入口
            </h2><span class="text-xs text-zinc-500">按事件量</span>
          </div>
          <div
            v-if="data.pages.length"
            class="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800"
          >
            <div
              v-for="item in data.pages.slice(0, 8)"
              :key="item.pathname"
              class="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <span class="min-w-0 truncate text-zinc-600 dark:text-zinc-300">{{ item.pathname }}</span><span class="shrink-0 tabular-nums text-zinc-500">{{ item.events }} 次 / {{ item.visitors }} 人</span>
            </div>
          </div>
          <p
            v-else
            class="mt-5 text-sm text-zinc-500"
          >
            暂无事件。小程序首次打开后会逐步出现数据。
          </p>
        </section>

        <section class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold">
              行为分布
            </h2><span class="text-xs text-zinc-500">事件类型</span>
          </div>
          <div
            v-if="data.events.length"
            class="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800"
          >
            <div
              v-for="item in data.events"
              :key="item.key"
              class="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <span class="min-w-0 truncate text-zinc-600 dark:text-zinc-300">{{ eventLabel(item.key) }}</span><span class="shrink-0 tabular-nums text-zinc-500">{{ item.events }} 次 / {{ item.visitors }} 人</span>
            </div>
          </div>
          <p
            v-else
            class="mt-5 text-sm text-zinc-500"
          >
            暂无行为事件。
          </p>
        </section>
      </div>

      <div class="grid gap-5 xl:grid-cols-3">
        <section class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold">
              版本
            </h2><span class="text-xs text-zinc-500">客户端自报</span>
          </div>
          <div
            v-for="item in data.versions.slice(0, 6)"
            :key="item.key"
            class="mt-2 flex justify-between text-sm"
          >
            <span>{{ item.key || '未上报' }}</span><span class="tabular-nums text-zinc-500">{{ item.events }}</span>
          </div>
          <p
            v-if="!data.versions.length"
            class="mt-3 text-sm text-zinc-500"
          >
            暂无版本数据。
          </p>
        </section>

        <section class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold">
              来源场景
            </h2><span class="text-xs text-zinc-500">envVersion / 启动场景</span>
          </div>
          <div
            v-for="item in data.sources.slice(0, 6)"
            :key="item.key"
            class="mt-2 flex justify-between text-sm"
          >
            <span>{{ item.key || '未上报' }}</span><span class="tabular-nums text-zinc-500">{{ item.events }}</span>
          </div>
          <p
            v-if="!data.sources.length"
            class="mt-3 text-sm text-zinc-500"
          >
            暂无来源数据。
          </p>
        </section>

        <section class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold">
              机型 / 系统
            </h2><span class="text-xs text-zinc-500">UA 归类</span>
          </div>
          <div
            v-for="item in data.userAgents.slice(0, 6)"
            :key="item.key"
            class="mt-2 flex justify-between text-sm"
          >
            <span>{{ item.key }}</span><span class="tabular-nums text-zinc-500">{{ item.events }}</span>
          </div>
          <p
            v-if="!data.userAgents.length"
            class="mt-3 text-sm text-zinc-500"
          >
            暂无机型数据。
          </p>
        </section>
      </div>

      <section class="rounded-lg border border-zinc-200 bg-[var(--surface)] p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-baseline justify-between">
          <h2 class="font-semibold">
            接口状态与延迟
          </h2><span class="text-xs text-zinc-500">客户端上报的安全摘要</span>
        </div>
        <div class="mt-4 overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="text-xs text-zinc-500">
              <tr>
                <th class="px-3 py-2">
                  接口
                </th><th class="px-3 py-2">
                  次数
                </th><th class="px-3 py-2">
                  错误
                </th><th class="px-3 py-2">
                  平均
                </th><th class="px-3 py-2">
                  P50
                </th><th class="px-3 py-2">
                  P95
                </th><th class="px-3 py-2">
                  最慢
                </th>
              </tr>
            </thead><tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr
                v-for="item in data.api.slice(0, 12)"
                :key="item.route"
              >
                <td class="max-w-[22rem] truncate px-3 py-3 font-mono text-xs">
                  {{ item.route }}
                </td><td class="px-3 py-3 tabular-nums">
                  {{ item.requestCount }}
                </td><td
                  class="px-3 py-3 tabular-nums"
                  :class="item.errorCount ? 'text-red-700' : 'text-emerald-700'"
                >
                  {{ item.errorCount }}
                </td><td class="px-3 py-3 tabular-nums">
                  {{ formatTime(item.latencyMs.average) }}
                </td><td class="px-3 py-3 tabular-nums">
                  {{ formatTime(item.latencyMs.p50) }}
                </td><td class="px-3 py-3 tabular-nums">
                  {{ formatTime(item.latencyMs.p95) }}
                </td><td class="px-3 py-3 tabular-nums">
                  {{ formatTime(item.latencyMs.max) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="!data.api.length"
          class="mt-4 text-sm text-zinc-500"
        >
          暂无接口数据。小程序请求过一次接口后就会出现。
        </p>
      </section>

      <section
        v-if="data.raw"
        class="rounded-lg border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/20"
      >
        <h2 class="font-semibold text-amber-950 dark:text-amber-100">
          总管理员可见的原始字段
        </h2>
        <p class="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80">
          仅用于排查兼容性，不用于用户画像；查看权限应保留审计。
        </p>
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p class="text-xs font-semibold text-amber-900/70 dark:text-amber-200/70">
              UA 样本 {{ data.raw.userAgents.length }} 条
            </p>
            <ul class="mt-2 max-h-56 space-y-1 overflow-y-auto break-all font-mono text-xs text-amber-950/80 dark:text-amber-100/80">
              <li
                v-for="ua in data.raw.userAgents"
                :key="ua"
              >
                {{ ua }}
              </li>
            </ul>
          </div>
          <div>
            <p class="text-xs font-semibold text-amber-900/70 dark:text-amber-200/70">
              IP 样本 {{ data.raw.ips.length }} 条
            </p>
            <ul class="mt-2 max-h-56 space-y-1 overflow-y-auto font-mono text-xs text-amber-950/80 dark:text-amber-100/80">
              <li
                v-for="ip in data.raw.ips"
                :key="ip"
              >
                {{ ip }}
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
