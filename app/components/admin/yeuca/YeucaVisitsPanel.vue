<script setup lang="ts">
import type { YeucaVisitRange, YeucaVisitsPayload } from '~~/shared/types/yeuca'
import { adminFetch } from '~~/app/utils/admin-request'

const toast = useToast()

const range = ref<YeucaVisitRange>('24h')
const loading = ref(false)
const data = ref<YeucaVisitsPayload | null>(null)

const ipFilter = ref('')
const onlyBots = ref(false)
const page = ref(1)

const banTarget = ref('')
const banReason = ref('')
const banHours = ref(24)
const banModalOpen = ref(false)
const banning = ref(false)

const RANGES: Array<{ value: YeucaVisitRange, label: string }> = [
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' }
]

const ACTION_LABEL: Record<string, string> = {
  page_view: '浏览',
  api: '接口',
  blocked: '已拦截'
}

const summary = computed(() => data.value?.summary)
const topPathMax = computed(() => Math.max(1, ...(summary.value?.topPaths ?? []).map(p => p.hits)))
const seriesMax = computed(() => Math.max(1, ...(summary.value?.series ?? []).map(p => p.hits)))
const seriesFirstLabel = computed(() => summary.value?.series[0]?.label ?? '')
const seriesLastLabel = computed(() => {
  const series = summary.value?.series ?? []
  return series[series.length - 1]?.label ?? ''
})

function getErrDesc(err: unknown, fallback = '请求失败'): string {
  const e = err as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message || e?.statusMessage || fallback
}

function formatTime(ms: number | null | undefined): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shortUa(ua: string): string {
  if (!ua) return '空 UA'
  const text = ua.replace(/\s+/g, ' ')
  return text.length > 58 ? `${text.slice(0, 58)}…` : text
}

function statusTone(code: number | null): string {
  if (!code) return 'text-zinc-500'
  if (code >= 500) return 'text-red-600 dark:text-red-400'
  if (code >= 400) return 'text-amber-600 dark:text-amber-400'
  return 'text-emerald-600 dark:text-emerald-400'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const query = new URLSearchParams({ range: range.value, page: String(page.value), pageSize: '50' })
    if (ipFilter.value.trim()) query.set('ip', ipFilter.value.trim())
    if (onlyBots.value) query.set('onlyBots', '1')
    data.value = await adminFetch<YeucaVisitsPayload>(`/api/admin/yeuca/visits?${query.toString()}`)
  } catch (err) {
    toast.add({ title: '访问记录取不到', description: getErrDesc(err), color: 'error' })
  } finally {
    loading.value = false
  }
}

function switchRange(next: YeucaVisitRange): void {
  if (range.value === next) return
  range.value = next
  page.value = 1
  void load()
}

function applyFilter(): void {
  page.value = 1
  void load()
}

function toggleOnlyBots(): void {
  onlyBots.value = !onlyBots.value
  applyFilter()
}

function turnPage(delta: number): void {
  const pages = data.value?.pagination.pages ?? 1
  const next = Math.min(pages, Math.max(1, page.value + delta))
  if (next === page.value) return
  page.value = next
  void load()
}

function openBan(ip: string, reason = ''): void {
  banTarget.value = ip
  banReason.value = reason
  banHours.value = 24
  banModalOpen.value = true
}

async function submitBan(): Promise<void> {
  if (!banTarget.value) return
  banning.value = true
  try {
    await adminFetch('/api/admin/yeuca/visits/ban', {
      method: 'POST',
      body: {
        ip: banTarget.value,
        action: 'ban',
        reason: banReason.value.trim() || '手动封禁',
        hours: Number(banHours.value) || 24
      }
    })
    toast.add({ title: `已封 ${banTarget.value}`, color: 'success' })
    banModalOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: '封禁失败', description: getErrDesc(err), color: 'error' })
  } finally {
    banning.value = false
  }
}

