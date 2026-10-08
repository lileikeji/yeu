<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { formatDateLabel, readingMinutesLabel, resolveGuideCategoryLabel } from '@shared/utils/content-presentation'
import { resolvePlaceStudentBody, resolvePlaceStudentSummary } from '@shared/utils/place-presentation'
import AppPage from '../../components/AppPage.vue'
import ContentBlocks from '../../components/ContentBlocks.vue'
import SourceList from '../../components/SourceList.vue'
import StateView from '../../components/StateView.vue'
import { getClub, getDepartment, getGuide, getNotice, getPlace } from '../../services/catalog'
import { explainError, openExternal, openLocation } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import { rememberRecent } from '../../utils/recent'
import type { ApiContent, ApiPlace } from '@shared/types/server'
import type { MiniAppNotice } from '../../types/app'

const loading = ref(true)
const error = ref<string | null>(null)
const guide = ref<ApiContent | null>(null)
const place = ref<ApiPlace | null>(null)
const detailSlug = ref('')
const detailKind = ref('guide')
const isPlace = ref(false)
const isNotice = ref(false)
const isDepartment = ref(false)
const isClub = ref(false)

const notice = computed(() => isNotice.value ? guide.value as MiniAppNotice : null)

const leadNotice = computed(() => {
  const value = guide.value?.metadata?.leadNotice
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

const summary = computed(() => {
  if (place.value) {
    return resolvePlaceStudentSummary(place.value.summary, place.value.name, place.value.category, place.value.type)
  }
  return guide.value?.summary?.trim() ?? ''
})

const body = computed(() => {
  if (place.value) {
    const resolved = resolvePlaceStudentBody(place.value.body, place.value.name, place.value.category, place.value.type)
    return resolved === summary.value ? '' : resolved
  }
  const raw = guide.value?.body?.trim() ?? ''
  return raw === summary.value ? '' : raw
})

const meta = computed(() => {
  if (!guide.value) return ''
  const parts = [
    guide.value.category ? resolveGuideCategoryLabel(guide.value.category) : '',
    readingMinutesLabel(body.value || summary.value),
    guide.value.lastVerifiedAt ? `${formatDateLabel(guide.value.lastVerifiedAt, { compact: true })}更新` : ''
  ].filter(Boolean)
  return parts.join(' · ')
})

function openSource(url: string): void {
  trackMiniApp('result_click', '/pages/guides/detail', { kind: isNotice.value ? 'notice' : 'guide', target: 'source' })
  openExternal(url)
}

function openNoticeAction(action: MiniAppNotice['actions'][number]): void {
  trackMiniApp('result_click', '/pages/guides/detail', { kind: 'notice', target: 'action' })
  if (/^https:\/\//i.test(action.href)) {
    openExternal(action.href)
    return
  }
  if (action.href.startsWith('/pages/')) {
    uni.navigateTo({ url: action.href })
  }
}

async function loadDetail(slug: string, kind: string): Promise<void> {
  loading.value = true
  error.value = null
  isPlace.value = kind === 'place'
  isNotice.value = kind === 'notice'
  isDepartment.value = kind === 'department'
  isClub.value = kind === 'club'
  place.value = null
  guide.value = null
  try {
    if (isPlace.value) {
      place.value = await getPlace(slug)
      rememberRecent({ kind: 'place', slug: place.value.slug, title: place.value.name })
      return
    }
    if (isNotice.value) {
      guide.value = await getNotice(slug)
      rememberRecent({ kind: 'notice', slug: guide.value.slug, title: guide.value.title })
      return
    }
    if (isDepartment.value) {
      guide.value = await getDepartment(slug)
      return
    }
    if (isClub.value) {
      guide.value = await getClub(slug)
      return
    }
    try {
      guide.value = await getGuide(slug)
      rememberRecent({ kind: 'guide', slug: guide.value.slug, title: guide.value.title })
    } catch (guideError) {
      // 深链可能只带 slug 不带 kind：指南查不到时改试公告，失败再抛出原错误。
      try {
        guide.value = await getNotice(slug)
      } catch {
        throw guideError
      }
      isNotice.value = true
      rememberRecent({ kind: 'notice', slug: guide.value.slug, title: guide.value.title })
    }
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
  }
}

function retryDetail(): void {
  if (!detailSlug.value || loading.value) return
  void loadDetail(detailSlug.value, detailKind.value)
}

onLoad((query) => {
  const slug = typeof query?.slug === 'string' ? query.slug : ''
  const kind = typeof query?.kind === 'string' ? query.kind : 'guide'
  detailSlug.value = slug
  detailKind.value = ['place', 'notice', 'department', 'club'].includes(kind) ? kind : 'guide'
  trackMiniApp('page_view', '/pages/guides/detail', { kind: detailKind.value })
  if (!slug) {
    error.value = '缺少内容标识。'
    loading.value = false
    return
  }
  void loadDetail(slug, detailKind.value)
})
</script>

<template>
  <AppPage eyebrow="校园值班台 / 详情" :title="place?.name || guide?.title || '详情'">
    <StateView
      :loading="loading"
      :error="error"
      :empty="!loading && !error && !place && !guide"
      empty-text="这份公开内容暂时没有可展示信息。"
      :retry-disabled="loading || !detailSlug"
      :retry-loading="loading"
      @retry="retryDetail"
    >
      <view v-if="place">
        <view class="head-row">
          <text class="chip">{{ place.address ? '校内地点' : '地点' }}</text>
        </view>
        <text class="t-body lead">{{ summary }}</text>
        <ContentBlocks v-if="body" class="body" :body="body" />
        <view v-if="place.address || place.openingHours" class="fact-block">
          <view v-if="place.address" class="fact-row">
            <text class="t-label fact-label">地址</text>
            <text class="t-body fact-text">{{ place.address }}</text>
          </view>
          <view v-if="place.openingHours" class="fact-row">
            <text class="t-label fact-label">开放时间</text>
            <text class="t-body fact-text">{{ place.openingHours }}</text>
          </view>
        </view>
        <button v-if="place.navigationAvailable" class="btn btn-primary action" @click="openLocation(place)">打开地图位置</button>
      </view>

      <view v-else-if="guide">
        <view class="head-row">
          <text class="chip">{{ isNotice ? '公告' : isDepartment ? '部门' : isClub ? '社团' : '指南' }}</text>
          <text class="t-meta">{{ meta }}</text>
        </view>

        <view v-if="leadNotice" class="note note-pending lead-notice">
          <text class="t-body">{{ leadNotice }}</text>
        </view>

        <text class="t-body lead">{{ summary }}</text>
        <ContentBlocks v-if="body" class="body" :body="body" />

        <view v-if="isNotice" class="note note-calm notice-state">
          <text class="t-meta">
            {{ notice?.confirmed ? `你已经确认过这条公告 · 共 ${notice.confirmationCount} 人确认` : `还没有确认过这条公告 · 已有 ${notice?.confirmationCount ?? 0} 人确认` }}
          </text>
        </view>

        <view v-if="notice && notice.actions.length" class="notice-actions">
          <view class="label-row">
            <text class="t-label">公告里的下一步</text>
          </view>
          <button v-for="action in notice.actions" :key="action.href" class="btn btn-quiet action-row" @click="openNoticeAction(action)">
            {{ action.label }}
          </button>
        </view>

        <SourceList :sources="guide.sources" />
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

.lead-notice {
  margin-bottom: 22rpx;
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

.action {
  margin-top: 28rpx;
}

.notice-state {
  margin-top: 30rpx;
}

.notice-actions {
  margin-top: 32rpx;
}

.action-row {
  margin-top: 16rpx;
}
</style>
