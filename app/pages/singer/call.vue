<script setup lang="ts">
import type { CompetitionCallBoard, CompetitionCallBoardRow } from '../../../shared/types'

definePageMeta({ layout: false })

useSeoMeta({
  title: '叫号台 · 新声歌手大赛',
  robots: 'noindex'
})

const board = ref<CompetitionCallBoard | null>(null)
const failed = ref('')
const loading = ref(false)
const updatedAt = ref('')

// 标题跟着接口给的轮次走：初赛结束、复赛开起来之后这里就是「复赛」。
const roundTitle = computed(() => board.value?.round.title || '初赛')

const dayLabel = computed(() => {
  const day = board.value?.round.activeDay
  if (day === 1) return '第一天 · 11月14号'
  if (day === 2) return '第二天 · 11月15号'
  return '不分天'
})

const statusText: Record<CompetitionCallBoardRow['state'], string> = {
  singing: '演唱中',
  waiting: '等候',
  finished: '已唱完',
  skipped: '未唱',
  idle: '待开始',
  unknown: '—'
}

const statusClass: Record<CompetitionCallBoardRow['state'], string> = {
  singing: 'bg-[var(--color-green-600)] text-white',
  waiting: 'bg-[color-mix(in_srgb,var(--color-orange-500)_18%,var(--surface))] text-[var(--color-orange-700)]',
  finished: 'bg-[color-mix(in_srgb,var(--ink)_8%,var(--surface))] text-[var(--muted-ink)]',
  skipped: 'bg-[color-mix(in_srgb,var(--color-orange-500)_14%,var(--surface))] text-[var(--color-orange-700)]',
  idle: 'bg-[color-mix(in_srgb,var(--ink)_6%,var(--surface))] text-[var(--muted-ink)]',
  unknown: 'bg-[color-mix(in_srgb,var(--ink)_6%,var(--surface))] text-[var(--muted-ink)]'
}

const waitingCount = computed(() => board.value?.rows.filter(row => row.state === 'waiting').length ?? 0)

function clockText(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(ts))
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const data = await plainFetch<CompetitionCallBoard>('/api/public/competition/call-board')
    board.value = data
    updatedAt.value = clockText(data.updatedAt)
    failed.value = ''
  } catch {
    failed.value = '刷新失败，稍后自动重试'
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null

function startPolling(): void {
  stopPolling()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void load()
  }, 3000)
}

