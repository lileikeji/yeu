<script setup lang="ts">
import type { CompetitionRegistrationStatus } from '~~/shared/types'

// useFetch 的推断在「显式泛型 + default 返回 null」组合下会退化成 unknown，
// 这里改用 useAsyncData 显式声明返回类型，SSR 首屏照旧由 $fetch 取。
const { data: status } = await useAsyncData<CompetitionRegistrationStatus | null>(
  'public-competition-register',
  () => $fetch<CompetitionRegistrationStatus>('/api/public/competition/register'),
  { default: () => null }
)

const registrationOpen = computed(() => status.value?.open === true)

useSeoMeta({
  title: '赛事与招新',
  description: '新声歌手大赛的赛程、报名入口、社团招新和评委登录入口汇总。',
  // 赛事没开启前不进索引（但仍跟随页面链接，singer / clubs / judge 都能被爬到）。
  robots: computed(() => (registrationOpen.value ? 'index, follow' : 'noindex, follow'))
})

const roundLabels: Record<string, string> = {
  prelim: '初赛',
  semi: '复赛',
  final: '决赛'
}

const schedule = computed(() => status.value?.schedule ?? [])

const singerEntries = [
  { title: '赛事详情', description: '看赛制、时间地点和参赛要求', to: '/singer', icon: 'i-lucide-mic-vocal' },
  { title: '预报名', description: '先留联系方式，现场再补齐资料', to: '/singer/pre-register', icon: 'i-lucide-clipboard-check' },
  { title: '现场登记', description: '比赛当天扫码登记，登记顺序就是出场顺序', to: '/singer/register', icon: 'i-lucide-scan' }
]

const recruitEntries = [
  { title: '全部社团', description: '按兴趣找社团，看招新是否已经开始', to: '/clubs', icon: 'i-lucide-users-round' },
  { title: '社团报名表', description: '音乐协会在线报名表；未开启时页面会说明已结束', to: '/recruit/music-association', icon: 'i-lucide-file-plus-2' },
  { title: '招新指南', description: '什么时候招新、怎么联系社团', to: '/guides/clubs', icon: 'i-lucide-notebook-tabs' },
  { title: '评委登录', description: '评委打分入口，账号由后台发放', to: '/judge/login', icon: 'i-lucide-key-round' }
]
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-4 md:py-5">
        <p class="section-kicker">
          赛事与招新
        </p>
        <h1 class="mt-1 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          {{ status?.title || '新声歌手大赛' }}
        </h1>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          报名、赛程和社团招新的入口都汇总在这一页。具体安排以主办方最新通知为准。
        </p>
        <p
          class="mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
          :class="registrationOpen
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'"
        >
          <UIcon
            :name="registrationOpen ? 'i-lucide-circle-check' : 'i-lucide-clock-3'"
            class="size-3.5"
          />
          {{ registrationOpen ? '报名进行中' : '报名未开启或已结束' }}
        </p>
      </div>
    </header>

    <div class="page-shell page-section space-y-6">
      <section v-if="schedule.length">
        <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
          赛程
        </h2>
        <ul class="mt-3 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <li
            v-for="item in schedule"
            :key="`${item.key}-${item.dateLabel}`"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm"
          >
            <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{{ roundLabels[item.key] ?? '赛程' }}</span>
            <span class="font-semibold text-zinc-950 dark:text-zinc-100">{{ item.dateLabel }} · {{ item.timeLabel }}</span>
            <span class="text-zinc-600 dark:text-zinc-300">{{ item.venue }}</span>
            <span class="w-full text-xs text-zinc-500 dark:text-zinc-400">{{ item.note }}</span>
          </li>
        </ul>
      </section>

      <section>
        <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
          我要参赛
        </h2>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="entry in singerEntries"
            :key="entry.to"
            :to="entry.to"
            class="surface-panel group flex items-center gap-2.5 p-3 transition hover:border-green-300 hover:shadow-sm dark:hover:border-green-700"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <UIcon
                :name="entry.icon"
                class="size-4"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold text-zinc-950 dark:text-zinc-100">{{ entry.title }}</span>
              <span class="mt-0.5 block text-xs leading-5 text-zinc-600 dark:text-zinc-300">{{ entry.description }}</span>
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 shrink-0 text-zinc-300 group-hover:text-green-700 dark:text-zinc-600 dark:group-hover:text-green-400"
            />
          </NuxtLink>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
          社团招新与评委入口
        </h2>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <NuxtLink
            v-for="entry in recruitEntries"
            :key="entry.to"
            :to="entry.to"
            class="group flex min-h-16 items-center gap-2.5 rounded-md border border-zinc-200 p-2.5 hover:border-green-300 dark:border-zinc-800 dark:hover:border-green-700"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-green-50 group-hover:text-green-700 dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-green-950 dark:group-hover:text-green-400">
              <UIcon
                :name="entry.icon"
                class="size-4"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold text-zinc-950 dark:text-zinc-100">{{ entry.title }}</span>
              <span class="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ entry.description }}</span>
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 shrink-0 text-zinc-300 group-hover:text-green-700 dark:text-zinc-600 dark:group-hover:text-green-400"
            />
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
