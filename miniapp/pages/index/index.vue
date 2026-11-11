<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type { FrontendFeatureKey } from '@shared/config/frontend-features'
import { formatDateLabel } from '@shared/utils/content-presentation'
import { CHECKLIST_STORAGE_KEY, buildHomeChecklistSummary, parseChecklistProgress } from '@shared/utils/checklist-catalog'
import AppPage from '../../components/AppPage.vue'
import { getHome, listNotices } from '../../services/catalog'
import { explainError, goAbout, goGuides, goMap, goNotices, goProcedures, goSearch, goServices, openExternal, openNotice, openPlace, openProcedure } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import { readRecent, recentKindLabel } from '../../utils/recent'
import type { MiniAppHomeResponse, MiniAppNotice } from '../../types/app'
import type { RecentItem } from '../../utils/recent'

const loading = ref(true)
const error = ref<string | null>(null)
const home = ref<MiniAppHomeResponse | null>(null)
interface StageCard {
  key: string
  label: string
  title: string
  items: string[]
  actionLabel: string
  action: () => void
}

const stageCards: StageCard[] = [
  {
    key: 'before-arrival',
    label: '到校前',
    title: '先确认报到安排，不要凭群聊猜',
    items: ['确认报到时间和要带的材料', '查专业对应的住宿片区', '收藏校园地图认方向'],
    actionLabel: '查看报到准备',
    action: () => uni.navigateTo({ url: '/pages/guides/detail?slug=arrival' })
  },
  {
    key: 'arrival-day',
    label: '报到当天',
    title: '先看清报到方位，再按步骤办理',
    items: ['按现场指引完成报到', '到宿舍确认入住', '核对一卡通与网络'],
    actionLabel: '打开校园地图',
    action: () => goMap()
  },
  {
    key: 'first-week',
    label: '入学第一周',
    title: '补齐学习和生活入口',
    items: ['确认课表和教学楼', '办理一卡通和校园网', '保存安全和办事入口'],
    actionLabel: '查看全部指南',
    action: () => goGuides()
  }
]

interface KeyDate {
  date: string
  title: string
  description: string
}

/** 与置顶公告口径一致的三条关键时间；学校更新后以当届通知为准。 */
const keyDates: KeyDate[] = [
  { date: '9月5–6日', title: '注册报到', description: '具体到校时段、报到地点和材料以录取通知书及学校后续通知为准。' },
  { date: '9月7–9日', title: '入学教育', description: '学院集合地点、时间和安排以辅导员或学院通知为准。' },
  { date: '9月10日', title: '开始上课', description: '课表、教材和教学安排以教务系统及学院通知为准。' }
]

interface ChecklistSummary {
  percent: number
  remainingCount: number
  nextTitle: string | null
}

const checklistSummary = ref<ChecklistSummary | null>(null)

function refreshChecklist(): void {
  try {
    const raw = uni.getStorageSync(CHECKLIST_STORAGE_KEY)
    const parsed = parseChecklistProgress(typeof raw === 'string' && raw ? JSON.parse(raw) : raw)
    checklistSummary.value = buildHomeChecklistSummary(parsed.completedIds, parsed.audience)
  } catch {
    checklistSummary.value = buildHomeChecklistSummary([], 'all')
  }
}

function goChecklist(): void {
  trackMiniApp('module_view', '/pages/index/index', { target: 'checklist' })
  uni.navigateTo({ url: '/pages/checklist/index' })
}

const notices = ref<MiniAppNotice[]>([])
const recent = ref<RecentItem[]>([])
const detailEntry = ref<MiniAppHomeResponse['entries'][number] | null>(null)

interface TaskCard {
  key?: FrontendFeatureKey
  title: string
  description: string
  icon: string
  action: () => void
  defaultOrder: number
}

interface Slide {
  key: string
  image: string
  label: string
  title: string
  summary: string
  action: () => void
}

const BANNERS = {
  campus: '/static/banner/campus.jpg',
  cityNight: '/static/banner/city-night.jpg',
  cityFood: '/static/banner/city-food.jpg'
}

