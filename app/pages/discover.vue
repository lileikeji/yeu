<script setup lang="ts">
import {
  discoverDirectoryEntries,
  discoverTaskEntries,
  discoverTrustEntries
} from '~~/app/utils/discover-presentation'

useSeoMeta({
  title: '更多服务',
  description: '按新生当前要做的事，快速进入仰恩校园地图、报到、指南、部门、社团与周边目录。'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              功能目录
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
              你现在要找什么
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              从具体任务直接进入，或按地图、指南、部门和社团浏览。
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
              新生任务
            </p>
            <h2 class="mt-1 text-xl font-bold text-zinc-950">
              按当前事项进入
            </h2>
          </div>
          <UButton
            to="/map"
            icon="i-lucide-map"
            label="地图"
            color="neutral"
            variant="ghost"
          />
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="entry in discoverTaskEntries"
            :key="entry.to"
            :to="entry.to"
            class="surface-panel group flex min-h-40 items-start gap-4 p-4 transition hover:border-green-300 hover:shadow-sm"
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
            <span class="flex min-w-0 flex-1 flex-col self-stretch">
              <span class="font-bold text-zinc-950">{{ entry.title }}</span>
              <span class="mt-2 flex-1 text-sm leading-6 text-zinc-600">{{ entry.description }}</span>
              <span class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                查看
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5 transition group-hover:translate-x-0.5"
                />
              </span>
            </span>
          </NuxtLink>
        </div>
      </section>

      <section class="border-y border-[var(--line)] bg-white">
        <div class="page-shell py-8 md:py-10">
          <p class="section-kicker">
            内容目录
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            按类别浏览
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
          说明与共建
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          查看信息边界或提交纠错
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
