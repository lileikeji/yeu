<script setup lang="ts">
import type { PublicContentBox } from '~/utils/public-catalog'

defineProps<{
  boxes: PublicContentBox[]
}>()

const toneClasses: Record<PublicContentBox['tone'], string> = {
  plain: 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900',
  green: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/60',
  blue: 'border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/60',
  amber: 'border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/70'
}
</script>

<template>
  <section
    v-if="boxes.length"
    class="border-b border-zinc-200 dark:border-zinc-800 py-8"
  >
    <div class="grid gap-4 md:grid-cols-2">
      <article
        v-for="box in boxes"
        :key="box.id"
        class="rounded-lg border p-5"
        :class="toneClasses[box.tone]"
      >
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-md bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400 shadow-sm">
            <UIcon
              :name="box.icon"
              class="size-4"
            />
          </span>
          <div class="min-w-0">
            <h2 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
              {{ box.title }}
            </h2>
            <p
              v-if="box.body"
              class="mt-2 whitespace-pre-line text-sm leading-7 text-zinc-700 dark:text-zinc-200"
            >
              {{ box.body }}
            </p>
          </div>
        </div>
        <ul
          v-if="box.items.length"
          class="mt-4 divide-y divide-black/5 border-y border-black/10"
        >
          <li
            v-for="item in box.items"
            :key="item"
            class="flex gap-2 py-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200"
          >
            <UIcon
              name="i-lucide-check"
              class="mt-1 size-4 shrink-0 text-green-700 dark:text-green-400"
            />
            <span>{{ item }}</span>
          </li>
        </ul>
        <div
          v-if="box.images.length"
          class="mt-5 grid gap-3 sm:grid-cols-2"
        >
          <figure
            v-for="image in box.images"
            :key="image.url"
            class="overflow-hidden rounded-md border border-black/10 bg-white dark:bg-zinc-900 p-2"
          >
            <ImagePreviewButton
              :src="image.url"
              :alt="image.title"
              button-class="aspect-[4/3] w-full rounded-sm bg-zinc-50 dark:bg-zinc-800/60"
              image-class="size-full object-contain"
            />
            <figcaption class="px-1 pb-1 pt-2 text-center text-xs font-medium leading-5 text-zinc-600 dark:text-zinc-300">
              {{ image.title }}
            </figcaption>
          </figure>
        </div>
      </article>
    </div>
  </section>
</template>
