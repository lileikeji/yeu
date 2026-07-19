<script setup lang="ts">
import { privacyHighlights, privacySections } from '~~/app/utils/privacy-presentation'

useSeoMeta({
  title: '隐私说明',
  description: '查看本站会记录什么、定位和群聊如何使用，以及怎样查询或删除自己的信息。',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          信息使用说明
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          隐私说明
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          这里说明本站会记录什么、为什么记录，以及你怎样查询或删除自己的信息。以下内容适用于当前版本，更新日期为 2026-07-14。
        </p>
      </div>
    </header>

    <div class="page-shell py-8 md:py-12">
      <ul class="mb-9 grid border-y border-zinc-200 sm:grid-cols-3">
        <li
          v-for="highlight in privacyHighlights"
          :key="highlight.label"
          class="flex items-center gap-3 border-b border-zinc-100 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
            <UIcon
              :name="highlight.icon"
              class="size-4"
            />
          </span>
          <span class="min-w-0">
            <span class="block text-xs text-zinc-500">{{ highlight.label }}</span>
            <span class="mt-1 block text-sm font-bold text-zinc-950">{{ highlight.value }}</span>
          </span>
        </li>
      </ul>

      <div class="grid gap-x-10 gap-y-8 md:grid-cols-2">
        <section
          v-for="section in privacySections"
          :key="section.title"
          class="border-t border-zinc-200 pt-5"
        >
          <div class="flex items-center gap-3">
            <span class="grid size-9 place-items-center rounded-md bg-green-50 text-green-700">
              <UIcon
                :name="section.icon"
                class="size-4"
              />
            </span>
            <h2 class="font-bold text-zinc-950">
              {{ section.title }}
            </h2>
          </div>
          <ul class="mt-4 space-y-3 text-sm leading-7 text-zinc-600">
            <li
              v-for="item in section.items"
              :key="item"
              class="flex gap-2"
            >
              <span class="mt-3 size-1.5 shrink-0 rounded-full bg-green-700" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-10 flex flex-wrap gap-2 border-t border-zinc-200 pt-6">
        <UButton
          to="/feedback"
          icon="i-lucide-message-square"
          label="询问或申请删除信息"
          class="min-h-11"
        />
        <UButton
          to="/"
          icon="i-lucide-house"
          label="返回首页"
          color="neutral"
          variant="outline"
          class="min-h-11"
        />
      </div>
    </div>
  </div>
</template>
