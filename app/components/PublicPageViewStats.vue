<script setup lang="ts">
interface PageViewStats {
  path: string
  viewCount: number
  visitorCount: number
}

const route = useRoute()
const stats = ref<PageViewStats | null>(null)
let requestToken = 0

const currentPath = computed(() => route.fullPath || '/')
const shouldTrack = computed(() => !route.path.startsWith('/admin') && !route.path.startsWith('/research'))

async function loadStats(path: string): Promise<void> {
  if (!shouldTrack.value) {
    stats.value = null
    return
  }

  const token = ++requestToken
  try {
    const result = await $fetch<PageViewStats>('/api/public/track/stats', {
      query: { path }
    })
    if (token === requestToken && result.path === currentPath.value) {
      stats.value = result
    }
  } catch {
    if (token === requestToken) stats.value = null
  }
}

function applyTrackedStats(event: Event): void {
  const detail = (event as CustomEvent<PageViewStats>).detail
  if (!detail || detail.path !== currentPath.value) return
  requestToken += 1
  stats.value = detail
}

onMounted(() => {
  window.addEventListener('public-page-view-stats', applyTrackedStats)
  void loadStats(currentPath.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('public-page-view-stats', applyTrackedStats)
})

watch(currentPath, (path) => {
  stats.value = null
  void loadStats(path)
})
</script>

<template>
  <div
    v-if="stats"
    class="border-t border-zinc-100 bg-white px-4 py-2 text-center text-xs text-zinc-400"
    aria-live="polite"
  >
    <span class="inline-flex items-center gap-1.5">
      <UIcon
        name="i-lucide-eye"
        class="size-3.5"
        aria-hidden="true"
      />
      <span>{{ stats.visitorCount }} 人看过</span>
      <span aria-hidden="true">·</span>
      <span>{{ stats.viewCount }} 次浏览</span>
    </span>
  </div>
</template>
