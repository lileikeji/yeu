<script setup lang="ts">
import type { ApiContent } from '~~/shared/types/server'
import {
  noticePublishedTime,
  noticeRelativeTime,
  noticeUnreadCount
} from '~/utils/notice-presentation'

interface PublicNotice extends ApiContent {
  pinned: boolean
  confirmationCount: number
  confirmed: boolean
}

interface ConfirmNoticeResponse {
  confirmed: boolean
  confirmationCount: number
}

const open = ref(false)
const selectedNoticeId = ref('')
const confirmingId = ref('')
const toast = useToast()
const { data } = await useFetch<{ items: PublicNotice[], total: number }>('/api/public/notices', {
  key: 'public-notices'
})
const notices = computed(() => data.value?.items ?? [])
const unreadCount = computed(() => noticeUnreadCount(notices.value))
const selectedNotice = computed(() => notices.value.find(notice => notice.id === selectedNoticeId.value) ?? null)
const modalTitle = computed(() => selectedNotice.value ? '公告详情' : '公告通知')
const modalDescription = computed(() => selectedNotice.value
  ? '查看公告的完整内容和发布时间。'
  : unreadCount.value > 0
    ? `还有 ${unreadCount.value} 条公告未读`
    : '近期公告都已阅读')

function noticeTime(notice: PublicNotice): string {
  return notice.publishedAt || notice.updatedAt
}

function openNoticeCenter(): void {
  selectedNoticeId.value = ''
  open.value = true
}

function showNoticeList(): void {
  selectedNoticeId.value = ''
}

async function confirmNotice(notice: PublicNotice): Promise<void> {
  if (notice.confirmed || confirmingId.value === notice.id) return

  const previousCount = notice.confirmationCount
  notice.confirmed = true
  notice.confirmationCount += 1
  confirmingId.value = notice.id

  try {
    const result = await $fetch<ConfirmNoticeResponse>(
      `/api/public/notices/${encodeURIComponent(notice.id)}/confirm`,
      { method: 'POST' }
    )
    notice.confirmed = result.confirmed
    notice.confirmationCount = result.confirmationCount
  } catch {
    notice.confirmed = false
    notice.confirmationCount = previousCount
    toast.add({
      title: '已打开公告',
      description: '阅读状态暂时没有保存，稍后再次打开时会重试。',
      color: 'warning'
    })
  } finally {
    confirmingId.value = ''
  }
}

function openNoticeDetail(notice: PublicNotice): void {
  selectedNoticeId.value = notice.id
  void confirmNotice(notice)
}
</script>

<template>
  <UButton
    icon="i-lucide-bell"
    color="neutral"
    variant="ghost"
    aria-label="查看公告"
    class="relative min-h-10 min-w-10 md:min-h-11 md:min-w-11"
    @click="openNoticeCenter"
  >
    <span class="hidden lg:inline">公告</span>
    <span
      v-if="unreadCount"
      class="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-amber-600 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white"
      :aria-label="`${unreadCount} 条未读公告`"
    >{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
  </UButton>

  <UModal
    v-model:open="open"
    :title="modalTitle"
    :description="modalDescription"
    :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-xl' }"
  >
    <template #body>
      <div
        v-if="selectedNotice"
        class="flex max-h-[72dvh] min-h-0 flex-col"
      >
        <div class="mb-4 flex items-center justify-between gap-3 border-b border-zinc-200 pb-3">
          <UButton
            icon="i-lucide-arrow-left"
            label="返回公告列表"
            color="neutral"
            variant="ghost"
            size="sm"
            class="-ml-2 min-h-10"
            @click="showNoticeList"
          />
          <span
            class="inline-flex shrink-0 items-center gap-1 text-xs font-medium"
            :class="selectedNotice.confirmed ? 'text-emerald-700' : 'text-amber-700'"
          >
            <UIcon
              :name="selectedNotice.confirmed ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              class="size-3.5"
            />
            {{ selectedNotice.confirmed ? '已读' : '未读' }}
          </span>
        </div>

        <article class="min-h-0 overflow-y-auto pr-1">
          <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <UBadge
              v-if="selectedNotice.pinned"
              label="置顶公告"
              color="warning"
              variant="soft"
              size="sm"
            />
            <time :datetime="noticeTime(selectedNotice)">
              {{ noticePublishedTime(noticeTime(selectedNotice)) }}
            </time>
            <span aria-hidden="true">·</span>
            <span>{{ selectedNotice.confirmationCount }} 人已读</span>
          </div>
          <h2 class="mt-4 text-xl font-bold leading-8 text-zinc-950 sm:text-2xl">
            {{ selectedNotice.title }}
          </h2>
          <p
            v-if="selectedNotice.summary"
            class="mt-3 rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-zinc-700"
          >
            {{ selectedNotice.summary }}
          </p>
          <div class="mt-5 whitespace-pre-line text-[15px] leading-8 text-zinc-800">
            {{ selectedNotice.body || selectedNotice.summary }}
          </div>
        </article>
      </div>

      <div
        v-else-if="notices.length"
        class="max-h-[72dvh] space-y-3 overflow-y-auto pr-1"
      >
        <button
          v-for="notice in notices"
          :key="notice.id"
          type="button"
          class="group w-full rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          :class="notice.confirmed
            ? 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
            : 'border-amber-300 bg-amber-50/80 hover:border-amber-400 hover:bg-amber-50'"
          :aria-label="`${notice.confirmed ? '已读' : '未读'}公告：${notice.title}`"
          @click="openNoticeDetail(notice)"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-1 grid size-8 shrink-0 place-items-center rounded-full"
              :class="notice.confirmed ? 'bg-zinc-100 text-zinc-500' : 'bg-amber-500 text-white'"
            >
              <UIcon
                name="i-lucide-megaphone"
                class="size-4"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <UBadge
                  v-if="notice.pinned"
                  label="置顶"
                  color="warning"
                  variant="soft"
                  size="sm"
                />
                <span
                  v-if="!notice.confirmed"
                  class="text-xs font-semibold text-amber-700"
                >未读</span>
                <time
                  :datetime="noticeTime(notice)"
                  class="text-xs text-zinc-500"
                >{{ noticeRelativeTime(noticeTime(notice)) }}</time>
              </span>
              <span class="mt-1.5 block text-base font-bold leading-6 text-zinc-950">
                {{ notice.title }}
              </span>
              <span class="mt-1 line-clamp-2 block text-sm leading-6 text-zinc-600">
                {{ notice.summary }}
              </span>
              <span class="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>{{ notice.confirmationCount }} 人已读</span>
                <span class="inline-flex items-center gap-1 font-semibold text-zinc-700">
                  查看详情
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </span>
            </span>
          </div>
        </button>
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
            目前没有新公告
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
