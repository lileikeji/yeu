<script setup lang="ts">
// 新版本检测：页面里加载的是旧 JS 时，提示用户刷新，而不是让人以为"改了没生效"。
const POLL_MS = 120_000

const { $pwa } = useNuxtApp()
const currentBuild = ref<string | null>(null)
const outdated = ref(false)
const dismissed = ref(false)

async function readBuild(): Promise<string> {
  const res = await $fetch<{ commit: string, release: string }>('/api/public/build', { cache: 'no-store' })
  return `${res.commit}@${res.release}`
}

async function check(): Promise<void> {
  try {
    const build = await readBuild()
    if (currentBuild.value === null) {
      currentBuild.value = build
      return
    }
    if (build !== currentBuild.value) outdated.value = true
  } catch {
    // 网络抖动忽略，下一轮再试
  }
}

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  void check()
  timer = setInterval(() => void check(), POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

function onVisible(): void {
  if (document.visibilityState === 'visible') void check()
}

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div
    v-if="outdated && !dismissed && !$pwa?.needRefresh"
    class="fixed inset-x-3 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-[70] flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-lg md:inset-x-auto md:right-4 md:bottom-4"
    role="status"
  >
    <span class="flex-1">站点已更新，当前页面还是旧版本。</span>
    <UButton
      size="xs"
      color="warning"
      variant="solid"
      @click="reload"
    >
      刷新
    </UButton>
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      aria-label="忽略更新提示"
      @click="() => { dismissed = true }"
    >
      稍后
    </UButton>
  </div>
</template>
