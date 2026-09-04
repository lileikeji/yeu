<script setup lang="ts">
import type { ApiContent, ApiNoticeAction } from '~~/shared/types/server'
import { safeNoticeActionHref } from '~~/shared/utils/notice-actions'
import {
  noticePublishedTime,
  noticeRelativeTime,
  noticeUnreadCount
} from '~/utils/notice-presentation'

interface PublicNotice extends ApiContent {
  pinned: boolean
  autoPopup: boolean
  actions: ApiNoticeAction[]
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
const autoPopupReady = ref(false)
const autoPopupShown = ref(false)
const detailSource = ref<'list' | 'auto' | null>(null)
const toast = useToast()
const autoPopupDismissalKey = 'yeu-notice-auto-popup-dismissed-v1'
const { data } = await useFetch<{ items: PublicNotice[], total: number }>('/api/public/notices', {
  key: 'public-notices'
})
const notices = computed(() => data.value?.items ?? [])
const unreadCount = computed(() => noticeUnreadCount(notices.value))
const selectedNotice = computed(() => notices.value.find(notice => notice.id === selectedNoticeId.value) ?? null)
const modalTitle = computed(() => selectedNotice.value ? '公告详情' : '公告通知')

function replaceNotice(id: string, patch: Partial<PublicNotice>): void {
  if (!data.value) return
  data.value = {
    ...data.value,
    items: data.value.items.map(notice => notice.id === id
      ? { ...notice, ...patch }
      : notice)
  }
}

const modalDescription = computed(() => selectedNotice.value
  ? '查看公告的完整内容和发布时间。'
  : unreadCount.value > 0
    ? `还有 ${unreadCount.value} 条公告未读`
    : '近期公告都已阅读')

function noticeTime(notice: PublicNotice): string {
  return notice.publishedAt || notice.updatedAt
}

function noticeActionHref(action: ApiNoticeAction): string | null {
  return safeNoticeActionHref(action.href)
}

function openNoticeCenter(): void {
  selectedNoticeId.value = ''
  detailSource.value = null
  open.value = true
}

async function confirmNotice(notice: PublicNotice): Promise<void> {
  if (notice.confirmed || confirmingId.value === notice.id) return

  const previousCount = notice.confirmationCount
  replaceNotice(notice.id, {
    confirmed: true,
    confirmationCount: previousCount + 1
  })
  confirmingId.value = notice.id

  try {
    const result = await $fetch<ConfirmNoticeResponse>(
      `/api/public/notices/${encodeURIComponent(notice.id)}/confirm`,
      { method: 'POST' }
    )
    replaceNotice(notice.id, {
      confirmed: result.confirmed,
      confirmationCount: result.confirmationCount
    })
  } catch {
    replaceNotice(notice.id, {
      confirmed: false,
      confirmationCount: previousCount
    })
    toast.add({
      title: '已打开公告',
      description: '阅读状态暂时没有保存，稍后再次打开时会重试。',
      color: 'warning'
    })
  } finally {
    confirmingId.value = ''
  }
}

function openNoticeDetail(notice: PublicNotice, source: 'list' | 'auto' = 'list'): void {
  selectedNoticeId.value = notice.id
  detailSource.value = source
  open.value = true
  void confirmNotice(notice)
}

function handleModalOpenChange(nextOpen: boolean): void {
  if (nextOpen) {
    open.value = true
    return
  }

  // Closing a detail opened from the list returns to that list. A forced
  // entry popup closes completely, so it does not trap the visitor in a list.
  if (selectedNoticeId.value && detailSource.value === 'list') {
    selectedNoticeId.value = ''
    detailSource.value = null
    open.value = true
    return
  }

  selectedNoticeId.value = ''
  detailSource.value = null
  open.value = false
}

function todayKey(): string {
  // `sv-SE` gives a stable YYYY-MM-DD value in the visitor's local timezone.
  return new Date().toLocaleDateString('sv-SE')
}

function hasDismissedAutoPopupToday(noticeId: string): boolean {
  if (import.meta.server) return false

  try {
    const saved = JSON.parse(localStorage.getItem(autoPopupDismissalKey) || 'null') as {
      noticeId?: string
      date?: string
    } | null
    return saved?.noticeId === noticeId && saved.date === todayKey()
  } catch {
    return false
  }
}

function dismissAutoPopupForToday(): void {
  const notice = selectedNotice.value
  if (!notice || !notice.autoPopup || import.meta.server) return

  try {
    localStorage.setItem(autoPopupDismissalKey, JSON.stringify({
      noticeId: notice.id,
      date: todayKey()
    }))
  } catch {
    // Private browsing modes can deny localStorage; closing still works.
  }

  open.value = false
}

function openAutomaticNotice(): void {
  if (!autoPopupReady.value || autoPopupShown.value || open.value) return
  // `autoPopup` controls entry-time display. Read state is only for the
  // list badge/color; a read notice should still open when the editor has
  // explicitly enabled entry-time announcements.
  const notice = notices.value.find(item => item.autoPopup)
  if (!notice || hasDismissedAutoPopupToday(notice.id)) return
  autoPopupShown.value = true
  openNoticeDetail(notice, 'auto')
}

// The notice request can resolve during SSR hydration or just after the
// component mounts. Watching both sources and deferring to the next tick keeps
// the modal trigger reliable in either case.
watch(
  [notices, autoPopupReady],
  () => {
    if (autoPopupReady.value) void nextTick(openAutomaticNotice)
  },
  { deep: true }
)

onMounted(() => {
  autoPopupReady.value = true
  void nextTick(openAutomaticNotice)
})
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
    :open="open"
    :title="modalTitle"
    :description="modalDescription"
    :ui="{
      content: 'w-[calc(100vw-1rem)] overflow-hidden sm:max-w-xl',
      header: 'border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 sm:px-5 sm:py-4',
      body: 'p-0'
    }"
    @update:open="handleModalOpenChange"
  >
    <template #title>
      <span class="inline-flex items-center gap-2">
        <span class="grid size-7 shrink-0 place-items-center rounded-full bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-400">
          <UIcon
            name="i-lucide-bell"
            class="size-4"
            aria-hidden="true"
          />
        </span>
        <span>{{ modalTitle }}</span>
      </span>
    </template>
    <template #body>
      <div
        v-if="selectedNotice"
        class="flex max-h-[min(72dvh,42rem)] min-h-0 flex-col px-4 pb-4 sm:px-5 sm:pb-5"
      >
        <article class="min-h-0 overflow-y-auto overscroll-y-contain pr-1">
          <div class="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <UBadge
                v-if="selectedNotice.pinned"
                label="置顶公告"
                color="warning"
                variant="soft"
                size="sm"
                icon="i-lucide-pin"
              />
              <time :datetime="noticeTime(selectedNotice)">
                {{ noticePublishedTime(noticeTime(selectedNotice)) }}
              </time>
              <span aria-hidden="true">·</span>
            </div>
            <span class="ml-auto inline-flex shrink-0 items-center gap-2">
              <span>{{ selectedNotice.confirmationCount }} 人已读</span>
              <span
                class="inline-flex items-center gap-1 font-medium"
                :class="selectedNotice.confirmed ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'"
              >
                <UIcon
                  :name="selectedNotice.confirmed ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  class="size-3.5"
                />
                {{ selectedNotice.confirmed ? '已读' : '未读' }}
              </span>
            </span>
          </div>
          <h2 class="mt-2 text-xl font-bold leading-8 text-zinc-950 dark:text-zinc-100 sm:text-2xl">
            {{ selectedNotice.title }}
          </h2>
          <p
            v-if="selectedNotice.summary"
            class="mt-2 rounded-md border-l-4 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-3 py-2.5 text-sm leading-6 text-zinc-700 dark:text-zinc-200"
          >
            {{ selectedNotice.summary }}
          </p>
          <div class="mt-3 whitespace-pre-line text-[15px] leading-7 text-zinc-800 dark:text-zinc-100">
            {{ selectedNotice.body || selectedNotice.summary }}
          </div>

          <div
            v-if="selectedNotice.actions?.length"
            class="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-3"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              快捷入口
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                v-for="action in selectedNotice.actions"
                :key="`${action.label}-${action.href}`"
                :to="noticeActionHref(action) || undefined"
                :icon="action.icon || 'i-lucide-arrow-up-right'"
                :label="action.label"
                color="primary"
                variant="soft"
                size="sm"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <UButton
              v-if="selectedNotice.autoPopup"
              icon="i-lucide-calendar-off"
              label="今日不再弹出"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="dismissAutoPopupForToday"
            />
          </div>
        </article>
      </div>

      <div
        v-else-if="notices.length"
        class="max-h-[min(72dvh,42rem)] space-y-2 overflow-y-auto overscroll-y-contain px-4 pb-4 pr-1 sm:px-5 sm:pb-5"
      >
        <button
          v-for="notice in notices"
          :key="notice.id"
          type="button"
          class="group w-full rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          :class="notice.confirmed
            ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
            : 'border-amber-300 dark:border-amber-800 bg-amber-50/80 hover:border-amber-400 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950'"
          :aria-label="`${notice.confirmed ? '已读' : '未读'}公告：${notice.title}`"
          @click="openNoticeDetail(notice)"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-1 grid size-8 shrink-0 place-items-center rounded-full"
              :class="notice.confirmed ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400' : 'bg-amber-500 text-white'"
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
                  icon="i-lucide-pin"
                />
                <span
                  v-if="!notice.confirmed"
                  class="text-xs font-semibold text-amber-700 dark:text-amber-300"
                >未读</span>
                <time
                  :datetime="noticeTime(notice)"
                  class="text-xs text-zinc-500 dark:text-zinc-400"
                >{{ noticeRelativeTime(noticeTime(notice)) }}</time>
              </span>
              <span class="mt-1.5 block text-base font-bold leading-6 text-zinc-950 dark:text-zinc-100">
                {{ notice.title }}
              </span>
              <span class="mt-1 line-clamp-2 block text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {{ notice.summary }}
              </span>
              <span class="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{{ notice.confirmationCount }} 人已读</span>
                <span class="inline-flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-200">
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
        class="grid min-h-40 place-items-center text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        <div>
          <UIcon
            name="i-lucide-bell-off"
            class="mx-auto size-6 text-zinc-400 dark:text-zinc-500"
          />
          <p class="mt-2">
            目前没有新公告
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
