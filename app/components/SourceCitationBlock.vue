<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'

/**
 * 「来源与核验时间」：只展示调用方交进来的来源。
 * 没有来源就如实说没有；核验时间缺失就写缺失，不用抓取时间顶替。
 */
export interface SourceCitationSource {
  title?: string | null
  url?: string | null
  level?: string | null
  official?: boolean | null
  verifiedAt?: string | null
  fetchedAt?: string | null
  quote?: string | null
}

const props = withDefaults(defineProps<{
  sources: SourceCitationSource[]
  claimId?: string | null
  targetId?: string | null
  title?: string
  emptyHint?: string
}>(), {
  claimId: null,
  targetId: null,
  title: '来源与核验时间',
  emptyHint: ''
})

const feedbackLink = computed(() => ({
  path: '/feedback',
  query: {
    targetType: 'place',
    targetId: props.targetId
  }
}))

function resolveSourceTitle(source: SourceCitationSource): string {
  const value = source.title?.trim()
  return value ? value : '未标注标题的来源'
}

function resolveSourceHref(source: SourceCitationSource): string | null {
  return safeExternalHref(source.url)
}

function resolveVerifiedAtLabel(source: SourceCitationSource): string {
  const value = source.verifiedAt?.trim()
  return value ? `核验时间：${value.slice(0, 10)}` : '未标注核验时间'
}
</script>

<template>
  <section
    class="surface-panel mt-6 p-5 md:p-6"
    :data-claim-id="claimId || undefined"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="section-kicker">
          来源
        </p>
        <h2 class="mt-2 text-lg font-bold text-zinc-950 dark:text-zinc-100">
          {{ title }}
        </h2>
      </div>
      <span
        v-if="sources.length"
        class="text-xs font-semibold text-zinc-500 dark:text-zinc-400"
      >{{ sources.length }} 条记录</span>
    </div>

    <ul
      v-if="sources.length"
      class="mt-4 space-y-3"
    >
      <li
        v-for="(source, index) in sources"
        :key="index"
        class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <a
            v-if="resolveSourceHref(source)"
            :href="resolveSourceHref(source) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-green-700 dark:text-green-400 hover:underline"
          >
            <span>{{ resolveSourceTitle(source) }}</span>
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5 shrink-0"
            />
          </a>
          <span
            v-else
            class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >{{ resolveSourceTitle(source) }}</span>
          <span
            v-if="source.official"
            class="inline-flex items-center rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:text-green-300"
          >官方</span>
          <span
            v-if="source.level"
            class="inline-flex items-center rounded-md border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
          >{{ source.level }} 级</span>
        </div>
        <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {{ resolveVerifiedAtLabel(source) }}
        </p>
        <p
          v-if="source.quote"
          class="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300"
        >
          {{ source.quote }}
        </p>
      </li>
    </ul>

    <div
      v-else
      class="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4"
    >
      <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        这条信息还没有可核验来源
      </p>
      <p
        v-if="emptyHint"
        class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
      >
        {{ emptyHint }}
      </p>
      <NuxtLink
        v-if="targetId"
        :to="feedbackLink"
        class="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:underline"
      >
        <UIcon
          name="i-lucide-message-square-warning"
          class="size-3.5 shrink-0"
        />
        <span>说明是哪条信息不对</span>
      </NuxtLink>
    </div>
  </section>
</template>
