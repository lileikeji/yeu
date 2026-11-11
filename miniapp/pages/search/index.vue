<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppPage from '../../components/AppPage.vue'
import ContentBlocks from '../../components/ContentBlocks.vue'
import SourceList from '../../components/SourceList.vue'
import StateView from '../../components/StateView.vue'
import { askAssistant, searchCatalog } from '../../services/catalog'
import { explainError, openExternal, openPlace, openProcedure } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import type { ApiAssistantResponse, ApiSearchItem, ApiSearchResponse } from '@shared/types/server'

const SESSION_KEY = 'miniapp-ai-session'

type Mode = 'search' | 'ai'

const mode = ref<Mode>('search')
const query = ref('')
const aiAnswer = ref<ApiAssistantResponse | null>(null)
const items = ref<ApiSearchItem[]>([])
const features = ref<NonNullable<ApiSearchResponse['features']>>([])
const loading = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const hasSearched = ref(false)
const lastSubmitted = ref('')

const searchSuggestions = ['报到', '学费', '宿舍', '食堂', '校园网', '图书馆', '快递', '社团']
const aiSuggestions = ['宿舍是几人间', '报到要带什么材料', '学费一年多少钱', '校园网怎么开通']

function readSessionId(): string {
  try {
    const existing = uni.getStorageSync(SESSION_KEY)
    if (typeof existing === 'string' && existing.length >= 8) return existing
    const created = `mpm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    uni.setStorageSync(SESSION_KEY, created)
    return created
  } catch {
    return ''
  }
}

function switchMode(next: Mode): void {
  if (mode.value === next) return
  mode.value = next
  error.value = null
  notice.value = null
  trackMiniApp('module_view', '/pages/search/index', { target: next })
  if (query.value && hasSearched.value) void submit(true)
}

async function submit(force = false): Promise<void> {
  if (loading.value) return
  const value = query.value.trim().slice(0, 120)
  if (!value) return
  if (!force && value === lastSubmitted.value && hasSearched.value) return
  query.value = value
  lastSubmitted.value = value
  hasSearched.value = true
  error.value = null
  notice.value = null
  loading.value = true

  if (mode.value === 'ai') {
    trackMiniApp('search_submit', '/pages/search/index', { queryLength: value.length, kind: 'ai' })
    try {
      aiAnswer.value = await askAssistant(value, readSessionId())
      items.value = []
      features.value = []
    } catch (cause) {
      const code = (cause as { details?: { code?: string | null } })?.details?.code
      // 关键词类提问服务端会要求走普通检索，这里自动回退，不让用户卡住。
      if (code === 'REGULAR_SEARCH_PREFERRED') {
        mode.value = 'search'
        notice.value = '已按关键词显示结果；换成完整问句可继续提问。'
        aiAnswer.value = null
        await runCatalogSearch(value)
      } else {
        aiAnswer.value = null
        error.value = explainError(cause)
      }
    } finally {
      loading.value = false
    }
    return
  }

  trackMiniApp('search_submit', '/pages/search/index', { queryLength: value.length, kind: 'search' })
  try {
    await runCatalogSearch(value)
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
  }
}

async function runCatalogSearch(value: string): Promise<void> {
  try {
    const response = await searchCatalog(value)
    items.value = response.items
    features.value = response.features ?? []
  } catch (cause) {
    items.value = []
    features.value = []
    throw cause
  }
}

function applySuggestion(value: string): void {
  query.value = value
  void submit(true)
}

function labelFor(item: ApiSearchItem): string {
  if (item.entityType === 'place') return '地点'
  if (item.entityType === 'procedure') return '流程'
  if (item.entityType === 'content' && item.kind === 'notice') return '公告'
  return item.kind === 'guide' ? '指南' : item.resultType
}

function openFeature(feature: NonNullable<ApiSearchResponse['features']>[number]): void {
  trackMiniApp('result_click', '/pages/search/index', { entityType: 'feature', id: feature.id })
  const target = feature.to
  if (target.startsWith('/guides/')) {
    uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(target.slice('/guides/'.length))}` })
    return
  }
  if (target.startsWith('/procedures/')) {
    openProcedure(target.slice('/procedures/'.length))
    return
  }
  if (/^https:\/\//i.test(target)) {
    openExternal(target)
    return
  }
  uni.navigateTo({ url: '/pages/about/index' })
}

