<script setup lang="ts">
import type { ThirdPartyRankingEntry, ThirdPartyRankingPayload } from '~~/shared/types'

definePageMeta({ layout: false })

useSeoMeta({ title: '人气投票', robots: 'noindex, nofollow' })

const REFRESH_MS = 30_000

const payload = ref<ThirdPartyRankingPayload | null>(null)
const error = ref('')
const loading = ref(true)
const refreshedAt = ref(0)

const entries = computed(() => payload.value?.entries ?? [])
const totals = computed(() => payload.value?.totals ?? { received: 0, valid: 0, watch: 0, voided: 0 })
const formUrl = computed(() => payload.value?.formUrl ?? '')
const maxValid = computed(() => Math.max(1, ...entries.value.map(item => item.valid)))

/** 与本站人气投票页一致：按出场号两人一组，还原「第 X 组 / N 号、M 号出场」。 */
const groups = computed(() => {
  const buckets = new Map<number, ThirdPartyRankingEntry[]>()
  for (const item of entries.value) {
    const groupNo = Math.ceil((item.number || 1) / 2)
    const list = buckets.get(groupNo) ?? []
    list.push(item)
    buckets.set(groupNo, list)
  }
  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([groupNo, list]) => ({
      groupNo,
      title: `第${'一二三四五六七八九十'[groupNo - 1] ?? groupNo}组`,
      candidates: list,
      numbers: list.map(item => item.number).filter((value): value is number => typeof value === 'number')
    }))
})

function refreshedText(): string {
  if (!refreshedAt.value) return ''
  return new Date(refreshedAt.value).toLocaleTimeString('zh-CN', { hour12: false })
}

function groupOrderLabel(numbers: number[]): string {
  if (numbers.length === 0) return ''
  return `${numbers.join(' 号、')} 号出场`
}

function rankLabel(item: ThirdPartyRankingEntry): string {
  if (item.rank <= 0) return '暂无排名'
  const tied = entries.value.filter(other => other.rank === item.rank && other.valid > 0).length
  return tied > 1 ? `并列第 ${item.rank}` : `第 ${item.rank} 名`
}

