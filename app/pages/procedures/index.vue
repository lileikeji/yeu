<script setup lang="ts">
import {
  filterProcedureListItems,
  procedureListAudienceOptions,
  procedureListDetailQuery,
  procedureListMessages,
  procedureMethodLabel
} from '~~/app/utils/procedure-list-presentation'

const { data, error, refresh } = await usePublicProcedureList()

useSeoMeta({
  title: '新生办事流程',
  description: '按顺序查看仰恩大学新生报到等事项的时间、材料、地点、负责部门和待通知状态。'
})

const query = ref('')
const audience = ref<'all' | 'undergraduate' | 'transfer'>('all')

const procedures = computed(() => filterProcedureListItems(data.value?.items ?? [], {
  query: query.value,
  audience: audience.value
}))
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          按步骤办理
        </p>
        <div class="mt-2 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div class="max-w-3xl">
            <h1 class="text-2xl font-bold text-zinc-950 md:text-3xl">
              新生办事流程
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              已确认信息和待通知事项分开展示。涉及个人时段、材料、地点和费用时，以录取通知书及学校当年通知为准。
            </p>
          </div>
          <UButton
            to="/guides"
            icon="i-lucide-notebook-tabs"
            label="查看背景指南"
            color="neutral"
            variant="outline"
            class="min-h-11 self-start md:self-auto"
          />
        </div>

        <div class="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            size="lg"
            placeholder="搜索报到或办事事项"
            aria-label="搜索办事流程"
          />
          <div
            class="scrollbar-none flex gap-1 overflow-x-auto"
            aria-label="适用人群"
          >
            <UButton
              v-for="option in procedureListAudienceOptions"
              :key="option.value"
              :label="option.label"
              :color="audience === option.value ? 'primary' : 'neutral'"
              :variant="audience === option.value ? 'soft' : 'ghost'"
              class="min-h-11 shrink-0"
              :aria-pressed="audience === option.value"
              @click="() => { audience = option.value }"
            />
          </div>
        </div>
      </div>
    </header>

    <div class="page-shell page-section">
      <div
        v-if="error"
        class="border-y border-red-200 bg-red-50 px-5 py-10 text-center"
        role="alert"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="mx-auto size-6 text-red-700"
        />
        <p class="mt-3 text-sm text-red-900">
          {{ procedureListMessages.serviceUnavailable }}
        </p>
        <UButton
          icon="i-lucide-refresh-cw"
          label="重新加载"
          color="neutral"
          variant="outline"
          class="mt-4"
          @click="refresh()"
        />
      </div>

      <template v-else>
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-zinc-900">
            {{ procedures.length }} 项流程
          </h2>
          <span class="text-xs text-zinc-500">无需登录</span>
        </div>

        <div
          v-if="procedures.length"
          class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <NuxtLink
            v-for="item in procedures"
            :key="item.id"
            :to="{
              path: `/procedures/${item.slug}`,
              query: procedureListDetailQuery(audience)
            }"
            class="surface-panel group flex min-h-60 flex-col p-5 transition hover:border-green-300 hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
                <UIcon
                  name="i-lucide-list-checks"
                  class="size-5"
                />
              </span>
              <UBadge
                :color="item.informationState === 'confirmed' ? 'success' : 'warning'"
                variant="soft"
                class="max-w-[12rem] whitespace-normal text-right"
              >
                {{ item.statusText }}
              </UBadge>
            </div>
            <h2 class="mt-5 text-base font-bold text-zinc-950">
              {{ item.title }}
            </h2>
            <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
              {{ item.summary }}
            </p>
            <div class="mt-5 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
              <div class="flex items-center justify-between gap-3">
                <span>{{ procedureMethodLabel(item.method) }}</span>
                <span class="inline-flex items-center gap-1 font-medium text-green-700">
                  {{ item.steps.length }} 个步骤
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-3.5 transition group-hover:translate-x-0.5"
                  />
                </span>
              </div>
              <p
                v-if="item.deadlineText"
                class="mt-2 line-clamp-2 leading-5"
              >
                {{ item.deadlineText }}
              </p>
            </div>
          </NuxtLink>
        </div>

        <div
          v-else
          class="border-y border-zinc-200 bg-white px-5 py-12 text-center"
        >
          <UIcon
            name="i-lucide-list-x"
            class="mx-auto size-6 text-zinc-400"
          />
          <p class="mt-3 text-sm text-zinc-600">
            {{ procedureListMessages.emptyMatch }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
