<script setup lang="ts">
defineProps<{
  label: string
  etaMinutes: number
}>()
</script>

<template>
  <div
    data-bus-eta-pill
    class="pointer-events-none absolute left-0 top-0 flex h-7 items-center gap-1 rounded-full border border-[var(--bus-accent-line)] bg-[var(--surface)] px-2.5 text-[12px] font-medium whitespace-nowrap text-[var(--ink)] shadow-sm select-none"
  >
    <span class="text-[var(--bus-accent)]">{{ label }}</span>
    <span>{{ etaMinutes > 0 ? `${etaMinutes}′` : '到站' }}</span>
  </div>
</template>
