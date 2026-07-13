<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  icon?: string
  eyebrow?: string
}>(), {
  description: '',
  icon: 'i-lucide-folder',
  eyebrow: '内容管理'
})
</script>

<template>
  <header class="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div class="flex min-w-0 items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-green-700">
        <UIcon
          :name="icon"
          class="size-5"
        />
      </span>
      <div class="min-w-0">
        <p class="text-xs font-semibold text-zinc-500">
          {{ eyebrow }}
        </p>
        <h1 class="mt-1 text-xl font-bold text-zinc-950 sm:text-2xl">
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="mt-1 max-w-3xl text-sm leading-6 text-zinc-500"
        >
          {{ description }}
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
