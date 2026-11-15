<script setup lang="ts">
type TourId = 'campus' | 'history'

interface PanoramaTour {
  id: TourId
  eyebrow: string
  title: string
  shortTitle: string
  description: string
  url: string
  sourceUrl: string
  sourceLabel: string
  icon: string
  badge: string
  official: boolean
}

const BAIDU_CAMPUS_PANORAMA_HASH = '#panoid=646c1306d4d72bfa631809a2&panotype=inter&heading=358&pitch=0&l=21&tn=B_NORMAL_MAP&sc=0&newmap=1&shareurl=1&pid=1000170000150119145327310IN&iid=646c1306d4d72bfa631809a2'
const BAIDU_CAMPUS_PANORAMA_URL = `https://map.baidu.com/poi/%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6/@13204528,2871631,21z,87t,-16.6h${BAIDU_CAMPUS_PANORAMA_HASH}`
const OFFICIAL_HISTORY_VR_URL = 'https://www.720yun.com/vr/c66jOpeOOa3'
const OFFICIAL_ANNOUNCEMENT_URL = 'https://news.yeu.edu.cn/2023/0621/c704a39166/page.htm'
const route = useRoute()

useSeoMeta({
  title: '全景云游校园',
  description: '在手机或电脑上查看校园大门、教学楼、宿舍、体育馆等校内实景，也可以进入学校发布的校史馆全景。'
})

const tours: PanoramaTour[] = [
  {
    id: 'campus',
    eyebrow: '先看这里',
    title: '逛校园里的路和楼',
    shortTitle: '校内实景',
    description: '百度地图用户全景 · 26 个拍摄点 · 非学校官方拍摄',
    url: BAIDU_CAMPUS_PANORAMA_URL,
    sourceUrl: BAIDU_CAMPUS_PANORAMA_URL,
    sourceLabel: '打开百度地图用户全景',
    icon: 'i-lucide-school',
    badge: '26 个校内拍摄点',
    official: false
  },
  {
    id: 'history',
    eyebrow: '再了解学校',
    title: '走进校史馆',
    shortTitle: '校史馆',
    description: '学校党委宣传部发布 · 2023 年上线 · 仅校史馆内景',
    url: OFFICIAL_HISTORY_VR_URL,
    sourceUrl: OFFICIAL_HISTORY_VR_URL,
    sourceLabel: '打开学校发布的 VR 校史馆',
    icon: 'i-lucide-history',
    badge: '学校发布',
    official: true
  }
]

const activeTourId = ref<TourId>(route.query.tour === 'history' ? 'history' : 'campus')
const viewerLoaded = ref(false)
const viewerReady = ref(false)
const viewerShell = ref<HTMLElement | null>(null)
const campusPanoramaFailed = ref(false)
const mobilePanorama = ref(false)

const activeTour = computed(() => (
  tours.find(tour => tour.id === activeTourId.value) ?? tours[0]!
))
const activeViewerUrl = computed(() => (
  activeTour.value.url
))

const controlTips = [
  {
    title: '按住画面转一圈',
    icon: 'i-lucide-mouse-pointer-2'
  },
  {
    title: '放大看清一点',
    icon: 'i-lucide-scan'
  },
  {
    title: '点底部换地方',
    icon: 'i-lucide-orbit'
  }
] as const

function scrollToViewer() {
  nextTick(() => {
    document.querySelector('#campus-panorama-viewer')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  })
}

function openTour(id: TourId) {
  if (id === 'history' && mobilePanorama.value) {
    window.location.assign(OFFICIAL_HISTORY_VR_URL)
    return
  }
  activeTourId.value = id
  viewerReady.value = false
  viewerLoaded.value = true
  scrollToViewer()
}

function chooseTour(id: TourId) {
  if (activeTourId.value === id) {
    openTour(id)
    return
  }
  activeTourId.value = id
  viewerReady.value = false
  viewerLoaded.value = false
  scrollToViewer()
}

function reloadViewer() {
  viewerReady.value = false
  viewerLoaded.value = false
  campusPanoramaFailed.value = false
  nextTick(() => {
    viewerLoaded.value = true
  })
}

async function enterFullscreen() {
  const target = viewerShell.value
  if (!target?.requestFullscreen) return
  try {
    await target.requestFullscreen()
  } catch {
    // Some mobile browsers only allow the full-screen button inside the panorama itself.
  }
}

onMounted(() => {
  mobilePanorama.value = /Android|iPhone|iPad|iPod|Mobile|MicroMessenger/i.test(navigator.userAgent)
    || window.matchMedia('(pointer: coarse)').matches
})
</script>

