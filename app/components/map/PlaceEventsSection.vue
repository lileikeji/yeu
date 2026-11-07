<script setup lang="ts">
import { userFetch } from '~~/app/utils/user-request'

interface PlaceEventView {
  slug: string
  title: string
  summary: string
  tier: 'A' | 'B' | 'C'
  lastSeenAt: string
  dateHint: { kind: 'upcoming', date: string } | null
}

interface PlaceEventsPayload {
  events: PlaceEventView[]
}

const props = defineProps<{
  placeId: string
  placeSlug: string | null
  placeName: string
}>()

const events = ref<PlaceEventView[] | null>(null)

// 关联事件是辅助增强内容：拿不到/为空就整块不渲染，不显示错误横幅
// （与商家推广条同一降级惯例）。
async function load(): Promise<void> {
  try {
    const payload = await userFetch<PlaceEventsPayload>('/api/public/place-events', {
      query: { slug: props.placeSlug || undefined, name: props.placeName }
    })
    events.value = payload?.events?.length ? payload.events : null
  } catch {
    events.value = null
  }
}

onMounted(load)
watch(() => props.placeId, () => {
  events.value = null
  void load()
})

function dateLabel(event: PlaceEventView): string {
  if (event.dateHint) {
    const [, month, day] = event.dateHint.date.split('-')
    return `预告 ${Number(month)}月${Number(day)}日`
  }
  const date = new Date(event.lastSeenAt)
  if (Number.isNaN(date.getTime())) return '近期'
  return `近期 ${date.getMonth() + 1}月${date.getDate()}日`
}
</script>

<template>
  <div
    v-if="events"
    class="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-2.5"
  >
    <p class="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
      相关通知与活动
    </p>
    <ul class="mt-1.5 space-y-1">
      <li
        v-for="event in events"
        :key="event.slug"
      >
        <NuxtLink
          :to="`/hot#${event.slug}`"
          class="flex items-start gap-1.5 rounded-lg px-1 py-1 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        >
          <span
            class="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            :class="event.dateHint
              ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-300'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'"
          >
            {{ dateLabel(event) }}
          </span>
          <span class="min-w-0 flex-1 text-xs leading-5 text-zinc-700 dark:text-zinc-200 line-clamp-2">
            {{ event.title }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