const taskCards: TaskCard[] = [
  { key: 'home.essential.map', title: '校园地图', description: '教学楼、宿舍、快递点', icon: '/static/icon-map.png', action: () => goMap(), defaultOrder: 10 },
  { key: 'home.essential.arrival', title: '流程清单', description: '办事步骤与材料', icon: '/static/icon-desk.png', action: () => goProcedures(), defaultOrder: 20 },
  { key: 'home.essential.network', title: '校园指南', description: '报到、宿舍、缴费', icon: '/static/icon-book.png', action: () => goGuides(), defaultOrder: 30 },
  { title: '通知公告', description: '近期公开通知', icon: '/static/icon-notice.png', action: () => goNotices(), defaultOrder: 40 }
]

function featureEnabled(key: string): boolean {
  return !home.value?.features.disabledKeys.includes(key as FrontendFeatureKey)
}

function featurePlacement(key: string, fallback: 'quick' | 'services' | 'more'): string {
  return home.value?.features.placements[key as FrontendFeatureKey] || fallback
}

function featureSortOrder(key: string): number | undefined {
  return home.value?.features.sortOrders[key as FrontendFeatureKey]
}

function taskCardOrder(card: TaskCard): number {
  return (card.key ? featureSortOrder(card.key) : undefined) ?? card.defaultOrder
}

const visibleTaskCards = computed(() => taskCards
  .filter(card => !card.key || (featureEnabled(card.key) && featurePlacement(card.key, 'quick') === 'quick'))
  .sort((left, right) => taskCardOrder(left) - taskCardOrder(right)))

const slides = computed<Slide[]>(() => {
  const pinned = [...notices.value].sort((left, right) => Number(right.pinned) - Number(left.pinned))[0]
  const items: Slide[] = []

  items.push(pinned
    ? {
        key: `notice-${pinned.slug}`,
        image: BANNERS.campus,
        label: pinned.pinned ? '重点公告' : '公开通知',
        title: pinned.title,
        summary: pinned.summary,
        action: () => openNotice(pinned.slug)
      }
    : {
        key: 'campus',
        image: BANNERS.campus,
        label: '校园',
        title: '校园全景',
        summary: '教学楼、宿舍、食堂和快递点都收在校园地图里。',
        action: () => goMap()
      })

  items.push(
    {
      key: 'city-night',
      image: BANNERS.cityNight,
      label: '周边',
      title: '泉州城区与夜景',
      summary: '周末进城、换乘和吃饭的去处，先在地图上看位置。',
      action: () => goMap()
    },
    {
      key: 'city-food',
      image: BANNERS.cityFood,
      label: '生活',
      title: '闽南小吃与夜市',
      summary: '周边能吃到什么，去之前先确认营业状态。',
      action: () => goSearch('周边')
    }
  )

  return items
})

const visibleEntries = computed(() => (home.value?.entries ?? [])
  .filter(entry => !entry.featureKey || featureEnabled(entry.featureKey))
  .filter(entry => featurePlacement(entry.featureKey || entry.id, entry.placement) !== 'hidden'))

const topNotices = computed(() => [...notices.value]
  .sort((left, right) => Number(right.pinned) - Number(left.pinned))
  .slice(0, 3))

async function loadHome(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [homeResponse, noticeResponse] = await Promise.all([
      getHome(),
      listNotices().catch(() => ({ items: [], total: 0 }))
    ])
    home.value = homeResponse
    notices.value = noticeResponse.items ?? []
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function refreshRecent(): void {
  recent.value = readRecent()
}

function openRecentItem(item: RecentItem): void {
  trackMiniApp('result_click', '/pages/index/index', { entityType: item.kind, slug: item.slug })
  if (item.kind === 'place') openPlace(item.slug)
  else if (item.kind === 'procedure') openProcedure(item.slug)
  else if (item.kind === 'notice') openNotice(item.slug)
  else uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(item.slug)}` })
}

function openSlide(slide: Slide): void {
  trackMiniApp('result_click', '/pages/index/index', { entityType: 'slide', kind: slide.key })
  slide.action()
}

function openNoticeRow(notice: MiniAppNotice): void {
  trackMiniApp('result_click', '/pages/index/index', { entityType: 'content', kind: 'notice', slug: notice.slug })
  openNotice(notice.slug)
}

function openHomeEntry(entry: MiniAppHomeResponse['entries'][number]): void {
  trackMiniApp('result_click', '/pages/index/index', { entityType: 'content', id: entry.id })
  const target = entry.to || ''
  if (target.startsWith('/guides/')) {
    uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(target.slice('/guides/'.length))}` })
    return
  }
  if (entry.sourceUrl) {
    openExternal(entry.sourceUrl)
    return
  }
  detailEntry.value = entry
}