<template>
  <div class="overflow-x-clip pb-16">
    <section class="panorama-hero relative isolate overflow-hidden border-b border-emerald-950/10 text-white">
      <img
        src="/images/intro/yeu-campus-hero.webp"
        alt=""
        class="absolute inset-0 size-full object-cover"
      >
      <div class="absolute inset-0 bg-[linear-gradient(112deg,rgba(3,28,22,.94),rgba(6,67,48,.72)_58%,rgba(7,30,24,.48))]" />
      <div class="absolute -right-24 top-16 size-96 rounded-full border border-white/15" />
      <div class="absolute right-16 top-44 size-64 rounded-full border border-emerald-100/25" />

      <div class="page-shell relative z-10 grid min-h-[28rem] content-end gap-5 py-8 md:min-h-[34rem] md:grid-cols-[minmax(0,1fr)_20rem] md:items-end md:py-12">
        <div class="max-w-3xl">
          <div class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/15 px-4 py-2 text-xs font-semibold backdrop-blur-md">
            <span class="grid size-8 place-items-center rounded-full bg-emerald-300 font-black text-emerald-950 dark:text-emerald-300">360°</span>
            不用到校，先在屏幕里逛一圈
          </div>
          <h1 class="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
            大门、教学楼、宿舍，<br>先看看长什么样
          </h1>
          <p class="mt-4 max-w-2xl text-xs leading-6 text-white/70">
            校内实景来自百度地图用户 · 校史馆由学校发布
          </p>

          <div class="mt-5 flex flex-wrap gap-3">
            <UButton
              icon="i-lucide-school"
              label="现在开始逛校园"
              size="xl"
              color="success"
              class="min-h-12 shadow-xl shadow-black/20"
              @click="openTour('campus')"
            />
            <UButton
              icon="i-lucide-history"
              label="先看校史馆"
              size="xl"
              color="neutral"
              variant="soft"
              class="min-h-12 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] dark:bg-zinc-900/90 text-zinc-950 dark:text-zinc-100 hover:bg-[var(--surface)] dark:hover:bg-zinc-900"
              @click="openTour('history')"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 md:grid-cols-1">
          <div
            v-for="tip in controlTips"
            :key="tip.title"
            class="rounded-2xl border border-white/15 bg-black/20 p-3 backdrop-blur-md md:flex md:items-center md:gap-3 md:p-4"
          >
            <UIcon
              :name="tip.icon"
              class="size-5 shrink-0 text-emerald-200"
            />
            <div class="mt-2 md:mt-0">
              <p class="text-xs font-bold text-white md:text-sm">
                {{ tip.title }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="page-shell py-8 md:py-12">
      <div class="mb-5">
        <p class="section-kicker">
          你想先看哪里
        </p>
        <h2 class="mt-1 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 md:text-3xl">
          校园实景和校史馆分开看
        </h2>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <button
          v-for="tour in tours"
          :key="tour.id"
          type="button"
          class="group relative overflow-hidden rounded-3xl border bg-[var(--surface)] dark:bg-zinc-900 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 md:p-6"
          :class="activeTourId === tour.id ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-zinc-200 dark:border-zinc-800'"
          @click="chooseTour(tour.id)"
        >
          <div class="flex items-start justify-between gap-4">
            <span
              class="grid size-12 shrink-0 place-items-center rounded-2xl"
              :class="tour.id === 'campus' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'"
            >
              <UIcon
                :name="tour.icon"
                class="size-6"
              />
            </span>
            <UBadge
              :label="tour.badge"
              :color="tour.official ? 'success' : 'neutral'"
              variant="soft"
            />
          </div>
          <p class="mt-5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {{ tour.eyebrow }}
          </p>
          <h3 class="mt-1 text-xl font-black text-zinc-950 dark:text-zinc-100">
            {{ tour.title }}
          </h3>
          <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ tour.description }}
          </p>
          <span class="mt-5 inline-flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            打开看看
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 transition-transform group-hover:translate-x-1"
            />
          </span>
        </button>
      </div>
    </section>

    <section
      id="campus-panorama-viewer"
      class="page-shell scroll-mt-20 pb-8 md:pb-12"
    >
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="section-kicker">
            正在看：{{ activeTour.shortTitle }}
          </p>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 md:text-3xl">
            {{ activeTour.title }}
          </h2>
        </div>
        <UButton
          :to="activeTour.sourceUrl"
          external
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          :label="activeTour.sourceLabel"
          color="neutral"
          variant="outline"
        />
      </div>

      <div
        ref="viewerShell"
        class="panorama-viewer-shell relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 dark:bg-zinc-800 shadow-2xl shadow-emerald-950/15"
      >
        <template v-if="viewerLoaded">
          <PanoramaBaiduCampusViewer
            v-if="activeTour.id === 'campus' && !campusPanoramaFailed"
            :key="`baidu-${activeTour.id}`"
            @ready="viewerReady = true"
            @error="campusPanoramaFailed = true"
          />
          <div
            v-else-if="activeTour.id === 'campus'"
            class="absolute inset-0 grid place-items-center bg-zinc-950 dark:bg-zinc-800 px-6 text-center text-white"
          >
            <div class="max-w-sm">
              <UIcon
                name="i-lucide-circle-alert"
                class="mx-auto size-8 text-amber-300"
              />
              <h3 class="mt-4 text-lg font-bold">
                校内实景暂时没有加载成功
              </h3>
              <UButton
                :to="BAIDU_CAMPUS_PANORAMA_URL"
                external
                target="_blank"
                rel="noopener noreferrer"
                icon="i-lucide-external-link"
                label="去原页面查看"
                color="neutral"
                class="mt-5"
              />
            </div>
          </div>
          <iframe
            v-else
            :key="activeTour.id"
            :src="activeViewerUrl"
            :title="`${activeTour.title} 360 度实景`"
            class="absolute inset-0 size-full border-0 bg-black dark:bg-zinc-900"
            loading="eager"
            referrerpolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock"
            allow="accelerometer; autoplay; fullscreen; gyroscope; xr-spatial-tracking"
            allowfullscreen
            @load="viewerReady = true"
          />

          <div
            v-if="!viewerReady"
            class="absolute inset-0 z-10 grid place-items-center bg-zinc-950 dark:bg-zinc-800 text-white"
            role="status"
          >
            <div class="text-center">
              <UIcon
                name="i-lucide-loader-circle"
                class="mx-auto size-7 animate-spin text-emerald-300"
              />
              <p class="mt-3 text-sm text-white/75">
                正在打开{{ activeTour.shortTitle }}
              </p>
              <p class="mt-1 text-xs text-white/50">
                第一次打开可能要等几秒
              </p>
            </div>
          </div>

          <div class="absolute right-3 top-3 z-20 flex gap-2">
            <UButton
              icon="i-lucide-refresh-cw"
              aria-label="重新打开实景"
              color="neutral"
              variant="solid"
              class="bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] dark:bg-zinc-900/90 text-zinc-950 dark:text-zinc-100 shadow-lg backdrop-blur hover:bg-[var(--surface)] dark:hover:bg-zinc-900"
              @click="reloadViewer"
            />
            <UButton
              icon="i-lucide-maximize-2"
              aria-label="全屏查看实景"
              color="neutral"
              variant="solid"
              class="bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] dark:bg-zinc-900/90 text-zinc-950 dark:text-zinc-100 shadow-lg backdrop-blur hover:bg-[var(--surface)] dark:hover:bg-zinc-900"
              @click="enterFullscreen"
            />
          </div>
        </template>

        <div
          v-else
          class="absolute inset-0 grid place-items-center overflow-hidden"
        >
          <img
            src="/images/intro/yeu-campus-hero.webp"
            alt=""
            class="absolute inset-0 size-full object-cover opacity-55"
          >
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,120,82,.12),rgba(2,15,12,.9))]" />
          <div class="relative z-10 max-w-md px-6 text-center text-white">
            <span class="mx-auto grid size-20 place-items-center rounded-full border border-white/25 bg-[color-mix(in_srgb,var(--surface)_10%,transparent)] dark:bg-zinc-900/10 text-2xl font-black backdrop-blur">
              360°
            </span>
            <h3 class="mt-5 text-2xl font-black">
              准备好就打开{{ activeTour.shortTitle }}
            </h3>
            <p class="mt-2 text-sm leading-6 text-white/65">
              点开以后，按住画面拖动就能四处看。
            </p>
            <UButton
              icon="i-lucide-play"
              :label="`打开${activeTour.shortTitle}`"
              size="xl"
              color="success"
              class="mt-6 min-h-12"
              @click="openTour(activeTour.id)"
            />
          </div>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span>校内实景：百度地图用户上传 · 校史馆：学校 2023 年发布</span>
        <UButton
          :to="OFFICIAL_ANNOUNCEMENT_URL"
          external
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="学校介绍"
          color="neutral"
          variant="link"
          class="px-0"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.panorama-hero {
  background: #073d2d;
}

.panorama-viewer-shell {
  height: min(76svh, 52rem);
  min-height: 34rem;
}

@media (max-width: 639px) {
  .panorama-viewer-shell {
    height: 72svh;
    min-height: 31rem;
    border-radius: 1.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(*) {
    scroll-behavior: auto !important;
  }
}
</style>
