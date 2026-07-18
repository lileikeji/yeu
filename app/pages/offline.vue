<script setup lang="ts">
import {
  offlineBoundaries,
  offlineStaticEntries,
  resolveOfflineStatus
} from '~~/app/utils/offline-presentation'
import { safeLocalPath } from '~/utils/safe-navigation'

useSeoMeta({
  title: '网络提示',
  description: '网络断开时查看连接状态、重试原页面，并了解哪些内容可能不是最新的。',
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
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          网络提示
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          网络连接出了点问题
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          先检查 Wi-Fi 或移动网络。连接恢复后可以回到原页面；报到、地点和营业时间等信息请不要只看旧页面。
        </p>
      </div>
    </header>

    <div class="page-shell py-8 md:py-12">
      <section
        class="flex items-start gap-4 border-y border-[var(--line)] bg-white px-4 py-5 sm:px-5"
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
          <h2 class="font-bold text-zinc-950">
            {{ status.title }}
          </h2>
          <p class="mt-1 text-sm leading-6 text-zinc-600">
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
          没有网络时要注意
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          以前打开过的页面可能不是最新的
        </h2>

        <div class="mt-5 grid gap-x-8 md:grid-cols-3">
          <article
            v-for="item in offlineBoundaries"
            :key="item.title"
            class="border-t border-zinc-200 py-5"
          >
            <h3 class="text-sm font-bold text-zinc-950">
              {{ item.title }}
            </h3>
            <p class="mt-2 text-sm leading-7 text-zinc-600">
              {{ item.text }}
            </p>
          </article>
        </div>
      </section>

      <section class="mt-6 border-t border-[var(--line)] pt-8">
        <p class="section-kicker">
          先看看这些
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          下面几页可能还能打开
        </h2>
        <p class="mt-2 text-xs leading-5 text-zinc-500">
          设备可能保留部分说明页面，但是否能打开取决于你之前是否访问过。
        </p>
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
