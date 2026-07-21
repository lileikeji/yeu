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
      <div class="page-shell py-8 md:py-11">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              所有入口
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
              你现在想做什么
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              按要办的事直接进入，也可以搜索地点、部门和社团。
            </p>
          </div>
          <UButton
            to="/search"
            icon="i-lucide-search"
            label="搜索全站"
            size="lg"
            class="min-h-11 self-start sm:self-auto"
          />
        </div>
      </div>
    </header>

    <div>
      <section class="page-shell py-8 md:py-10">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="section-kicker">
              常用入口
            </p>
            <h2 class="mt-1 text-xl font-bold text-zinc-950">
              先从这些开始
            </h2>
          </div>
          <UButton
            to="/map"
            icon="i-lucide-map"
            label="打开地图"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="entry in visibleTaskEntries"
            :key="entry.to"
            :to="entry.to"
            class="surface-panel group flex min-h-32 items-start gap-3 p-4 transition hover:border-green-300 hover:shadow-sm sm:min-h-40 sm:gap-4"
          >
            <span
              class="grid size-10 shrink-0 place-items-center rounded-md"
              :class="entry.tone"
            >
              <UIcon
                :name="entry.icon"
                class="size-5"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="font-bold text-zinc-950">{{ entry.title }}</span>
              <span class="mt-2 block text-sm leading-6 text-zinc-600">{{ entry.description }}</span>
            </span>
            <UIcon
              name="i-lucide-arrow-right"
              class="mt-1 size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-green-700"
            />
          </NuxtLink>
        </div>
        <div
          v-if="discoverTaskEntries.length > discoverTaskPreviewLimit"
          class="mt-5 flex justify-center"
        >
          <UButton
            :icon="tasksExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :label="tasksExpanded ? '收起其他入口' : `再看 ${taskPreview.hiddenCount} 个入口`"
            color="neutral"
            variant="soft"
            class="min-h-11"
            :aria-expanded="tasksExpanded"
            @click="toggleTaskPreview"
          />
        </div>
      </section>

      <section class="border-y border-green-100 bg-green-50/60">
        <div class="page-shell py-7 md:py-9">
          <p class="section-kicker">
            账号与交流
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            {{ isAuthenticated ? '个人资料与新生群聊' : '群聊和个人资料需要登录' }}
          </h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            {{ isAuthenticated ? '查看或修改个人资料，也可以进入公共群和宿舍楼群。' : '不登录也能继续使用地图、清单和指南。已有账号登录后，可以进入群聊并填写专业和宿舍楼。' }}
          </p>

          <div class="mt-5 grid gap-x-8 sm:grid-cols-2">
            <NuxtLink
              v-for="entry in accountEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-20 items-center gap-3 border-t border-green-200 py-4"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-white text-green-700 shadow-sm">
                <UIcon
                  :name="entry.icon"
                  class="size-4"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-zinc-950">{{ entry.title }}</span>
                <span class="mt-1 block text-xs leading-5 text-zinc-600">{{ entry.description }}</span>
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
        <div class="page-shell py-8 md:py-10">
          <p class="section-kicker">
            继续浏览
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            按内容找
          </h2>

          <div class="mt-5 grid gap-x-8 md:grid-cols-2">
            <NuxtLink
              v-for="entry in discoverDirectoryEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-24 items-center gap-4 border-b border-zinc-200 py-4"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-green-50 group-hover:text-green-700">
                <UIcon
                  :name="entry.icon"
                  class="size-5"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-zinc-950">{{ entry.title }}</span>
                <span class="mt-1 block text-xs leading-5 text-zinc-500">{{ entry.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-zinc-300 group-hover:text-green-700"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          帮助与说明
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          信息从哪来，哪里错了怎么说
        </h2>

        <div class="mt-5 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="entry in discoverTrustEntries"
            :key="entry.to"
            :to="entry.to"
            class="group flex min-h-28 gap-3 border-t border-zinc-200 py-4"
          >
            <UIcon
              :name="entry.icon"
              class="mt-0.5 size-5 shrink-0 text-green-700"
            />
            <span class="min-w-0">
              <span class="block text-sm font-bold text-zinc-950 group-hover:text-green-700">{{ entry.title }}</span>
              <span class="mt-1.5 block text-xs leading-5 text-zinc-500">{{ entry.description }}</span>
            </span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
