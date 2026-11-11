<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import { trackMiniApp } from '../../services/http'
import { openExternal } from '../../utils/navigation'

interface PanoramaTour {
  id: string
  eyebrow: string
  title: string
  description: string
  detail: string
  url: string
  sourceLabel: string
  badge: string
  official: boolean
}

const BAIDU_CAMPUS_PANORAMA_URL = 'https://map.baidu.com/poi/%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6/@13204528,2871631,21z,87t,-16.6h#panoid=646c1306d4d72bfa631809a2&panotype=inter&heading=358&pitch=0&l=21&tn=B_NORMAL_MAP&sc=0&newmap=1&shareurl=1&pid=1000170000150119145327310IN&iid=646c1306d4d72bfa631809a2'
const OFFICIAL_HISTORY_VR_URL = 'https://www.720yun.com/vr/c66jOpeOOa3'

const tours: PanoramaTour[] = [
  {
    id: 'campus',
    eyebrow: '先看这里',
    title: '逛校园里的路和楼',
    description: '从大门一路看到教学楼、部分宿舍、体育馆、医务所和公交站。',
    detail: '可以切换 26 个拍摄点，包括大门、和昌教学楼、普照教学楼、黑龙江楼、吉林楼、辽宁楼、湖北楼、湖南楼、甘肃楼、体育馆、医务所、学生公寓、篮球场、草坪、商店和校园公交站。画面来自百度地图用户上传，不是学校官方拍摄。',
    url: BAIDU_CAMPUS_PANORAMA_URL,
    sourceLabel: '打开百度地图用户全景',
    badge: '26 个校内拍摄点',
    official: false
  },
  {
    id: 'history',
    eyebrow: '再了解学校',
    title: '走进校史馆',
    description: '学校发布的 VR 校史馆，沿着展厅往前看，了解学校从筹建到现在的办学历程。',
    detail: '可以切换前言、艰苦筹建、学校初创、教育改革、开放办学、校友风采等展厅，展板也能放大看。本站只提供入口，不复制校史馆全景内容。',
    url: OFFICIAL_HISTORY_VR_URL,
    sourceLabel: '打开学校发布的 VR 校史馆',
    badge: '学校发布',
    official: true
  }
]

function openTour(tour: PanoramaTour): void {
  trackMiniApp('module_view', '/pages/panorama/index', { target: 'panorama-open', tour: tour.id })
  openExternal(tour.url)
}

onLoad(() => {
  trackMiniApp('page_view', '/pages/panorama/index')
})
</script>

<template>
  <AppPage title="全景云游校园">
    <view class="note note-calm intro">
      <text class="t-meta">
        微信小程序不能直接内嵌外部全景页面（需要配置业务域名），这里先给出来源和入口：点按钮复制链接后，粘贴到浏览器或微信里打开即可。
      </text>
    </view>

    <view class="list-stack tour-list">
      <view v-for="tour in tours" :key="tour.id" class="list-card">
        <view class="tour-head">
          <text class="t-label">{{ tour.eyebrow }}</text>
          <text class="chip">{{ tour.badge }}</text>
        </view>
        <text class="t-item tour-title">{{ tour.title }}</text>
        <text class="t-meta tour-description">{{ tour.description }}</text>
        <text class="t-meta tour-detail">{{ tour.detail }}</text>

        <view class="tour-source">
          <text class="t-label">{{ tour.official ? '来源 · 学校官方' : '来源 · 用户上传' }}</text>
        </view>

        <button class="btn btn-primary btn-sm tour-action" @click="openTour(tour)">
          {{ tour.sourceLabel }}
        </button>
      </view>
    </view>

    <view class="note note-pending">
      <text class="t-meta">
        全景由第三方平台提供，拍摄时间和现场状态可能变化；校内建筑与道路以现场和学校最新通知为准。
      </text>
    </view>
  </AppPage>
</template>

<style scoped>
.intro {
  margin-bottom: 16rpx;
}

.tour-list {
  margin-bottom: 16rpx;
}

.tour-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.tour-title {
  display: block;
  margin-top: 8rpx;
  font-size: 32rpx;
}

.tour-description {
  margin-top: 10rpx;
}

.tour-detail {
  margin-top: 8rpx;
}

.tour-source {
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid var(--line);
}

.tour-action {
  margin-top: 16rpx;
  width: 100%;
}
</style>
