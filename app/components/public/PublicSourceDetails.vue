<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import { studentFacingSourceTitle } from '~/utils/sources-presentation'

export interface PublicSourceDetailsItem {
  key: string
  title: string
  url?: string | null
  meta?: string | null
  note?: string | null
  unavailable?: boolean
}

withDefaults(defineProps<{
  sources: PublicSourceDetailsItem[]
  verifiedAt?: string | null
  title?: string
}>(), {
  verifiedAt: null,
  title: '这些信息从哪里来'
})
</script>

<template>
  <details class="group border-y border-zinc-200 bg-white">
    <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-zinc-800 marker:hidden">
      <span class="inline-flex items-center gap-2">
        <UIcon
          name="i-lucide-shield-check"
          class="size-4 text-green-700"
        />
        {{ title }}
        <span class="font-normal text-zinc-500">{{ sources.length }} 条</span>
      </span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 text-zinc-400 transition group-open:rotate-180"
      />
    </summary>

    <div class="border-t border-zinc-100 pb-5 pt-4">
      <ul
        v-if="sources.length"
        class="space-y-3"
      >
        <li
          v-for="source in sources"
          :key="source.key"
          class="text-xs leading-5 text-zinc-600"
        >
          <a
            v-if="safeExternalHref(source.url) && !source.unavailable"
            :href="safeExternalHref(source.url) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-10 items-start gap-2 py-1 hover:text-green-700"
          >
            <UIcon
              name="i-lucide-external-link"
              class="mt-0.5 size-3.5 shrink-0"
            />
            <span>
              <span class="font-medium">{{ studentFacingSourceTitle(source.title) }}</span>
              <span
                v-if="source.meta"
                class="block text-zinc-500"
              >{{ source.meta }}</span>
              <span
                v-if="source.note"
                class="block text-orange-700"
              >{{ source.note }}</span>
            </span>
          </a>
          <span
            v-else
            class="inline-flex items-start gap-2"
          >
            <UIcon
              name="i-lucide-archive"
              class="mt-0.5 size-3.5 shrink-0 text-orange-600"
            />
            <span>
              <span class="font-medium">{{ studentFacingSourceTitle(source.title) }}</span>
              <span class="block text-zinc-500">{{ source.meta || '这个页面现在打不开，暂时只保留名称供参考。' }}</span>
              <span
                v-if="source.note"
                class="block text-orange-700"
              >{{ source.note }}</span>
            </span>
          </span>
        </li>
      </ul>
      <p
        v-else
        class="text-xs leading-5 text-zinc-500"
      >
        这页暂时没有可以打开的参考链接。
      </p>
      <p
        v-if="verifiedAt"
        class="mt-4 text-xs text-zinc-500"
      >
        最近整理：{{ verifiedAt }}
      </p>
    </div>
  </details>
</template>
