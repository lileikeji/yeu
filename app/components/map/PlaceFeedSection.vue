<script setup lang="ts">
import type { ApiPlaceFeedItem, ApiPlaceFeedResponse } from '~~/shared/types/server'
import { userFetch } from '~~/app/utils/user-request'

const props = defineProps<{
  placeId: string
  placeSlug: string | null
  placeName: string
}>()

const items = ref<ApiPlaceFeedItem[] | null>(null)
const openComments = ref<string | null>(null)

async function load(): Promise<void> {
  try {
    const payload = await userFetch<ApiPlaceFeedResponse>('/api/public/place-feed', {
      query: {
        slug: props.placeSlug || undefined,
        name: props.placeName
      }
    })
    items.value = payload?.items?.length ? payload.items : null
  } catch {
    items.value = null
  }
}

onMounted(load)
watch(() => props.placeId, () => {
  items.value = null
  openComments.value = null
  void load()
})

const upcoming = computed(() => (items.value ?? []).filter(item => item.status === 'upcoming'))
const started = computed(() => (items.value ?? []).filter(item => item.status === 'started'))

function monthDay(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function dateLabel(item: ApiPlaceFeedItem): string {
  if (item.dateHint) return `预告 ${monthDay(item.at)}`
  if (item.kind === 'activity') {
    const date = new Date(item.at)
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return `${monthDay(item.at)} ${time}`
  }
  return `近期 ${monthDay(item.at)}`
}

function metaLabel(item: ApiPlaceFeedItem): string {
  if (item.kind === 'activity') {
    const organization = item.organization?.title ?? '社团活动'
    return item.room ? `${organization} · ${item.room}` : organization
  }
  return item.channel === 'notice' ? '通知公告' : '校园动态'
}

function linkFor(item: ApiPlaceFeedItem): string {
  return item.kind === 'activity'
    ? `/activities/${encodeURIComponent(item.slug)}`
    : `/hot/${encodeURIComponent(item.slug)}`
}

function toggleComments(slug: string): void {
  openComments.value = openComments.value === slug ? null : slug
}
</script>

<template>
  <div
    v-if="items"
    class="mt-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800"
  >
    <p class="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
      相关通知与活动
    </p>

    <section
      v-for="group in [
        { key: 'upcoming', label: '未开始', rows: upcoming },
        { key: 'started', label: '已开始', rows: started }
      ]"
      :key="group.key"
      class="mt-2"
    >
      <p
        v-if="group.rows.length"
        class="mb-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400"
      >
        {{ group.label }} · {{ group.rows.length }}
      </p>
      <ul
        v-if="group.rows.length"
        class="space-y-1.5"
      >
        <li
          v-for="item in group.rows"
          :key="`${item.kind}-${item.id}`"
        >
          <div class="flex items-start gap-1.5">
            <NuxtLink
              :to="linkFor(item)"
              class="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              <img
                v-if="item.coverUrl"
                :src="item.coverUrl"
                alt=""
                class="mt-0.5 size-9 shrink-0 rounded-md object-cover"
                loading="lazy"
              >
              <span
                v-else
                class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md text-[9px] font-medium"
                :class="item.kind === 'activity'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
              >
                {{ item.kind === 'activity' ? '活动' : (item.channel === 'notice' ? '通知' : '动态') }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-start gap-1.5">
                  <span class="line-clamp-2 flex-1 text-xs font-medium leading-5 text-zinc-800 dark:text-zinc-100">
                    {{ item.title }}
                  </span>
                  <span class="mt-0.5 shrink-0 text-[9px] text-zinc-400 dark:text-zinc-500">
                    {{ dateLabel(item) }}
                  </span>
                </span>
                <span
                  v-if="item.summary"
                  class="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-zinc-500 dark:text-zinc-400"
                >
                  {{ item.summary }}
                </span>
                <span class="mt-0.5 block text-[9px] text-zinc-400 dark:text-zinc-500">
                  {{ metaLabel(item) }}
                </span>
              </span>
            </NuxtLink>
            <button
              v-if="item.kind === 'activity'"
              type="button"
              class="mt-1 min-h-6 shrink-0 rounded px-1 text-[9px] text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              @click="toggleComments(item.slug)"
            >
              {{ openComments === item.slug ? '收起' : '留言' }}
            </button>
          </div>
          <ActivityComments
            v-if="item.kind === 'activity' && openComments === item.slug"
            :activity-slug="item.slug"
            compact
            class="ml-10"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
