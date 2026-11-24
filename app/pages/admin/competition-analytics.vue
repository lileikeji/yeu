<script setup lang="ts">
import type { CompetitionAdminPayload } from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from '~~/app/composables/useCompetitionRoster'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '大赛数据可视化',
  robots: 'noindex, nofollow'
})

const loading = ref(true)
const loadError = ref('')
const payload = ref<CompetitionAdminPayload | null>(null)
const autoRefresh = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function load(silent = false): Promise<void> {
  if (!silent) {
    loading.value = true
    loadError.value = ''
  }
  try {
    payload.value = await adminFetch<CompetitionAdminPayload>('/api/admin/competition')
  } catch (error) {
    if (!silent) {
      const status = (error as { statusCode?: number }).statusCode
      loadError.value = status === 403
        ? '仅限组织管理员或超级管理员查看。'
        : apiErrorMessage(error, '比赛数据加载失败，请刷新重试。')
    }
  } finally {
    if (!silent) loading.value = false
  }
}

watch(autoRefresh, (enabled) => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (enabled) {
    pollTimer = setInterval(() => {
      void load(true)
    }, 8000)
  }
})

onMounted(() => {
  void load()
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {{ payload?.event.title || '新声歌手大赛' }} · 数据可视化
        </h1>
        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {{ payload?.event.edition ? `${payload.event.edition} · ` : '' }}选手实况、跨轮综合实力建模与决赛 1v1 对阵预测
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-sliders-horizontal"
          label="返回大赛管理"
          to="/admin/competition"
          color="neutral"
          variant="soft"
        />
        <UButton
          :icon="autoRefresh ? 'i-lucide-pause' : 'i-lucide-radio'"
          :label="autoRefresh ? '实时轮询中' : '开启实时刷新'"
          :color="autoRefresh ? 'success' : 'neutral'"
          variant="soft"
          @click="autoRefresh = !autoRefresh"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="soft"
          :loading="loading"
          @click="load()"
        />
      </div>
    </div>

    <div
      v-if="loading && !payload"
      class="grid min-h-80 place-items-center"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-7 animate-spin text-green-700 dark:text-green-400"
      />
    </div>

    <div
      v-else-if="loadError"
      class="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      role="alert"
    >
      {{ loadError }}
    </div>

    <AdminCompetitionAnalyticsPanel
      v-else-if="payload"
      :payload="payload"
      @update:payload="payload = $event"
      @refresh="load()"
    />
  </div>
</template>
