<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
  eyebrow?: string
}>()
</script>

<template>
  <view class="page-shell">
    <view v-if="title || subtitle || eyebrow" class="page-heading">
      <text v-if="eyebrow" class="t-label page-eyebrow">{{ eyebrow }}</text>
      <text v-if="title" class="t-display page-title">{{ title }}</text>
      <text v-if="subtitle" class="t-body page-subtitle">{{ subtitle }}</text>
    </view>
    <slot />
  </view>
</template>

<style scoped>
.page-shell {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 32rpx 24rpx calc(56rpx + env(safe-area-inset-bottom));
}

.page-heading {
  margin-bottom: 24rpx;
}

.page-eyebrow {
  margin-bottom: 10rpx;
}

.page-title {
  margin: 0;
}

.page-subtitle {
  margin-top: 10rpx;
  color: var(--muted);
}
</style>
