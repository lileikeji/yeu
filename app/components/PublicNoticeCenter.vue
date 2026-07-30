<script setup lang="ts">
import type { ApiContent } from '~~/shared/types/server'

interface PublicNotice extends ApiContent {
  pinned: boolean
  confirmationCount: number
  confirmed: boolean
}

const open = ref(false)
const confirmingId = ref('')
const { data, refresh } = await useFetch<{ items: PublicNotice[], total: number }>('/api/public/notices', {
  key: 'public-notices'
})
const notices = computed(() => data.value?.items ?? [])

function openNoticeCenter(): void {
  open.value = true
}

function closeNoticeCenter(): void {
  open.value = false
}

function formatNoticeTime(value: string | null): string {
  if (!value) return '时间待确认'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value))
}

async function confirmNotice(notice: PublicNotice): Promise<void> {
  if (notice.confirmed || confirmingId.value) return
  confirmingId.value = notice.id
  try {
    await $fetch(`/api/public/notices/${encodeURIComponent(notice.id)}/confirm`, { method: 'POST' })
    await refresh()
  } finally {
    confirmingId.value = ''
  }
}
</script>

<template>
  <UButton
    icon="i-lucide-bell"
    color="neutral"
    variant="ghost"
    aria-label="查看公告"
    class="relative min-h-11 min-w-11"
    @click="openNoticeCenter"
  >
    <span class="hidden lg:inline">公告</span>
    <span
      v-if="notices.length"
      class="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-orange-600 px-1 text-[10px] font-bold leading-4 text-white"
    >{{ Math.min(notices.length, 99) }}</span>
  </UButton>

  <UModal
    v-model:open="open"
    title="最新公告"
    description="查看近期公告和更新，并确认你已知晓。"
    :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-2xl' }"
  >
    <template #body>
      <div
        v-if="notices.length"
        class="max-h-[70dvh] divide-y divide-zinc-100 overflow-y-auto"
      >
        <article
          v-for="notice in notices"
          :key="notice.id"
          class="py-4 first:pt-0 last:pb-0"
        >
          <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <UBadge
              v-if="notice.pinned"
              label="置顶"
              color="warning"
              variant="soft"
              size="sm"
            />
            <time :datetime="notice.publishedAt || notice.updatedAt">
              {{ formatNoticeTime(notice.publishedAt || notice.updatedAt) }}
            </time>
            <span>{{ notice.confirmationCount }} 人已确认</span>
          </div>
          <h3 class="mt-2 text-base font-bold text-zinc-950">
            {{ notice.title }}
          </h3>
          <p class="mt-1 text-sm leading-6 text-zinc-600">
            {{ notice.summary }}
          </p>
          <details
            v-if="notice.body"
            class="mt-3 text-sm text-zinc-700"
          >
            <summary class="cursor-pointer font-semibold text-green-700">
              查看完整内容
            </summary>
            <p class="mt-2 whitespace-pre-line leading-7">
              {{ notice.body }}
            </p>
          </details>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UButton
              :icon="notice.confirmed ? 'i-lucide-circle-check' : 'i-lucide-check'"
              :label="notice.confirmed ? '已确认' : '我已知晓'"
              :disabled="notice.confirmed"
              :loading="confirmingId === notice.id"
              size="sm"
              class="min-h-10"
              @click="confirmNotice(notice)"
            />
            <NuxtLink
              :to="`/campus#notice-${encodeURIComponent(notice.slug)}`"
              class="inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-green-700"
              @click="closeNoticeCenter"
            >
              在公告页查看
              <UIcon
                name="i-lucide-arrow-right"
                class="size-3.5"
              />
            </NuxtLink>
          </div>
        </article>
      </div>
      <div
        v-else
        class="grid min-h-40 place-items-center text-center text-sm text-zinc-500"
      >
        <div>
          <UIcon
            name="i-lucide-bell-off"
            class="mx-auto size-6 text-zinc-400"
          />
          <p class="mt-2">
            目前没有需要查看的公告
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
