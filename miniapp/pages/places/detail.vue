<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import {
  formatDateLabel
} from '@shared/utils/content-presentation'
import {
  isPlaceCoordinateVerified,
  resolveCoordinateSystemLabel,
  resolveCoordinateVerificationLabel,
  resolvePlaceCategoryLabel,
  resolvePlaceNavigationStatusLabel,
  resolvePlaceScopeLabel,
  resolvePlaceStudentBody,
  resolvePlaceStudentSummary
} from '@shared/utils/place-presentation'
import AppPage from '../../components/AppPage.vue'
import ContentBlocks from '../../components/ContentBlocks.vue'
import SourceList from '../../components/SourceList.vue'
import StateView from '../../components/StateView.vue'
import { getPlace } from '../../services/catalog'
import { explainError, openExternal, openLocation } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import { rememberRecent } from '../../utils/recent'
import type { ApiPlace } from '@shared/types/server'

const place = ref<ApiPlace | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const detailSlug = ref('')

const categoryLabel = computed(() => place.value ? resolvePlaceCategoryLabel(place.value.category, place.value.type) : '')
const summary = computed(() => place.value
  ? resolvePlaceStudentSummary(place.value.summary, place.value.name, place.value.category, place.value.type)
  : '')
const body = computed(() => {
  if (!place.value) return ''
  const resolved = resolvePlaceStudentBody(place.value.body, place.value.name, place.value.category, place.value.type)
  if (!resolved || resolved === summary.value) return ''
  return resolved
})
const navigationLabel = computed(() => place.value
  ? resolvePlaceNavigationStatusLabel(isPlaceCoordinateVerified(place.value))
  : '')

const facts = computed(() => {
  const value = place.value
  if (!value) return []
  return [
    { label: '地址', text: value.address },
    { label: '校区', text: value.campusArea },
    { label: '楼层', text: [value.floor, value.room].filter(Boolean).join(' · ') },
    { label: '开放时间', text: value.openingHours },
    { label: '电话', text: value.phone },
    { label: '范围', text: resolvePlaceScopeLabel(value.scope) }
  ].filter(fact => Boolean(fact.text)) as Array<{ label: string, text: string }>
})

const verificationRows = computed(() => {
  const value = place.value
  if (!value) return []
  return [
    { label: '资料更新', text: formatDateLabel(value.lastVerifiedAt) },
    { label: '坐标核验', text: formatDateLabel(value.coordinateVerifiedAt) },
    { label: '坐标状态', text: resolveCoordinateVerificationLabel(value.coordinateVerification) },
    { label: '坐标系', text: value.coordinateSystem ? resolveCoordinateSystemLabel(value.coordinateSystem) : null }
  ].filter(row => Boolean(row.text)) as Array<{ label: string, text: string }>
})

async function loadPlace(slug: string): Promise<void> {
  loading.value = true
  error.value = null
  try {
    place.value = await getPlace(slug)
    rememberRecent({ kind: 'place', slug: place.value.slug, title: place.value.name })
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
  }
}

function retryPlace(): void {
  if (!detailSlug.value || loading.value) return
  void loadPlace(detailSlug.value)
}

function copyLink(url: string | null, target: string): void {
  trackMiniApp('result_click', '/pages/places/detail', { entityType: 'place', slug: detailSlug.value, target })
  openExternal(url)
}

onLoad((query) => {
  const slug = typeof query?.slug === 'string' ? query.slug : ''
  detailSlug.value = slug
  trackMiniApp('page_view', '/pages/places/detail', { entityType: 'place', slug: slug || undefined })
  if (!slug) {
    error.value = '缺少地点标识。'
    loading.value = false
    return
  }
  void loadPlace(slug)
})
</script>

<template>
  <AppPage eyebrow="校园值班台 / 地点详情" :title="place?.name || '地点详情'">
    <StateView
      :loading="loading"
      :error="error"
      :empty="!loading && !error && !place"
      empty-text="这个地点暂时没有可展示信息。"
      :retry-disabled="loading || !detailSlug"
      :retry-loading="loading"
      @retry="retryPlace"
    >
      <view v-if="place">
        <view class="head-row">
          <text class="chip">{{ categoryLabel }}</text>
          <text class="t-label">{{ navigationLabel }}</text>
        </view>

        <text class="t-body lead">{{ summary }}</text>

        <ContentBlocks v-if="body" class="body" :body="body" />

        <view v-if="place.navigationAvailable" class="primary-action">
          <button class="btn btn-primary" @click="openLocation(place)">打开地图位置</button>
        </view>

        <view v-if="facts.length" class="fact-block">
          <view v-for="fact in facts" :key="fact.label" class="fact-row">
            <text class="t-label fact-label">{{ fact.label }}</text>
            <text class="t-body fact-text">{{ fact.text }}</text>
          </view>
        </view>

        <view class="secondary-actions">
          <button v-if="place.website" class="btn-link" @click="copyLink(place.website, 'website')">复制官方网站</button>
          <button v-if="place.externalMapUrl" class="btn-link" @click="copyLink(place.externalMapUrl, 'external-map')">复制地图链接</button>
        </view>

        <view v-if="verificationRows.length" class="note note-pending verification">
          <view class="label-row">
            <text class="t-label">核验信息</text>
          </view>
          <view v-for="row in verificationRows" :key="row.label" class="verification-row">
            <text class="t-meta verification-label">{{ row.label }}</text>
            <text class="t-meta verification-value">{{ row.text }}</text>
          </view>
          <text class="t-meta verification-hint">开放时间和入口可能临时调整，出发前再看一眼学校当届通知。</text>
        </view>

        <SourceList :sources="place.sources" />

        <view class="note note-error disclaimer">
          <text class="t-meta">地点名称、开放时间和服务范围可能调整；重要安排以学校当届通知和现场指引为准。</text>
        </view>
      </view>
    </StateView>
  </AppPage>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.lead {
  color: var(--ink-soft);
}

.body {
  margin-top: 22rpx;
}

.primary-action {
  margin-top: 28rpx;
}

.fact-block {
  margin-top: 32rpx;
  padding-top: 8rpx;
  border-top: 1rpx solid var(--line);
}

.fact-row {
  display: flex;
  gap: 20rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.fact-label {
  flex: 0 0 128rpx;
  color: var(--muted);
  letter-spacing: 0;
}

.fact-text {
  flex: 1;
  min-width: 0;
}

.secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 28rpx;
  margin-top: 24rpx;
}

.verification {
  margin-top: 32rpx;
}

.verification-row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 12rpx;
}

.verification-label {
  color: var(--mustard);
}

.verification-value {
  color: var(--ink);
  font-weight: 600;
}

.verification-hint {
  margin-top: 16rpx;
  color: var(--mustard);
}

.disclaimer {
  margin-top: 32rpx;
}
</style>
