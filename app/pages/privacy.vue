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
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          信息使用说明
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          隐私说明
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          这一页写清楚本站记录什么、为什么记录、怎么查询和删除。我们不会要你的学号、一卡通密码或校园网密码。最近更新：2026-07-14。
        </p>
      </div>
    </header>

    <div class="page-shell py-8 md:py-12">
      <section class="mb-10">
        <p class="section-kicker">
          先记住这三点
        </p>
        <h2 class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          常用功能怎么保护你的信息
        </h2>
        <ul class="mt-4 grid gap-3 sm:grid-cols-3">
          <li
            v-for="highlight in privacyHighlights"
            :key="highlight.label"
            class="flex items-center gap-3 rounded-md border bg-white dark:bg-zinc-900 p-4 shadow-sm"
            :class="{
              'border-blue-200 dark:border-blue-900': highlight.tone === 'blue',
              'border-green-200 dark:border-green-800': highlight.tone === 'green',
              'border-amber-200 dark:border-amber-900': highlight.tone === 'amber'
            }"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-md"
              :class="{
                'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300': highlight.tone === 'blue',
                'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400': highlight.tone === 'green',
                'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300': highlight.tone === 'amber'
              }"
              aria-hidden="true"
            >
              <UIcon
                :name="highlight.icon"
                class="size-4"
              />
            </span>
            <span class="min-w-0">
              <span class="block text-xs text-zinc-500 dark:text-zinc-400">{{ highlight.label }}</span>
              <span class="mt-1 block text-sm font-bold text-zinc-950 dark:text-zinc-100">{{ highlight.value }}</span>
            </span>
          </li>
        </ul>
      </section>

      <div class="grid gap-x-10 gap-y-8 md:grid-cols-2">
        <section
          v-for="section in privacySections"
          :key="section.title"
          class="border-t border-zinc-200 dark:border-zinc-800 pt-5"
        >
          <div class="flex items-center gap-3">
            <span class="grid size-9 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
              <UIcon
                :name="section.icon"
                class="size-4"
              />
            </span>
            <h2 class="font-bold text-zinc-950 dark:text-zinc-100">
              {{ section.title }}
            </h2>
          </div>
          <ul class="mt-4 space-y-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
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

      <div class="mt-10 flex flex-wrap gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <UButton
          to="/feedback?type=privacy_request&from=%2Fprivacy"
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
