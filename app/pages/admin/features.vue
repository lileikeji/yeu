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

onMounted(() => void loadFeatures())
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <AdminPageHeader
      title="前台功能"
      description="控制首页每个功能卡片是否显示。关闭后用户刷新首页就不会再看到该入口。"
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
      class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      {{ errorMessage }}
    </div>

    <section
      class="grid grid-cols-2 gap-3 sm:max-w-md"
      aria-label="功能显示概况"
    >
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          前台显示
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
          {{ enabledCount }}
        </p>
      </div>
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          已关闭
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-700">
          {{ disabledCount }}
        </p>
      </div>
    </section>

    <div
      v-if="loading && !items.length"
      class="grid min-h-64 place-items-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-500"
      role="status"
    >
      <div class="text-center">
        <UIcon
          name="i-lucide-loader-circle"
          class="mx-auto size-6 animate-spin text-green-700"
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
        class="overflow-hidden rounded-md border border-zinc-200 bg-white"
      >
        <div class="border-b border-zinc-100 px-4 py-3 sm:px-5">
          <h2 class="text-sm font-bold text-zinc-950">
            {{ group.label }}
          </h2>
          <p class="mt-1 text-xs text-zinc-500">
            {{ group.features.length }} 个可控制入口
          </p>
        </div>

        <ul class="divide-y divide-zinc-100">
          <li
            v-for="feature in group.features"
            :key="feature.key"
            class="flex min-h-20 items-center gap-3 px-4 py-4 sm:px-5"
          >
            <span
              class="grid size-10 shrink-0 place-items-center rounded-md"
              :class="feature.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'"
            >
              <UIcon
                :name="feature.icon"
                class="size-5"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-sm font-semibold text-zinc-950">
                  {{ feature.title }}
                </h3>
                <UBadge
                  :label="feature.enabled ? '显示中' : '已关闭'"
                  :color="feature.enabled ? 'success' : 'neutral'"
                  variant="soft"
                  size="sm"
                />
              </div>
              <p class="mt-1 text-xs leading-5 text-zinc-500">
                {{ feature.description }}
              </p>
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