function stopPolling(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(async () => {
  await load()
  startPolling()
})

onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="singer-canvas min-h-dvh text-[var(--ink)]">
    <main class="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-semibold tracking-wider text-[var(--color-orange-700)]">
            仰恩大学音乐协会 · 叫号台
          </p>
          <h1 class="mt-1 text-2xl font-black tracking-wide sm:text-3xl">
            新声歌手大赛 · {{ roundTitle }}
          </h1>
        </div>
        <div class="flex items-center gap-2 text-xs text-[var(--muted-ink)]">
          <span class="rounded-full bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3 py-1 font-semibold text-[var(--ink)] ring-1 ring-[var(--line)]">
            {{ dayLabel }}
          </span>
          <span>{{ updatedAt || '—' }}</span>
          <button
            type="button"
            class="rounded-full bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3 py-1 font-semibold text-[var(--ink)] ring-1 ring-[var(--line)] active:scale-95 disabled:opacity-50"
            :disabled="loading"
            @click="load"
          >
            {{ loading ? '刷新中' : '刷新' }}
          </button>
        </div>
      </header>

      <p
        v-if="failed"
        class="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--color-orange-500)_10%,var(--surface))] px-4 py-2 text-sm text-[var(--color-orange-700)]"
      >
        {{ failed }}
      </p>

      <!-- 正在唱 -->
      <section class="mt-5 rounded-3xl bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-5 shadow-sm ring-1 ring-[var(--line)] sm:p-6">
        <p class="text-xs font-semibold tracking-wider text-[var(--color-orange-700)]">
          正在唱
        </p>
        <template v-if="board?.current">
          <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-4xl font-black tracking-wide sm:text-5xl">{{ board.current.name }}</span>
            <span class="text-lg font-semibold text-[var(--ink)]">《{{ board.current.song || '清唱' }}》</span>
          </div>
          <p class="mt-1 text-sm text-[var(--muted-ink)]">
            第 {{ board.current.position }} 位 · {{ board.current.className || '班级未填' }}
          </p>
        </template>
        <p
          v-else
          class="mt-2 text-2xl font-bold text-[var(--muted-ink)]"
        >
          还没开始叫号
        </p>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl bg-[color-mix(in_srgb,var(--color-green-600)_8%,var(--surface))] p-4 ring-1 ring-[var(--line)]">
            <p class="text-xs font-semibold text-[var(--color-green-700)]">
              下一位
            </p>
            <p class="mt-1 text-2xl font-bold">
              <template v-if="board?.next">
                {{ board.next.name }}
                <span class="text-base font-semibold text-[var(--ink)]">《{{ board.next.song || '清唱' }}》</span>
              </template>
              <span
                v-else
                class="text-[var(--muted-ink)]"
              >—</span>
            </p>
          </div>
          <div class="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
            <p class="text-xs font-semibold text-[var(--color-orange-700)]">
              还在等
            </p>
            <p class="mt-1 text-2xl font-bold">
              {{ waitingCount }} 位
              <span class="text-sm font-normal text-[var(--muted-ink)]">· 今天共 {{ board?.total ?? 0 }} 位</span>
            </p>
          </div>
        </div>
      </section>

      <!-- 顺序表 -->
      <section class="mt-5 overflow-hidden rounded-3xl bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] shadow-sm ring-1 ring-[var(--line)]">
        <table class="w-full text-left text-sm">
          <thead class="bg-[color-mix(in_srgb,var(--color-orange-500)_8%,var(--surface))] text-xs text-[var(--color-orange-700)]">
            <tr>
              <th class="w-12 px-3 py-2 font-semibold">
                序
              </th>
              <th class="px-2 py-2 font-semibold">
                姓名
              </th>
              <th class="px-2 py-2 font-semibold">
                歌曲
              </th>
              <th class="hidden px-2 py-2 font-semibold sm:table-cell">
                班级
              </th>
              <th class="w-20 px-3 py-2 text-right font-semibold">
                状态
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in board?.rows ?? []"
              :key="`${row.position}-${row.name}`"
              class="border-t border-[var(--line)]"
              :class="row.state === 'singing' ? 'bg-[color-mix(in_srgb,var(--color-green-600)_12%,var(--surface))]' : row.state === 'finished' ? 'text-[var(--muted-ink)]' : ''"
            >
              <td class="px-3 py-2 font-mono text-[var(--muted-ink)]">
                {{ row.position }}
              </td>
              <td class="px-2 py-2 font-semibold">
                {{ row.name }}
              </td>
              <td class="px-2 py-2">
                {{ row.song || '—' }}
              </td>
              <td class="hidden px-2 py-2 text-[var(--muted-ink)] sm:table-cell">
                {{ row.className || '—' }}
              </td>
              <td class="px-3 py-2 text-right">
                <span
                  class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                  :class="statusClass[row.state]"
                >
                  {{ row.state === 'waiting' && row.ahead !== null && row.ahead > 0 ? `前方 ${row.ahead} 位` : statusText[row.state] }}
                </span>
              </td>
            </tr>
            <tr v-if="!board?.rows.length">
              <td
                colspan="5"
                class="px-3 py-8 text-center text-[var(--muted-ink)]"
              >
                今天还没有人签到
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <p class="mt-4 text-center text-xs text-[var(--muted-ink)]">
        每 3 秒自动刷新 · 顺序由后台出场名单决定
      </p>
    </main>
  </div>
</template>
