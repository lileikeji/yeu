<script setup lang="ts">
import { privacySections } from '~~/app/utils/privacy-presentation'

useSeoMeta({
  title: '隐私说明',
  description: '仰恩新生指南的反馈、定位、离线使用与管理员处理信息说明。',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          PRIVACY
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          隐私说明
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          本项目由个人或学生团队维护，按最少必要原则处理数据。以下规则适用于当前 V0.3 Alpha，更新日期为 2026-07-14。
        </p>
      </div>
    </header>

    <div class="page-shell py-8 md:py-12">
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
          label="提交查询或删除请求"
        />
        <UButton
          to="/"
          icon="i-lucide-house"
          label="返回首页"
          color="neutral"
          variant="outline"
        />
      </div>
    </div>
  </div>
</template>
