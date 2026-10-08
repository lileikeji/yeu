<script setup lang="ts">
import { computed } from 'vue'
import type { ApiPlace } from '@shared/types/server'
import { isPlaceCoordinateVerified, resolvePlaceCategoryLabel, resolvePlaceNavigationStatusLabel, resolvePlaceStudentSummary } from '@shared/utils/place-presentation'
import { openLocation } from '../utils/navigation'

const props = defineProps<{ place: ApiPlace }>()
defineEmits<{ open: [slug: string] }>()

const categoryLabel = computed(() => resolvePlaceCategoryLabel(props.place.category, props.place.type))
const summary = computed(() => resolvePlaceStudentSummary(props.place.summary, props.place.name, props.place.category, props.place.type))
const navigationLabel = computed(() => resolvePlaceNavigationStatusLabel(isPlaceCoordinateVerified(props.place)))
</script>

<template>
  <view class="place-row">
    <button class="place-main" @click="$emit('open', place.slug)">
      <view class="place-head">
        <text class="t-item place-name">{{ place.name }}</text>
        <text class="chip">{{ categoryLabel }}</text>
      </view>
      <text v-if="summary" class="t-body place-summary">{{ summary }}</text>
      <text v-if="place.address" class="t-meta place-address">地址：{{ place.address }}</text>
    </button>
    <view class="place-foot">
      <text class="t-label">{{ navigationLabel }}</text>
      <button v-if="place.navigationAvailable" class="btn-link" @click.stop="openLocation(place)">打开位置</button>
      <text v-else class="t-meta">坐标待核验</text>
    </view>
  </view>
</template>

<style scoped>
.place-row {
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.place-main {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  color: var(--ink);
  background: transparent;
  text-align: left;
  line-height: inherit;
}

.place-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.place-name {
  flex: 1;
  min-width: 0;
}

.place-summary {
  margin-top: 10rpx;
  color: var(--muted);
}

.place-address {
  margin-top: 8rpx;
}

.place-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 14rpx;
}
</style>
