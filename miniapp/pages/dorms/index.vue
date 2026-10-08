<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import AppPage from '../../components/AppPage.vue'
import { dormDisclaimers, dormTours, findDormTour, resolveDormAssetUrl } from '@shared/utils/dorm-presentation'
import { getApiBaseUrl, trackMiniApp } from '../../services/http'
import { goMapCategory, openExternal } from '../../utils/navigation'

const activeId = ref<string>(dormTours[0]!.id)
const videoFailed = ref(false)
const posterFailed = ref<Record<string, boolean>>({})

const activeTour = computed(() => findDormTour(activeId.value))
const origin = getApiBaseUrl()
const videoUrl = computed(() => resolveDormAssetUrl(origin, activeTour.value.videoPath))
const posterUrl = computed(() => resolveDormAssetUrl(origin, activeTour.value.posterPath))

function posterOf(id: string, path: string): string {
  return posterFailed.value[id] ? '' : resolveDormAssetUrl(origin, path)
}

function markPosterFailed(id: string): void {
  posterFailed.value = { ...posterFailed.value, [id]: true }
}

function selectDorm(id: string): void {
  if (activeId.value === id) return
  activeId.value = id
  videoFailed.value = false
  trackMiniApp('module_view', '/pages/dorms/index', { target: 'dorm-switch', dorm: id })
}

function copyVideoLink(): void {
  trackMiniApp('module_view', '/pages/dorms/index', { target: 'dorm-video-link', dorm: activeId.value })
  openExternal(videoUrl.value)
}

onLoad(() => {
  trackMiniApp('page_view', '/pages/dorms/index')
})
</script>

<template>
  <AppPage title="宿舍实拍" subtitle="普通型和舒适型分开看。视频由本站维护者自行拍摄，只作行前参考。">
    <view class="list-stack">
      <button
        v-for="tour in dormTours"
        :key="tour.id"
        class="list-card dorm-option"
        :class="{ selected: activeId === tour.id }"
        @click="selectDorm(tour.id)"
      >
        <image
          v-if="posterOf(tour.id, tour.posterPath)"
          class="dorm-thumb"
          :src="posterOf(tour.id, tour.posterPath)"
          mode="aspectFill"
          @error="markPosterFailed(tour.id)"
        />
        <view class="dorm-option-body">
          <view class="dorm-option-head">
            <text class="t-item dorm-name">{{ tour.name }}</text>
            <text class="chip">{{ tour.badge }}</text>
          </view>
          <text class="t-meta dorm-summary">{{ tour.summary }}</text>
        </view>
      </button>
    </view>

    <view class="list-card video-card">
      <text class="t-label">正在看 · {{ activeTour.duration }}</text>
      <text class="t-item video-title">{{ activeTour.name }}</text>
      <text class="t-meta video-detail">{{ activeTour.detail }}</text>

      <video
        v-if="!videoFailed"
        :key="activeId"
        class="dorm-video"
        :src="videoUrl"
        :poster="posterOf(activeTour.id, activeTour.posterPath)"
        controls
        show-center-play-btn
        object-fit="contain"
        @error="videoFailed = true"
      />

      <view v-else class="note note-pending video-fallback">
        <text class="t-meta">视频暂时没有加载成功，可能是网络或域名白名单限制。</text>
        <button class="btn btn-outline btn-sm video-fallback-action" @click="copyVideoLink">复制视频链接</button>
      </view>

      <view class="highlight-list">
        <text v-for="(item, index) in activeTour.highlights" :key="index" class="t-meta highlight">· {{ item }}</text>
      </view>

      <view class="video-actions">
        <button class="btn btn-outline btn-sm" @click="copyVideoLink">复制视频链接</button>
        <button class="btn btn-primary btn-sm" @click="goMapCategory('dorm')">去地图找宿舍楼</button>
      </view>
    </view>

    <view v-for="item in dormDisclaimers" :key="item.title" class="note note-pending">
      <text class="t-item disclaimer-title">{{ item.title }}</text>
      <text class="t-meta disclaimer-body">{{ item.body }}</text>
    </view>
  </AppPage>
</template>

<style scoped>
.dorm-option {
  display: flex;
  align-items: stretch;
  gap: 20rpx;
  width: 100%;
  text-align: left;
  line-height: inherit;
}

.dorm-option.selected {
  border-color: var(--teal);
  box-shadow: inset 0 0 0 1rpx var(--teal);
}

.dorm-thumb {
  flex: 0 0 auto;
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  background: var(--line);
}

.dorm-option-body {
  flex: 1;
  min-width: 0;
}

.dorm-option-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.dorm-name {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
}

.dorm-summary {
  margin-top: 8rpx;
}

.video-card {
  margin-top: 16rpx;
}

.video-title {
  margin-top: 6rpx;
  font-size: 34rpx;
}

.video-detail {
  margin-top: 10rpx;
}

/* 实拍是竖屏 9:16，盒子按比例给高度，避免上下大片黑边。 */
.dorm-video {
  width: 100%;
  height: 1060rpx;
  margin-top: 18rpx;
  border-radius: 12rpx;
  background: #000;
}

.video-fallback {
  margin-top: 18rpx;
}

.video-fallback-action {
  margin-top: 14rpx;
}

.highlight-list {
  display: grid;
  gap: 6rpx;
  margin-top: 18rpx;
}

.highlight {
  color: var(--ink);
}

.video-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}

.disclaimer-title {
  font-size: 28rpx;
}

.disclaimer-body {
  margin-top: 6rpx;
}
</style>
