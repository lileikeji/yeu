<script setup lang="ts">
import {
  SHOWCASE_INTRO_DURATION_MS,
  SHOWCASE_TOTAL_DURATION_MS,
  clampShowcaseProgress,
  showcaseCheckedCount,
  showcaseSceneIndex,
  showcaseSceneProgress,
  showcaseScenes,
  showcaseTypedText
} from '~/utils/showcase-presentation'

definePageMeta({ layout: false })

const BAIDU_CAMPUS_PANORAMA_URL = 'https://map.baidu.com/poi/%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6/@13204528,2871631,21z,87t,-16.6h#panoid=646c1306d4d72bfa631809a2&panotype=inter&heading=358&pitch=0&l=21&tn=B_NORMAL_MAP&sc=0&newmap=1&shareurl=1&pid=1000170000150119145327310IN&iid=646c1306d4d72bfa631809a2'

useSeoMeta({
  title: '新生指南展示',
  description: '迎新指南录屏展示模式。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const initialSceneIndex = showcaseSceneIndex(route.query.scene)
const initialProgressValue = Array.isArray(route.query.progress)
  ? route.query.progress[0]
  : route.query.progress
const initialProgress = clampShowcaseProgress(Number(initialProgressValue ?? 0))
const initialScene = showcaseScenes[initialSceneIndex] ?? showcaseScenes[0]
const introCycle = ref(0)
const showIntro = ref(route.query.intro !== '0')
const sceneIndex = ref(initialSceneIndex)
const sceneElapsedMs = ref(initialScene.durationMs * initialProgress)
const paused = ref(route.query.autoplay === '0')
const started = ref(!showIntro.value)
const controlsVisible = ref(true)
const loopEnabled = computed(() => route.query.loop === '1')
const showControls = computed(() => route.query.controls !== '0')

let frameId: number | null = null
let previousFrameAt = 0
let controlsTimer: number | null = null
let introTimer: number | null = null

const activeScene = computed(() => showcaseScenes[sceneIndex.value] ?? showcaseScenes[0])
const sceneProgress = computed(() => showcaseSceneProgress(
  sceneElapsedMs.value,
  activeScene.value.durationMs
))
const previousDuration = computed(() => showcaseScenes
  .slice(0, sceneIndex.value)
  .reduce((total, scene) => total + scene.durationMs, 0))
const totalProgress = computed(() => clampShowcaseProgress((
  (showIntro.value ? 0 : SHOWCASE_INTRO_DURATION_MS)
  + previousDuration.value
  + sceneElapsedMs.value
) / SHOWCASE_TOTAL_DURATION_MS))

const arrivalQuery = computed(() => showcaseTypedText(
  '上海楼',
  (sceneProgress.value - 0.16) / 0.3
))
const assistantQuestion = computed(() => showcaseTypedText(
  '从泉州站到学校怎么走？附近有哪些公交？',
  (sceneProgress.value - 0.06) / 0.24
))
const assistantAnswer = computed(() => showcaseTypedText(
  '泉州站上车，乘 K6 到“仰恩大学第三校区”站下车，不用换乘。通常约 50–70 分钟，全程一票制 2 元。K6 末班较早，出发前再看一次当天班次。',
  (sceneProgress.value - 0.57) / 0.3
))
const completedChecklistCount = computed(() => showcaseCheckedCount(
  (sceneProgress.value - 0.15) / 0.68,
  3
))
const cursorStyle = computed(() => {
  const p = sceneProgress.value
  const paths: Record<string, [number, number, number, number]> = {
    arrival: [67, 40, 80, 67],
    map: [38, 67, 76, 63],
    panorama: [67, 48, 83, 70],
    assistant: [29, 61, 77, 72],
    checklist: [67, 50, 80, 72],
    transport: [38, 57, 76, 62]
  }
  const path = paths[activeScene.value.id]
  if (!path) return { opacity: 0 }
  const eased = 1 - Math.pow(1 - p, 3)
  return {
    left: `${path[0] + (path[2] - path[0]) * eased}%`,
    top: `${path[1] + (path[3] - path[1]) * eased}%`,
    opacity: p > 0.08 && p < 0.94 ? 1 : 0
  }
})

const checklistItems = [
  '确认自己的报到日期和校区',
  '提前收藏宿舍与教学楼位置',
  '保存录取通知书和官方通知'
]

function advanceScene(): void {
  if (sceneIndex.value < showcaseScenes.length - 1) {
    sceneIndex.value += 1
    sceneElapsedMs.value = 0
    return
  }
  paused.value = true
  sceneElapsedMs.value = activeScene.value.durationMs
  if (loopEnabled.value) void restartShowcase()
}

function tick(now: number): void {
  if (!previousFrameAt) previousFrameAt = now
  const delta = Math.min(80, Math.max(0, now - previousFrameAt))
  previousFrameAt = now

  if (started.value && !paused.value) {
    sceneElapsedMs.value += delta
    if (sceneElapsedMs.value >= activeScene.value.durationMs) advanceScene()
  }
  frameId = window.requestAnimationFrame(tick)
}

function onIntroComplete(): void {
  showIntro.value = false
  started.value = true
  previousFrameAt = 0
}

function scheduleIntroCompletion(): void {
  if (introTimer !== null) window.clearTimeout(introTimer)
  introTimer = window.setTimeout(onIntroComplete, SHOWCASE_INTRO_DURATION_MS)
}

async function restartShowcase(): Promise<void> {
  sceneIndex.value = 0
  sceneElapsedMs.value = 0
  started.value = false
  paused.value = false
  showIntro.value = false
  await nextTick()
  introCycle.value += 1
  showIntro.value = true
  scheduleIntroCompletion()
  revealControls()
}

function togglePlayback(): void {
  paused.value = !paused.value
  previousFrameAt = 0
  revealControls()
}

function revealControls(): void {
  controlsVisible.value = true
  if (controlsTimer !== null) window.clearTimeout(controlsTimer)
  if (!paused.value) {
    controlsTimer = window.setTimeout(() => {
      controlsVisible.value = false
    }, 1_800)
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === ' ') {
    event.preventDefault()
    togglePlayback()
  } else if (event.key.toLocaleLowerCase() === 'r') {
    void restartShowcase()
  } else if (event.key === 'ArrowRight') {
    advanceScene()
  }
}

onMounted(() => {
  frameId = window.requestAnimationFrame(tick)
  window.addEventListener('keydown', handleKeydown)
  if (showIntro.value) scheduleIntroCompletion()
  revealControls()
})

onBeforeUnmount(() => {
  if (frameId !== null) window.cancelAnimationFrame(frameId)
  if (controlsTimer !== null) window.clearTimeout(controlsTimer)
  if (introTimer !== null) window.clearTimeout(introTimer)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="showcase-root"
    :data-scene="activeScene.id"
    :style="{ '--scene-progress': sceneProgress }"
    @pointermove="revealControls"
  >
    <div class="showcase-device">
      <span
        class="showcase-device-camera"
        aria-hidden="true"
      />
      <main
        class="showcase-frame"
        aria-label="迎新指南展示"
      >
        <Transition name="showcase-intro">
          <section
            v-if="showIntro"
            :key="introCycle"
            class="showcase-film-intro"
          >
            <img
              src="/images/intro/yeu-campus-hero.webp"
              alt=""
              width="1579"
              height="889"
            >
            <div class="showcase-film-intro-shade" />
            <div class="showcase-film-stars">
              <i
                v-for="star in 34"
                :key="star"
                :style="{
                  '--star-index': star,
                  '--star-x': `${(star * 37) % 96}%`,
                  '--star-y': `${(star * 61) % 92}%`,
                  'animationDelay': `${-star * 95}ms`
                }"
              />
            </div>
            <div class="showcase-film-intro-orbit" />
            <div class="showcase-film-intro-copy">
              <span>迎</span>
              <p>CAMPUS WELCOME GUIDE</p>
              <h1>迎新指南</h1>
              <b>把开学前最容易踩的坑，提前讲清楚</b>
            </div>
          </section>
        </Transition>
        <Transition
          name="showcase-scene"
        >
          <section
            v-if="activeScene.id === 'arrival'"
            key="arrival"
            class="showcase-scene showcase-arrival"
          >
            <img
              src="/images/intro/yeu-campus-hero.webp"
              alt="校园湖区与建筑"
              width="1579"
              height="889"
              class="showcase-cover"
            >
            <div class="showcase-arrival-shade" />

            <div class="showcase-brand showcase-brand-light">
              <span class="showcase-brand-mark">迎</span>
              <span>迎新指南</span>
            </div>

            <div class="showcase-arrival-copy">
              <p class="showcase-kicker showcase-kicker-light">
                2026 新生到校第一步
              </p>
              <h1>第一次到校，<br>也能把路走明白。</h1>
              <p>搜地点、看路线、查流程。新生真正会用到的，都放到一处。</p>
            </div>

            <div class="showcase-search-panel">
              <div class="showcase-window-bar">
                <span />
                <span />
                <span />
                <p>校园地点搜索</p>
              </div>
              <div class="showcase-search-box">
                <UIcon
                  name="i-lucide-search"
                  class="size-5"
                />
                <span>{{ arrivalQuery }}</span>
                <i v-if="sceneProgress < 0.55" />
              </div>
              <div
                class="showcase-place-result"
                :class="{ 'is-visible': sceneProgress > 0.48 }"
              >
                <span class="showcase-result-icon">
                  <UIcon
                    name="i-lucide-building-2"
                    class="size-5"
                  />
                </span>
                <div>
                  <strong>上海楼</strong>
                  <p>宿舍 · 已核验位置 · 可直接导航</p>
                </div>
                <UIcon
                  name="i-lucide-arrow-up-right"
                  class="size-5"
                />
              </div>
            </div>
          </section>

          <section
            v-else-if="activeScene.id === 'map'"
            key="map"
            class="showcase-scene showcase-map-scene"
          >
            <div class="showcase-scene-heading">
              <div class="showcase-brand">
                <span class="showcase-brand-mark">迎</span>
                <span>校园地图</span>
              </div>
              <div>
                <p class="showcase-kicker">
                  校园平面图
                </p>
                <h2>找到地点，下一步怎么走也一起给你。</h2>
              </div>
            </div>

            <div class="showcase-map-layout">
              <div class="showcase-map-canvas">
                <img
                  src="/images/yeu-campus-plan-2025.jpg"
                  alt="校园官方平面示意图"
                  width="8504"
                  height="3898"
                >
                <svg
                  class="showcase-route-layer"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    class="showcase-route-shadow"
                    d="M79 72 C75 70 73 69 69 68 C65 66 63 62 59 58"
                    pathLength="100"
                  />
                  <path
                    class="showcase-route-line"
                    d="M79 72 C75 70 73 69 69 68 C65 66 63 62 59 58"
                    pathLength="100"
                  />
                </svg>
                <span class="showcase-map-pin showcase-map-pin-start">
                  <UIcon name="i-lucide-door-open" />
                  <b>8号门</b>
                </span>
                <span class="showcase-map-pin showcase-map-pin-end">
                  <UIcon name="i-lucide-map-pin" />
                  <b>宏船楼</b>
                </span>
              </div>

              <aside
                class="showcase-map-details"
                :class="{ 'is-visible': sceneProgress > 0.32 }"
              >
                <span class="showcase-detail-icon">
                  <UIcon name="i-lucide-route" />
                </span>
                <p class="showcase-kicker">
                  路线已经找好
                </p>
                <h3>从 8 号门到宏船楼</h3>
                <p>入口、目的地和步行方向都放在同一张图里，到校后不用再拼聊天截图。</p>
                <div class="showcase-detail-status">
                  <UIcon name="i-lucide-circle-check-big" />
                  位置数据已核验
                </div>
                <NuxtLink to="/map?q=宏船楼">
                  打开真实地图
                  <UIcon name="i-lucide-arrow-right" />
                </NuxtLink>
              </aside>
            </div>
          </section>

          <section
            v-else-if="activeScene.id === 'panorama'"
            key="panorama"
            class="showcase-scene showcase-panorama-scene"
          >
            <div class="showcase-panorama-copy">
              <div class="showcase-brand showcase-brand-light">
                <span class="showcase-brand-mark">迎</span>
                <span>校园 360° 实景</span>
              </div>
              <p class="showcase-kicker showcase-kicker-light">
                先在线逛校园
              </p>
              <h2>26 个校内实景，<br>开学前先逛一圈。</h2>
              <p>大门、教学楼、宿舍、体育馆、篮球场和商店都能提前看看，到校时更容易认路。</p>
              <div class="showcase-panorama-tags">
                <span>大门</span>
                <span>教学楼</span>
                <span>学生公寓</span>
                <span>体育馆</span>
                <span>篮球场</span>
                <span>商店</span>
              </div>
              <p class="showcase-panorama-note">
                校内实景来自百度地图用户上传；实际环境有变化时，以到校后看到的为准。
              </p>
            </div>

            <div
              class="showcase-panorama-window"
              :class="{ 'is-visible': sceneProgress > 0.12 }"
            >
              <div class="showcase-window-bar">
                <span />
                <span />
                <span />
                <p>校园 · 实景</p>
              </div>
              <iframe
                :src="BAIDU_CAMPUS_PANORAMA_URL"
                title="校园 360 度实景"
                loading="eager"
                referrerpolicy="strict-origin-when-cross-origin"
              />
              <div class="showcase-panorama-hint">
                <UIcon name="i-lucide-mouse-pointer-2" />
                拖动画面看四周，点击地点换位置
              </div>
            </div>
          </section>

          <section
            v-else-if="activeScene.id === 'assistant'"
            key="assistant"
            class="showcase-scene showcase-assistant-scene"
          >
            <div class="showcase-assistant-header">
              <div class="showcase-brand">
                <span class="showcase-brand-mark">迎</span>
                <span>校园搜索</span>
              </div>
              <p>先查系统资料 · 找不到再检索网页 · 每个结论都保留来源</p>
            </div>

            <div class="showcase-assistant-layout">
              <section class="showcase-question-panel">
                <p class="showcase-kicker">
                  有问题直接问
                </p>
                <h2>你只管问，我们帮你把可靠资料找出来。</h2>
                <div class="showcase-question-input">
                  <span>{{ assistantQuestion }}</span>
                  <i v-if="sceneProgress < 0.36" />
                  <UIcon name="i-lucide-arrow-up" />
                </div>
                <ol class="showcase-trace-list">
                  <li :class="{ 'is-visible': sceneProgress > 0.28 }">
                    <UIcon name="i-lucide-scan-search" />
                    <span>看懂你想问什么</span>
                    <b>到校路线 · 附近公交</b>
                  </li>
                  <li :class="{ 'is-visible': sceneProgress > 0.36 }">
                    <UIcon name="i-lucide-panels-top-left" />
                    <span>先找站内已有答案</span>
                    <b>到校与离校交通</b>
                  </li>
                  <li :class="{ 'is-visible': sceneProgress > 0.43 }">
                    <UIcon name="i-lucide-database" />
                    <span>核对线路和票价</span>
                    <b>K6 · K2 · K507</b>
                  </li>
                  <li :class="{ 'is-visible': sceneProgress > 0.51 }">
                    <UIcon name="i-lucide-file-check-2" />
                    <span>把重点整理给你</span>
                    <b>马上看懂</b>
                  </li>
                </ol>
              </section>

              <article
                class="showcase-answer-panel"
                :class="{ 'is-visible': sceneProgress > 0.55 }"
              >
                <div class="showcase-answer-label">
                  <UIcon name="i-lucide-sparkles" />
                  已找到相关资料
                </div>
                <h3>泉州站，优先 K6 直达。</h3>
                <p class="showcase-answer-copy">
                  {{ assistantAnswer }}<i v-if="sceneProgress < 0.9" />
                </p>
                <div class="showcase-answer-facts">
                  <span><b>50–70</b> 分钟</span>
                  <span><b>2 元</b> 全程一票制</span>
                  <span><b>0</b> 次换乘</span>
                </div>
                <div class="showcase-citation">
                  <UIcon name="i-lucide-shield-check" />
                  <span>来源：到校交通资料 · K6 线路资料 · 2026-07-26 核对</span>
                </div>
                <NuxtLink to="/transport">
                  查看完整路线
                  <UIcon name="i-lucide-arrow-up-right" />
                </NuxtLink>
              </article>
            </div>
          </section>

          <section
            v-else-if="activeScene.id === 'checklist'"
            key="checklist"
            class="showcase-scene showcase-checklist-scene"
          >
            <div class="showcase-checklist-copy">
              <div class="showcase-brand">
                <span class="showcase-brand-mark">迎</span>
                <span>新生清单</span>
              </div>
              <p class="showcase-kicker">
                到校前准备
              </p>
              <h2>要带什么、什么时候办，<br>按时间一项项完成。</h2>
              <p>到校前、报到当天、入学第一周，做过的事会一直替你记着。</p>
            </div>

            <div class="showcase-countdown">
              <span>报到倒计时</span>
              <strong>41</strong>
              <b>天</b>
              <p>9月5–6日注册报到</p>
            </div>

            <div class="showcase-task-list">
              <div class="showcase-task-progress">
                <span>到校前</span>
                <b>{{ completedChecklistCount }} / 3</b>
              </div>
              <div class="showcase-task-progress-line">
                <i :style="{ width: `${completedChecklistCount / 3 * 100}%` }" />
              </div>
              <ul>
                <li
                  v-for="(item, index) in checklistItems"
                  :key="item"
                  :class="{ 'is-checked': index < completedChecklistCount }"
                >
                  <span>
                    <UIcon
                      :name="index < completedChecklistCount ? 'i-lucide-check' : 'i-lucide-circle'"
                      class="size-4"
                    />
                  </span>
                  {{ item }}
                </li>
              </ul>
              <NuxtLink to="/checklist">
                打开完整清单
                <UIcon name="i-lucide-arrow-right" />
              </NuxtLink>
            </div>
          </section>

          <section
            v-else-if="activeScene.id === 'transport'"
            key="transport"
            class="showcase-scene showcase-transport-scene"
          >
            <div class="showcase-transport-heading">
              <div class="showcase-brand">
                <span class="showcase-brand-mark">迎</span>
                <span>到校与离校交通</span>
              </div>
              <div>
                <p class="showcase-kicker">
                  到校前先看清
                </p>
                <h2>从车站到校门，路线直接给到你。</h2>
              </div>
            </div>

            <div class="showcase-transport-layout">
              <article
                class="showcase-transit-route"
                :class="{ 'is-visible': sceneProgress > 0.14 }"
              >
                <div class="showcase-transit-query">
                  <UIcon name="i-lucide-train-front" />
                  <span>泉州站</span>
                  <UIcon name="i-lucide-arrow-right" />
                  <span>仰恩大学</span>
                </div>
                <div class="showcase-bus-line">
                  <span class="showcase-bus-number">K6</span>
                  <div>
                    <p>福厦铁路泉州站</p>
                    <i />
                    <p>仰恩大学第三校区</p>
                  </div>
                </div>
                <div class="showcase-transit-meta">
                  <span><b>50–70</b> 分钟</span>
                  <span><b>2 元</b> 全程一票制</span>
                  <span><b>直达</b> 不换乘</span>
                </div>
                <p class="showcase-transit-note">
                  K6 末班较早。具体发车时间、停靠站和临时调整，出发当天再看一次实时规划。
                </p>
              </article>

              <aside
                class="showcase-nearby-lines"
                :class="{ 'is-visible': sceneProgress > 0.28 }"
              >
                <div class="showcase-nearby-header">
                  <div>
                    <p class="showcase-kicker">
                      NEARBY TRANSIT
                    </p>
                    <h3>学校周边公交</h3>
                  </div>
                  <UIcon name="i-lucide-bus-front" />
                </div>
                <ul>
                  <li>
                    <b>K6</b>
                    <span>泉州站 ↔ 仰恩大学第三校区</span>
                    <em>直达动车站</em>
                  </li>
                  <li>
                    <b>K2</b>
                    <span>文化宫 ↔ 仰恩大学第三校区</span>
                    <em>往返市区</em>
                  </li>
                  <li>
                    <b>K507</b>
                    <span>泉州东站方向换乘参考</span>
                    <em>当天重查</em>
                  </li>
                </ul>
                <div class="showcase-transit-status">
                  <UIcon name="i-lucide-circle-check-big" />
                  已找到站内线路信息，并结合当天高德路线
                </div>
              </aside>
            </div>
          </section>

          <section
            v-else
            key="outro"
            class="showcase-scene showcase-outro-scene"
          >
            <img
              src="/images/intro/yeu-campus-hero.webp"
              alt=""
              width="1579"
              height="889"
              class="showcase-cover"
            >
            <div class="showcase-outro-shade" />
            <div class="showcase-outro-orbit showcase-outro-orbit-one" />
            <div class="showcase-outro-orbit showcase-outro-orbit-two" />
            <div class="showcase-outro-copy">
              <span class="showcase-outro-mark">迎</span>
              <p>迎新指南</p>
              <h2>把新生最容易踩的坑，<br>提前整理清楚。</h2>
              <div class="showcase-outro-line" />
              <span>开学前看一遍 · 到校以后少走弯路</span>
            </div>
          </section>
        </Transition>

        <span
          v-if="!showIntro && activeScene.id !== 'outro'"
          class="showcase-demo-cursor"
          :style="cursorStyle"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-mouse-pointer-2" />
          <i />
        </span>

        <div
          class="showcase-timeline"
          aria-hidden="true"
        >
          <i :style="{ width: `${totalProgress * 100}%` }" />
        </div>
      </main>
      <div
        class="showcase-device-chin"
        aria-hidden="true"
      >
        <span>迎</span>
      </div>
      <div
        class="showcase-device-neck"
        aria-hidden="true"
      />
      <div
        class="showcase-device-base"
        aria-hidden="true"
      />
    </div>

    <div
      v-if="showControls"
      class="showcase-controls"
      :class="{ 'is-hidden': !controlsVisible }"
    >
      <button
        type="button"
        :aria-label="paused ? '继续播放' : '暂停播放'"
        :title="paused ? '继续播放' : '暂停播放'"
        @click="togglePlayback"
      >
        <UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" />
      </button>
      <button
        type="button"
        aria-label="重新播放"
        title="重新播放"
        @click="restartShowcase"
      >
        <UIcon name="i-lucide-rotate-ccw" />
      </button>
      <NuxtLink
        to="/"
        aria-label="返回网站首页"
        title="返回网站首页"
      >
        <UIcon name="i-lucide-external-link" />
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.showcase-root {
  --scene-progress: 0;
  min-height: 100dvh;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 3.2vh 3vw 9.5vh;
  background:
    radial-gradient(circle at 16% 12%, rgba(81, 157, 126, 0.3), transparent 32%),
    radial-gradient(circle at 86% 16%, rgba(243, 197, 125, 0.2), transparent 25%),
    linear-gradient(145deg, #071b16 0%, #0d3025 50%, #061510 100%);
  color: #17211d;
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
}

.showcase-root::before {
  position: fixed;
  inset: -22%;
  background:
    radial-gradient(circle at 34% 48%, rgba(105, 207, 164, 0.12), transparent 25%),
    radial-gradient(circle at 68% 45%, rgba(255, 198, 115, 0.1), transparent 22%);
  content: "";
  animation: showcase-ambient-drift 10s ease-in-out infinite alternate;
  pointer-events: none;
}

.showcase-root::after {
  content: "";
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 13vh;
  background: linear-gradient(180deg, rgba(2, 15, 11, 0), rgba(2, 15, 11, 0.72));
  pointer-events: none;
}

.showcase-device {
  position: relative;
  z-index: 1;
  width: min(88vw, calc(75vh * 16 / 9));
  filter: drop-shadow(0 40px 55px rgba(0, 8, 5, 0.54));
  animation: showcase-device-breathe 7s ease-in-out infinite;
}

.showcase-device-camera {
  position: absolute;
  z-index: 7;
  top: 9px;
  left: 50%;
  width: 5px;
  height: 5px;
  border: 1px solid rgba(144, 177, 165, 0.32);
  border-radius: 50%;
  background: #020706;
  box-shadow: 0 0 0 2px rgba(6, 15, 12, 0.76);
  transform: translateX(-50%);
}

.showcase-frame {
  position: relative;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 12px solid #101715;
  border-bottom-width: 8px;
  border-radius: 18px 18px 4px 4px;
  background: #f4f7f5;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.09),
    0 0 0 1px rgba(5, 9, 8, 0.84);
  isolation: isolate;
}

.showcase-film-intro {
  position: absolute;
  z-index: 30;
  inset: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #052319;
}

.showcase-film-intro > img {
  position: absolute;
  inset: -4%;
  width: 108%;
  height: 108%;
  object-fit: cover;
  filter: saturate(0.78) contrast(1.08);
  animation: showcase-intro-push 2.6s ease-out both;
}

.showcase-film-intro-shade {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 49%, rgba(17, 92, 65, 0.22), transparent 26%),
    linear-gradient(180deg, rgba(3, 27, 19, 0.78), rgba(3, 27, 19, 0.9));
}

.showcase-film-stars {
  position: absolute;
  inset: 0;
}

.showcase-film-stars i {
  position: absolute;
  left: var(--star-x);
  top: var(--star-y);
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #f8ead2;
  box-shadow: 0 0 11px rgba(255, 214, 146, 0.72);
  animation: showcase-star-float 1.8s ease-in-out infinite alternate;
}

.showcase-film-stars i:nth-child(3n) {
  width: 2px;
  height: 2px;
  background: #91e1bd;
}

.showcase-film-stars i:nth-child(4n) {
  width: 5px;
  height: 5px;
  opacity: 0.56;
}

.showcase-film-intro-orbit {
  position: absolute;
  left: 50%;
  top: 49%;
  width: min(31vw, 310px);
  aspect-ratio: 1;
  border: 1px solid rgba(213, 237, 225, 0.23);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: showcase-intro-orbit 2.3s ease-out both;
}

.showcase-film-intro-orbit::before,
.showcase-film-intro-orbit::after {
  position: absolute;
  border-radius: 50%;
  content: "";
}

.showcase-film-intro-orbit::before {
  inset: 13%;
  border: 1px dashed rgba(255, 201, 119, 0.36);
}

.showcase-film-intro-orbit::after {
  right: 8%;
  top: 18%;
  width: 8px;
  height: 8px;
  background: #ffc477;
  box-shadow: 0 0 22px rgba(255, 196, 119, 0.92);
}

.showcase-film-intro-copy {
  position: relative;
  z-index: 2;
  color: white;
  text-align: center;
  animation: showcase-intro-copy 720ms 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.showcase-film-intro-copy > span {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.showcase-film-intro-copy p {
  margin: 14px 0 0;
  color: #bbdacb;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.24em;
}

.showcase-film-intro-copy h1 {
  margin: 8px 0 0;
  font-size: clamp(35px, 4vw, 54px);
  line-height: 1.15;
  letter-spacing: -0.04em;
}

.showcase-film-intro-copy b {
  display: block;
  margin-top: 15px;
  color: #e4eee9;
  font-size: 13px;
  font-weight: 550;
}

.showcase-device-chin {
  display: grid;
  place-items: center;
  height: 34px;
  border-radius: 0 0 18px 18px;
  background: linear-gradient(180deg, #dfe4e1, #bfc7c3);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.85);
  color: #53615b;
}

.showcase-device-chin span {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.showcase-device-neck {
  width: 12%;
  height: 7vh;
  min-height: 38px;
  margin: 0 auto;
  background: linear-gradient(90deg, #9da8a3, #e5e9e7 47%, #a9b3ae);
  clip-path: polygon(24% 0, 76% 0, 100% 100%, 0 100%);
}

.showcase-device-base {
  width: 31%;
  height: 12px;
  margin: -1px auto 0;
  border-radius: 50% 50% 8px 8px;
  background: linear-gradient(180deg, #e2e7e4, #8f9c96);
  box-shadow: 0 11px 22px rgba(0, 8, 5, 0.4);
}

.showcase-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.showcase-scene::after {
  position: absolute;
  z-index: 12;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: linear-gradient(110deg, transparent 42%, rgba(255, 255, 255, 0.035) 50%, transparent 58%);
  background-position: -120% 0;
  background-size: 220% 100%;
  content: "";
  animation: showcase-screen-sheen 4s ease-in-out forwards;
  pointer-events: none;
}

.showcase-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform-origin: 58% 48%;
  animation: showcase-cover-push 4.2s ease-out forwards;
}

.showcase-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #123c2d;
  font-size: 14px;
  font-weight: 700;
}

.showcase-brand-light {
  color: #f7fbf8;
}

.showcase-brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 11px;
}

.showcase-kicker {
  margin: 0;
  color: #297257;
  font-size: 12px;
  font-weight: 800;
}

.showcase-kicker-light {
  color: #b8ddc9;
}

.showcase-arrival-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(3, 23, 17, 0.9) 0%, rgba(3, 23, 17, 0.7) 46%, rgba(3, 23, 17, 0.15) 100%);
}

.showcase-arrival .showcase-brand {
  position: absolute;
  left: 5.5%;
  top: 7%;
}

.showcase-arrival-copy {
  position: absolute;
  left: 5.5%;
  top: 31%;
  width: 48%;
  color: white;
}

.showcase-arrival-copy h1 {
  margin: 16px 0 0;
  max-width: 760px;
  font-size: 52px;
  line-height: 1.13;
  letter-spacing: 0;
}

.showcase-arrival-copy > p:last-child {
  margin: 22px 0 0;
  max-width: 560px;
  color: #d8e9df;
  font-size: 17px;
  line-height: 1.8;
}

.showcase-search-panel {
  position: absolute;
  top: 23%;
  right: 5.5%;
  width: 37%;
  min-height: 44%;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 8px;
  background: rgba(247, 250, 248, 0.94);
  box-shadow: 0 28px 70px rgba(0, 20, 14, 0.32);
  padding: 28px;
  animation: showcase-panel-rise 900ms 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.showcase-window-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  color: #67736e;
  font-size: 11px;
}

.showcase-window-bar span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d0d7d3;
}

.showcase-window-bar span:nth-child(1) { background: #e57b65; }
.showcase-window-bar span:nth-child(2) { background: #e2b650; }
.showcase-window-bar span:nth-child(3) { background: #5bb080; }
.showcase-window-bar p { margin: 0 0 0 auto; }

.showcase-search-box {
  margin-top: 30px;
  height: 62px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #b8c7c0;
  border-radius: 6px;
  background: white;
  padding: 0 18px;
  color: #18382c;
  font-size: 20px;
  font-weight: 650;
}

.showcase-search-box i,
.showcase-question-input i {
  width: 2px;
  height: 24px;
  background: #1b6d4d;
  animation: showcase-caret 800ms steps(1) infinite;
}

.showcase-place-result {
  margin-top: 18px;
  min-height: 92px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  border-top: 1px solid #dce3df;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 500ms ease, transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.showcase-place-result.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.showcase-result-icon,
.showcase-detail-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 6px;
  background: #dff1e8;
  color: #155c42;
}

.showcase-place-result strong { color: #122a21; font-size: 17px; }
.showcase-place-result p { margin: 5px 0 0; color: #718078; font-size: 12px; }

.showcase-map-scene {
  background: #eaf0ed;
  padding: 4.3% 4.8%;
}

.showcase-scene-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 40px;
}

.showcase-scene-heading > div:last-child { text-align: right; }
.showcase-scene-heading h2 { margin: 6px 0 0; font-size: 32px; line-height: 1.2; }

.showcase-map-layout {
  margin-top: 3%;
  height: 73%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
}

.showcase-map-canvas {
  position: relative;
  overflow: hidden;
  border: 1px solid #bdcbc4;
  border-radius: 8px;
  background: #4d80b3;
}

.showcase-map-canvas > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.showcase-route-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.showcase-route-shadow,
.showcase-route-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: showcase-route-draw 2.5s 500ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

.showcase-route-shadow { stroke: rgba(255, 255, 255, 0.94); stroke-width: 2.1; }
.showcase-route-line { stroke: #ed6f3f; stroke-width: 0.85; }

.showcase-map-pin {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  border: 2px solid white;
  border-radius: 6px;
  background: #133f31;
  color: white;
  padding: 0 10px;
  box-shadow: 0 8px 24px rgba(0, 25, 18, 0.24);
  font-size: 12px;
}

.showcase-map-pin-start { left: 76%; top: 67%; }
.showcase-map-pin-end { left: 55%; top: 52%; background: #e65e32; }

.showcase-map-details {
  display: flex;
  flex-direction: column;
  border: 1px solid #cbd6d1;
  border-radius: 8px;
  background: white;
  padding: 24px;
  opacity: 0;
  transform: translateX(18px);
  transition: opacity 600ms ease, transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.showcase-map-details.is-visible { opacity: 1; transform: translateX(0); }
.showcase-map-details .showcase-kicker { margin-top: 22px; }
.showcase-map-details h3 { margin: 7px 0 0; font-size: 24px; line-height: 1.25; }
.showcase-map-details > p:not(.showcase-kicker) { color: #64716b; font-size: 13px; line-height: 1.75; }

.showcase-detail-status {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #166344;
  font-size: 12px;
  font-weight: 700;
}

.showcase-map-details a,
.showcase-answer-panel a,
.showcase-task-list a {
  margin-top: 14px;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 6px;
  background: #123f30;
  color: white;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.showcase-panorama-scene {
  display: grid;
  grid-template-columns: minmax(250px, 0.72fr) minmax(0, 1.45fr);
  align-items: center;
  gap: 4%;
  padding: 4.5% 4.8%;
  background:
    radial-gradient(circle at 9% 15%, rgba(93, 160, 130, 0.32), transparent 36%),
    linear-gradient(135deg, #08281e, #0f4a36);
  color: white;
}

.showcase-panorama-copy .showcase-kicker {
  margin-top: 12%;
}

.showcase-panorama-copy h2 {
  margin: 4% 0 0;
  font-size: clamp(32px, 2.45vw, 42px);
  line-height: 1.13;
  letter-spacing: -0.04em;
}

.showcase-panorama-copy > p:not(.showcase-kicker, .showcase-panorama-note) {
  margin: 5% 0 0;
  max-width: 500px;
  color: #d5e8df;
  font-size: 15px;
  line-height: 1.75;
}

.showcase-panorama-tags {
  margin-top: 7%;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.showcase-panorama-tags span {
  border: 1px solid rgba(217, 239, 228, 0.28);
  border-radius: 999px;
  background: rgba(225, 244, 235, 0.1);
  padding: 7px 11px;
  color: #eef8f3;
  font-size: 11px;
}

.showcase-panorama-note {
  margin: 8% 0 0;
  max-width: 430px;
  color: rgba(224, 239, 232, 0.67);
  font-size: 10px;
  line-height: 1.65;
}

.showcase-panorama-window {
  position: relative;
  align-self: stretch;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(231, 244, 237, 0.44);
  border-radius: 10px;
  background: #dfe8e3;
  box-shadow: 0 26px 60px rgba(0, 13, 8, 0.38);
  opacity: 0;
  transform: translateX(28px) scale(0.98);
  transition: opacity 650ms ease, transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.showcase-panorama-window.is-visible {
  opacity: 1;
  transform: translateX(0) scale(1);
}

.showcase-panorama-window .showcase-window-bar {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  right: 0;
  height: 34px;
  border-bottom: 1px solid #d2ddd7;
  background: rgba(250, 252, 251, 0.96);
  padding: 0 12px;
  color: #65736c;
}

.showcase-panorama-window iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #dfe8e3;
}

.showcase-panorama-hint {
  position: absolute;
  z-index: 4;
  left: 18px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(4, 28, 20, 0.8);
  padding: 8px 12px;
  color: white;
  font-size: 10px;
  backdrop-filter: blur(8px);
}

.showcase-assistant-scene {
  background: #f7f8f6;
  padding: 4.3% 5.5%;
}

.showcase-assistant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 30px;
}

.showcase-assistant-header > p { margin: 0; color: #728078; font-size: 12px; }

.showcase-assistant-layout {
  margin-top: 4.5%;
  height: 70%;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 3.5%;
}

.showcase-question-panel {
  border-right: 1px solid #d9e0dc;
  padding-right: 8%;
}

.showcase-question-panel h2 { margin: 10px 0 0; font-size: 34px; line-height: 1.2; }

.showcase-question-input {
  margin-top: 34px;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #b9c7c0;
  border-radius: 8px;
  background: white;
  padding: 0 18px;
  color: #163428;
  font-size: 18px;
  font-weight: 650;
  box-shadow: 0 14px 38px rgba(20, 57, 43, 0.08);
}

.showcase-question-input > svg { margin-left: auto; padding: 7px; width: 34px; height: 34px; border-radius: 6px; background: #174b39; color: white; }

.showcase-trace-list { margin: 26px 0 0; padding: 0; list-style: none; }
.showcase-trace-list li {
  min-height: 42px;
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #e2e7e4;
  color: #65726c;
  font-size: 12px;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 350ms ease, transform 450ms ease;
}
.showcase-trace-list li.is-visible { opacity: 1; transform: translateY(0); }
.showcase-trace-list li b { color: #245b46; font-weight: 700; }

.showcase-answer-panel {
  align-self: stretch;
  border: 1px solid #cdd8d2;
  border-radius: 8px;
  background: white;
  padding: 32px;
  box-shadow: 0 22px 54px rgba(25, 57, 45, 0.09);
  opacity: 0;
  transform: translateY(22px);
  transition: opacity 600ms ease, transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.showcase-answer-panel.is-visible { opacity: 1; transform: translateY(0); }
.showcase-answer-label { display: flex; align-items: center; gap: 8px; color: #196044; font-size: 13px; font-weight: 800; }
.showcase-answer-panel h3 { margin: 24px 0 0; color: #153128; font-size: 28px; line-height: 1.3; }
.showcase-answer-panel > p { margin: 15px 0 0; color: #586760; font-size: 14px; line-height: 1.85; }
.showcase-answer-copy i {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 3px;
  background: #1b6d4d;
  vertical-align: -0.12em;
  animation: showcase-caret 800ms steps(1) infinite;
}
.showcase-answer-facts {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #e1e7e3;
  border-bottom: 1px solid #e1e7e3;
  padding: 13px 0;
}
.showcase-answer-facts span {
  min-width: 0;
  border-right: 1px solid #e1e7e3;
  color: #68756f;
  font-size: 11px;
  text-align: center;
}
.showcase-answer-facts span:last-child { border-right: 0; }
.showcase-answer-facts b { display: block; color: #173f31; font-size: 18px; line-height: 1.25; }
.showcase-citation { margin-top: 20px; display: flex; align-items: center; gap: 8px; border-left: 3px solid #db9b40; background: #fff7e8; padding: 12px 14px; color: #6a4d20; font-size: 12px; }

.showcase-checklist-scene {
  display: grid;
  grid-template-columns: 1.05fr 0.42fr 0.88fr;
  align-items: center;
  gap: 3.5%;
  background: #f4f7f5;
  padding: 5.5%;
}

.showcase-checklist-copy .showcase-kicker { margin-top: 70px; }
.showcase-checklist-copy h2 { margin: 14px 0 0; color: #102e23; font-size: 40px; line-height: 1.25; }
.showcase-checklist-copy > p:last-child { margin: 20px 0 0; max-width: 480px; color: #627069; font-size: 14px; line-height: 1.8; }

.showcase-countdown {
  align-self: center;
  border-top: 3px solid #c55031;
  border-bottom: 1px solid #d9d4c8;
  padding: 24px 10px;
  color: #792c1d;
  text-align: center;
}
.showcase-countdown span { display: block; font-size: 13px; font-weight: 800; }
.showcase-countdown strong { display: inline-block; margin-top: 8px; font-family: Georgia, serif; font-size: 72px; line-height: 1; }
.showcase-countdown b { margin-left: 5px; font-size: 18px; }
.showcase-countdown p { margin: 13px 0 0; font-size: 12px; }

.showcase-task-list {
  border: 1px solid #cbd6d0;
  border-radius: 8px;
  background: white;
  padding: 28px;
  box-shadow: 0 22px 52px rgba(20, 57, 43, 0.09);
}
.showcase-task-progress { display: flex; justify-content: space-between; color: #213a31; font-size: 13px; font-weight: 800; }
.showcase-task-progress-line { margin-top: 13px; height: 5px; overflow: hidden; border-radius: 3px; background: #e4eae7; }
.showcase-task-progress-line i { display: block; height: 100%; background: #197450; transition: width 500ms ease; }
.showcase-task-list ul { margin: 22px 0 0; padding: 0; list-style: none; }
.showcase-task-list li { min-height: 54px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #edf0ee; color: #5c6862; font-size: 13px; transition: color 350ms ease; }
.showcase-task-list li > span { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; background: #edf1ef; color: #748078; transition: background 350ms ease, color 350ms ease; }
.showcase-task-list li.is-checked { color: #163e2f; font-weight: 700; }
.showcase-task-list li.is-checked > span { background: #197450; color: white; }

.showcase-transport-scene {
  overflow: hidden;
  background: #edf2ef;
  padding: 4.3% 5.5%;
}

.showcase-transport-scene::before {
  position: absolute;
  inset: 0 0 auto;
  height: 7px;
  background: #174f3a;
  content: '';
}

.showcase-transport-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 40px;
}

.showcase-transport-heading > div:last-child { text-align: right; }
.showcase-transport-heading h2 { margin: 7px 0 0; color: #112f24; font-size: 34px; line-height: 1.2; }

.showcase-transport-layout {
  margin-top: 3.2%;
  height: 71%;
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
  gap: 22px;
}

.showcase-transit-route,
.showcase-nearby-lines {
  border: 1px solid #c8d4ce;
  border-radius: 8px;
  background: #fff;
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 600ms ease, transform 750ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.showcase-transit-route.is-visible,
.showcase-nearby-lines.is-visible { opacity: 1; transform: translateY(0); }

.showcase-transit-route {
  display: flex;
  flex-direction: column;
  padding: 30px 34px;
  box-shadow: 0 24px 58px rgba(24, 59, 45, 0.09);
}

.showcase-transit-query {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #193f31;
  font-size: 15px;
  font-weight: 800;
}

.showcase-transit-query svg:first-child { color: #c75535; }
.showcase-transit-query svg:nth-child(3) { width: 16px; color: #8a9690; }

.showcase-bus-line {
  margin-top: 28px;
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 24px;
}

.showcase-bus-number {
  display: grid;
  place-items: center;
  width: 82px;
  height: 82px;
  border-radius: 8px;
  background: #176c4d;
  color: #fff;
  font-size: 30px;
  font-weight: 900;
}

.showcase-bus-line > div { position: relative; padding-left: 26px; }
.showcase-bus-line > div::before {
  position: absolute;
  left: 5px;
  top: 10px;
  bottom: 10px;
  width: 2px;
  background: #73ad94;
  content: '';
}
.showcase-bus-line p { position: relative; margin: 0; color: #1d382e; font-size: 19px; font-weight: 750; }
.showcase-bus-line p::before {
  position: absolute;
  left: -26px;
  top: 50%;
  width: 12px;
  height: 12px;
  border: 3px solid #1c7655;
  border-radius: 50%;
  background: #fff;
  content: '';
  transform: translateY(-50%);
}
.showcase-bus-line i { display: block; height: 32px; }

.showcase-transit-meta {
  margin-top: 30px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #e1e7e3;
  border-bottom: 1px solid #e1e7e3;
  padding: 17px 0;
}
.showcase-transit-meta span { border-right: 1px solid #e1e7e3; color: #68756f; font-size: 12px; text-align: center; }
.showcase-transit-meta span:last-child { border-right: 0; }
.showcase-transit-meta b { display: block; color: #173f31; font-size: 21px; }
.showcase-transit-note { margin: auto 0 0; color: #66736d; font-size: 12px; line-height: 1.75; }

.showcase-nearby-lines { padding: 28px; }
.showcase-nearby-header { display: flex; align-items: center; justify-content: space-between; }
.showcase-nearby-header h3 { margin: 6px 0 0; color: #17382c; font-size: 25px; }
.showcase-nearby-header > svg { width: 30px; height: 30px; color: #c55c3b; }
.showcase-nearby-lines ul { margin: 23px 0 0; padding: 0; list-style: none; }
.showcase-nearby-lines li {
  min-height: 72px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-top: 1px solid #e3e8e5;
}
.showcase-nearby-lines li b { color: #176c4d; font-size: 17px; }
.showcase-nearby-lines li span { color: #304a40; font-size: 12px; line-height: 1.45; }
.showcase-nearby-lines li em { color: #8a5a34; font-size: 10px; font-style: normal; font-weight: 750; }
.showcase-transit-status {
  margin-top: 17px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: 3px solid #318060;
  background: #edf7f2;
  padding: 11px 12px;
  color: #285b47;
  font-size: 11px;
  font-weight: 700;
}

.showcase-outro-scene {
  display: grid;
  place-items: center;
  background: #06261b;
}

.showcase-outro-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(2, 27, 18, 0.94), rgba(2, 34, 23, 0.82) 54%, rgba(2, 27, 18, 0.68)),
    radial-gradient(circle at 72% 42%, rgba(250, 195, 112, 0.22), transparent 28%);
}

.showcase-outro-orbit {
  position: absolute;
  left: 69%;
  top: 45%;
  aspect-ratio: 1;
  border: 1px solid rgba(218, 240, 227, 0.23);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.showcase-outro-orbit::before,
.showcase-outro-orbit::after {
  position: absolute;
  border-radius: 50%;
  content: "";
}

.showcase-outro-orbit::before {
  inset: 12%;
  border: 1px dashed rgba(255, 200, 116, 0.28);
}

.showcase-outro-orbit::after {
  left: 50%;
  top: -5px;
  width: 10px;
  height: 10px;
  background: #ffc476;
  box-shadow: 0 0 24px rgba(255, 196, 118, 0.86);
}

.showcase-outro-orbit-one {
  width: 38%;
  animation: showcase-orbit-spin 12s linear infinite;
}

.showcase-outro-orbit-two {
  width: 24%;
  opacity: 0.72;
  animation: showcase-orbit-spin 8s linear infinite reverse;
}

.showcase-outro-copy {
  position: relative;
  z-index: 2;
  width: min(84%, 760px);
  color: white;
  text-align: center;
  animation: showcase-outro-reveal 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.showcase-outro-mark {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.showcase-outro-copy > p {
  margin: 14px 0 0;
  color: #c7dfd2;
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0.18em;
}

.showcase-outro-copy h2 {
  margin: 26px 0 0;
  font-size: clamp(38px, 4.5vw, 62px);
  line-height: 1.16;
  letter-spacing: -0.04em;
}

.showcase-outro-line {
  width: 68px;
  height: 3px;
  margin: 25px auto 18px;
  background: #ffc476;
  animation: showcase-line-grow 850ms 500ms ease-out both;
}

.showcase-outro-copy > span:last-child {
  color: #d6e7de;
  font-size: 15px;
  font-weight: 650;
}

.showcase-demo-cursor {
  position: absolute;
  z-index: 18;
  width: 24px;
  height: 24px;
  color: white;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.72));
  transform: translate(-4px, -3px);
  transition: left 80ms linear, top 80ms linear, opacity 180ms ease;
  pointer-events: none;
}

.showcase-demo-cursor > svg {
  position: relative;
  z-index: 2;
  width: 22px;
  height: 22px;
  fill: #143f30;
  stroke-width: 1.7;
}

.showcase-demo-cursor > i {
  position: absolute;
  left: -12px;
  top: -12px;
  width: 44px;
  height: 44px;
  border: 2px solid rgba(255, 190, 103, 0.74);
  border-radius: 50%;
  opacity: 0;
  animation: showcase-cursor-pulse 1.35s ease-out infinite;
}

.showcase-timeline {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(255, 255, 255, 0.22);
}
.showcase-timeline i { display: block; height: 100%; background: #ffbd6e; transition: width 100ms linear; }

.showcase-controls {
  position: fixed;
  z-index: 10000;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 6px;
  opacity: 1;
  transition: opacity 250ms ease;
}
.showcase-controls.is-hidden { pointer-events: none; opacity: 0; }
.showcase-controls button,
.showcase-controls a {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(255,255,255,0.36);
  border-radius: 6px;
  background: rgba(4, 27, 20, 0.78);
  color: white;
  cursor: pointer;
  backdrop-filter: blur(10px);
}
.showcase-controls svg { width: 18px; height: 18px; }

.showcase-scene-enter-active,
.showcase-scene-leave-active { transition: opacity 500ms ease, transform 650ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.showcase-scene-enter-from { opacity: 0; transform: scale(1.018); }
.showcase-scene-leave-to { opacity: 0; transform: scale(0.992); }

@keyframes showcase-route-draw { to { stroke-dashoffset: 0; } }
@keyframes showcase-caret { 50% { opacity: 0; } }
@keyframes showcase-intro-push {
  from { transform: scale(1.04); }
  to { transform: scale(1.11); }
}
@keyframes showcase-intro-orbit {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.7) rotate(-24deg); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(24deg); }
}
@keyframes showcase-intro-copy {
  from { opacity: 0; transform: translateY(18px) scale(0.97); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes showcase-star-float {
  from { opacity: 0.25; transform: translate3d(-4px, 5px, 0) scale(0.7); }
  to { opacity: 0.95; transform: translate3d(5px, -7px, 0) scale(1.25); }
}
@keyframes showcase-device-breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.002); }
}
@keyframes showcase-ambient-drift {
  from { transform: translate3d(-2%, 0, 0) rotate(-2deg); }
  to { transform: translate3d(2%, -2%, 0) rotate(2deg); }
}
@keyframes showcase-cover-push {
  from { transform: scale(1.035); }
  to { transform: scale(1.075); }
}
@keyframes showcase-panel-rise {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes showcase-screen-sheen {
  0%, 16% { background-position: -120% 0; opacity: 0; }
  45% { opacity: 1; }
  78%, 100% { background-position: 135% 0; opacity: 0; }
}
@keyframes showcase-cursor-pulse {
  0%, 55% { opacity: 0; transform: scale(0.35); }
  67% { opacity: 0.85; }
  100% { opacity: 0; transform: scale(1.25); }
}
@keyframes showcase-orbit-spin {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
@keyframes showcase-outro-reveal {
  from { opacity: 0; transform: translateY(28px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes showcase-line-grow {
  from { width: 0; opacity: 0; }
  to { width: 68px; opacity: 1; }
}

.showcase-intro-leave-active {
  transition: opacity 420ms ease, filter 420ms ease, transform 520ms ease;
}

.showcase-intro-leave-to {
  opacity: 0;
  filter: blur(5px);
  transform: scale(1.025);
}

@media (min-width: 1600px) {
  .showcase-arrival-copy h1 { font-size: 64px; }
  .showcase-arrival-copy > p:last-child { font-size: 19px; }
  .showcase-map-layout { grid-template-columns: minmax(0, 1fr) 360px; }
  .showcase-question-panel h2 { font-size: 42px; }
  .showcase-answer-panel h3 { font-size: 34px; }
  .showcase-checklist-copy h2 { font-size: 48px; }
}

@media (max-width: 900px) {
  .showcase-root { padding: 0; }
  .showcase-device {
    width: 100vw;
    filter: none;
  }
  .showcase-device-camera,
  .showcase-device-chin,
  .showcase-device-neck,
  .showcase-device-base { display: none; }
  .showcase-frame {
    width: 100vw;
    height: 100dvh;
    aspect-ratio: auto;
    border: 0;
    border-radius: 0;
  }

  .showcase-brand { gap: 8px; font-size: 12px; }
  .showcase-brand-mark { width: 34px; height: 34px; font-size: 9px; }
  .showcase-kicker { font-size: 10px; }

  .showcase-arrival-shade {
    background: linear-gradient(180deg, rgba(3, 23, 17, 0.86), rgba(3, 23, 17, 0.62) 48%, rgba(3, 23, 17, 0.88));
  }
  .showcase-arrival .showcase-brand { left: 6%; top: 5%; }
  .showcase-arrival-copy { left: 6%; top: 14%; width: 88%; }
  .showcase-arrival-copy h1 { margin-top: 12px; font-size: 38px; line-height: 1.16; }
  .showcase-arrival-copy > p:last-child { margin-top: 16px; max-width: 340px; font-size: 14px; line-height: 1.7; }
  .showcase-search-panel {
    top: auto;
    right: 6%;
    bottom: 7%;
    width: 88%;
    min-height: 0;
    padding: 20px;
  }
  .showcase-window-bar { height: 22px; font-size: 9px; }
  .showcase-search-box { margin-top: 20px; height: 54px; padding: 0 14px; font-size: 17px; }
  .showcase-place-result { margin-top: 12px; min-height: 76px; gap: 10px; }
  .showcase-result-icon { width: 40px; height: 40px; }
  .showcase-place-result strong { font-size: 15px; }
  .showcase-place-result p { font-size: 10px; }

  .showcase-map-scene { padding: 28px 20px 24px; }
  .showcase-scene-heading { display: block; }
  .showcase-scene-heading > div:last-child { margin-top: 18px; text-align: left; }
  .showcase-scene-heading h2 { font-size: 26px; }
  .showcase-map-layout {
    margin-top: 20px;
    height: calc(100% - 126px);
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1.3fr) minmax(0, 0.7fr);
    gap: 12px;
  }
  .showcase-map-canvas > img { object-position: 56% center; }
  .showcase-map-pin { min-height: 28px; padding: 0 7px; font-size: 9px; }
  .showcase-map-details { padding: 16px; }
  .showcase-map-details .showcase-kicker { margin-top: 8px; }
  .showcase-map-details h3 { margin-top: 4px; font-size: 18px; }
  .showcase-map-details > p:not(.showcase-kicker) { margin: 6px 0; font-size: 10px; line-height: 1.5; }
  .showcase-detail-status,
  .showcase-map-details a { font-size: 10px; }
  .showcase-detail-status { margin-top: auto; }
  .showcase-map-details a { min-height: 36px; margin-top: 8px; }
  .showcase-detail-icon { width: 34px; height: 34px; }

  .showcase-panorama-scene {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    align-items: stretch;
    gap: 18px;
    padding: 28px 20px 24px;
  }
  .showcase-panorama-copy .showcase-kicker { margin-top: 18px; }
  .showcase-panorama-copy h2 { margin-top: 7px; font-size: 31px; }
  .showcase-panorama-copy > p:not(.showcase-kicker, .showcase-panorama-note) {
    margin-top: 10px;
    font-size: 11px;
    line-height: 1.6;
  }
  .showcase-panorama-tags { margin-top: 12px; gap: 5px; }
  .showcase-panorama-tags span { padding: 5px 8px; font-size: 9px; }
  .showcase-panorama-note { display: none; }
  .showcase-panorama-window { min-height: 0; }

  .showcase-assistant-scene { padding: 28px 20px 24px; }
  .showcase-assistant-header { display: block; }
  .showcase-assistant-header > p { margin-top: 12px; font-size: 10px; line-height: 1.5; }
  .showcase-assistant-layout {
    margin-top: 22px;
    height: calc(100% - 90px);
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 16px;
  }
  .showcase-question-panel { border-right: 0; border-bottom: 1px solid #d9e0dc; padding: 0 0 14px; }
  .showcase-question-panel h2 { font-size: 27px; }
  .showcase-question-input { margin-top: 18px; min-height: 52px; font-size: 15px; }
  .showcase-trace-list { margin-top: 12px; }
  .showcase-trace-list li { min-height: 34px; grid-template-columns: 20px 1fr auto; font-size: 10px; }
  .showcase-answer-panel { overflow: hidden; padding: 18px; }
  .showcase-answer-panel h3 { margin-top: 12px; font-size: 21px; }
  .showcase-answer-panel > p { margin-top: 10px; font-size: 12px; line-height: 1.65; }
  .showcase-answer-facts { margin-top: 10px; padding: 8px 0; }
  .showcase-answer-facts span { font-size: 9px; }
  .showcase-answer-facts b { font-size: 14px; }
  .showcase-citation { margin-top: 12px; padding: 9px; font-size: 10px; }
  .showcase-answer-panel a { min-height: 36px; font-size: 11px; }

  .showcase-checklist-scene {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    align-items: stretch;
    gap: 18px;
    padding: 28px 20px 24px;
  }
  .showcase-checklist-copy .showcase-kicker { margin-top: 26px; }
  .showcase-checklist-copy h2 { margin-top: 8px; font-size: 30px; }
  .showcase-checklist-copy > p:last-child { margin-top: 10px; font-size: 12px; line-height: 1.6; }
  .showcase-countdown {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: end;
    padding: 12px 4px;
    text-align: left;
  }
  .showcase-countdown span { align-self: center; font-size: 11px; }
  .showcase-countdown strong { margin: 0; font-size: 46px; }
  .showcase-countdown b { align-self: center; font-size: 13px; }
  .showcase-countdown p { grid-column: 1 / -1; margin-top: 6px; font-size: 10px; }
  .showcase-task-list { padding: 18px; }
  .showcase-task-progress,
  .showcase-task-list li,
  .showcase-task-list a { font-size: 11px; }
  .showcase-task-list li { min-height: 46px; gap: 9px; }
  .showcase-task-list li > span { width: 26px; height: 26px; }
  .showcase-task-list a { min-height: 38px; }

  .showcase-transport-scene { padding: 28px 20px 24px; }
  .showcase-transport-heading { display: block; }
  .showcase-transport-heading > div:last-child { margin-top: 18px; text-align: left; }
  .showcase-transport-heading h2 { font-size: 27px; }
  .showcase-transport-layout {
    margin-top: 20px;
    height: auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-content: start;
    gap: 12px;
  }
  .showcase-transit-route { padding: 16px 18px; }
  .showcase-transit-query { gap: 8px; font-size: 11px; }
  .showcase-transit-query svg { width: 16px; }
  .showcase-bus-line { margin-top: 13px; grid-template-columns: 54px minmax(0, 1fr); gap: 14px; }
  .showcase-bus-number { width: 54px; height: 54px; font-size: 21px; }
  .showcase-bus-line > div { padding-left: 20px; }
  .showcase-bus-line > div::before { left: 4px; top: 7px; bottom: 7px; }
  .showcase-bus-line p { font-size: 12px; }
  .showcase-bus-line p::before { left: -20px; width: 10px; height: 10px; border-width: 2px; }
  .showcase-bus-line i { height: 17px; }
  .showcase-transit-meta { margin-top: 13px; padding: 8px 0; }
  .showcase-transit-meta span { font-size: 9px; }
  .showcase-transit-meta b { font-size: 14px; }
  .showcase-transit-note { margin-top: 10px; font-size: 9px; line-height: 1.45; }
  .showcase-nearby-lines { padding: 15px 18px; }
  .showcase-nearby-header h3 { margin-top: 3px; font-size: 18px; }
  .showcase-nearby-header > svg { width: 23px; height: 23px; }
  .showcase-nearby-lines ul { margin-top: 9px; }
  .showcase-nearby-lines li { min-height: 43px; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 7px; }
  .showcase-nearby-lines li b { font-size: 13px; }
  .showcase-nearby-lines li span { font-size: 9px; }
  .showcase-nearby-lines li em { font-size: 8px; }
  .showcase-transit-status { margin-top: 8px; padding: 7px 8px; font-size: 9px; }

  .showcase-controls { top: 10px; right: 10px; gap: 4px; }
  .showcase-controls button,
  .showcase-controls a { width: 36px; height: 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .showcase-route-shadow,
  .showcase-route-line { animation-duration: 1ms; animation-delay: 0ms; }
  .showcase-scene-enter-active,
  .showcase-scene-leave-active { transition-duration: 1ms; }
}
</style>
