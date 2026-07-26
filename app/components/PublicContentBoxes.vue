<script setup lang="ts">
import type { PublicContentBox } from '~/utils/public-catalog'

defineProps<{
  boxes: PublicContentBox[]
}>()

const toneClasses: Record<PublicContentBox['tone'], string> = {
  plain: 'border-zinc-200 bg-white',
  green: 'border-emerald-200 bg-emerald-50/60',
  blue: 'border-blue-200 bg-blue-50/60',
  amber: 'border-amber-200 bg-amber-50/70'
}
</script>

<template>
  <section
    v-if="boxes.length"
    class="border-b border-zinc-200 py-8"
  >
    <div class="grid gap-4 md:grid-cols-2">
      <article
        v-for="box in boxes"
        :key="box.id"
        class="rounded-lg border p-5"
        :class="toneClasses[box.tone]"
      >
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-md bg-white text-green-700 shadow-sm">
            <UIcon
              :name="box.icon"
              class="size-4"
            />
          </span>
          <div class="min-w-0">
            <h2 class="text-base font-bold text-zinc-950">
              {{ box.title }}
            </h2>
            <p
              v-if="box.body"
              class="mt-2 whitespace-pre-line text-sm leading-7 text-zinc-700"
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
            class="flex gap-2 py-3 text-sm leading-6 text-zinc-700"
          >
            <UIcon
              name="i-lucide-check"
              class="mt-1 size-4 shrink-0 text-green-700"
            />
            <span>{{ item }}</span>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>
