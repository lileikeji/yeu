<script setup lang="ts">
import {
  buildDiscoverAccountEntries,
  buildDiscoverTaskPreview,
  discoverDirectoryEntries,
  discoverTaskPreviewLimit,
  discoverTaskEntries,
  discoverTrustEntries
} from '~~/app/utils/discover-presentation'

useSeoMeta({
  title: '更多服务',
  description: '按新生当前要做的事，快速进入仰恩校园地图、报到、指南、部门、社团与周边目录。'
})

const { isAuthenticated, refreshSession } = useUserSession()
await refreshSession()

const tasksExpanded = ref(false)
const taskPreview = computed(() => buildDiscoverTaskPreview(discoverTaskEntries, tasksExpanded.value))
const visibleTaskEntries = computed(() => taskPreview.value.items)
const accountEntries = computed(() => buildDiscoverAccountEntries(isAuthenticated.value))

function toggleTaskPreview(): void {
  tasksExpanded.value = !tasksExpanded.value
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-5 md:py-7">
        <div class="flex items-end justify-between gap-4">
          <div class="max-w-2xl">
            <p class="section-kicker">
              所有入口
            </p>
            <h1 class="mt-1 text-2xl font-bold text-zinc-950 md:text-3xl">
              你现在想做什么
            </h1>
            <p class="mt-2 text-sm leading-6 text-zinc-600">
              按要办的事直接进入，也可以搜索地点、部门和社团。
            </p>
          </div>
          <UButton
            to="/search"
            icon="i-lucide-search"
            size="md"
            class="min-h-11 min-w-11 shrink-0"
            aria-label="搜索全站"
          >
            <span class="hidden sm:inline">搜索全站</span>
          </UButton>
        </div>
      </div>
    </header>

    <div>
      <section class="page-shell py-5 md:py-7">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="section-kicker">
              常用入口
            </p>
            <h2 class="mt-1 text-xl font-bold text-zinc-950">
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
            class="surface-panel group relative flex min-h-24 items-center gap-3 p-3 transition hover:border-green-300 hover:shadow-sm sm:min-h-28 sm:gap-4 sm:p-4"
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
              <span class="block truncate text-[10px] font-medium leading-4 text-green-700 sm:text-[11px] sm:leading-5">{{ entry.when }}</span>
              <span class="mt-0.5 block text-sm font-bold leading-5 text-zinc-950 sm:text-base">{{ entry.title }}</span>
              <span class="mt-1.5 hidden text-xs leading-5 text-zinc-600 sm:block">{{ entry.description }}</span>
            </span>
            <UIcon
              name="i-lucide-arrow-right"
              class="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-green-700 sm:static sm:mt-1 sm:translate-y-0"
            />
          </NuxtLink>
        </div>
      </section>

      <section class="border-y border-green-100 bg-green-50/60">
        <div class="page-shell py-5 md:py-7">
          <p class="section-kicker">
            账号与交流
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            {{ isAuthenticated ? '个人资料与新生群聊' : '群聊和个人资料需要登录' }}
          </h2>
          <p class="mt-1.5 max-w-2xl text-xs leading-5 text-zinc-600 sm:text-sm sm:leading-6">
            {{ isAuthenticated ? '查看或修改个人资料，也可以进入公共群和宿舍楼群。' : '不登录也能继续使用地图、清单和指南。已有账号登录后，可以进入群聊并填写专业和宿舍楼。' }}
          </p>

          <div class="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
            <NuxtLink
              v-for="entry in accountEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-20 items-center gap-2.5 rounded-md border border-green-200 bg-white/70 p-3"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-white text-green-700 shadow-sm">
                <UIcon
                  :name="entry.icon"
                  class="size-4"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-zinc-950">{{ entry.title }}</span>
                <span class="mt-1 hidden text-xs leading-5 text-zinc-600 sm:block">{{ entry.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-zinc-300 transition-colors group-hover:text-green-700"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="border-y border-[var(--line)] bg-white">
        <div class="page-shell py-5 md:py-7">
          <p class="section-kicker">
            继续浏览
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            按内容找
          </h2>

          <div class="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <NuxtLink
              v-for="entry in discoverDirectoryEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-20 items-center gap-2.5 rounded-md border border-zinc-200 p-3 hover:border-green-300"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-green-50 group-hover:text-green-700">
                <UIcon
                  :name="entry.icon"
                  class="size-4"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-zinc-950">{{ entry.title }}</span>
                <span class="mt-1 hidden text-xs leading-5 text-zinc-500 sm:block">{{ entry.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-zinc-300 group-hover:text-green-700"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="page-shell py-5 md:py-7">
        <p class="section-kicker">
          帮助与说明
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          信息从哪来，哪里错了怎么说
        </h2>

        <div class="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          <NuxtLink
            v-for="entry in discoverTrustEntries"
            :key="entry.to"
            :to="entry.to"
            class="group flex min-h-20 items-center gap-2.5 rounded-md border border-zinc-200 p-3 hover:border-green-300"
          >
            <UIcon
              :name="entry.icon"
              class="size-4 shrink-0 text-green-700"
            />
            <span class="min-w-0">
              <span class="block text-sm font-bold text-zinc-950 group-hover:text-green-700">{{ entry.title }}</span>
              <span class="mt-1 hidden text-xs leading-5 text-zinc-500 sm:block">{{ entry.description }}</span>
            </span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
