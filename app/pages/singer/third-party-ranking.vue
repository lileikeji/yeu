<script setup lang="ts">
import type { ThirdPartyRankingPayload } from '~~/shared/types'

definePageMeta({ layout: false })

useSeoMeta({ title: '人气投票实时榜', robots: 'noindex, nofollow' })

const REFRESH_MS = 30_000

const payload = ref<ThirdPartyRankingPayload | null>(null)
const error = ref('')
const loading = ref(true)
const refreshedAt = ref(0)

const entries = computed(() => payload.value?.entries ?? [])
const totals = computed(() => payload.value?.totals ?? { received: 0, valid: 0, watch: 0, voided: 0 })
const hasVotes = computed(() => totals.value.received > 0)
const leaderValid = computed(() => Math.max(1, entries.value[0]?.valid ?? 1))

function refreshedText(): string {
  if (!refreshedAt.value) return ''
  return new Date(refreshedAt.value).toLocaleTimeString('zh-CN', { hour12: false })
}

function messageOf(caught: unknown): string {
  const data = (caught as { data?: { message?: string } })?.data
  return data?.message ?? (caught as { message?: string })?.message ?? '榜单暂时取不到，稍后自动重试。'
}

async function load(): Promise<void> {
  try {
    payload.value = await plainFetch<ThirdPartyRankingPayload>(
      '/api/public/competition/popularity/third-party-ranking'
    )
    refreshedAt.value = Date.now()
    error.value = ''
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  void load()
  // 页面在后台时不发请求，切回来立刻补一次。
  timer = setInterval(() => {
    if (!document.hidden) void load()
  }, REFRESH_MS)
  document.addEventListener('visibilitychange', onVisible)
})

function onVisible(): void {
  if (!document.hidden) void load()
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <div class="singer-canvas min-h-dvh px-4 py-6 text-[var(--ink)]">
    <div class="mx-auto w-full max-w-3xl space-y-4">
      <header class="text-center">
        <p class="text-xs tracking-[0.24em] text-rose-600">
          仰恩大学音乐协会 · 新声歌手大赛
        </p>
        <h1 class="mt-2 text-3xl font-black tracking-tight">
          人气投票实时榜
        </h1>
        <p class="mt-2 text-sm text-[var(--muted-ink)]">
          数据来自微信投票表单，每 30 秒自动刷新。
        </p>
        <div class="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span class="rounded-full bg-[var(--surface)] px-3 py-1 font-medium shadow-sm">
            {{ totals.valid }} 票有效
          </span>
          <span class="rounded-full bg-[var(--surface)] px-3 py-1 text-[var(--muted-ink)] shadow-sm">
            共 {{ totals.received }} 次提交
          </span>
          <span
            v-if="totals.watch"
            class="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800"
          >
            {{ totals.watch }} 票待复核
          </span>
          <span
            v-if="refreshedText()"
            class="rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-[var(--muted-ink)]"
          >
            {{ refreshedText() }} 更新
          </span>
        </div>
      </header>

      <p
        v-if="error"
        class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ error }}
      </p>

      <div
        v-if="loading"
        class="rounded-2xl bg-[var(--surface)] px-4 py-16 text-center text-sm text-[var(--muted-ink)] shadow-sm"
      >
        正在统计票数…
      </div>

      <p
        v-else-if="!hasVotes"
        class="rounded-2xl bg-[var(--surface)] px-4 py-16 text-center text-sm text-[var(--muted-ink)] shadow-sm"
      >
        还没有人投票，第一个投出的人会立刻出现在这里。
      </p>

      <ol
        v-else
        class="space-y-3"
      >
        <li
          v-for="item in entries"
          :key="item.optionId"
          class="rounded-2xl bg-[var(--surface)] p-4 shadow-sm"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black"
              :class="item.rank === 1 && item.valid > 0
                ? 'bg-rose-600 text-white'
                : item.rank > 0
                  ? 'bg-[var(--surface-sunken)] text-[var(--ink)]'
                  : 'bg-[var(--surface-sunken)] text-[var(--muted-ink)]'"
            >
              {{ item.rank > 0 ? item.rank : '–' }}
            </span>

            <img
              v-if="item.photoUrl"
              :src="item.photoUrl"
              :alt="item.name"
              class="size-12 shrink-0 rounded-xl object-cover"
            >
            <span
              v-else
              class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-base font-black text-[var(--muted-ink)]"
            >
              {{ item.name.slice(0, 1) }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span class="text-base font-bold">{{ item.name }}</span>
                <span
                  v-if="item.number"
                  class="text-xs text-[var(--muted-ink)]"
                >{{ item.number }} 号</span>
                <span
                  v-if="item.className"
                  class="text-xs text-[var(--muted-ink)]"
                >{{ item.className }}</span>
              </div>
              <p
                v-if="item.song"
                class="mt-0.5 truncate text-xs text-[var(--muted-ink)]"
              >
                《{{ item.song }}》
              </p>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  class="h-full rounded-full bg-rose-600 transition-[width] duration-500"
                  :style="{ width: `${Math.round((item.valid / leaderValid) * 100)}%` }"
                />
              </div>
            </div>

            <div class="shrink-0 text-right">
              <p class="text-xl font-black tabular-nums">
                {{ item.valid }}
              </p>
              <p class="text-[11px] text-[var(--muted-ink)]">
                票
              </p>
            </div>
          </div>

          <p
            v-if="item.watch"
            class="mt-2 text-[11px] text-amber-800"
          >
            另有 {{ item.watch }} 票疑似异常，人工复核中，暂不计入排名。
          </p>
        </li>
      </ol>

      <p class="pt-2 text-center text-[11px] leading-relaxed text-[var(--muted-ink)]">
        排名只统计通过风控的有效票；同一微信号重复提交、机房 IP 批量提交与秒填会被单独拦下。
      </p>
    </div>
  </div>
</template>
