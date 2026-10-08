<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppPage from '../../components/AppPage.vue'
import StateView from '../../components/StateView.vue'
import { listDepartments } from '../../services/catalog'
import { explainError } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import type { ApiContent } from '@shared/types/server'

const items = ref<ApiContent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    items.value = (await listDepartments()).items
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function openDepartment(slug: string): void {
  trackMiniApp('result_click', '/pages/departments/index', { entityType: 'content', kind: 'department', slug })
  uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(slug)}&kind=department` })
}

onShow(() => {
  trackMiniApp('page_view', '/pages/departments/index')
  void load()
})
onPullDownRefresh(() => { void load() })
</script>

<template>
  <AppPage title="校内部门" subtitle="按要办的事查职责和公开联系方式，具体窗口和电话以部门最新通知为准。">
    <StateView :loading="loading" :error="error" :empty="!items.length" empty-text="暂时没有已公开的部门资料。" @retry="load">
      <view class="list-stack">
        <button v-for="item in items" :key="item.id" class="dept-row list-card" @click="openDepartment(item.slug)">
          <view class="dept-head">
            <text class="t-item dept-title">{{ item.title }}</text>
          </view>
          <text v-if="item.summary" class="t-meta dept-summary">{{ item.summary }}</text>
        </button>
      </view>
    </StateView>
  </AppPage>
</template>

<style scoped>
.dept-row {
  display: block;
  width: 100%;
  text-align: left;
  line-height: inherit;
}

.dept-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.dept-title {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
}

.dept-summary {
  display: -webkit-box;
  margin-top: 8rpx;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
