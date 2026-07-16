<script setup lang="ts">
import {
  offlineBoundaries,
  offlineStaticEntries,
  resolveOfflineStatus
} from '~~/app/utils/offline-presentation'
import { safeLocalPath } from '~/utils/safe-navigation'

useSeoMeta({
  title: '离线状态',
  description: '仰恩新生指南的网络断开提示、缓存边界与重试入口。',
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
          PWA 离线状态
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          暂时无法更新内容
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          待网络恢复后重试。涉及报到、日期、地点、营业时间和招新的信息，不应仅凭旧页面行动。
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
              :label="isOnline ? '重新加载原页面' : '重新尝试'"
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
          离线边界
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          当前不保存动态校园数据
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
          可尝试打开
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          静态说明页面
        </h2>
        <p class="mt-2 text-xs leading-5 text-zinc-500">
          以下页面是否可用取决于当前 PWA 版本和设备缓存，本页不宣称它们已保存。
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
