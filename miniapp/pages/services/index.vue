<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { MAP_CATEGORY_COLORS, MAP_CATEGORY_LABELS } from '@shared/utils/place-presentation'
import AppPage from '../../components/AppPage.vue'
import { trackMiniApp } from '../../services/http'
import { goGuides, goMap, goMapCategory, goNotices, goProcedures, goSearch, openExternal, openProcedure } from '../../utils/navigation'

interface ServiceEntry {
  title: string
  description: string
  action: () => void
}

interface ServiceGroup {
  key: string
  label: string
  note: string
  entries: ServiceEntry[]
}

function openDepartments(): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'content', kind: 'department' })
  uni.navigateTo({ url: '/pages/departments/index' })
}

function openClubs(): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'content', kind: 'club' })
  uni.navigateTo({ url: '/pages/clubs/index' })
}

function openNearby(): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'nearby' })
  uni.navigateTo({ url: '/pages/nearby/index' })
}

function openDorms(): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'dorm' })
  uni.navigateTo({ url: '/pages/dorms/index' })
}

function openPanorama(): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'panorama' })
  uni.navigateTo({ url: '/pages/panorama/index' })
}

function openChecklist(): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'checklist' })
  uni.navigateTo({ url: '/pages/checklist/index' })
}

function openGuide(slug: string): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'content', kind: 'guide', slug })
  uni.navigateTo({ url: `/pages/guides/detail?slug=${encodeURIComponent(slug)}` })
}

const groups: ServiceGroup[] = [
  {
    key: 'task',
    label: '按要办的事找',
    note: '新生最常问的几件事',
    entries: [
      { title: '新生清单', description: '按到校前、报到当天和第一周逐项勾选', action: () => openChecklist() },
      { title: '新生报到', description: '报到日期、要带的材料和现场顺序', action: () => openGuide('arrival') },
      { title: '学费与资助', description: '学费、住宿费、助学贷款和助学金', action: () => openGuide('fees-aid') },
      { title: '找宿舍 / 教学楼', description: '宿舍片区、教学楼位置和食堂', action: () => openGuide('find-campus') },
      { title: '校园一卡通与网络', description: '校园网、校园卡和连接问题', action: () => openGuide('campus-card-network') },
      { title: '学习 / 图书馆', description: '开学日期、教务入口、借阅规则', action: () => openGuide('study-library') },
      { title: '快递 / 外卖', description: '取件站点、取餐点和配送范围', action: () => openGuide('express-delivery') },
      { title: '安全 / 医疗', description: '校园 110、医务室和心理支持', action: () => openGuide('safety-health') },
      { title: '周边商铺', description: '学生街和周边的吃住行', action: () => openGuide('nearby') },
      { title: '社团与招新', description: '社团方向和本学期招新消息', action: () => openClubs() }
    ]
  },
  {
    key: 'procedure',
    label: '按办事流程找',
    note: '要提交材料或找部门的',
    entries: [
      { title: '校园网与账号登录', description: '账号登录不上、网络故障排查', action: () => openProcedure('campus-network') },
      { title: '宿舍维修报修', description: '设施损坏的报修流程', action: () => openProcedure('dorm-repair') },
      { title: '图书馆借阅证', description: '借阅证办理与微信绑定', action: () => openProcedure('library-card-wechat') },
      { title: '专升本档案邮寄', description: '仅专升本新生需要办理', action: () => openProcedure('transfer-archive-mailing') }
    ]
  },
  {
    key: 'place',
    label: '按位置找',
    note: '在地图上按类别筛',
    entries: Object.entries(MAP_CATEGORY_LABELS).map(([id, label]) => ({
      title: label,
      description: `${label}类地点在地图上的分布`,
      action: () => goMapCategory(id)
    }))
  },
  {
    key: 'browse',
    label: '内容浏览',
    note: '全部公开资料的入口',
    entries: [
      { title: '全部指南', description: '按入学、校园、生活、社团查看', action: () => goGuides() },
      { title: '流程清单', description: '办事步骤、材料和负责部门', action: () => goProcedures() },
      { title: '通知公告', description: '按时间查看近期公开通知', action: () => goNotices() },
      { title: '校园地图', description: '全部已发布地点与分类筛选', action: () => goMap() },
      { title: '站内检索 / AI 问答', description: '按关键词查，或直接问一句话', action: () => goSearch() },
      { title: '校内部门', description: '招生、教务、学生事务等部门入口', action: () => openDepartments() },
      { title: '学生社团', description: '按兴趣浏览社团方向', action: () => openClubs() },
      { title: '周边攻略', description: '学校周边与泉州市区的去处整理', action: () => openNearby() },
      { title: '宿舍实拍', description: '普通型与舒适型宿舍的实拍视频', action: () => openDorms() },
      { title: '全景云游', description: '校内实景与校史馆全景入口', action: () => openPanorama() }
    ]
  }
]

