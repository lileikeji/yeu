<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  icon?: string
  eyebrow?: string
}>(), {
  icon: 'i-lucide-folder',
  eyebrow: '内容管理'
})
</script>

<template>
  <header class="flex flex-col gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div class="flex min-w-0 items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400">
        <UIcon
          :name="icon"
          class="size-5"
        />
      </span>
      <div class="min-w-0">
        <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {{ eyebrow }}
        </p>
        <h1 class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100 sm:text-2xl">
          {{ title }}
        </h1>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
