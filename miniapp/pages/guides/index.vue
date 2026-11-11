<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { GUIDE_CATEGORY_LABELS, resolveGuideCategoryLabel } from '@shared/utils/content-presentation'
import AppPage from '../../components/AppPage.vue'
import GuideCard from '../../components/GuideCard.vue'
import StateView from '../../components/StateView.vue'
import { listGuides } from '../../services/catalog'
import { explainError, goProcedures, goSearch } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import type { ApiContent } from '@shared/types/server'

const guides = ref<ApiContent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const filter = ref('all')

const filters = computed(() => {
  const present = new Set(guides.value.map(guide => guide.category ?? ''))
  return [
    { id: 'all', label: '全部' },
    ...Object.entries(GUIDE_CATEGORY_LABELS)
      .filter(([id]) => present.has(id))
      .map(([id, label]) => ({ id, label }))
  ]
})

const visibleGuides = computed(() => filter.value === 'all'
  ? guides.value
  : guides.value.filter(guide => (guide.category ?? '') === filter.value))

const groups = computed(() => {
  const order = Object.keys(GUIDE_CATEGORY_LABELS)
  const buckets = new Map<string, ApiContent[]>()
  for (const guide of visibleGuides.value) {
    const key = guide.category ?? ''
    buckets.set(key, [...(buckets.get(key) ?? []), guide])
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => {
      const leftIndex = order.indexOf(left)
      const rightIndex = order.indexOf(right)
      return (leftIndex === -1 ? order.length : leftIndex) - (rightIndex === -1 ? order.length : rightIndex)
    })
    .map(([category, items]) => ({ category, label: resolveGuideCategoryLabel(category), items }))
})

async function loadGuides(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    guides.value = (await listGuides()).items
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function openGuide(slug: string): void {
  const guide = guides.value.find(item => item.slug === slug)
  trackMiniApp('result_click', '/pages/guides/index', {
    entityType: 'content',
    kind: 'guide',
    slug,
    id: guide?.id || null
  })
  uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(slug)}` })
}

onShow(() => {
  trackMiniApp('page_view', '/pages/guides/index')
  void loadGuides()
})

onPullDownRefresh(() => {
  void loadGuides()
})
</script>

<template>
  <AppPage eyebrow="校园值班台 / 读说明" title="校园指南">
    <scroll-view v-if="!loading && !error && guides.length" class="filter-scroll" scroll-x>
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

    <StateView :loading="loading" :error="error" :empty="!visibleGuides.length" empty-text="这个主题下暂时没有已发布指南。" @retry="loadGuides">
      <view>
        <view v-for="group in groups" :key="group.category" class="guide-group">
          <view class="label-row group-head">
            <text class="t-label">{{ group.label }}</text>
            <text class="t-meta">{{ group.items.length }} 篇</text>
          </view>
          <view class="list-stack">
            <GuideCard v-for="guide in group.items" :key="guide.id" :guide="guide" @open="openGuide" />
          </view>
        </view>
      </view>
    </StateView>

    <view class="guide-tools">
      <button class="btn-link" @click="goProcedures">去看办事流程</button>
      <button class="btn-link" @click="goSearch()">搜索指南</button>
    </view>
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

.guide-group + .guide-group {
  margin-top: 36rpx;
}

.group-head {
  gap: 12rpx;
  margin-bottom: 4rpx;
}

.guide-tools {
  display: flex;
  gap: 36rpx;
  margin-top: 36rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--line);
}
</style>