const officialLinks = [
  { title: '学校官网', description: '学校主页与官方通知', url: 'https://www.yeu.edu.cn/' },
  { title: '招生官网', description: '招生章程与录取信息', url: 'https://zhaosheng.yeu.edu.cn/' },
  { title: '学生资助', description: '奖助学金与资助政策', url: 'https://xsb.yeu.edu.cn/xszz/list.htm' }
]

function openOfficial(url: string, title: string): void {
  trackMiniApp('result_click', '/pages/services/index', { entityType: 'external', kind: title })
  openExternal(url)
}

onShow(() => {
  trackMiniApp('page_view', '/pages/services/index')
})
</script>

<template>
  <AppPage title="服务导航" subtitle="按要办的事、办事流程、位置或资料类型找到入口。">
    <button class="search-bar" @click="goSearch()">
      <image class="search-bar-icon" src="/static/icon-search.png" mode="aspectFit" />
      <text class="search-bar-text">搜索校园信息，或输入你的问题</text>
    </button>

    <view v-for="group in groups" :key="group.key" class="section">
      <view class="section-head">
        <text class="t-section">{{ group.label }}</text>
        <text class="t-meta">{{ group.note }}</text>
      </view>
      <view class="entry-list list-stack">
        <button v-for="entry in group.entries" :key="entry.title" class="entry-row list-card" @click="entry.action">
          <view class="entry-copy">
            <text class="t-item entry-title">{{ entry.title }}</text>
            <text class="t-meta entry-desc">{{ entry.description }}</text>
          </view>
          <text class="entry-chevron">›</text>
        </button>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="t-section">学校官方入口</text>
        <text class="t-meta">在浏览器里打开</text>
      </view>
      <view class="entry-list list-stack">
        <button v-for="link in officialLinks" :key="link.url" class="entry-row list-card" @click="openOfficial(link.url, link.title)">
          <view class="entry-copy">
            <text class="t-item entry-title">{{ link.title }}</text>
            <text class="t-meta entry-desc">{{ link.description }}</text>
          </view>
          <text class="entry-chevron">›</text>
        </button>
      </view>
      <text class="t-meta official-note">在浏览器里打开学校官网，办理和缴费按官网指引进行。</text>
    </view>

    <view class="note note-pending reminder">
      <text class="t-meta">这里只做资料整理，具体办理要求以学校当届通知和现场为准。</text>
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

.section {
  margin-top: 40rpx;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 12rpx;
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  color: var(--ink);
  text-align: left;
  line-height: inherit;
}

.entry-copy {
  flex: 1;
  min-width: 0;
}

.entry-title {
  font-size: 30rpx;
}

.entry-desc {
  margin-top: 6rpx;
}

.entry-chevron {
  flex: 0 0 auto;
  color: var(--line-strong);
  font-size: 40rpx;
  line-height: 1;
}

.official-note {
  margin-top: 14rpx;
}

.reminder {
  margin-top: 40rpx;
}
</style>
