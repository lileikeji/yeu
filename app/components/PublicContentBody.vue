<script setup lang="ts">
defineProps<{
  body: string
  title?: string
}>()
</script>

<template>
  <section
    v-if="body.trim()"
    class="border-b border-zinc-200 py-8"
  >
    <h2 class="text-lg font-bold text-zinc-950">
      {{ title || '详细介绍' }}
    </h2>
    <div class="mt-4 whitespace-pre-line text-sm leading-8 text-zinc-700">
      {{ body }}
    </div>
  </section>
</template>