function shareWidth(item: ThirdPartyRankingEntry): string {
  return `${Math.max(item.valid > 0 ? 6 : 0, Math.round((item.valid / maxValid.value) * 100))}%`
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
  <div class="singer-canvas min-h-dvh text-[var(--ink)]">
    <div class="mx-auto w-full max-w-2xl space-y-3 px-3 py-4 sm:px-4">
      <header class="text-center">
        <p class="text-xs tracking-[0.24em] text-rose-600">
          仰恩大学音乐协会 · 新声歌手大赛
        </p>
        <h1 class="mt-2 text-3xl font-black tracking-tight">
          人气奖投票
        </h1>
        <p class="mt-1.5 text-sm text-[var(--muted-ink)]">
          为你喜欢的选手投一票
        </p>
      </header>

      <div class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 shadow-sm">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-green-600)_14%,var(--surface))] px-2.5 py-1 text-xs font-bold text-[var(--color-green-700)]">
              <span class="size-1.5 rounded-full bg-[var(--color-green-600)]" />
              投票进行中
            </span>
            <span class="text-xs text-[var(--muted-ink)]">
              <template v-if="refreshedAt">{{ refreshedText() }} 更新</template>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-right">
              <span class="text-base font-black tabular-nums">{{ totals.valid }}</span>
              <span class="ml-1 text-xs text-[var(--muted-ink)]">票有效</span>
            </div>
            <button
              type="button"
              aria-label="刷新票数"
              class="grid size-8 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--muted-ink)] transition hover:text-[var(--ink)] active:scale-95 disabled:opacity-50"
              :disabled="loading"
              @click="load"
            >
              <UIcon
                name="i-lucide-refresh-cw"
                class="size-3.5"
                :class="loading ? 'animate-spin' : ''"
              />
            </button>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2 text-xs">
          <span class="font-semibold">
            共 <span class="tabular-nums">{{ entries.length }}</span> 位选手
          </span>
          <span class="text-[var(--muted-ink)]">
            累计收到 <strong class="tabular-nums text-[var(--ink)]">{{ totals.received }}</strong> 张票 · 每 30 秒自动刷新
          </span>
        </div>
      </div>

      <p
        v-if="error"
        class="rounded-2xl border border-red-300/60 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
      >
        {{ error }}
      </p>

      <div
        v-if="loading"
        class="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-12 text-center text-sm text-[var(--muted-ink)] shadow-sm"
      >
        正在加载候选名单…
      </div>

      <template v-else>
        <div
          v-if="entries.length === 0"
          class="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-12 text-center text-sm text-[var(--muted-ink)] shadow-sm"
        >
          暂无决赛候选选手。
        </div>

        <template v-else>
          <div class="flex items-center justify-between gap-2 px-1 text-xs text-[var(--muted-ink)]">
            <span class="inline-flex items-center gap-1.5 font-medium">
              <UIcon
                name="i-lucide-list-ordered"
                class="size-3.5 text-[var(--color-green-700)]"
              />
              按出场顺序分组排列 · 共 {{ entries.length }} 位选手
            </span>
            <span class="tabular-nums">共 {{ groups.length }} 组</span>
          </div>

          <div class="space-y-4">
            <section
              v-for="group in groups"
              :key="group.groupNo"
              class="rounded-3xl border bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-3 shadow-sm sm:p-4"
              :class="group.candidates.some(item => item.rank === 1)
                ? 'border-rose-400/70 ring-1 ring-rose-500/20'
                : 'border-[var(--line)]'"
            >
              <div class="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <div class="flex items-center gap-2">
                  <span class="rounded-full bg-[color-mix(in_srgb,var(--color-green-600)_14%,var(--surface))] px-3 py-1 text-xs font-black tracking-wide text-[var(--color-green-700)]">
                    {{ group.title }}
                  </span>
                  <span
                    v-if="group.candidates.some(item => item.rank === 1)"
                    class="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
                  >
                    当前榜首
                  </span>
                </div>
                <span class="text-xs font-medium tabular-nums text-[var(--muted-ink)]">
                  {{ groupOrderLabel(group.numbers) }}
                </span>
              </div>

              <div class="mt-3 grid grid-cols-2 gap-2.5 sm:gap-4">
                <article
                  v-for="candidate in group.candidates"
                  :key="candidate.optionId"
                  class="flex flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-xs transition"
                  :class="candidate.rank === 1
                    ? 'border-rose-400 ring-2 ring-rose-500/25'
                    : 'border-[var(--line)]'"
                >
                  <div class="relative aspect-[4/5] overflow-hidden bg-[color-mix(in_srgb,var(--color-green-600)_10%,var(--surface-sunken))]">
                    <img
                      v-if="candidate.photoUrl"
                      :src="candidate.photoUrl"
                      :alt="`${candidate.number ?? ''}号选手 ${candidate.name}`"
                      class="size-full object-cover"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    >
                    <span
                      v-else
                      class="grid size-full place-items-center text-4xl font-black text-[var(--color-green-700)] sm:text-5xl"
                    >{{ candidate.name.slice(0, 1) }}</span>
                    <span class="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white backdrop-blur-xs">
                      {{ candidate.number ? `${candidate.number}号` : '待定' }}
                    </span>
                    <span
                      v-if="candidate.rank > 0"
                      class="absolute right-2 top-2 rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-xs"
                      :class="candidate.rank === 1 ? 'bg-rose-600' : 'bg-black/55 backdrop-blur-xs'"
                    >
                      {{ rankLabel(candidate) }}
                    </span>
                  </div>

                  <div class="flex flex-1 flex-col gap-2 p-2.5 sm:p-3.5">
                    <div>
                      <p class="truncate text-base font-black leading-tight text-[var(--ink)] sm:text-lg">
                        {{ candidate.name }}
                      </p>
                      <p class="mt-0.5 truncate text-xs text-[var(--muted-ink)]">
                        {{ candidate.className || '班级未填' }}
                      </p>
                    </div>

                    <p class="flex items-center gap-1 truncate text-xs font-medium text-[var(--muted-ink)] sm:text-sm">
                      <UIcon
                        name="i-lucide-music"
                        class="size-3.5 shrink-0 text-[var(--color-orange-700)]"
                      />
                      <span class="truncate">《{{ candidate.song || '曲目待定' }}》</span>
                    </p>

                    <div class="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-2">
                      <div class="flex items-center justify-between gap-1">
                        <span class="whitespace-nowrap text-xs text-[var(--muted-ink)]">
                          <strong class="text-base font-black tabular-nums text-[var(--ink)] sm:text-lg">{{ candidate.valid }}</strong>
                          <span class="ml-0.5">票</span>
                        </span>
                        <span class="shrink-0 whitespace-nowrap text-[11px] font-bold tabular-nums text-[var(--muted-ink)]">
                          {{ candidate.share > 0 ? `${(candidate.share * 100).toFixed(1)}%` : '暂无占比' }}
                        </span>
                      </div>
                      <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--muted-ink)_18%,transparent)]">
                        <div
                          class="h-full rounded-full transition-[width] duration-500"
                          :class="candidate.rank === 1 ? 'bg-rose-600' : 'bg-[var(--color-green-600)]'"
                          :style="{ width: shareWidth(candidate) }"
                        />
                      </div>
                      <p
                        v-if="candidate.watch > 0"
                        class="mt-1 truncate text-[11px] font-medium leading-tight text-amber-700 dark:text-amber-300"
                      >
                        另有 {{ candidate.watch }} 票疑似异常，人工复核中
                      </p>
                    </div>

                    <a
                      v-if="formUrl"
                      :href="formUrl"
                      target="_blank"
                      rel="noopener"
                      class="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white shadow-xs transition-transform hover:bg-rose-700 active:scale-[0.98]"
                    >
                      <UIcon
                        name="i-lucide-square-pen"
                        class="size-4"
                      />
                      去投票
                    </a>
                    <p
                      v-else
                      class="mt-auto flex w-full items-center justify-center rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm font-bold text-[var(--muted-ink)]"
                    >
                      暂未开启投票
                    </p>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>
      </template>

      <p class="pt-1 text-center text-xs leading-relaxed text-[var(--muted-ink)]">
        一个微信限投一票，投票在微信里打开表单完成。排名只统计通过风控的有效票；同一微信号重复提交、机房 IP 批量提交与秒填会被单独拦下。
      </p>
    </div>
  </div>
</template>