function closeEntry(): void {
  detailEntry.value = null
}

onShow(() => {
  trackMiniApp('page_view', '/pages/index/index')
  refreshRecent()
  refreshChecklist()
  void loadHome()
})
onPullDownRefresh(() => {
  refreshRecent()
  refreshChecklist()
  void loadHome()
})
</script>

<template>
  <AppPage title="今天要办什么？">
    <button class="search-bar" @click="goSearch()">
      <image class="search-bar-icon" src="/static/icon-search.png" mode="aspectFit" />
      <text class="search-bar-text">搜索校园信息，或输入你的问题</text>
    </button>

    <swiper
      v-if="slides.length"
      class="highlight-swiper"
      :autoplay="true"
      :interval="5200"
      :duration="420"
      :circular="slides.length > 1"
      indicator-dots
      indicator-color="rgba(32, 37, 34, .14)"
      indicator-active-color="#176f46"
    >
      <swiper-item v-for="slide in slides" :key="slide.key">
        <button class="slide" @click="openSlide(slide)">
          <image class="slide-image" :src="slide.image" mode="aspectFill" />
          <view class="slide-scrim" />
          <view class="slide-body">
            <text class="slide-label">{{ slide.label }}</text>
            <text class="slide-title">{{ slide.title }}</text>
            <text class="slide-summary">{{ slide.summary }}</text>
          </view>
        </button>
      </swiper-item>
    </swiper>

    <view v-if="error" class="note note-error load-error">
      <text class="t-item">部分内容没读出来</text>
      <text class="t-meta load-error-copy">{{ error }}</text>
      <button class="btn-link load-error-action" @click="loadHome">重新加载</button>
    </view>

    <view class="section">
      <text class="t-section">常用查询</text>
      <view class="quick-grid">
        <button v-for="card in visibleTaskCards" :key="card.title" class="quick-card" @click="card.action">
          <view class="quick-card-icon">
            <image class="quick-card-icon-image" :src="card.icon" mode="aspectFit" />
          </view>
          <view class="quick-card-copy">
            <text class="quick-card-title">{{ card.title }}</text>
            <text class="quick-card-desc">{{ card.description }}</text>
          </view>
        </button>
      </view>
    </view>

    <view v-if="topNotices.length" class="section">
      <view class="section-head">
        <text class="t-section">最新通知</text>
        <button class="btn-link" @click="goNotices">全部</button>
      </view>
      <view class="notice-list list-stack">
        <button v-for="notice in topNotices" :key="notice.id" class="notice-row list-card" @click="openNoticeRow(notice)">
          <view class="notice-row-head">
            <text v-if="notice.pinned" class="chip-pin">置顶</text>
            <text class="t-meta">{{ formatDateLabel(notice.publishedAt ?? notice.updatedAt, { compact: true }) }}</text>
          </view>
          <text class="t-item notice-row-title">{{ notice.title }}</text>
          <text class="t-meta notice-row-summary">{{ notice.summary }}</text>
        </button>
      </view>
    </view>

    <view v-if="recent.length" class="section">
      <text class="t-section">最近看过</text>
      <view class="recent-list list-stack">
        <button v-for="item in recent" :key="`${item.kind}-${item.slug}`" class="recent-row list-card" @click="openRecentItem(item)">
          <text class="chip-plain recent-kind">{{ recentKindLabel(item.kind) }}</text>
          <text class="t-item recent-title">{{ item.title }}</text>
        </button>
      </view>
    </view>

    <view v-if="visibleEntries.length" class="section">
      <text class="t-section">快捷资料</text>
      <view class="entry-list list-stack">
        <button v-for="entry in visibleEntries.slice(0, 6)" :key="entry.id" class="entry-row list-card" @click="openHomeEntry(entry)">
          <text class="t-item">{{ entry.title }}</text>
          <text class="t-meta entry-desc">{{ entry.description }}</text>
        </button>
      </view>
    </view>

    <view v-if="checklistSummary" class="section">
      <view class="section-head">
        <text class="t-section">新生清单</text>
        <button class="btn-link" @click="goChecklist">打开</button>
      </view>
      <button class="checklist-card list-card" @click="goChecklist">
        <view class="checklist-head">
          <text class="checklist-percent">{{ checklistSummary.percent }}%</text>
          <text class="t-meta checklist-count">还差 {{ checklistSummary.remainingCount }} 项</text>
        </view>
        <view class="progress-track">
          <view class="progress-bar" :style="{ width: `${checklistSummary.percent}%` }" />
        </view>
        <text v-if="checklistSummary.nextTitle" class="t-meta checklist-next">下一项：{{ checklistSummary.nextTitle }}</text>
        <text v-else class="t-meta checklist-next">清单已勾完，出发前再核对一遍学校通知。</text>
      </button>
    </view>

    <view class="section">
      <text class="t-section">重要时间</text>
      <view class="date-list list-stack">
        <view v-for="item in keyDates" :key="item.title" class="date-row list-card">
          <text class="date-value">{{ item.date }}</text>
          <view class="date-copy">
            <text class="t-item date-title">{{ item.title }}</text>
            <text class="t-meta date-desc">{{ item.description }}</text>
          </view>
        </view>
      </view>
      <text class="t-meta date-note">日期来自 2026 级公开通知，变动时以学校当届通知为准。</text>
    </view>

    <view class="section">
      <text class="t-section">按入学阶段查看</text>
      <view class="stage-list">
        <view v-for="stage in stageCards" :key="stage.key" class="stage-card">
          <view class="stage-head">
            <text class="chip">{{ stage.label }}</text>
          </view>
          <text class="t-item stage-title">{{ stage.title }}</text>
          <view class="stage-items">
            <view v-for="item in stage.items" :key="item" class="stage-item">
              <text class="stage-dot">·</text>
              <text class="t-meta stage-item-text">{{ item }}</text>
            </view>
          </view>
          <button class="btn-link stage-action" @click="stage.action">{{ stage.actionLabel }}</button>
        </view>
      </view>
    </view>

    <button class="btn btn-outline services-entry" @click="goServices()">
      <view class="services-copy">
        <text class="t-item">服务导航</text>
        <text class="t-meta services-desc">按办事、位置、资料类型找全部入口</text>
      </view>
      <text class="services-chevron">›</text>
    </button>

    <view class="note note-pending reminder">
      <text class="t-meta">内容只收录已公开信息，日期、费用和规则以学校当届通知为准。</text>
    </view>

    <button class="btn-link about-link" @click="goAbout">关于与反馈</button>

    <view v-if="detailEntry" class="entry-detail" role="dialog">
      <view class="entry-detail-card">
        <text class="t-section">{{ detailEntry.title }}</text>
        <text class="t-body entry-detail-body">{{ detailEntry.detailContent || detailEntry.description }}</text>
        <view class="entry-detail-actions">
          <button v-if="detailEntry.sourceUrl" class="btn btn-quiet btn-sm" @click="openExternal(detailEntry.sourceUrl)">复制来源链接</button>
          <button class="btn btn-primary btn-sm" @click="closeEntry">知道了</button>
        </view>
      </view>
    </view>
  </AppPage>
