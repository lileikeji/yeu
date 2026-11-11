<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  CHECKLIST_STORAGE_KEY,
  buildChecklistOverview,
  checklistAudienceOptions,
  createEmptyChecklistProgress,
  parseChecklistProgress,
  serializeChecklistProgress,
  toggleCompletedId
} from '@shared/utils/checklist-catalog'
import type { ChecklistAudience, ChecklistProgressSnapshot } from '@shared/utils/checklist-catalog'
import AppPage from '../../components/AppPage.vue'
import { goGuides, goMap, goProcedures, goServices } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'

const progress = ref<ChecklistProgressSnapshot>(createEmptyChecklistProgress())
const ready = ref(false)

const overview = computed(() => buildChecklistOverview(progress.value.completedIds, progress.value.audience))

const stageEntries = computed(() => overview.value.stageProgress)

function readProgress(): ChecklistProgressSnapshot {
  try {
    const raw = uni.getStorageSync(CHECKLIST_STORAGE_KEY)
    if (typeof raw === 'string' && raw) return parseChecklistProgress(JSON.parse(raw))
    if (raw && typeof raw === 'object') return parseChecklistProgress(raw)
  } catch {
    // 本地记录损坏时回到空进度，不影响使用。
  }
  return createEmptyChecklistProgress()
}

function writeProgress(next: ChecklistProgressSnapshot): void {
  try {
    uni.setStorageSync(CHECKLIST_STORAGE_KEY, serializeChecklistProgress(next))
  } catch {
    uni.showToast({ title: '本机保存失败，稍后再试', icon: 'none' })
  }
}

function isDone(itemId: string): boolean {
  return progress.value.completedIds.includes(itemId)
}

function toggleItem(itemId: string): void {
  const next = !isDone(itemId)
  progress.value = {
    ...progress.value,
    completedIds: toggleCompletedId(progress.value.completedIds, itemId, next),
    updatedAt: new Date().toISOString()
  }
  writeProgress(progress.value)
  trackMiniApp('result_click', '/pages/checklist/index', { entityType: 'checklist', id: itemId, success: next })
}

function setAudience(audience: ChecklistAudience): void {
  if (progress.value.audience === audience) return
  progress.value = { ...progress.value, audience, updatedAt: new Date().toISOString() }
  writeProgress(progress.value)
  trackMiniApp('module_view', '/pages/checklist/index', { target: 'audience', moduleKey: audience })
}

function resetProgress(): void {
  uni.showModal({
    title: '清空清单进度',
    content: '只会清掉这台设备上的勾选记录，不影响清单内容。',
    confirmText: '清空',
    success: (result) => {
      if (!result.confirm) return
      progress.value = { ...createEmptyChecklistProgress(), audience: progress.value.audience }
      writeProgress(progress.value)
      uni.showToast({ title: '已清空', icon: 'none' })
    }
  })
}

