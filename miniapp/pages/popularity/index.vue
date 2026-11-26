<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import AppPage from '../../components/AppPage.vue'
import StateView from '../../components/StateView.vue'
import { postJson, request, trackMiniApp } from '../../services/http'
import { explainError } from '../../utils/navigation'

interface PopularityCandidate {
  singerId: string
  number: number
  name: string
  className?: string | null
  photoUrl?: string | null
  song?: string | null
  count?: number
}

interface PopularityBallot {
  singerId: string
  changeCount: number
  version: number
}

interface PopularityState {
  status: 'scheduled' | 'open' | 'closed'
  opensAt: number
  closesAt: number
  allowChange: boolean
  maxChanges: number
  showResults: boolean
  totalVotes?: number
  candidates: PopularityCandidate[]
  myBallot?: PopularityBallot | null
  pageTicket?: string
  deviceToken?: string
}

const state = ref<PopularityState | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const vt = ref('')
const pageTicket = ref('')
const deviceToken = ref('')
const readyAt = ref(0)

const statusText = computed(() => {
  switch (state.value?.status) {
    case 'open': return '投票进行中'
    case 'scheduled': return '尚未开始'
    case 'closed': return '投票已截止'
    default: return ''
  }
})

const mySingerId = computed(() => state.value?.myBallot?.singerId || '')

function envPayload(): { tz: string, lang: string, screen: string, touch: number } {
  const info = uni.getSystemInfoSync()
  return {
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    lang: info.language || 'zh-CN',
    screen: `${Math.round(info.screenWidth)}x${Math.round(info.screenHeight)}`,
    touch: 5
  }
}

function loginWithWechat(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: result => result.code ? resolve(result.code) : reject(new Error('未取到微信登录凭证')),
      fail: () => reject(new Error('微信登录失败，请重试'))
    })
  })
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (!vt.value) {
      const code = await loginWithWechat()
      const session = await postJson<{ vt: string }>({
        path: '/api/miniapp/v1/popularity/login',
        body: { code }
      })
      vt.value = session.vt
    }
    const data = await request<PopularityState>({
      path: '/api/miniapp/v1/popularity/state',
      query: { vt: vt.value, d: deviceToken.value || undefined },
      cacheTtl: 0
    })
    pageTicket.value = data.pageTicket || ''
    deviceToken.value = data.deviceToken || deviceToken.value
    state.value = data
    readyAt.value = Date.now() + 700
  } catch (cause) {
    const message = explainError(cause)
    if (message.includes('凭证')) {
      vt.value = ''
      error.value = '登录已过期，请下拉刷新重试'
    } else {
      error.value = message
    }
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

async function voteFor(candidate: PopularityCandidate): Promise<void> {
  if (busy.value || !state.value || state.value.status !== 'open') return
  if (Date.now() < readyAt.value) {
    uni.showToast({ title: '正在确认选手，请稍候', icon: 'none' })
    return
  }
  busy.value = true
  try {
    const result = await postJson<PopularityState>({
      path: '/api/miniapp/v1/popularity/vote',
      body: {
        vt: vt.value,
        singerId: candidate.singerId,
        revision: state.value.myBallot?.version ?? 0,
        pageTicket: pageTicket.value,
        d: deviceToken.value || undefined,
        env: envPayload()
      }
    })
    pageTicket.value = result.pageTicket || pageTicket.value
    state.value = result
    trackMiniApp('result_click', '/pages/popularity/index', { entityType: 'competition', kind: 'popularity_vote' })
    uni.showToast({ title: '投票成功', icon: 'success' })
  } catch (cause) {
    const message = explainError(cause)
    if (message.includes('凭证') || message.includes('刷新')) {
      await load()
    }
    uni.showToast({ title: message, icon: 'none' })
  } finally {
    busy.value = false
  }
}

onShow(() => {
  trackMiniApp('page_view', '/pages/popularity/index')
  void load()
})

onPullDownRefresh(() => {
  void load()
})
</script>

<template>
  <AppPage eyebrow="新声歌手大赛" title="人气奖投票">
    <StateView
      :loading="loading"
      :error="error"
      :empty="!state?.candidates?.length"
      empty-text="暂无候选歌手"
      @retry="load"
    >
      <view class="status-row">
        <text class="chip" :class="state?.status">{{ statusText }}</text>
        <text v-if="state?.showResults" class="t-meta">共 {{ state?.totalVotes ?? 0 }} 票</text>
      </view>

      <view class="list-stack">
        <view v-for="candidate in state?.candidates || []" :key="candidate.singerId" class="list-card">
          <view class="row-head">
            <text class="t-item">{{ candidate.number }}. {{ candidate.name }}</text>
            <text v-if="mySingerId === candidate.singerId" class="chip-pin">已投</text>
          </view>
          <text v-if="candidate.className" class="t-meta">{{ candidate.className }}</text>
          <text v-if="candidate.song" class="t-body">{{ candidate.song }}</text>
          <button
            class="btn-link vote-btn"
            :disabled="busy || state?.status !== 'open'"
            @click="voteFor(candidate)"
          >
            {{ mySingerId === candidate.singerId ? (state?.allowChange ? '改投此人' : '已投此人') : '投这一票' }}
          </button>
        </view>
      </view>
    </StateView>
  </AppPage>
</template>

<style scoped>
.status-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.chip {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  background: #efe9db;
  color: #6b7263;
}

.chip.open {
  background: #e3f3e8;
  color: #176f46;
}

.chip.closed {
  background: #f3e3e3;
  color: #a13b3b;
}

.row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.vote-btn {
  margin-top: 16rpx;
  align-self: flex-start;
}
</style>
