<script setup lang="ts">
import type { NuxtError } from '#app'
import {
  errorRecoveryActions,
  resolveErrorPageContent
} from '~~/app/utils/error-page-presentation'
import { recoverClientPage } from '~~/app/utils/client-recovery'
import { THEME_PALETTE_THEME_COLORS } from '~~/app/utils/theme-mode'

const props = defineProps<{
  error: NuxtError
}>()

const content = computed(() => resolveErrorPageContent(props.error.statusCode))
const recovering = ref(false)
const { isDark: isSiteDark, palette } = useThemeMode()
const themeColor = computed(() => THEME_PALETTE_THEME_COLORS[palette.value])

useHead({
  title: () => `${content.value.title} | 迎新指南`,
  htmlAttrs: { lang: 'zh-CN' },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: themeColor }
  ],
  link: [
    { rel: 'icon', type: 'image/png', href: '/icons/app-icon-192.png' },
    { rel: 'apple-touch-icon', href: '/icons/app-icon-192.png' }
  ]
})

useSeoMeta({
  robots: 'noindex, nofollow'
})

function recover(to: string): void {
  if (recovering.value) return
  recovering.value = true
  void recoverClientPage({
    destination: to,
    clearNuxtError: () => clearError()
  })
}

function retryPage(): void {
  if (recovering.value) return
  recovering.value = true
  void recoverClientPage({
    clearNuxtError: () => clearError()
  })
}
</script>

<template>
  <div class="min-h-dvh bg-[var(--page-bg)] text-zinc-950 dark:text-zinc-100">
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell flex h-16 items-center justify-between gap-3">
        <a
          href="/"
          class="flex min-h-11 min-w-0 items-center"
          aria-label="返回迎新指南首页"
          @click.prevent="recover('/')"
        >
          <span class="inline-flex items-center gap-2 text-base font-bold text-zinc-950 dark:text-zinc-100">
            <span class="grid size-9 place-items-center overflow-hidden rounded-md bg-transparent p-0">
              <img
                :src="isSiteDark ? '/images/brand/system-logo-mark.png' : '/images/brand/system-logo-mark-light.png'"
                alt=""
                aria-hidden="true"
                class="size-full object-contain"
                decoding="async"
              >
            </span>
            迎新指南
          </span>
        </a>
        <button
          type="button"
          class="grid size-11 place-items-center rounded-md text-zinc-600 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-green-800 dark:hover:text-green-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
          aria-label="返回首页"
          @click="recover('/')"
        >
          <UIcon
            name="i-lucide-house"
            class="size-5"
          />
        </button>
      </div>
    </header>

    <main class="page-shell grid min-h-[calc(100dvh-4rem)] content-center py-10 md:py-16">
      <section
        class="mx-auto w-full max-w-2xl"
        aria-labelledby="error-page-title"
      >
        <div class="grid size-12 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300">
          <UIcon
            :name="content.icon"
            class="size-6"
          />
        </div>

        <p class="section-kicker mt-6">
          {{ content.kicker }}
        </p>
        <p
          v-if="content.code"
          class="mt-2 text-sm font-semibold tabular-nums text-zinc-500 dark:text-zinc-400"
        >
          {{ content.code }}
        </p>
        <h1
          id="error-page-title"
          class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl"
        >
          {{ content.title }}
        </h1>
        <p class="mt-3 max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 md:text-base">
          {{ content.description }}
        </p>

        <div class="mt-6 flex flex-wrap gap-2">
          <button
            v-if="content.canRetry"
            type="button"
            class="inline-flex min-h-11 items-center gap-2 rounded-md bg-green-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            :disabled="recovering"
            @click="retryPage"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              class="size-4"
            />
            {{ recovering ? '正在恢复…' : '重新打开' }}
          </button>
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100 transition-colors hover:border-green-300 dark:hover:border-green-700 hover:text-green-800 dark:hover:text-green-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            :disabled="recovering"
            @click="recover('/')"
          >
            <UIcon
              name="i-lucide-house"
              class="size-4"
            />
            返回首页
          </button>
        </div>

        <div class="mt-9 border-t border-[var(--line)] pt-6">
          <h2 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
            继续查找
          </h2>
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <button
              v-for="action in errorRecoveryActions"
              :key="action.to"
              type="button"
              class="group flex min-h-20 items-center gap-3 rounded-md border border-[var(--line)] bg-white dark:bg-zinc-900 px-4 text-left transition-colors hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              :disabled="recovering"
              @click="recover(action.to)"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 group-hover:bg-green-50 dark:group-hover:bg-green-950 group-hover:text-green-800 dark:group-hover:text-green-300">
                <UIcon
                  :name="action.icon"
                  class="size-4"
                />
              </span>
              <span class="min-w-0 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ action.label }}</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
