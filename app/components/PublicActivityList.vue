<script setup lang="ts">
import type { ApiActivitySummary } from '~~/shared/types/server'

const props = withDefaults(defineProps<{
  organizationSlug: string
  limit?: number
  includePast?: boolean
}>(), {
  limit: 5,
  includePast: false
})

interface ActivityListPayload {
  items: ApiActivitySummary[]
  total: number
}

const { data, pending } = await useFetch<ActivityListPayload>('/api/public/activities', {
  key: `public-activities-${props.organizationSlug}-${props.limit}-${props.includePast ? 'past' : 'upcoming'}`,
  query: {
    organization: props.organizationSlug,
    limit: props.limit,
    includePast: props.includePast ? 'true' : undefined
  }
})

const items = computed(() => data.value?.items ?? [])

function formatDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatMeta(item: ApiActivitySummary): string {
  const parts = [`${formatDay(item.startsAt)} ${formatTime(item.startsAt)}`]
  if (item.endsAt) parts.push(`至 ${formatTime(item.endsAt)}`)
  if (item.place) parts.push(`${item.place.name}${item.room ? ` ${item.room}` : ''}`)
  else if (item.room) parts.push(item.room)
  return parts.join(' · ')
}
</script>

<template>
  <section
    v-if="!pending && items.length"
    class="border-b border-zinc-200 py-8 dark:border-zinc-800"
    aria-labelledby="organization-activities-title"
  >
    <div class="flex items-end justify-between gap-3">
      <div>
        <h2
          id="organization-activities-title"
          class="text-lg font-bold text-zinc-950 dark:text-zinc-100"
        >
          {{ includePast ? '活动回顾' : '活动通知' }}
        </h2>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          由本组织发布，经校方审核后展示
        </p>
      </div>
      <span class="text-xs text-zinc-400 dark:text-zinc-500">{{ items.length }} 条</span>
    </div>

    <div class="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      <NuxtLink
        v-for="item in items"
        :key="item.id"
        :to="`/activities/${item.slug}`"
        class="group flex gap-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
      >
        <div class="flex w-12 shrink-0 flex-col items-center justify-center self-start rounded-lg bg-emerald-50 px-1 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <span class="text-sm font-bold leading-none">{{ formatDay(item.startsAt) }}</span>
          <span class="mt-1 text-[11px] leading-none">{{ formatTime(item.startsAt) }}</span>
        </div>

        <img
          v-if="item.coverUrl"
          :src="item.coverUrl"
          :alt="`${item.title} 活动照片`"
          class="size-16 shrink-0 rounded-lg object-cover"
          loading="lazy"
        >

        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold leading-6 text-zinc-900 group-hover:text-emerald-800 dark:text-zinc-100 dark:group-hover:text-emerald-300">
            {{ item.title }}
          </h3>
          <p class="mt-0.5 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ item.summary }}
          </p>
          <p class="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <UIcon
              name="i-lucide-calendar-clock"
              class="size-3.5 shrink-0"
            />
            <span class="truncate">{{ formatMeta(item) }}</span>
          </p>
        </div>

        <UIcon
          name="i-lucide-chevron-right"
          class="mt-1 size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-700 dark:text-zinc-600 dark:group-hover:text-emerald-300"
        />
      </NuxtLink>
    </div>
  </section>
</template>