async function unban(ip: string): Promise<void> {
  try {
    await adminFetch('/api/admin/yeuca/visits/ban', {
      method: 'POST',
      body: { ip, action: 'unban' }
    })
    toast.add({ title: `已解封 ${ip}`, color: 'success' })
    await load()
  } catch (err) {
    toast.add({ title: '解封失败', description: getErrDesc(err), color: 'error' })
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="space-y-3.5">
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
            访问记录
          </h2>
          <p class="mt-1 text-xs text-zinc-500">
            官网每来一次请求记一行，脚本和爬虫单独标出来。数据留 {{ data?.retentionDays ?? 30 }} 天。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <UButton
            v-for="item in RANGES"
            :key="item.value"
            size="xs"
            :variant="range === item.value ? 'solid' : 'outline'"
            :color="range === item.value ? 'primary' : 'neutral'"
            :class="range === item.value ? '!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white' : ''"
            :label="item.label"
            @click="switchRange(item.value)"
          />
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            icon="i-lucide-refresh-cw"
            label="刷新"
            :loading="loading"
            @click="load"
          />
        </div>
      </div>

      <div class="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <p class="text-xs text-zinc-500">
            请求数
          </p>
          <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ summary?.hits ?? 0 }}
          </p>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <p class="text-xs text-zinc-500">
            页面浏览
          </p>
          <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ summary?.pageViews ?? 0 }}
          </p>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <p class="text-xs text-zinc-500">
            独立 IP
          </p>
          <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ summary?.ips ?? 0 }}
          </p>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <p class="text-xs text-zinc-500">
            机器流量
          </p>
          <p class="mt-1 flex items-baseline gap-1.5 text-xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ summary?.botHits ?? 0 }}
            <span class="text-xs font-medium text-zinc-500">{{ summary?.botRate ?? 0 }}%</span>
          </p>
        </div>
      </div>

      <div class="mt-3 flex h-24 items-end gap-[2px]">
        <div
          v-for="(point, index) in summary?.series ?? []"
          :key="index"
          class="group relative flex-1 rounded-t bg-[#a8121e]/25 hover:bg-[#a8121e]"
          :style="{ height: `${Math.max(2, Math.round((point.hits / seriesMax) * 92))}px` }"
          :title="`${point.label} · ${point.hits}`"
        />
      </div>
      <div class="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{{ seriesFirstLabel }}</span>
        <span>{{ seriesLastLabel }}</span>
      </div>
    </div>

    <div
      v-if="(summary?.bursts.length ?? 0) > 0"
      class="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 p-3.5"
    >
      <p class="text-xs font-bold text-amber-900 dark:text-amber-200">
        一小时内机器请求 ≥ 30 次的 IP
      </p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="item in summary?.bursts ?? []"
          :key="item.ip"
          class="inline-flex items-center gap-1.5 rounded-md border border-amber-300 dark:border-amber-700/60 bg-white/70 dark:bg-zinc-900 px-2 py-1 font-mono text-xs"
        >
          {{ item.ip }}
          <span class="text-zinc-500">{{ item.hits }} 次</span>
          <UButton
            v-if="!item.banned"
            size="xs"
            variant="link"
            color="error"
            label="封"
            @click="openBan(item.ip, '短时高频机器请求')"
          />
          <span
            v-else
            class="text-red-600 dark:text-red-400"
          >已封</span>
        </span>
      </div>
    </div>

    <div class="grid gap-3.5 lg:grid-cols-2">
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4">
        <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
          访问最多的页面
        </h3>
        <div
          v-if="(summary?.topPaths.length ?? 0) === 0"
          class="mt-3 text-xs text-zinc-500"
        >
          还没有记录。
        </div>
        <ul
          v-else
          class="mt-2 space-y-1.5"
        >
          <li
            v-for="item in summary?.topPaths ?? []"
            :key="item.path"
            class="text-xs"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate font-mono text-zinc-700 dark:text-zinc-300">{{ item.path }}</span>
              <span class="shrink-0 text-zinc-500">{{ item.hits }} · {{ item.ips }} IP</span>
            </div>
            <div class="mt-1 h-1 rounded bg-zinc-100 dark:bg-zinc-800">
              <div
                class="h-1 rounded bg-[#a8121e]/60"
                :style="{ width: `${Math.round((item.hits / topPathMax) * 100)}%` }"
              />
            </div>
          </li>
        </ul>
      </div>

      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4">
        <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
          来路 IP
        </h3>
        <div
          v-if="(summary?.topIps.length ?? 0) === 0"
          class="mt-3 text-xs text-zinc-500"
        >
          还没有记录。
        </div>
        <ul
          v-else
          class="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          <li
            v-for="item in summary?.topIps ?? []"
            :key="item.ip"
            class="flex items-center justify-between gap-2 py-1.5 text-xs"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-zinc-800 dark:text-zinc-200">{{ item.ip }}</span>
                <UBadge
                  v-if="item.isBot"
                  :label="item.botName || '机器'"
                  color="warning"
                  variant="soft"
                  size="xs"
                />
                <UBadge
                  v-if="item.banned"
                  label="已封"
                  color="error"
                  variant="soft"
                  size="xs"
                />
              </div>
              <p class="mt-0.5 text-[11px] text-zinc-500">
                <span>{{ item.locationLabel }}</span>
                <span> · {{ item.hits }} 次</span>
                <span> · {{ item.paths }} 个页面</span>
                <span> · {{ formatTime(item.lastAt) }}</span>
              </p>
            </div>
            <UButton
              v-if="!item.banned"
              size="xs"
              variant="soft"
              color="error"
              label="封禁"
              @click="openBan(item.ip)"
            />
            <UButton
              v-else
              size="xs"
              variant="soft"
              color="neutral"
              label="解封"
              @click="unban(item.ip)"
            />
          </li>
        </ul>
      </div>
    </div>

    <div
      v-if="(summary?.bans.length ?? 0) > 0"
      class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4"
    >
      <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
        封禁中的 IP
      </h3>
      <ul class="mt-2 flex flex-wrap gap-1.5">
        <li
          v-for="item in summary?.bans ?? []"
          :key="item.ip"
          class="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs"
        >
          <span class="font-mono">{{ item.ip }}</span>
          <span class="text-zinc-500">{{ item.reason }}</span>
          <span class="text-zinc-400">到 {{ formatTime(item.expiresAt) }}</span>
          <UButton
            size="xs"
            variant="link"
            color="neutral"
            label="解封"
            @click="unban(item.ip)"
          />
        </li>
      </ul>
    </div>

    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-1.5">
          <UInput
            v-model="ipFilter"
            size="xs"
            placeholder="按 IP 或路径过滤"
            icon="i-lucide-search"
            class="w-56"
            @keyup.enter="applyFilter"
          />
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            label="查询"
            @click="applyFilter"
          />
          <UButton
            size="xs"
            :variant="onlyBots ? 'solid' : 'outline'"
            :color="onlyBots ? 'warning' : 'neutral'"
            label="只看机器"
            @click="toggleOnlyBots"
          />
        </div>
        <span class="text-xs text-zinc-500">
          共 {{ data?.pagination.total ?? 0 }} 行 · 第 {{ data?.pagination.page ?? 1 }}/{{ data?.pagination.pages ?? 1 }} 页
        </span>
      </div>

      <div class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[880px] text-left text-xs">
          <thead class="text-zinc-500">
            <tr class="border-b border-zinc-200 dark:border-zinc-800">
              <th class="py-1.5 pr-2 font-medium">
                时间
              </th>
              <th class="py-1.5 pr-2 font-medium">
                IP
              </th>
              <th class="py-1.5 pr-2 font-medium">
                动作
              </th>
              <th class="py-1.5 pr-2 font-medium">
                路径
              </th>
              <th class="py-1.5 pr-2 font-medium">
                状态
              </th>
              <th class="py-1.5 pr-2 font-medium">
                耗时
              </th>
              <th class="py-1.5 pr-2 font-medium">
                UA
              </th>
              <th class="py-1.5 pr-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data?.rows ?? []"
              :key="row.id"
              class="border-b border-zinc-100 dark:border-zinc-800/60"
            >
              <td class="whitespace-nowrap py-1.5 pr-2 text-zinc-500">
                {{ formatTime(row.createdAt) }}
              </td>
              <td class="whitespace-nowrap py-1.5 pr-2">
                <div class="flex items-baseline gap-1.5">
                  <span class="font-mono">{{ row.ip }}</span>
                  <span class="text-[11px] text-zinc-400">{{ row.locationLabel }}</span>
                </div>
              </td>
              <td class="whitespace-nowrap py-1.5 pr-2">
                <UBadge
                  :label="ACTION_LABEL[row.action] ?? row.action"
                  :color="row.action === 'blocked' ? 'error' : row.action === 'api' ? 'neutral' : 'success'"
                  variant="soft"
                  size="xs"
                />
                <UBadge
                  v-if="row.isBot"
                  :label="row.botName || '机器'"
                  color="warning"
                  variant="outline"
                  size="xs"
                  class="ml-1"
                />
              </td>
              <td class="max-w-[240px] truncate py-1.5 pr-2 font-mono text-zinc-700 dark:text-zinc-300">
                {{ row.path }}
              </td>
              <td
                class="whitespace-nowrap py-1.5 pr-2"
                :class="statusTone(row.status)"
              >
                {{ row.status ?? '—' }}
              </td>
              <td class="whitespace-nowrap py-1.5 pr-2 text-zinc-500">
                {{ row.durationMs === null ? '—' : `${row.durationMs} ms` }}
              </td>
              <td
                class="max-w-[260px] truncate py-1.5 pr-2 text-zinc-500"
                :title="row.userAgent"
              >
                {{ shortUa(row.userAgent) }}
              </td>
              <td class="whitespace-nowrap py-1.5 pr-2 text-right">
                <UButton
                  v-if="!row.banned && row.ip !== '未知'"
                  size="xs"
                  variant="link"
                  color="error"
                  label="封"
                  @click="openBan(row.ip)"
                />
                <UButton
                  v-else-if="row.banned"
                  size="xs"
                  variant="link"
                  color="neutral"
                  label="解封"
                  @click="unban(row.ip)"
                />
              </td>
            </tr>
            <tr v-if="(data?.rows.length ?? 0) === 0">
              <td
                colspan="8"
                class="py-10 text-center text-sm text-zinc-500"
              >
                这段时间没有访问记录。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex items-center justify-end gap-1.5">
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          label="上一页"
          :disabled="(data?.pagination.page ?? 1) <= 1"
          @click="turnPage(-1)"
        />
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          label="下一页"
          :disabled="(data?.pagination.page ?? 1) >= (data?.pagination.pages ?? 1)"
          @click="turnPage(1)"
        />
      </div>
    </div>

    <div
      v-if="banModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="banModalOpen = false"
    >
      <div class="w-full max-w-md rounded-xl bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-3">
        <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
          封禁 {{ banTarget }}
        </h3>
        <UFormField label="原因">
          <UInput
            v-model="banReason"
            size="sm"
            placeholder="手动封禁"
            class="w-full"
          />
        </UFormField>
        <UFormField label="时长（小时）">
          <UInput
            v-model="banHours"
            type="number"
            min="1"
            max="8760"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-1.5 pt-1">
          <UButton
            size="sm"
            variant="soft"
            color="neutral"
            label="取消"
            @click="banModalOpen = false"
          />
          <UButton
            size="sm"
            color="error"
            label="确认封禁"
            :loading="banning"
            @click="submitBan"
          />
        </div>
      </div>
    </div>
  </div>
</template>
