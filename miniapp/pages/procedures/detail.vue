<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import {
  formatDateLabel,
  resolveProcedureCategoryLabel,
  resolveProcedureMethodLabel,
  resolveProcedureStateLabel,
  studentFacingProcedureText
} from '@shared/utils/content-presentation'
import AppPage from '../../components/AppPage.vue'
import ContentBlocks from '../../components/ContentBlocks.vue'
import SourceList from '../../components/SourceList.vue'
import StateView from '../../components/StateView.vue'
import { getProcedure } from '../../services/catalog'
import { explainError, goMap, openExternal } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import { rememberRecent } from '../../utils/recent'
import type { MiniAppProcedure } from '../../types/app'

const item = ref<MiniAppProcedure | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const detailSlug = ref('')

const statusText = computed(() => item.value
  ? (item.value.statusText ? studentFacingProcedureText(item.value.statusText) : resolveProcedureStateLabel(item.value.informationState))
  : '')

const body = computed(() => {
  const value = item.value
  if (!value) return ''
  const raw = value.body?.trim() ?? ''
  return raw === value.summary?.trim() ? '' : raw
})

const timeRows = computed(() => {
  const value = item.value
  if (!value) return []
  return [
    { label: '办理方式', text: resolveProcedureMethodLabel(value.method) },
    { label: '办理时长', text: value.processingTime },
    { label: '办理期限', text: value.deadlineText },
    { label: '有效期', text: value.validFrom || value.validUntil ? `${formatDateLabel(value.validFrom)} 至 ${formatDateLabel(value.validUntil)}` : null },
    { label: '负责部门', text: value.department?.name ?? null },
    { label: '最后更新', text: value.lastVerifiedAt ? formatDateLabel(value.lastVerifiedAt, { compact: true }) : null }
  ].filter(row => Boolean(row.text)) as Array<{ label: string, text: string }>
})

async function loadProcedure(slug: string): Promise<void> {
  loading.value = true
  error.value = null
  try {
    item.value = await getProcedure(slug)
    rememberRecent({ kind: 'procedure', slug: item.value.slug, title: item.value.title })
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
  }
}

function retryProcedure(): void {
  if (!detailSlug.value || loading.value) return
  void loadProcedure(detailSlug.value)
}

function openSource(url: string): void {
  trackMiniApp('result_click', '/pages/procedures/detail', { entityType: 'procedure', target: 'source' })
  openExternal(url)
}

function openRelatedGuide(slug: string): void {
  trackMiniApp('result_click', '/pages/procedures/detail', { entityType: 'content', kind: 'guide', slug })
  uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(slug)}` })
}

onLoad((query) => {
  trackMiniApp('page_view', '/pages/procedures/detail', { entityType: 'procedure' })
  const slug = typeof query?.slug === 'string' ? query.slug : ''
  detailSlug.value = slug
  if (!slug) { error.value = '缺少流程标识。'; loading.value = false; return }
  void loadProcedure(slug)
})
</script>

<template>
  <AppPage eyebrow="校园值班台 / 流程详情" :title="item?.title || '流程详情'">
    <StateView
      :loading="loading"
      :error="error"
      :empty="!loading && !error && !item"
      empty-text="这份流程暂时没有可展示内容。"
      :retry-disabled="loading || !detailSlug"
      :retry-loading="loading"
      @retry="retryProcedure"
    >
      <view v-if="item">
        <view class="head-row">
          <text class="chip">{{ resolveProcedureCategoryLabel(item.category) }}</text>
          <text class="t-label">{{ statusText }}</text>
        </view>

        <text class="t-body lead">{{ item.summary }}</text>
        <ContentBlocks v-if="body" class="body" :body="body" />

        <view v-if="timeRows.length" class="fact-block">
          <view v-for="row in timeRows" :key="row.label" class="fact-row">
            <text class="t-label fact-label">{{ row.label }}</text>
            <text class="t-body fact-text">{{ row.text }}</text>
          </view>
        </view>

        <view v-if="item.steps.length" class="section">
          <view class="label-row">
            <text class="t-label">办理步骤</text>
          </view>
          <view v-for="step in item.steps" :key="step.id" class="step-row">
            <text class="step-index">{{ step.order }}</text>
            <view class="step-copy">
              <text class="t-item">{{ step.title }}</text>
              <text v-if="step.description" class="t-body step-description">{{ step.description }}</text>
              <text v-if="step.timeText" class="t-meta step-meta">时间：{{ step.timeText }}</text>
              <text v-if="step.department" class="t-meta step-meta">负责：{{ step.department.name }}</text>
              <button v-if="step.place" class="btn-link step-action" @click="goMap(step.place.slug)">在校园地图查看办理地点</button>
            </view>
          </view>
        </view>

        <view v-if="item.materials.length" class="section">
          <view class="label-row">
            <text class="t-label">准备材料</text>
          </view>
          <view v-for="material in item.materials" :key="material.id" class="material-row">
            <view class="material-head">
              <text class="t-item material-name">{{ material.name }}</text>
              <text v-if="material.isRequired" class="chip-plain material-required">必要</text>
            </view>
            <text v-if="material.description" class="t-body material-description">{{ material.description }}</text>
          </view>
        </view>

        <button v-if="item.relatedGuide" class="btn btn-quiet related-guide" @click="openRelatedGuide(item.relatedGuide.slug)">
          相关指南：{{ item.relatedGuide.title }}
        </button>

        <SourceList :sources="item.sources" />

        <view class="note note-error disclaimer">
          <text class="t-meta">这是公开资料整理页，不代替学校审批或系统操作。日期、材料和入口有变化时，以负责部门最新通知为准。</text>
        </view>

        <button v-if="item.department?.website" class="btn btn-outline department-link" @click="openExternal(item.department.website)">复制负责部门入口</button>
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

.fact-block {
  margin-top: 30rpx;
  border-top: 1rpx solid var(--line);
}

.fact-row {
  display: flex;
  gap: 20rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.fact-label {
  flex: 0 0 148rpx;
  color: var(--muted);
  letter-spacing: 0;
}

.fact-text {
  flex: 1;
  min-width: 0;
}

.section {
  margin-top: 36rpx;
}

.step-row {
  display: flex;
  gap: 20rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.step-index {
  flex: 0 0 auto;
  width: 52rpx;
  height: 52rpx;
  border-radius: 10rpx;
  color: var(--teal-dark);
  background: var(--teal-soft);
  font-size: 26rpx;
  font-weight: 700;
  line-height: 52rpx;
  text-align: center;
}

.step-copy {
  flex: 1;
  min-width: 0;
}

.step-description {
  margin-top: 8rpx;
  color: var(--muted);
}

.step-meta {
  margin-top: 8rpx;
}

.step-action {
  margin-top: 10rpx;
}

.material-row {
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.material-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.material-name {
  flex: 1;
  min-width: 0;
}

.material-required {
  color: var(--brick);
  border-color: var(--brick-soft);
}

.material-description {
  margin-top: 8rpx;
  color: var(--muted);
}

.related-guide {
  width: 100%;
  margin-top: 32rpx;
  text-align: left;
}

.disclaimer {
  margin-top: 32rpx;
}

.department-link {
  width: 100%;
  margin-top: 24rpx;
}
</style>
