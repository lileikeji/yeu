<script setup lang="ts">
import { computed } from 'vue'
import { formatDateLabel } from '@shared/utils/content-presentation'
import { openExternal } from '../utils/navigation'

interface SourceLike {
  id: string
  title: string
  url: string
  publisherName?: string
  isOfficial?: boolean
  publishedAt?: string | null
}

const props = defineProps<{ sources: SourceLike[] | null | undefined, title?: string }>()

const rows = computed(() => (props.sources ?? []).map(source => ({
  id: source.id,
  title: source.title,
  url: source.url,
  meta: [
    source.publisherName || '',
    source.isOfficial ? '官方来源' : '公开来源',
    source.publishedAt ? formatDateLabel(source.publishedAt, { compact: true }) : ''
  ].filter(Boolean).join(' · ')
})))
</script>

<template>
  <view v-if="rows.length" class="source-block">
    <view class="label-row">
      <text class="t-label">{{ title || '信息来源' }}</text>
    </view>
    <view v-for="row in rows" :key="row.id" class="source-row">
      <text class="t-item source-title">{{ row.title }}</text>
      <text class="t-meta source-meta">{{ row.meta }}</text>
      <button class="btn-link source-action" @click="openExternal(row.url)">复制链接</button>
    </view>
  </view>
</template>

<style scoped>
.source-block {
  margin-top: 32rpx;
  padding-top: 28rpx;
  border-top: 1rpx solid var(--line);
}

.source-row {
  margin-top: 22rpx;
}

.source-row + .source-row {
  padding-top: 22rpx;
  border-top: 1rpx solid var(--line);
}

.source-title {
  font-size: 28rpx;
}

.source-meta {
  margin-top: 6rpx;
}

.source-action {
  margin-top: 8rpx;
}
</style>
