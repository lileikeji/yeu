<script setup lang="ts">
import {
  buildDiscoverTaskPreview,
  discoverDirectoryEntries,
  discoverTaskPreviewLimit,
  discoverTaskEntries,
  discoverTrustEntries
} from '~~/app/utils/discover-presentation'

useSeoMeta({
  title: '更多服务',
  description: '按现在要做的事，进校园地图、报到、指南、部门、社团和周边。'
})

const tasksExpanded = ref(false)
const taskPreview = computed(() => buildDiscoverTaskPreview(discoverTaskEntries, tasksExpanded.value))
const visibleTaskEntries = computed(() => taskPreview.value.items)

function toggleTaskPreview(): void {
  tasksExpanded.value = !tasksExpanded.value
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-4 md:py-5">
        <div class="flex items-end justify-between gap-4">
          <div class="max-w-2xl">
            <p class="section-kicker">
              所有入口
            </p>
            <h1 class="mt-1 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
              你现在想做什么
            </h1>
          </div>
          <UButton
            to="/search"
            icon="i-lucide-search"
            size="md"
            class="justify-center min-h-11 min-w-11 shrink-0"
            aria-label="搜索全站"
          >
            <span class="hidden sm:inline">搜索全站</span>
          </UButton>
        </div>
      </div>
    </header>

    <div>
      <section class="page-shell py-4 md:py-5">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="section-kicker">
              常用入口
            </p>
            <h2 class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
              开学最常用的入口
            </h2>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <UButton
              to="/map"
              icon="i-lucide-map"
              label="地图"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
            <UButton
              v-if="discoverTaskEntries.length > discoverTaskPreviewLimit"
              :icon="tasksExpanded ? 'i-lucide-chevron-up' : 'i-lucide-layout-grid'"
              :label="tasksExpanded ? '收起' : `全部 ${discoverTaskEntries.length}`"
              color="neutral"
              variant="ghost"
              class="min-h-11"
              :aria-expanded="tasksExpanded"
              @click="toggleTaskPreview"
            />
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
          <NuxtLink
            v-for="entry in visibleTaskEntries"
            :key="entry.to"
            :to="entry.to"
            class="surface-panel group relative flex min-h-20 items-center gap-2.5 p-2.5 transition hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm sm:min-h-24 sm:gap-3 sm:p-3"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-md sm:size-10"
              :class="entry.tone"
            >
              <UIcon
                :name="entry.icon"
                class="size-4 sm:size-5"
              />
            </span>
            <span class="min-w-0 flex-1 pr-3 sm:pr-0">
              <span class="block truncate text-[10px] font-medium leading-4 text-green-700 dark:text-green-400 sm:text-[11px] sm:leading-5">{{ entry.when }}</span>
              <span class="mt-0.5 block text-sm font-bold leading-5 text-zinc-950 dark:text-zinc-100 sm:text-base">{{ entry.title }}</span>
              <span class="mt-1.5 hidden text-xs leading-5 text-zinc-600 dark:text-zinc-300 sm:block">{{ entry.description }}</span>
            </span>
            <UIcon
              name="i-lucide-arrow-right"
              class="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 shrink-0 text-zinc-300 dark:text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-green-700 dark:group-hover:text-green-400 sm:static sm:mt-1 sm:translate-y-0"
            />
          </NuxtLink>
        </div>
      </section>

      <section class="border-y border-[var(--line)] bg-white dark:bg-zinc-900">
        <div class="page-shell py-4 md:py-5">
          <p class="section-kicker">
            继续浏览
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
            按内容找
          </h2>

          <div class="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <NuxtLink
              v-for="entry in discoverDirectoryEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-16 items-center gap-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5 hover:border-green-300 dark:hover:border-green-700 sm:min-h-20 sm:p-3"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 group-hover:bg-green-50 dark:group-hover:bg-green-950 group-hover:text-green-700 dark:group-hover:text-green-400">
                <UIcon
                  :name="entry.icon"
                  class="size-4"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-zinc-950 dark:text-zinc-100">{{ entry.title }}</span>
                <span class="mt-1 hidden text-xs leading-5 text-zinc-500 dark:text-zinc-400 sm:block">{{ entry.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-zinc-300 dark:text-zinc-600 group-hover:text-green-700 dark:group-hover:text-green-400"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="page-shell py-4 md:py-5">
        <p class="section-kicker">
          帮助与说明
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          信息从哪来，哪里错了怎么说
        </h2>

        <div class="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          <NuxtLink
            v-for="entry in discoverTrustEntries"
            :key="entry.to"
            :to="entry.to"
            class="group flex min-h-16 items-center gap-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5 hover:border-green-300 dark:hover:border-green-700 sm:min-h-20 sm:p-3"
          >
            <UIcon
              :name="entry.icon"
              class="size-4 shrink-0 text-green-700 dark:text-green-400"
            />
            <span class="min-w-0">
              <span class="block text-sm font-bold text-zinc-950 dark:text-zinc-100 group-hover:text-green-700 dark:group-hover:text-green-400">{{ entry.title }}</span>
              <span class="mt-1 hidden text-xs leading-5 text-zinc-500 dark:text-zinc-400 sm:block">{{ entry.description }}</span>
            </span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
