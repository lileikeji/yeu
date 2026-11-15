<script setup lang="ts">
interface PageViewStats {
  path: string
  viewCount: number
  visitorCount: number
}

interface Props {
  variant?: 'bar' | 'inline' | 'overlay' | 'map-dock'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'bar'
})

const route = useRoute()
const stats = ref<PageViewStats | null>(null)
let requestToken = 0

const currentPath = computed(() => route.fullPath || '/')
const shouldTrack = computed(() => !route.path.startsWith('/admin') && !route.path.startsWith('/research'))

function sameTrackedPath(left: string, right: string): boolean {
  if (left === right) return true
  try {
    return decodeURIComponent(left) === decodeURIComponent(right)
  } catch {
    return false
  }
}

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
    if (token === requestToken && sameTrackedPath(result.path, currentPath.value)) {
      stats.value = result
    }
  } catch {
    if (token === requestToken) stats.value = null
  }
}

function applyTrackedStats(event: Event): void {
  const detail = (event as CustomEvent<PageViewStats>).detail
  if (!detail || !sameTrackedPath(detail.path, currentPath.value)) return
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
    class="text-center text-xs text-zinc-400 dark:text-zinc-500"
    :class="{
      'border-t border-zinc-100 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 px-4 py-2': props.variant === 'bar',
      'px-1 py-3': props.variant === 'inline',
      'pointer-events-none absolute bottom-[calc(var(--mobile-nav-height)+0.75rem)] right-3 z-20 rounded-full border border-white/70 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] dark:bg-zinc-900/90 px-3 py-1.5 shadow-md backdrop-blur-sm md:bottom-3 md:right-4': props.variant === 'overlay',
      'pointer-events-none absolute bottom-3 right-3 z-20 max-w-[calc(100%-7rem)] whitespace-nowrap rounded-full border border-white/70 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] dark:bg-zinc-900/90 px-3 py-1.5 shadow-md backdrop-blur-sm md:bottom-3 md:right-4': props.variant === 'map-dock'
    }"
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
