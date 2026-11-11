<script setup lang="ts">
import type { ApiActivitySummary } from '~~/shared/types/server'
import { userFetch } from '~~/app/utils/user-request'

const props = defineProps<{
  placeId: string
  placeSlug: string | null
}>()

interface ActivityListPayload {
  items: ApiActivitySummary[]
  total: number
}

const activities = ref<ApiActivitySummary[] | null>(null)
const openCommentsId = ref<string | null>(null)

// 活动卡片是建筑详情的增强内容：接口失败或没有活动时整块不渲染。
async function load(): Promise<void> {
  if (!props.placeSlug) {
    activities.value = null
    return
  }
  try {
    const payload = await userFetch<ActivityListPayload>('/api/public/activities', {
      query: { place: props.placeSlug, limit: 3 }
    })
    activities.value = payload?.items?.length ? payload.items : null
  } catch {
    activities.value = null
  }
}

onMounted(load)
watch(() => props.placeId, () => {
  activities.value = null
  openCommentsId.value = null
  void load()
})

function toggleComments(id: string): void {
  openCommentsId.value = openCommentsId.value === id ? null : id
}

function formatDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()}`
}
</script>

<template>
  <div
    v-if="activities"
    class="mt-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        活动通知
      </p>
    </div>
    <ul class="mt-1.5 space-y-1">
      <li
        v-for="activity in activities"
        :key="activity.id"
        class="rounded-lg px-1 py-1"
      >
        <div class="flex items-start gap-2">
          <NuxtLink
            :to="`/activities/${activity.slug}`"
            class="flex min-w-0 flex-1 items-start gap-2 rounded-md py-0.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            <img
              v-if="activity.coverUrl"
              :src="activity.coverUrl"
              :alt="`${activity.title} 活动照片`"
              class="size-10 shrink-0 rounded-md object-cover"
              loading="lazy"
            >
            <span
              v-else
              class="mt-0.5 shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            >
              {{ formatDay(activity.startsAt) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="line-clamp-2 block text-xs font-medium leading-5 text-zinc-700 dark:text-zinc-200">
                {{ activity.title }}
              </span>
              <span class="mt-0.5 block truncate text-[10px] text-zinc-400 dark:text-zinc-500">
                {{ formatDay(activity.startsAt) }}
                <template v-if="activity.room"> · {{ activity.room }}</template>
              </span>
            </span>
          </NuxtLink>
          <button
            type="button"
            class="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
            :aria-expanded="openCommentsId === activity.id"
            @click="toggleComments(activity.id)"
          >
            {{ openCommentsId === activity.id ? '收起' : '留言' }}
          </button>
        </div>
        <ActivityComments
          v-if="openCommentsId === activity.id"
          :activity-slug="activity.slug"
          compact
        />
      </li>
    </ul>
  </div>
</template>
