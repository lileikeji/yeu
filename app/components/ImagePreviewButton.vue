<script setup lang="ts">
const props = withDefaults(defineProps<{
  src: string
  alt: string
  buttonClass?: string
  imageClass?: string
}>(), {
  buttonClass: '',
  imageClass: ''
})

const open = ref(false)
</script>

<template>
  <button
    type="button"
    :class="['group relative block cursor-zoom-in overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700', props.buttonClass]"
    :aria-label="`放大查看：${alt}`"
    @click="open = true"
  >
    <img
      :src="src"
      :alt="alt"
      :class="props.imageClass"
    >
    <span class="absolute bottom-2 right-2 grid size-10 place-items-center rounded-md bg-zinc-950/75 text-white shadow-sm transition group-hover:bg-zinc-950">
      <UIcon
        name="i-lucide-expand"
        class="size-4"
      />
      <span class="sr-only">放大查看</span>
    </span>
  </button>

  <UModal
    v-model:open="open"
    :title="alt"
    :ui="{ content: 'w-[calc(100vw-1rem)] max-w-none sm:w-full sm:max-w-4xl' }"
  >
    <template #body>
      <div class="flex min-h-0 items-center justify-center bg-zinc-50 p-1 sm:p-3">
        <img
          :src="src"
          :alt="alt"
          class="max-h-[calc(100dvh-9rem)] w-full object-contain"
        >
      </div>
    </template>
  </UModal>
</template>
