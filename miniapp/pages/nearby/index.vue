<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import AppPage from '../../components/AppPage.vue'
import StateView from '../../components/StateView.vue'
import { listNearbyGuides } from '../../services/catalog'
import { explainError } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import type { MiniAppNearbyGuide } from '../../types/app'

type Scope = 'nearby' | 'city'

const SCOPE_LABELS: Record<Scope, string> = { nearby: '学校周边', city: '泉州市区' }

const scope = ref<Scope>('nearby')
const category = ref('')
const items = ref<MiniAppNearbyGuide[]>([])
const categories = ref<Array<{ id: string, label: string, count: number }>>([])
const loading = ref(true)
const error = ref<string | null>(null)

const scopeOptions = computed(() => (Object.keys(SCOPE_LABELS) as Scope[]).map(id => ({
  id,
  label: SCOPE_LABELS[id]
})))

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const response = await listNearbyGuides({ scope: scope.value, category: category.value || undefined })
    items.value = response.items
    categories.value = response.categories
    // 切 scope 后原分类可能不存在了，避免留下空列表。
    if (category.value && !response.categories.some(entry => entry.id === category.value)) category.value = ''
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function applyScope(value: Scope): void {
  if (scope.value === value) return
  scope.value = value
  category.value = ''
  trackMiniApp('module_view', '/pages/nearby/index', { target: 'nearby-scope', scope: value })
  void load()
}

function applyCategory(value: string): void {
  category.value = category.value === value ? '' : value
  trackMiniApp('module_view', '/pages/nearby/index', { target: 'nearby-category', category: category.value })
  void load()
}

/**
 * 打开地点：攻略里的坐标本来就来自高德 POI（GCJ-02），
 * 必须如实标注坐标系，否则会被当成 WGS84 再换算一次，偏几百米。
 */
function openDestination(guide: MiniAppNearbyGuide, destination: MiniAppNearbyGuide['destinations'][number]): void {
  trackMiniApp('open_location', '/pages/nearby/index', {
    guide: guide.id,
    destination: destination.id,
    hasCoordinate: true
  })
  uni.openLocation({
    name: destination.label,
    address: destination.note || undefined,
    longitude: destination.longitude,
    latitude: destination.latitude,
    scale: 16,
    fail: () => uni.showToast({ title: '地图打开失败，请稍后重试', icon: 'none' })
  })
}

onShow(() => {
  trackMiniApp('page_view', '/pages/nearby/index')
  void load()
})
onPullDownRefresh(() => { void load() })
</script>

<template>
  <AppPage title="周边攻略" subtitle="学校周边和泉州市区的去处整理；商家与营业状态请在出发当天再复核一次。">
    <view class="scope-row">
      <button
        v-for="option in scopeOptions"
        :key="option.id"
        class="scope-button"
        :class="{ selected: scope === option.id }"
        @click="applyScope(option.id)"
      >
        {{ option.label }}
      </button>
    </view>

    <scroll-view v-if="categories.length" class="category-scroll" scroll-x>
      <view class="category-row">
        <button
          v-for="entry in categories"
          :key="entry.id"
          class="category-button"
          :class="{ selected: category === entry.id }"
          @click="applyCategory(entry.id)"
        >
          {{ entry.label }}
          <text class="category-count">{{ entry.count }}</text>
        </button>
      </view>
    </scroll-view>

    <StateView
      :loading="loading"
      :error="error"
      :empty="!items.length"
      empty-text="这个分类暂时还没有整理内容。"
      @retry="load"
    >
      <view class="list-stack">
        <view v-for="item in items" :key="item.id" class="list-card">
          <text class="t-label">{{ item.eyebrow }}</text>
          <text class="t-item guide-title">{{ item.title }}</text>
          <text class="t-meta guide-summary">{{ item.summary }}</text>

          <view v-if="item.highlights.length" class="highlight-list">
            <text v-for="(highlight, index) in item.highlights" :key="index" class="t-meta highlight">· {{ highlight }}</text>
          </view>

          <view class="meta-list">
            <text class="t-meta"><text class="meta-key">适合</text>{{ item.suitableFor }}</text>
            <text class="t-meta"><text class="meta-key">怎么去</text>{{ item.travelNote }}</text>
            <text class="t-meta"><text class="meta-key">花费</text>{{ item.costNote }}</text>
          </view>

          <view class="destination-list">
            <button
              v-for="destination in item.destinations"
              :key="destination.id"
              class="destination-row"
              @click="openDestination(item, destination)"
            >
              <view class="destination-text">
                <text class="t-item destination-label">{{ destination.label }}</text>
                <text v-if="destination.note" class="t-meta destination-note">{{ destination.note }}</text>
              </view>
              <text class="destination-action">去这里</text>
            </button>
          </view>

          <view class="note note-pending freshness">
            <text class="t-meta">{{ item.freshnessNote }}</text>
          </view>
        </view>
      </view>
    </StateView>
  </AppPage>
</template>

<style scoped>
.scope-row {
  display: flex;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.scope-button {
  flex: 1;
  min-height: 76rpx;
  border: 1rpx solid var(--line);
  border-radius: 12rpx;
  color: var(--ink);
  background: var(--surface);
  font-size: 28rpx;
  line-height: 76rpx;
}

.scope-button.selected {
  border-color: var(--teal);
  color: var(--teal-dark);
  background: var(--teal-soft);
  font-weight: 600;
}

.category-scroll {
  width: 100%;
  margin-bottom: 16rpx;
  white-space: nowrap;
}

.category-row {
  display: inline-flex;
  gap: 12rpx;
}

.category-button {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  min-height: 66rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  color: var(--ink);
  background: var(--surface);
  font-size: 25rpx;
  line-height: 66rpx;
}

.category-button.selected {
  border-color: var(--teal);
  color: var(--teal-dark);
  background: var(--teal-soft);
}

.category-count {
  color: var(--muted);
  font-size: 22rpx;
}

.guide-title {
  display: block;
  margin-top: 6rpx;
  font-size: 32rpx;
}

.guide-summary {
  margin-top: 10rpx;
}

.highlight-list {
  display: grid;
  gap: 6rpx;
  margin-top: 14rpx;
}

.highlight {
  color: var(--ink);
}

.meta-list {
  display: grid;
  gap: 6rpx;
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid var(--line);
}

.meta-key {
  margin-right: 10rpx;
  color: var(--teal-dark);
  font-size: 22rpx;
  font-weight: 700;
}

.destination-list {
  display: grid;
  gap: 10rpx;
  margin-top: 16rpx;
}

.destination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  width: 100%;
  min-height: 88rpx;
  padding: 14rpx 22rpx;
  border: 1rpx solid var(--line);
  border-radius: 12rpx;
  background: var(--paper);
  text-align: left;
  line-height: inherit;
}

.destination-text {
  flex: 1;
  min-width: 0;
}

.destination-label {
  font-size: 28rpx;
}

.destination-note {
  margin-top: 4rpx;
}

.destination-action {
  flex: 0 0 auto;
  color: var(--teal-dark);
  font-size: 26rpx;
  font-weight: 700;
}

.freshness {
  margin-top: 16rpx;
}
</style>
