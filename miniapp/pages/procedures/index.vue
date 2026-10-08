<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import {
  PROCEDURE_CATEGORY_LABELS,
  resolveProcedureCategoryLabel,
  resolveProcedureStateLabel,
  studentFacingProcedureText
} from '@shared/utils/content-presentation'
import AppPage from '../../components/AppPage.vue'
import StateView from '../../components/StateView.vue'
import { listProcedures } from '../../services/catalog'
import { explainError, openProcedure } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import type { MiniAppProcedure } from '../../types/app'

const items = ref<MiniAppProcedure[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const filter = ref('all')

const filters = computed(() => {
  const present = new Set(items.value.map(item => item.category ?? ''))
  return [
    { id: 'all', label: '全部' },
    ...Object.entries(PROCEDURE_CATEGORY_LABELS)
      .filter(([id]) => present.has(id))
      .map(([id, label]) => ({ id, label }))
  ]
})

const visibleItems = computed(() => filter.value === 'all'
  ? items.value
  : items.value.filter(item => (item.category ?? '') === filter.value))

async function loadProcedures(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    items.value = (await listProcedures()).items
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function stateLabel(item: MiniAppProcedure): string {
  return resolveProcedureStateLabel(item.informationState)
}

function statusDetail(item: MiniAppProcedure): string {
  const text = item.statusText ? studentFacingProcedureText(item.statusText) : ''
  return text && text !== stateLabel(item) ? text : ''
}

function stateClass(item: MiniAppProcedure): string {
  return item.informationState === 'awaiting-notice' ? 'status-waiting' : item.informationState === 'partial' ? 'status-partial' : 'status-ready'
}

function counts(item: MiniAppProcedure): string {
  const steps = item.steps.length
  const materials = item.materials.length
  return [
    steps ? `${steps} 个步骤` : '步骤待补充',
    materials ? `${materials} 项材料` : '材料暂未公布'
  ].join(' · ')
}

onShow(() => {
  trackMiniApp('page_view', '/pages/procedures/index')
  void loadProcedures()
})

onPullDownRefresh(() => { void loadProcedures() })
</script>

<template>
  <AppPage eyebrow="校园值班台 / 办事情" title="流程清单" subtitle="先看办理路径，再核对当前通知。信息不完整的流程会明确标注。">
    <scroll-view v-if="!loading && !error && items.length" class="filter-scroll" scroll-x>
      <view class="filter-row">
        <button
          v-for="item in filters"
          :key="item.id"
          class="filter-button"
          :class="{ selected: filter === item.id }"
          @click="filter = item.id"
        >{{ item.label }}</button>
      </view>
    </scroll-view>

    <StateView :loading="loading" :error="error" :empty="!visibleItems.length" empty-text="这个分类下暂时没有已公开流程。" @retry="loadProcedures">
      <view>
        <view class="list-stack">
        <button v-for="item in visibleItems" :key="item.id" class="procedure-row" @click="openProcedure(item.slug)">
          <text class="t-item procedure-title">{{ item.title }}</text>
          <view class="procedure-tags">
            <text class="status" :class="stateClass(item)">{{ stateLabel(item) }}</text>
            <text class="chip-plain">{{ resolveProcedureCategoryLabel(item.category) }}</text>
          </view>
          <text v-if="item.summary" class="t-body procedure-summary">{{ item.summary }}</text>
          <text v-if="statusDetail(item)" class="t-meta procedure-status">{{ statusDetail(item) }}</text>
          <view class="procedure-foot">
            <text class="t-meta">{{ counts(item) }} · {{ item.department ? item.department.name : '负责部门待确认' }}</text>
            <text class="t-meta procedure-action">查看流程 ›</text>
          </view>
        </button>
        </view>
      </view>
    </StateView>
  </AppPage>
</template>

<style scoped>
.filter-scroll {
  width: 100%;
  margin-bottom: 24rpx;
  white-space: nowrap;
}

.filter-row {
  display: inline-flex;
  gap: 12rpx;
}

.filter-button {
  min-width: 108rpx;
  min-height: 64rpx;
  padding: 0 24rpx;
  border: 1rpx solid var(--line-strong);
  border-radius: 999rpx;
  color: var(--ink-soft);
  background: var(--surface);
  font-size: 26rpx;
  line-height: 64rpx;
}

.filter-button.selected {
  border-color: var(--teal);
  color: var(--on-teal);
  background: var(--teal);
}

.procedure-row {
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

.procedure-title {
  font-size: 32rpx;
}

.procedure-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.status {
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1.7;
}

.status-ready { color: var(--teal-dark); background: var(--teal-soft); }
.status-partial { color: var(--mustard); background: var(--mustard-soft); }
.status-waiting { color: var(--brick); background: var(--brick-soft); }

.procedure-summary {
  margin-top: 12rpx;
  color: var(--muted);
}

.procedure-status {
  margin-top: 8rpx;
  color: var(--mustard);
}

.procedure-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 14rpx;
}

.procedure-action {
  flex: 0 0 auto;
  color: var(--teal-dark);
  font-weight: 600;
}
</style>
