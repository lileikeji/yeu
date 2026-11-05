<script setup lang="ts">
import type { ApiSignalEventDetail } from '~~/shared/types/server'

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))

const { data: event, error } = await useFetch<ApiSignalEventDetail>(
  () => `/api/public/signal/${encodeURIComponent(slug.value)}`,
  { key: () => `signal-detail-${slug.value}`, default: () => null }
)

useSeoMeta({
  title: () => event.value ? `${event.value.title} · 校园热度` : '校园热度',
  description: () => event.value?.summary ?? '学校各站点同一件事的原文汇总。'
})

const dayText = (value?: string | number | null): string => {
  if (!value) return ''
  const time = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(time)) return ''
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <div class="pb-10">
    <section class="page-shell pt-6 md:pt-8">
      <NuxtLink
        to="/hot"
        class="inline-flex items-center gap-1 text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        回到校园热度
      </NuxtLink>

      <div
        v-if="!event"
        class="mt-6 rounded-xl border border-[var(--line)] bg-white p-6 dark:bg-zinc-900"
      >
        <p class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
          没有这件事了
        </p>
        <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {{ error ? '这条事件可能已被新的抓取结果替换。' : '事件不存在，或者链接里的编号不对。' }}
        </p>
      </div>

      <template v-else>
        <p class="section-kicker mt-6">
          {{ event.category }}
        </p>
        <h1 class="mt-1 text-2xl font-semibold leading-9 text-zinc-950 md:text-[28px] dark:text-zinc-100">
          {{ event.title }}
        </h1>
        <p
          v-if="event.summary"
          class="mt-2 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300"
        >
          {{ event.summary }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span class="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{{ event.tierLabel }}</span>
          <span>{{ event.sourceCount }} 个来源 · {{ event.itemCount }} 条原文</span>
          <span>热度 {{ event.heat.toFixed(2) }}</span>
          <span>首次出现 {{ dayText(event.firstSeenAt) }}</span>
          <span>最近更新 {{ dayText(event.lastSeenAt) }}</span>
        </div>

        <h2 class="mt-7 text-base font-semibold text-zinc-950 dark:text-zinc-100">
          原文（{{ event.items.length }} 条）
        </h2>
        <ul class="mt-3 space-y-3">
          <li
            v-for="item in event.items"
            :key="item.id"
            class="rounded-xl border border-[var(--line)] bg-white p-4 dark:bg-zinc-900"
          >
            <a
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
            >
              {{ item.title }}
            </a>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {{ item.sourceTitle }}<span v-if="item.isOfficial"> · 官方</span>
              <span v-if="item.publishedAt"> · {{ dayText(item.publishedAt) }} 发布</span>
              <span v-if="item.isPrimary"> · 主来源</span>
            </p>
            <p
              v-if="item.excerpt"
              class="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300"
            >
              {{ item.excerpt }}
            </p>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>
