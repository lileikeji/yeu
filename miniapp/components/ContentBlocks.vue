<script setup lang="ts">
import { computed } from 'vue'
import { parseContentBlocks } from '@shared/utils/content-presentation'

const props = defineProps<{ body: string | null | undefined }>()

const blocks = computed(() => parseContentBlocks(props.body))
</script>

<template>
  <view class="content-blocks">
    <template v-for="(block, index) in blocks" :key="index">
      <text v-if="block.type === 'heading'" class="t-section block-heading">{{ block.text }}</text>

      <view v-else-if="block.type === 'list'" class="block-list">
        <view v-for="(item, itemIndex) in block.items" :key="itemIndex" class="block-list-row">
          <text class="block-marker">{{ block.ordered ? `${itemIndex + 1}` : '·' }}</text>
          <text class="t-body block-list-text">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="block.type === 'quote'" class="note note-calm block-quote">
        <text class="t-body">{{ block.text }}</text>
      </view>

      <text v-else class="t-body block-paragraph">{{ block.text }}</text>
    </template>
  </view>
</template>

<style scoped>
.content-blocks {
  display: block;
}

.block-heading {
  margin-top: 30rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid var(--line);
}

.block-heading:first-child {
  margin-top: 0;
}

.block-paragraph {
  margin-top: 18rpx;
}

.block-list {
  margin-top: 16rpx;
}

.block-list-row {
  display: flex;
  gap: 14rpx;
  margin-top: 12rpx;
}

.block-marker {
  flex: 0 0 auto;
  min-width: 32rpx;
  color: var(--teal);
  font-size: 26rpx;
  font-weight: 700;
  line-height: 1.62;
  text-align: right;
}

.block-list-text {
  flex: 1;
  min-width: 0;
}

.block-quote {
  margin-top: 20rpx;
}
</style>
