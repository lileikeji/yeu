<script setup lang="ts">
import { publicNotices } from '~/utils/public-catalog'
import { safeExternalHref } from '~/utils/safe-external-href'
import { safeNoticeActionHref } from '~~/shared/utils/notice-actions'

useSeoMeta({
  title: '公告',
  description: '迎新指南的近期公告：报到时间、功能入口与内容更新说明。'
})

const { data: publicContentResponse, error: publicContentError, refresh } = await usePublicContentList()
const notices = computed(() => publicNotices(publicContentResponse.value?.items ?? []))
const hasError = computed(() => Boolean(publicContentError.value))
const latestUpdatedAt = computed(() => notices.value[0]?.updatedAt ?? '')
</script>

<template>
  <main class="min-h-screen bg-zinc-50 pb-16 dark:bg-zinc-950">
    <div class="page-shell pt-5">
      <nav
        class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
        aria-label="面包屑"
      >
        <NuxtLink
          to="/"
          class="hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          首页
        </NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5"
        />
        <NuxtLink
          to="/campus"
          class="hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          校园
        </NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5"
        />
        <span class="text-zinc-700 dark:text-zinc-300">公告</span>
      </nav>

      <header class="mt-6 max-w-3xl">
        <h1 class="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100 md:text-3xl">
          公告
        </h1>
        <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          <template v-if="notices.length">
            共 {{ notices.length }} 条，最新更新于 {{ latestUpdatedAt }}。
          </template>
          <template v-else>
            近期没有新的公告。
          </template>
        </p>
      </header>
    </div>

    <div class="page-shell mt-6 space-y-3">
      <article
        v-for="notice in notices"
        :id="notice.slug"
        :key="notice.id"
        class="surface-panel scroll-mt-20 p-5 md:p-6"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UBadge
            color="warning"
            variant="soft"
          >
            公告
          </UBadge>
          <span class="text-xs text-zinc-400 dark:text-zinc-500">更新于 {{ notice.updatedAt }}</span>
        </div>
        <h2 class="mt-4 text-lg font-bold text-zinc-950 dark:text-zinc-100 md:text-xl">
          {{ notice.title }}
        </h2>
        <p
          v-if="notice.summary"
          class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300"
        >
          {{ notice.summary }}
        </p>
        <PublicNoticeBody
          :body="notice.body"
          class="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
        />
        <div
          v-if="notice.actions.length"
          class="mt-4 flex flex-wrap gap-2"
        >
          <UButton
            v-for="action in notice.actions"
            :key="`${action.label}-${action.href}`"
            :to="safeNoticeActionHref(action.href) || undefined"
            :icon="action.icon || 'i-lucide-arrow-up-right'"
            :label="action.label"
            color="primary"
            variant="soft"
            size="sm"
          />
        </div>
        <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span v-if="notice.audience">{{ notice.audience }}</span>
          <span v-if="notice.validUntil">有效至 {{ notice.validUntil.slice(0, 10) }}</span>
          <a
            v-if="notice.sources[0]"
            :href="safeExternalHref(notice.sources[0]?.url) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-green-700 hover:underline dark:text-green-400"
          >查看学校原文</a>
        </div>
      </article>

      <div
        v-if="hasError"
        class="flex items-start gap-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
        role="status"
      >
        <UIcon
          name="i-lucide-info"
          class="mt-0.5 size-3.5 shrink-0"
        />
        <span>公告加载失败，<button
          type="button"
          class="font-medium underline"
          @click="refresh()"
        >重试</button></span>
      </div>

      <p
        v-else-if="!notices.length"
        class="surface-panel p-6 text-sm text-zinc-600 dark:text-zinc-300"
      >
        近期没有新的公告，先去
        <NuxtLink
          to="/campus"
          class="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >校园</NuxtLink>
        看看。
      </p>
    </div>
  </main>
</template>
