<script setup lang="ts">
import { parseNoticeBodyLines } from '~/utils/notice-body'

const props = defineProps<{
  body?: string | null
  class?: string
}>()

const lines = computed(() => parseNoticeBodyLines(props.body))
</script>

<template>
  <div
    v-if="lines.length"
    :class="['space-y-2 text-sm leading-7 text-zinc-700 dark:text-zinc-200', props.class]"
  >
    <p
      v-for="(line, lineIndex) in lines"
      :key="lineIndex"
      class="whitespace-pre-wrap"
    >
      <template
        v-for="(segment, segmentIndex) in line"
        :key="segmentIndex"
      >
        <strong
          v-if="segment.bold"
          class="font-semibold text-zinc-950 dark:text-zinc-100"
        >{{ segment.text }}</strong>
        <template v-else>
          {{ segment.text }}
        </template>
      </template>
    </p>
  </div>
</template>
