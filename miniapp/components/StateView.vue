<script setup lang="ts">
defineProps<{
  loading?: boolean
  empty?: boolean
  error?: string | null
  emptyText?: string
  loadingText?: string
  retryDisabled?: boolean
  retryLoading?: boolean
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <view v-if="loading" class="state-block" aria-busy="true">
    <view class="label-row">
      <text class="t-label">{{ loadingText || '正在读取公开内容' }}</text>
    </view>
    <view class="skeleton">
      <view class="skeleton-line" style="width: 88%" />
      <view class="skeleton-line" style="width: 72%" />
      <view class="skeleton-line" style="width: 80%" />
    </view>
    <text class="t-meta state-hint">第一次打开会稍慢，之后会快一些。</text>
  </view>

  <view v-else-if="error" class="state-block" role="alert">
    <view class="note note-error">
      <text class="t-item">暂时读不到内容</text>
      <text class="t-body state-copy">{{ error }}</text>
      <button class="btn btn-primary btn-sm state-action" :disabled="retryDisabled || retryLoading" :loading="retryLoading" @click="$emit('retry')">
        {{ retryLoading ? '正在重试' : '重新加载' }}
      </button>
    </view>
  </view>

  <view v-else-if="empty" class="state-block">
    <view class="note note-pending">
      <text class="t-item">这里暂时没有内容</text>
      <text class="t-body state-copy">{{ emptyText || '换个关键词，或稍后再来看看。' }}</text>
    </view>
  </view>

  <slot v-else />
</template>

<style scoped>
.state-block {
  padding: 4rpx 0;
}

.skeleton {
  margin-top: 20rpx;
}

.skeleton-line {
  height: 26rpx;
  border-radius: 6rpx;
  background: var(--paper-deep);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-line + .skeleton-line {
  margin-top: 16rpx;
}

.skeleton-line:nth-child(2) { animation-delay: .12s; }
.skeleton-line:nth-child(3) { animation-delay: .24s; }

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .45; }
}

.state-hint {
  margin-top: 18rpx;
}

.state-copy {
  margin-top: 10rpx;
}

.state-action {
  width: 240rpx;
  margin-top: 22rpx;
}
</style>
