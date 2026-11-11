<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { formatDateLabel } from '@shared/utils/content-presentation'
import AppPage from '../../components/AppPage.vue'
import StateView from '../../components/StateView.vue'
import { listNotices } from '../../services/catalog'
import { explainError, openExternal, openNotice as navigateToNotice } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import type { MiniAppNotice } from '../../types/app'

const items = ref<MiniAppNotice[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

function openNoticeItem(item: MiniAppNotice): void {
  trackMiniApp('result_click', '/pages/notices/index', { entityType: 'content', kind: 'notice', slug: item.slug, id: item.id })
  navigateToNotice(item.slug)
}

function openNoticeAction(action: MiniAppNotice['actions'][number]): void {
  trackMiniApp('result_click', '/pages/notices/index', { entityType: 'content', kind: 'notice', target: 'action' })
  if (/^https:\/\//i.test(action.href)) {
    openExternal(action.href)
    return
  }
  if (action.href.startsWith('/pages/')) uni.navigateTo({ url: action.href })
}

async function loadNotices(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    items.value = (await listNotices()).items
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

onShow(() => {
  trackMiniApp('page_view', '/pages/notices/index')
  void loadNotices()
})

onPullDownRefresh(() => { void loadNotices() })
</script>

<template>
  <AppPage eyebrow="校园值班台 / 看变化" title="通知公告">
    <StateView :loading="loading" :error="error" :empty="!items.length" empty-text="暂无已发布公告。" @retry="loadNotices">
      <view class="list-stack">
        <view v-for="item in items" :key="item.id" class="notice-row list-card">
          <view class="notice-head">
            <text v-if="item.pinned" class="chip-pin">置顶</text>
            <text class="t-meta">{{ formatDateLabel(item.publishedAt ?? item.updatedAt, { compact: true }) }}</text>
          </view>

          <button class="notice-main" @click="openNoticeItem(item)">
            <text class="t-item notice-title">{{ item.title }}</text>
            <text v-if="item.summary" class="t-body notice-summary">{{ item.summary }}</text>
          </button>

          <view class="notice-foot">
            <text class="t-label">{{ item.confirmed ? `你已确认 · ${item.confirmationCount} 人确认` : `${item.confirmationCount} 人确认` }}</text>
            <view v-if="item.actions.length" class="notice-actions">
              <button v-for="action in item.actions" :key="action.href" class="btn-link" @click="openNoticeAction(action)">{{ action.label }}</button>
            </view>
          </view>
        </view>
      </view>
    </StateView>
  </AppPage>
</template>

<style scoped>
.notice-row {
  padding: 24rpx 26rpx;
}

.notice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 12rpx;
}

.chip-pin {
  display: inline-block;
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
  color: var(--brick);
  background: var(--brick-soft);
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1.6;
}

.notice-main {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  color: var(--ink);
  background: transparent;
  text-align: left;
  line-height: inherit;
}

.notice-title {
  font-size: 32rpx;
}

.notice-summary {
  margin-top: 10rpx;
  color: var(--muted);
}

.notice-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.notice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 28rpx;
}
</style>