function openResult(item: ApiSearchItem): void {
  trackMiniApp('result_click', '/pages/search/index', {
    entityType: item.entityType,
    kind: item.kind || undefined,
    slug: item.slug || undefined,
    id: item.id || undefined
  })
  if (item.entityType === 'place') {
    openPlace(item.slug)
    return
  }
  if (item.entityType === 'procedure') {
    openProcedure(item.slug)
    return
  }
  if (item.kind === 'guide' || item.kind === 'notice') {
    uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(item.slug)}${item.kind === 'notice' ? '&kind=notice' : ''}` })
    return
  }
  const itemUrl = (item as ApiSearchItem & { url?: string | null }).url
  if (itemUrl && /^https:\/\//i.test(itemUrl)) {
    openExternal(itemUrl)
    return
  }
  uni.navigateTo({ url: '/pages/about/index' })
}

function openCitation(url: string): void {
  trackMiniApp('result_click', '/pages/search/index', { entityType: 'citation' })
  openExternal(url)
}

function receiveRouteQuery(): void {
  const pending = uni.getStorageSync('miniapp-search-query')
  if (typeof pending !== 'string' || !pending) return
  uni.removeStorageSync('miniapp-search-query')
  const value = pending.slice(0, 120)
  query.value = value
  if (value !== lastSubmitted.value) void submit(true)
}

function handleShow(): void {
  trackMiniApp('page_view', '/pages/search/index')
  receiveRouteQuery()
}

onLoad((options) => {
  if (typeof options?.q === 'string' && options.q.trim()) {
    query.value = options.q.slice(0, 120)
    void submit(true)
  }
})

onShow(handleShow)
</script>

<template>
  <AppPage title="站内搜索">
    <view class="mode-row">
      <button class="mode-button" :class="{ selected: mode === 'search' }" @click="switchMode('search')">
        <text class="mode-text">查资料</text>
      </button>
      <button class="mode-button" :class="{ selected: mode === 'ai' }" @click="switchMode('ai')">
        <text class="mode-text">直接问</text>
      </button>
    </view>

    <view class="search-row">
      <input
        v-model="query"
        class="search-input"
        :placeholder="mode === 'ai' ? '例如：宿舍是几人间' : '例如：图书馆、校园网、报到'"
        confirm-type="search"
        @confirm="submit(false)"
      />
      <button class="btn btn-primary search-button" :disabled="loading || !query.trim()" :loading="loading" @click="submit(false)">
        {{ mode === 'ai' ? '提问' : '搜索' }}
      </button>
    </view>

    <view v-if="!hasSearched" class="suggest-block">
      <view class="label-row">
        <text class="t-label">{{ mode === 'ai' ? '可以这样问' : '常用的搜索' }}</text>
      </view>
      <view class="suggest-row">
        <button
          v-for="word in (mode === 'ai' ? aiSuggestions : searchSuggestions)"
          :key="word"
          class="suggest-chip"
          @click="applySuggestion(word)"
        >{{ word }}</button>
      </view>
    </view>

    <view v-if="notice" class="note note-pending notice-note">
      <text class="t-meta">{{ notice }}</text>
    </view>

    <StateView
      :loading="loading"
      :error="error"
      :empty="hasSearched && !loading && !error && !items.length && !features.length && !aiAnswer"
      :empty-text="mode === 'ai' ? '这次没有得到回答。可以换个说法再问一次。' : '没有找到匹配内容。可以换个更短的关键词。'"
      @retry="submit(true)"
    >
      <view v-if="aiAnswer" class="ai-block">
        <view class="ai-head">
          <text class="chip">回答</text>
          <text class="t-meta">{{ aiAnswer.mode === 'ai' ? '结合站内与公开资料' : '基于站内资料' }}</text>
        </view>
        <ContentBlocks class="ai-body" :body="aiAnswer.answer" />
        <view v-if="aiAnswer.citations.length" class="ai-citations">
          <view class="label-row">
            <text class="t-label">参考来源</text>
          </view>
          <button
            v-for="citation in aiAnswer.citations"
            :key="citation.url"
            class="citation-row"
            @click="openCitation(citation.url)"
          >
            <view class="citation-head">
              <text class="t-item citation-title">{{ citation.title }}</text>
              <text class="chip-plain">{{ citation.source === 'site' ? '站内' : '网页' }}</text>
            </view>
            <text v-if="citation.snippet" class="t-meta citation-snippet">{{ citation.snippet }}</text>
          </button>
        </view>
        <text class="t-meta ai-disclaimer">整理结果可能有出入，办理要求以学校当届通知和现场为准。</text>
      </view>

      <view v-if="features.length" class="feature-list">
        <view class="label-row">
          <text class="t-label">快捷入口</text>
        </view>
        <button v-for="feature in features" :key="feature.id" class="feature-row" @click="openFeature(feature)">
          <text class="t-item">{{ feature.title }}</text>
          <text class="t-meta feature-summary">{{ feature.summary }}</text>
        </button>
      </view>

      <view v-if="items.length" class="result-list">
        <view class="label-row result-heading">
          <text class="t-label">找到 {{ items.length }} 条结果</text>
        </view>
        <button v-for="item in items" :key="`${item.entityType}-${item.id}`" class="result-row" @click="openResult(item)">
          <view class="result-head">
            <text class="t-item result-title">{{ item.title }}</text>
            <text class="chip">{{ labelFor(item) }}</text>
          </view>
          <text v-if="item.summary" class="t-body result-summary">{{ item.summary }}</text>
        </button>
      </view>
    </StateView>

    <view v-if="hasSearched && !loading && (items.length || features.length || aiAnswer)" class="suggest-block suggest-after">
      <view class="label-row">
        <text class="t-label">再试试</text>
      </view>
      <view class="suggest-row">
        <button
          v-for="word in (mode === 'ai' ? aiSuggestions : searchSuggestions)"
          :key="word"
          class="suggest-chip"
          @click="applySuggestion(word)"
        >{{ word }}</button>
      </view>
    </view>
  </AppPage>
</template>

<style scoped>
.mode-row {
  display: flex;
  gap: 8rpx;
  padding: 6rpx;
  border-radius: 14rpx;
  background: var(--surface-sunk);
}

.mode-button {
  flex: 1;
  min-height: 72rpx;
  padding: 0 20rpx;
  border: 0;
  border-radius: 10rpx;
  background: transparent;
  line-height: 72rpx;
}

.mode-button.selected {
  background: var(--surface);
  box-shadow: 0 2rpx 8rpx -4rpx rgba(35, 40, 31, .35);
}

.mode-text {
  color: var(--muted);
  font-size: 28rpx;
  font-weight: 600;
}

.mode-button.selected .mode-text {
  color: var(--teal-dark);
}

.search-row {
  display: flex;
  align-items: stretch;
  gap: 12rpx;
  margin-top: 20rpx;
}

.search-input {
  flex: 1;
  height: 88rpx;
  padding: 0 24rpx;
  border: 1rpx solid var(--line-strong);
  border-radius: 12rpx;
  color: var(--ink);
  background: var(--surface);
  box-sizing: border-box;
  font-size: 28rpx;
}

.search-button {
  flex: 0 0 auto;
  width: 152rpx;
  min-height: 88rpx;
  line-height: 88rpx;
}

.suggest-block {
  margin-top: 32rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--line);
}

.suggest-after {
  margin-top: 40rpx;
}

.suggest-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 18rpx;
}

.suggest-chip {
  min-height: 64rpx;
  padding: 0 26rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  color: var(--ink-soft);
  background: var(--surface);
  font-size: 26rpx;
  line-height: 64rpx;
}

.notice-note {
  margin-top: 24rpx;
}

.ai-block {
  margin-top: 28rpx;
  padding: 26rpx;
  border: 1rpx solid var(--line);
  border-radius: 16rpx;
  background: var(--surface);
}

.ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.ai-body {
  margin-top: 18rpx;
}

.ai-citations {
  margin-top: 30rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--line);
}

.citation-row {
  display: block;
  width: 100%;
  padding: 20rpx 0;
  border: 0;
  border-bottom: 1rpx solid var(--line);
  color: var(--ink);
  background: transparent;
  text-align: left;
  line-height: inherit;
}

.citation-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.citation-title {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
}

.citation-snippet {
  display: -webkit-box;
  margin-top: 8rpx;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ai-disclaimer {
  margin-top: 24rpx;
}

.feature-list,
.result-list {
  margin-top: 32rpx;
}

.result-heading {
  margin-bottom: 4rpx;
}

.feature-row,
.result-row {
  display: block;
  width: 100%;
  padding: 24rpx 0;
  border: 0;
  border-bottom: 1rpx solid var(--line);
  color: var(--ink);
  background: transparent;
  text-align: left;
  line-height: inherit;
}

.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.result-title {
  flex: 1;
  min-width: 0;
}

.feature-summary,
.result-summary {
  margin-top: 8rpx;
  color: var(--muted);
}
</style>
