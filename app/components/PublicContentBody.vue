<script setup lang="ts">
defineProps<{
  body: string
  title?: string
}>()
</script>

<template>
  <section
    v-if="body.trim()"
    class="border-b border-zinc-200 dark:border-zinc-800 py-8"
  >
    <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
      {{ title || '详细介绍' }}
    </h2>
    <div class="mt-4 whitespace-pre-line text-sm leading-8 text-zinc-700 dark:text-zinc-200">
      {{ body }}
    </div>
  </section>
</template>