</template>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  min-height: 92rpx;
  padding: 0 30rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  background: var(--surface);
  text-align: left;
  line-height: inherit;
}

.search-bar-icon {
  flex: 0 0 auto;
  width: 34rpx;
  height: 34rpx;
}

.search-bar-text {
  flex: 1;
  min-width: 0;
  color: var(--muted);
  font-size: 28rpx;
}

.highlight-swiper {
  width: 100%;
  height: 356rpx;
  margin-top: 24rpx;
}

.slide {
  position: relative;
  display: block;
  width: 100%;
  height: 316rpx;
  padding: 0;
  border: 0;
  border-radius: 16rpx;
  background: var(--surface-sunk);
  overflow: hidden;
  text-align: left;
  line-height: inherit;
}

.slide-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.slide-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(12, 16, 12, .8) 0%, rgba(12, 16, 12, .38) 46%, rgba(12, 16, 12, .04) 100%);
}

.slide-body {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 24rpx 28rpx;
}

.slide-label {
  display: inline-block;
  padding: 2rpx 14rpx;
  border-radius: 8rpx;
  color: #ffffff;
  background: rgba(255, 255, 255, .24);
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.7;
}

.slide-title {
  display: -webkit-box;
  margin-top: 12rpx;
  color: #ffffff;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.32;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.slide-summary {
  display: -webkit-box;
  margin-top: 6rpx;
  color: rgba(255, 255, 255, .84);
  font-size: 25rpx;
  line-height: 1.45;
  overflow: hidden;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.load-error {
  margin-top: 24rpx;
}

.load-error-copy {
  margin-top: 8rpx;
}

.load-error-action {
  margin-top: 8rpx;
}

.section {
  margin-top: 40rpx;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
  margin-top: 20rpx;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 148rpx;
  padding: 22rpx;
  border: 1rpx solid var(--line);
  border-radius: 16rpx;
  background: var(--surface);
  text-align: left;
  line-height: inherit;
}

.quick-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 68rpx;
  height: 68rpx;
  border-radius: 14rpx;
  background: var(--teal-soft);
}

