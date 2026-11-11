<script setup lang="ts">
import type { ApiFrontendFeature } from '~~/shared/types/server'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'

definePageMeta({ layout: 'admin' })

const toast = useToast()
const items = ref<ApiFrontendFeature[]>([])
const loading = ref(true)
const errorMessage = ref('')
const savingKeys = ref(new Set<string>())

const groups = computed(() => {
  const grouped = new Map<string, ApiFrontendFeature[]>()
  for (const item of items.value) {
    const group = grouped.get(item.group) ?? []
    group.push(item)
    grouped.set(item.group, group)
  }
  return [...grouped.entries()].map(([label, features]) => ({ label, features }))
})

const enabledCount = computed(() => items.value.filter(item => item.enabled).length)
const disabledCount = computed(() => items.value.length - enabledCount.value)

const placementOptions = [
  { value: 'default', label: '默认模块' },
  { value: 'quick', label: '常用查询' },
  { value: 'timeline', label: '按入学阶段' },
  { value: 'services', label: '服务导航' }
] as const

async function loadFeatures(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await adminFetch<{ items: ApiFrontendFeature[] }>('/api/admin/features')
    items.value = response.items ?? []
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '前台功能加载失败')
  } finally {
    loading.value = false
  }
}

async function setFeatureEnabled(item: ApiFrontendFeature, enabled: boolean): Promise<void> {
  if (savingKeys.value.has(item.key) || item.enabled === enabled) return
  savingKeys.value = new Set(savingKeys.value).add(item.key)
  try {
    const response = await adminFetch<{ item: ApiFrontendFeature }>('/api/admin/features', {
      method: 'PUT',
      body: { key: item.key, enabled }
    })
    const index = items.value.findIndex(feature => feature.key === item.key)
    if (index >= 0) items.value.splice(index, 1, response.item)
    toast.add({
      title: enabled ? '已在前台显示' : '已从前台隐藏',
      description: item.title,
      color: enabled ? 'success' : 'neutral'
    })
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ title: getRequestMessage(error, '保存失败'), color: 'error' })
  } finally {
    const next = new Set(savingKeys.value)
    next.delete(item.key)
    savingKeys.value = next
  }
}

async function updateFeatureLayout(
  item: ApiFrontendFeature,
  patch: { placement?: ApiFrontendFeature['placement'], sortOrder?: number }
): Promise<void> {
  if (savingKeys.value.has(item.key)) return
  savingKeys.value = new Set(savingKeys.value).add(item.key)
  try {
    const response = await adminFetch<{ item: ApiFrontendFeature }>('/api/admin/features', {
      method: 'PUT',
      body: {
        key: item.key,
        enabled: item.enabled,
        placement: patch.placement ?? item.placement,
        sortOrder: patch.sortOrder ?? item.sortOrder
      }
    })
    const index = items.value.findIndex(feature => feature.key === item.key)
    if (index >= 0) items.value.splice(index, 1, response.item)
    toast.add({ title: '前台位置已保存', description: item.title, color: 'success' })
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ title: getRequestMessage(error, '位置保存失败'), color: 'error' })
  } finally {
    const next = new Set(savingKeys.value)
    next.delete(item.key)
    savingKeys.value = next
  }
}

function onPlacementChange(item: ApiFrontendFeature, event: Event): void {
  const value = (event.target as HTMLSelectElement).value as ApiFrontendFeature['placement']
  void updateFeatureLayout(item, { placement: value })
}

function onSortOrderChange(item: ApiFrontendFeature, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isInteger(value) || value < 0 || value > 9999 || value === item.sortOrder) return
  void updateFeatureLayout(item, { sortOrder: value })
}

onMounted(() => void loadFeatures())
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <AdminPageHeader
      title="前台功能"
      icon="i-lucide-layout-grid"
      eyebrow="内容管理"
    >
      <template #actions>
        <UButton
          to="/"
          icon="i-lucide-external-link"
          label="查看首页"
          color="neutral"
          variant="outline"
          target="_blank"
          rel="noopener noreferrer"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="loadFeatures"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-300"
      role="alert"
    >
      {{ errorMessage }}
    </div>

    <section
      class="grid grid-cols-2 gap-3 sm:max-w-md"
      aria-label="功能显示概况"
    >
      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          前台显示
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {{ enabledCount }}
        </p>
      </div>
      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          已关闭
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-700 dark:text-zinc-200">
          {{ disabledCount }}
        </p>
      </div>
    </section>

    <div
      v-if="loading && !items.length"
      class="grid min-h-64 place-items-center rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-500 dark:text-zinc-400"
      role="status"
    >
      <div class="text-center">
        <UIcon
          name="i-lucide-loader-circle"
          class="mx-auto size-6 animate-spin text-green-700 dark:text-green-400"
        />
        <p class="mt-3">
          正在加载前台功能
        </p>
      </div>
    </div>

    <div
      v-else
      class="space-y-5"
    >
      <section
        v-for="group in groups"
        :key="group.label"
        class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
      >
        <div class="border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 sm:px-5">
          <h2 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
            {{ group.label }}
          </h2>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {{ group.features.length }} 个可控制入口
          </p>
        </div>

        <ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <li
            v-for="feature in group.features"
            :key="feature.key"
            class="flex min-h-20 items-center gap-3 px-4 py-4 sm:px-5"
          >
            <span
              class="grid size-10 shrink-0 place-items-center rounded-md"
              :class="feature.enabled ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'"
            >
              <UIcon
                :name="feature.icon"
                class="size-5"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  {{ feature.title }}
                </h3>
                <UBadge
                  :label="feature.enabled ? '显示中' : '已关闭'"
                  :color="feature.enabled ? 'success' : 'neutral'"
                  variant="soft"
                  size="sm"
                />
              </div>
              <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {{ feature.description }}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <label class="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>显示模块</span>
                  <select
                    class="h-8 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                    :value="feature.placement"
                    :disabled="savingKeys.has(feature.key)"
                    :aria-label="`${feature.title}显示模块`"
                    @change="onPlacementChange(feature, $event)"
                  >
                    <option
                      v-for="option in placementOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>顺序</span>
                  <input
                    class="h-8 w-20 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 text-xs tabular-nums text-zinc-800 dark:text-zinc-100 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                    type="number"
                    min="0"
                    max="9999"
                    step="1"
                    :value="feature.sortOrder"
                    :disabled="savingKeys.has(feature.key)"
                    :aria-label="`${feature.title}显示顺序`"
                    @change="onSortOrderChange(feature, $event)"
                  >
                </label>
              </div>
            </div>
            <USwitch
              :model-value="feature.enabled"
              :disabled="savingKeys.has(feature.key)"
              :loading="savingKeys.has(feature.key)"
              :aria-label="`${feature.enabled ? '关闭' : '显示'}${feature.title}`"
              @update:model-value="setFeatureEnabled(feature, $event)"
            />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
