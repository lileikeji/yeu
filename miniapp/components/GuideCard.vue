<script setup lang="ts">
import { computed } from 'vue'
import type { ApiContent } from '@shared/types/server'
import { formatDateLabel, readingMinutesLabel, resolveGuideCategoryLabel } from '@shared/utils/content-presentation'

const props = defineProps<{ guide: ApiContent }>()
defineEmits<{ open: [slug: string] }>()

const categoryLabel = computed(() => resolveGuideCategoryLabel(props.guide.category))
const meta = computed(() => [
  readingMinutesLabel(props.guide.body || props.guide.summary),
  props.guide.lastVerifiedAt ? `${formatDateLabel(props.guide.lastVerifiedAt, { compact: true })}更新` : ''
].filter(Boolean).join(' · '))
</script>

<template>
  <button class="guide-row" @click="$emit('open', guide.slug)">
    <view class="guide-head">
      <text class="t-item guide-title">{{ guide.title }}</text>
      <text class="chip">{{ categoryLabel }}</text>
    </view>
    <text v-if="guide.summary" class="t-body guide-summary">{{ guide.summary }}</text>
    <text class="t-meta guide-meta">{{ meta }}</text>
  </button>
</template>

<style scoped>
.guide-row {
  display: block;
  width: 100%;
  padding: 24rpx 26rpx;
  border: 1rpx solid var(--line);
  border-radius: 16rpx;
  color: var(--ink);
  background: var(--surface);
  text-align: left;
  line-height: inherit;
  box-sizing: border-box;
}

.guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.guide-title {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
}

.guide-summary {
  margin-top: 10rpx;
  color: var(--muted);
}

.guide-meta {
  margin-top: 10rpx;
}
</style>