.quick-card-icon-image {
  width: 38rpx;
  height: 38rpx;
}

.quick-card-copy {
  flex: 1;
  min-width: 0;
}

.quick-card-title {
  display: block;
  color: var(--ink);
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.3;
}

.quick-card-desc {
  display: -webkit-box;
  margin-top: 4rpx;
  color: var(--muted);
  font-size: 22rpx;
  line-height: 1.4;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.notice-list,
.recent-list,
.entry-list {
  margin-top: 20rpx;
}

.notice-row {
  display: block;
  width: 100%;
  color: var(--ink);
  text-align: left;
  line-height: inherit;
}

.notice-row-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.chip-pin {
  display: inline-block;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  color: var(--brick);
  background: var(--brick-soft);
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.6;
}

.notice-row-title {
  margin-top: 8rpx;
  font-size: 30rpx;
}

.notice-row-summary {
  display: -webkit-box;
  margin-top: 6rpx;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  color: var(--ink);
  text-align: left;
  line-height: inherit;
}

.recent-kind {
  flex: 0 0 auto;
}

.recent-title {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
}

.entry-row {
  display: block;
  width: 100%;
  color: var(--ink);
  text-align: left;
  line-height: inherit;
}

.entry-desc {
  margin-top: 6rpx;
}

.checklist-card {
  display: block;
  width: 100%;
  margin-top: 20rpx;
  text-align: left;
  line-height: inherit;
}

.checklist-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.checklist-percent {
  color: var(--teal-dark);
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.1;
}

.checklist-count {
  flex: 1;
  text-align: right;
}

.progress-track {
  height: 12rpx;
  margin-top: 16rpx;
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

.checklist-next {
  margin-top: 14rpx;
}

.date-list {
  margin-top: 20rpx;
}

.date-row {
  display: flex;
  gap: 20rpx;
}

.date-value {
  flex: 0 0 auto;
  min-width: 148rpx;
  color: var(--teal-dark);
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1.5;
}

.date-copy {
  flex: 1;
  min-width: 0;
}

.date-title {
  font-size: 28rpx;
}

.date-desc {
  margin-top: 4rpx;
}

.date-note {
  margin-top: 12rpx;
}

.stage-list {
  display: grid;
  gap: 16rpx;
  margin-top: 20rpx;
}

.stage-card {
  padding: 26rpx;
  border: 1rpx solid var(--line);
  border-radius: 16rpx;
  background: var(--surface);
}

.stage-head {
  display: flex;
  align-items: center;
}

.stage-title {
  margin-top: 14rpx;
  font-size: 30rpx;
}

.stage-items {
  margin-top: 12rpx;
}

.stage-item {
  display: flex;
  gap: 10rpx;
  margin-top: 6rpx;
}

.stage-dot {
  color: var(--teal);
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.45;
}

.stage-item-text {
  flex: 1;
  min-width: 0;
}

.stage-action {
  margin-top: 12rpx;
}

.services-entry {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  min-height: 120rpx;
  margin-top: 32rpx;
  padding: 22rpx 26rpx;
  text-align: left;
  line-height: inherit;
}

.services-copy {
  flex: 1;
  min-width: 0;
}

.services-desc {
  margin-top: 6rpx;
}

.services-chevron {
  flex: 0 0 auto;
  color: var(--line-strong);
  font-size: 40rpx;
  line-height: 1;
}

.reminder {
  margin-top: 40rpx;
}

.about-link {
  margin-top: 28rpx;
}

.entry-detail {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  padding: 28rpx;
  background: rgba(32, 37, 34, .36);
  box-sizing: border-box;
}

.entry-detail-card {
  width: 100%;
  padding: 32rpx;
  border-radius: 20rpx 20rpx 0 0;
  background: var(--surface);
  box-sizing: border-box;
}

.entry-detail-body {
  margin-top: 18rpx;
  white-space: pre-wrap;
}

.entry-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 28rpx;
}
</style>
