<script setup lang="ts">
import {
  offlineBoundaries,
  offlineStaticEntries,
  resolveOfflineStatus
} from '~~/app/utils/offline-presentation'
import { safeLocalPath } from '~/utils/safe-navigation'

useSeoMeta({
  title: '网络提示',
  description: '网络断开时检查连接、回到原页面，并确认哪些校园信息需要联网后重新查看。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const router = useRouter()
const isOnline = ref<boolean | null>(null)

const retryPath = computed(() => {
  const value = safeLocalPath(route.query.from)
  return value && !value.startsWith('/offline') ? value : '/'
})

const status = computed(() => resolveOfflineStatus(isOnline.value))

function updateNetworkStatus() {
  isOnline.value = navigator.onLine
}

function retry() {
  window.location.assign(retryPath.value)
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }

  void navigateTo('/discover')
}

onMounted(() => {
  updateNetworkStatus()
  window.addEventListener('online', updateNetworkStatus)
  window.addEventListener('offline', updateNetworkStatus)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateNetworkStatus)
  window.removeEventListener('offline', updateNetworkStatus)
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          {{ status.pageKicker }}
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          {{ status.pageTitle }}
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          {{ status.pageDescription }}
        </p>
      </div>
    </header>

    <div class="page-shell py-8 md:py-12">
      <section
        class="flex max-w-3xl items-start gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900 px-4 py-5 shadow-sm sm:px-5"
        role="status"
        aria-live="polite"
      >
        <span
          class="grid size-11 shrink-0 place-items-center rounded-md"
          :class="status.tone"
        >
          <UIcon
            :name="status.icon"
            class="size-5"
            :class="isOnline === null ? 'animate-spin' : ''"
          />
        </span>
        <div class="min-w-0">
          <h2 class="font-bold text-zinc-950 dark:text-zinc-100">
            {{ status.title }}
          </h2>
          <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ status.description }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <UButton
              icon="i-lucide-refresh-cw"
              :label="isOnline ? '回到原页面' : '再试一次'"
              class="min-h-11"
              @click="retry"
            />
            <UButton
              icon="i-lucide-arrow-left"
              label="返回上一页"
              color="neutral"
              variant="outline"
              class="min-h-11"
              @click="goBack"
            />
          </div>
        </div>
      </section>

      <section class="mt-10">
        <p class="section-kicker">
          现在先这样做
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          重要信息等联网后再确认
        </h2>

        <div class="mt-5 grid gap-x-8 md:grid-cols-3">
          <article
            v-for="item in offlineBoundaries"
            :key="item.title"
            class="flex gap-3 border-t border-zinc-200 dark:border-zinc-800 py-5"
          >
            <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300">
              <UIcon
                :name="item.icon"
                class="size-4"
              />
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                {{ item.title }}
              </h3>
              <p class="mt-1.5 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                {{ item.text }}
              </p>
            </div>
          </article>
        </div>
      </section>

      <section class="mt-6 border-t border-[var(--line)] pt-8">
        <p class="section-kicker">
          还能先看看
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          之前看过的常用页面
        </h2>
        <div class="mt-4 grid gap-2 sm:grid-cols-3">
          <UButton
            v-for="entry in offlineStaticEntries"
            :key="entry.to"
            :to="entry.to"
            :icon="entry.icon"
            :label="entry.title"
            color="neutral"
            variant="outline"
            class="min-h-11 justify-start"
          />
        </div>
      </section>
    </div>
  </div>
</template>
