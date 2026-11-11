<script setup lang="ts">
import type { ApiActivitySummary } from '~~/shared/types/server'

const props = withDefaults(defineProps<{
  organizationSlug?: string
  limit?: number
  includePast?: boolean
  showEmpty?: boolean
}>(), {
  limit: 5,
  includePast: false,
  showEmpty: false
})

interface ActivityListPayload {
  items: ApiActivitySummary[]
  total: number
}

const { data, pending } = await useFetch<ActivityListPayload>('/api/public/activities', {
  key: `public-activities-${props.organizationSlug ?? 'all'}-${props.limit}-${props.includePast ? 'past' : 'upcoming'}`,
  query: {
    ...(props.organizationSlug ? { organization: props.organizationSlug } : {}),
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
    v-if="showEmpty || (!pending && items.length)"
    class="border-b border-zinc-200 py-8 dark:border-zinc-800"
    :aria-labelledby="`activities-title-${organizationSlug ?? 'all'}`"
  >
    <div class="flex items-end justify-between gap-3">
      <div>
        <h2
          :id="`activities-title-${organizationSlug ?? 'all'}`"
          class="text-lg font-bold text-zinc-950 dark:text-zinc-100"
        >
          {{ includePast ? '活动回顾' : organizationSlug ? '活动通知' : '近期活动' }}
        </h2>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {{ organizationSlug ? '由本组织发布，经校方审核后展示' : '由社团与部门发布，经校方审核后展示' }}
        </p>
      </div>
      <span class="text-xs text-zinc-400 dark:text-zinc-500">{{ items.length }} 条</span>
    </div>

    <div
      v-if="items.length"
      class="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
    >
      <div
        v-for="item in items"
        :key="item.id"
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
          <h3 class="text-sm font-semibold leading-6 text-zinc-900 dark:text-zinc-100">
            <NuxtLink
              :to="`/activities/${item.slug}`"
              class="underline-offset-2 hover:text-emerald-800 hover:underline dark:hover:text-emerald-300"
            >
              {{ item.title }}
            </NuxtLink>
          </h3>
          <p class="mt-0.5 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ item.summary }}
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <p class="flex min-w-0 items-center gap-1">
              <UIcon
                name="i-lucide-calendar-clock"
                class="size-3.5 shrink-0"
              />
              <span class="truncate">{{ formatMeta(item) }}</span>
            </p>
            <span class="ml-auto inline-flex shrink-0 items-center gap-2">
              <NuxtLink
                :to="`/activities/${item.slug}`"
                class="inline-flex min-h-7 items-center gap-0.5 rounded-md px-1.5 font-medium text-zinc-600 underline-offset-2 hover:text-emerald-700 hover:underline dark:text-zinc-300 dark:hover:text-emerald-300"
              >
                活动详情
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-3.5"
                />
              </NuxtLink>
              <NuxtLink
                :to="`/activities/${item.slug}#comments`"
                class="inline-flex min-h-7 items-center gap-1 rounded-md border border-emerald-200 px-2 font-medium text-emerald-700 underline-offset-2 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                <UIcon
                  name="i-lucide-message-circle"
                  class="size-3.5"
                />
                留言
              </NuxtLink>
            </span>
          </div>
        </div>
      </div>
    </div>
    <p
      v-else
      class="mt-4 rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
    >
      暂时没有即将开始的活动。
    </p>
  </section>
</template>