/** 清单里的目标沿用网页路由，这里映射到小程序可达的页面。 */
function openTarget(to: string | undefined): void {
  if (!to) return
  trackMiniApp('result_click', '/pages/checklist/index', { entityType: 'checklist-link', slug: to })
  if (to.startsWith('/map')) {
    goMap()
    return
  }
  if (to.startsWith('/procedures')) {
    goProcedures()
    return
  }
  if (to === '/nearby') {
    uni.navigateTo({ url: '/pages/guides/detail?slug=nearby' })
    return
  }
  if (to === '/clubs') {
    uni.navigateTo({ url: '/pages/guides/detail?slug=clubs' })
    return
  }
  if (to === '/departments') {
    goServices()
    return
  }
  if (to.startsWith('/guides/')) {
    const slug = to.slice('/guides/'.length).split(/[?#]/)[0] ?? ''
    if (slug) {
      uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(slug)}` })
      return
    }
    goGuides()
    return
  }
  goServices()
}

onShow(() => {
  progress.value = readProgress()
  ready.value = true
  trackMiniApp('page_view', '/pages/checklist/index')
})
</script>

<template>
  <AppPage title="新生清单">
    <view v-if="ready" class="summary card">
      <view class="summary-head">
        <text class="summary-percent">{{ overview.percent }}%</text>
        <text class="t-meta summary-count">已完成 {{ overview.completedCount }} / {{ overview.totalCount }} 项</text>
      </view>
      <view class="progress-track">
        <view class="progress-bar" :style="{ width: `${overview.percent}%` }" />
      </view>
      <text v-if="overview.nextItem" class="t-meta summary-next">下一项：{{ overview.nextItem.title }}</text>
      <text v-else class="t-meta summary-next">全部勾完了，出发前再核对一遍学校通知即可。</text>
      <button v-if="overview.completedCount > 0" class="btn-link summary-reset" @click="resetProgress">清空勾选</button>
    </view>

    <scroll-view class="audience-scroll" scroll-x>
      <view class="audience-row">
        <button
          v-for="option in checklistAudienceOptions"
          :key="option.value"
          class="audience-button"
          :class="{ selected: progress.audience === option.value }"
          @click="setAudience(option.value)"
        >{{ option.label }}</button>
      </view>
    </scroll-view>

    <view v-for="entry in stageEntries" :key="entry.stage.id" class="section">
      <view class="section-head">
        <text class="t-section">{{ entry.stage.label }}</text>
        <text class="t-meta">{{ entry.completedCount }}/{{ entry.totalCount }}</text>
      </view>
      <text class="t-meta stage-desc">{{ entry.stage.description }}</text>

      <view class="item-list list-stack">
        <view v-for="item in entry.items" :key="item.id" class="item-card list-card" :class="{ done: isDone(item.id) }" @click="toggleItem(item.id)">
          <view class="item-check" :class="{ checked: isDone(item.id) }">
            <text v-if="isDone(item.id)" class="item-check-mark">✓</text>
          </view>
          <view class="item-copy">
            <text class="t-item item-title" :class="{ done: isDone(item.id) }">{{ item.title }}</text>
            <text class="t-meta item-desc">{{ item.description }}</text>
            <view v-if="item.awaitingNotice" class="item-flag">
              <text class="t-meta item-flag-text">以学校当届通知为准</text>
            </view>
          </view>
          <button v-if="item.to" class="btn-link item-link" @click.stop="openTarget(item.to)">查看</button>
        </view>
      </view>
    </view>

    <view class="note note-pending reminder">
      <text class="t-meta">清单只是自查用，材料与时间要求以录取通知书和学校当届通知为准。</text>
    </view>
  </AppPage>
</template>

<style scoped>
.summary {
  margin-bottom: 24rpx;
}

.summary-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.summary-percent {
  color: var(--teal-dark);
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.1;
}

.summary-count {
  flex: 1;
  text-align: right;
}

.progress-track {
  height: 12rpx;
  margin-top: 18rpx;
  border-radius: 999rpx;
  background: var(--paper-deep);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 999rpx;
  background: var(--teal);
  transition: width .22s ease;
}

.summary-next {
  margin-top: 16rpx;
}

.summary-reset {
  margin-top: 12rpx;
}

.audience-scroll {
  width: 100%;
  margin-bottom: 8rpx;
  white-space: nowrap;
}

.audience-row {
  display: inline-flex;
  gap: 12rpx;
}

.audience-button {
  min-width: 140rpx;
  min-height: 68rpx;
  padding: 0 26rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  color: var(--ink);
  background: var(--surface);
  font-size: 26rpx;
  line-height: 68rpx;
}

.audience-button.selected {
  border-color: var(--teal);
  color: var(--teal-dark);
  background: var(--teal-soft);
  font-weight: 600;
}

.section {
  margin-top: 40rpx;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.stage-desc {
  margin-top: 6rpx;
}

.item-list {
  margin-top: 20rpx;
}

.item-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
}

.item-card.done {
  background: var(--teal-tint);
}

.item-check {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 44rpx;
  height: 44rpx;
  margin-top: 4rpx;
  border: 2rpx solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface);
}

.item-check.checked {
  border-color: var(--teal);
  background: var(--teal);
}

.item-check-mark {
  color: var(--on-teal);
  font-size: 26rpx;
  font-weight: 700;
  line-height: 1;
}

.item-copy {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 30rpx;
}

.item-title.done {
  color: var(--muted);
  text-decoration: line-through;
}

.item-desc {
  margin-top: 6rpx;
}

.item-flag {
  margin-top: 8rpx;
}

.item-flag-text {
  color: var(--mustard);
}

.item-link {
  flex: 0 0 auto;
  align-self: center;
  margin-left: 12rpx;
}

.reminder {
  margin-top: 40rpx;
}
</style>
