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

useSeoMeta({
  title: '新生指南展示',
  description: '仰恩新生指南录屏展示模式。',
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

let frameId: number | null = null
let previousFrameAt = 0
let controlsTimer: number | null = null

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
  '宿舍床垫要买多大？',
  (sceneProgress.value - 0.08) / 0.28
))
const completedChecklistCount = computed(() => showcaseCheckedCount(
  (sceneProgress.value - 0.15) / 0.68,
  3
))

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

async function restartShowcase(): Promise<void> {
  sceneIndex.value = 0
  sceneElapsedMs.value = 0
  started.value = false
  paused.value = false
  showIntro.value = false
  await nextTick()
  introCycle.value += 1
  showIntro.value = true
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
  revealControls()
})

onBeforeUnmount(() => {
  if (frameId !== null) window.cancelAnimationFrame(frameId)
  if (controlsTimer !== null) window.clearTimeout(controlsTimer)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="showcase-root"
    @pointermove="revealControls"
  >
    <ClientOnly>
      <IntroOverlay
        v-if="showIntro"
        :key="introCycle"
        force
        :auto-complete-ms="SHOWCASE_INTRO_DURATION_MS - 700"
        @complete="onIntroComplete"
      />
    </ClientOnly>

    <main
      class="showcase-frame"
      aria-label="仰恩新生指南展示"
    >
      <Transition
        name="showcase-scene"
        mode="out-in"
      >
        <section
          v-if="activeScene.id === 'arrival'"
          key="arrival"
          class="showcase-scene showcase-arrival"
        >
          <img
            src="/images/intro/yeu-campus-hero.webp"
            alt="仰恩大学校园湖区与建筑"
            width="1579"
            height="889"
            class="showcase-cover"
          >
          <div class="showcase-arrival-shade" />

          <div class="showcase-brand showcase-brand-light">
            <span class="showcase-brand-mark">YEU</span>
            <span>仰恩新生指南</span>
          </div>

          <div class="showcase-arrival-copy">
            <p class="showcase-kicker showcase-kicker-light">
              2026 FRESHMAN GUIDE
            </p>
            <h1>第一次进校，<br>不该靠群聊截图认路。</h1>
            <p>从一个地点开始，把报到当天走成一条清楚的路线。</p>
          </div>

          <div class="showcase-search-panel">
            <div class="showcase-window-bar">
              <span />
              <span />
              <span />
              <p>yeu.huiliyill.cn</p>
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
              <span class="showcase-brand-mark">YEU</span>
              <span>校园地图</span>
            </div>
            <div>
              <p class="showcase-kicker">
                REAL CAMPUS DATA
              </p>
              <h2>搜到地点，也要走得到。</h2>
            </div>
          </div>

          <div class="showcase-map-layout">
            <div class="showcase-map-canvas">
              <img
                src="/images/yeu-campus-plan-2025.jpg"
                alt="仰恩大学官方平面示意图"
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
                <b>宏翔楼</b>
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
                ROUTE READY
              </p>
              <h3>从 8 号门到宏翔楼</h3>
              <p>已定位入口与目的地，步行路线会按地图服务的实时结果规划。</p>
              <div class="showcase-detail-status">
                <UIcon name="i-lucide-circle-check-big" />
                位置数据已核验
              </div>
              <NuxtLink to="/map?q=宏翔楼">
                打开真实地图
                <UIcon name="i-lucide-arrow-right" />
              </NuxtLink>
            </aside>
          </div>
        </section>

        <section
          v-else-if="activeScene.id === 'assistant'"
          key="assistant"
          class="showcase-scene showcase-assistant-scene"
        >
          <div class="showcase-assistant-header">
            <div class="showcase-brand">
              <span class="showcase-brand-mark">YEU</span>
              <span>校园搜索</span>
            </div>
            <p>数据库优先 · 必要时再检索网页 · 答案保留来源</p>
          </div>

          <div class="showcase-assistant-layout">
            <section class="showcase-question-panel">
              <p class="showcase-kicker">
                ASK THE CAMPUS
              </p>
              <h2>问题不必先改成关键词。</h2>
              <div class="showcase-question-input">
                <span>{{ assistantQuestion }}</span>
                <i v-if="sceneProgress < 0.42" />
                <UIcon name="i-lucide-arrow-up" />
              </div>
              <ol class="showcase-trace-list">
                <li :class="{ 'is-visible': sceneProgress > 0.34 }">
                  <UIcon name="i-lucide-scan-search" />
                  <span>分析问题</span>
                  <b>宿舍床与床垫尺寸</b>
                </li>
                <li :class="{ 'is-visible': sceneProgress > 0.43 }">
                  <UIcon name="i-lucide-database" />
                  <span>搜索内置数据库</span>
                  <b>已完成</b>
                </li>
                <li :class="{ 'is-visible': sceneProgress > 0.52 }">
                  <UIcon name="i-lucide-file-check-2" />
                  <span>整理答案</span>
                  <b>保留核验边界</b>
                </li>
              </ol>
            </section>

            <article
              class="showcase-answer-panel"
              :class="{ 'is-visible': sceneProgress > 0.55 }"
            >
              <div class="showcase-answer-label">
                <UIcon name="i-lucide-sparkles" />
                校园助手
              </div>
              <h3>先不要按网传尺寸定制床垫。</h3>
              <p>
                目前没有检索到学校官方公开的统一宿舍床尺寸。不同楼栋、房型和床位设施可能不同，拿到楼栋与房型后，再向宿管、辅导员或在校同学实测确认。
              </p>
              <div class="showcase-citation">
                <UIcon name="i-lucide-shield-check" />
                <span>未确认的数据，不伪装成学校通知</span>
              </div>
              <NuxtLink to="/search?q=宿舍床垫要买多大">
                继续查看
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
              <span class="showcase-brand-mark">YEU</span>
              <span>新生清单</span>
            </div>
            <p class="showcase-kicker">
              BEFORE ARRIVAL
            </p>
            <h2>不知道先做什么，<br>就按时间一步一步来。</h2>
            <p>到校前、报到当天、入学第一周，每一项都能继续勾选。</p>
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
          v-else
          key="contact"
          class="showcase-scene showcase-contact-scene"
        >
          <img
            src="/images/intro/yeu-campus-hero.webp"
            alt="仰恩大学校园俯瞰"
            width="1579"
            height="889"
            class="showcase-cover"
          >
          <div class="showcase-contact-shade" />
          <div class="showcase-contact-copy">
            <div class="showcase-brand showcase-brand-light">
              <span class="showcase-brand-mark">YEU</span>
              <span>仰恩新生指南</span>
            </div>
            <p class="showcase-kicker showcase-kicker-light">
              SAVE IT FOR SEPTEMBER
            </p>
            <h2>发给同届。<br>开学前一定用得到。</h2>
            <div class="showcase-contact-stats">
              <span><b>98</b> 个校园地点</span>
              <span><b>25</b> 项新生待办</span>
              <span><b>1</b> 个入口查清楚</span>
            </div>
            <p class="showcase-url">
              yeu.huiliyill.cn
            </p>
          </div>
          <div
            class="showcase-qr-panel"
            :class="{ 'is-visible': sceneProgress > 0.2 }"
          >
            <img
              src="/images/contact-wechat.png"
              alt="联系整理者微信二维码"
              width="814"
              height="1151"
            >
            <div>
              <strong>有问题，直接联系</strong>
              <p>也可以加我拉新生群</p>
            </div>
          </div>
        </section>
      </Transition>

      <div
        class="showcase-timeline"
        aria-hidden="true"
      >
        <i :style="{ width: `${totalProgress * 100}%` }" />
      </div>
    </main>

    <div
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
  min-height: 100dvh;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #03150f;
  color: #17211d;
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
}

.showcase-frame {
  position: relative;
  width: min(100vw, calc(100vh * 16 / 9));
  height: min(100vh, calc(100vw * 9 / 16));
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #f4f7f5;
  isolation: isolate;
}

.showcase-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.showcase-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.showcase-arrival-shade,
.showcase-contact-shade {
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

.showcase-arrival-copy h1,
.showcase-contact-copy h2 {
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

.showcase-contact-shade {
  background: linear-gradient(90deg, rgba(3, 23, 17, 0.93), rgba(3, 23, 17, 0.68) 55%, rgba(3, 23, 17, 0.3));
}

.showcase-contact-copy {
  position: absolute;
  left: 6%;
  top: 8%;
  width: 55%;
  color: white;
}
.showcase-contact-copy .showcase-kicker { margin-top: 12%; }
.showcase-contact-copy h2 { font-size: 54px; }
.showcase-contact-stats { margin-top: 34px; display: flex; gap: 24px; color: #cce3d6; font-size: 13px; }
.showcase-contact-stats span { padding-right: 24px; border-right: 1px solid rgba(255,255,255,0.22); }
.showcase-contact-stats span:last-child { border-right: 0; }
.showcase-contact-stats b { display: block; margin-bottom: 5px; color: #ffcc7b; font-size: 28px; }
.showcase-url { margin: 34px 0 0; color: #ffefd4; font-size: 22px; font-weight: 800; }

.showcase-qr-panel {
  position: absolute;
  right: 7%;
  top: 17%;
  width: 24%;
  border: 1px solid rgba(255,255,255,0.62);
  border-radius: 8px;
  background: white;
  padding: 18px;
  box-shadow: 0 30px 70px rgba(0, 18, 13, 0.34);
  opacity: 0;
  transform: translateY(20px) scale(0.96);
  transition: opacity 600ms ease, transform 800ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.showcase-qr-panel.is-visible { opacity: 1; transform: translateY(0) scale(1); }
.showcase-qr-panel img { display: block; width: 100%; aspect-ratio: 814 / 1151; object-fit: cover; object-position: center 38%; }
.showcase-qr-panel > div { border-top: 1px solid #e4e7e5; padding-top: 13px; text-align: center; }
.showcase-qr-panel strong { color: #173c2e; font-size: 14px; }
.showcase-qr-panel p { margin: 4px 0 0; color: #748079; font-size: 11px; }

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

@media (min-width: 1600px) {
  .showcase-arrival-copy h1,
  .showcase-contact-copy h2 { font-size: 64px; }
  .showcase-arrival-copy > p:last-child { font-size: 19px; }
  .showcase-map-layout { grid-template-columns: minmax(0, 1fr) 360px; }
  .showcase-question-panel h2 { font-size: 42px; }
  .showcase-answer-panel h3 { font-size: 34px; }
  .showcase-checklist-copy h2 { font-size: 48px; }
}

@media (max-width: 900px) {
  .showcase-frame {
    width: 100vw;
    height: 100dvh;
    aspect-ratio: auto;
  }

  .showcase-brand { gap: 8px; font-size: 12px; }
  .showcase-brand-mark { width: 34px; height: 34px; font-size: 9px; }
  .showcase-kicker { font-size: 10px; }

  .showcase-arrival-shade {
    background: linear-gradient(180deg, rgba(3, 23, 17, 0.86), rgba(3, 23, 17, 0.62) 48%, rgba(3, 23, 17, 0.88));
  }
  .showcase-arrival .showcase-brand { left: 6%; top: 5%; }
  .showcase-arrival-copy { left: 6%; top: 14%; width: 88%; }
  .showcase-arrival-copy h1,
  .showcase-contact-copy h2 { margin-top: 12px; font-size: 38px; line-height: 1.16; }
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

  .showcase-contact-shade {
    background: linear-gradient(180deg, rgba(3, 23, 17, 0.93), rgba(3, 23, 17, 0.72) 58%, rgba(3, 23, 17, 0.9));
  }
  .showcase-contact-copy { left: 6%; top: 7%; width: 88%; }
  .showcase-contact-copy .showcase-kicker { margin-top: 14%; }
  .showcase-contact-copy h2 { font-size: 36px; }
  .showcase-contact-stats { margin-top: 24px; gap: 12px; font-size: 10px; }
  .showcase-contact-stats span { flex: 1; padding-right: 10px; }
  .showcase-contact-stats b { font-size: 20px; }
  .showcase-url { margin-top: 20px; font-size: 16px; }
  .showcase-qr-panel { top: auto; right: 22%; bottom: 5%; width: 56%; padding: 12px; }
  .showcase-qr-panel strong { font-size: 11px; }
  .showcase-qr-panel p { font-size: 9px; }

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
