<script setup lang="ts">
const OFFICIAL_VR_URL = 'https://www.720yun.com/vr/c66jOpeOOa3'
const OFFICIAL_ANNOUNCEMENT_URL = 'https://news.yeu.edu.cn/2023/0621/c704a39166/page.htm'

useSeoMeta({
  title: '全景云游校园',
  description: '进入仰恩大学官方校史馆 VR 全景，拖拽视角、切换场景，提前了解校园历史与校史馆展陈。'
})

const viewerLoaded = ref(false)
const viewerReady = ref(false)
const viewerShell = ref<HTMLElement | null>(null)

const controlTips = [
  {
    title: '拖动看四周',
    description: '电脑按住鼠标拖动；手机用单指左右滑动。',
    icon: 'i-lucide-mouse-pointer-2'
  },
  {
    title: '缩放看细节',
    description: '使用滚轮或双指缩放，展板文字可以放大查看。',
    icon: 'i-lucide-scan'
  },
  {
    title: '切换展厅点位',
    description: '打开“场景选择”，可直接跳到不同篇章。',
    icon: 'i-lucide-orbit'
  }
] as const

function startViewer() {
  viewerLoaded.value = true
  nextTick(() => {
    document.querySelector('#official-vr-viewer')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  })
}

function reloadViewer() {
  viewerReady.value = false
  viewerLoaded.value = false
  nextTick(() => {
    viewerLoaded.value = true
  })
}

async function enterFullscreen() {
  const target = viewerShell.value
  if (!target || !target.requestFullscreen) return
  await target.requestFullscreen()
}
</script>

<template>
  <div class="overflow-x-clip pb-16">
    <section class="panorama-hero relative isolate overflow-hidden border-b border-emerald-950/10 text-white">
      <img
        src="/images/intro/yeu-campus-hero.webp"
        alt=""
        class="absolute inset-0 size-full object-cover"
      >
      <div class="absolute inset-0 bg-[linear-gradient(120deg,rgba(4,35,27,.94),rgba(7,67,49,.72)_52%,rgba(9,28,23,.42))]" />
      <div class="absolute -right-28 top-20 size-96 rounded-full border border-white/15" />
      <div class="absolute -right-8 top-40 size-72 rounded-full border border-emerald-200/25" />

      <div class="page-shell relative z-10 grid min-h-[34rem] content-end gap-8 py-12 md:min-h-[40rem] md:grid-cols-[minmax(0,1fr)_19rem] md:items-end md:py-16">
        <div class="max-w-3xl">
          <div class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/15 px-4 py-2 text-xs font-semibold backdrop-blur-md">
            <span class="grid size-7 place-items-center rounded-full bg-emerald-300 font-black text-emerald-950">360°</span>
            仰恩大学官方全景来源
          </div>
          <h1 class="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
            拖一拖，<br class="sm:hidden">先走进仰恩校史馆
          </h1>
          <p class="mt-5 max-w-2xl text-sm leading-7 text-white/80 md:text-base md:leading-8">
            不用下载 App。进入后可以转动视角、缩放展板、切换不同篇章，也能在支持的设备上进入 VR 模式。
          </p>

          <div class="mt-7 flex flex-wrap gap-3">
            <UButton
              icon="i-lucide-orbit"
              label="开始全景云游"
              size="xl"
              color="success"
              class="min-h-12 shadow-xl shadow-black/20"
              @click="startViewer"
            />
            <UButton
              :to="OFFICIAL_VR_URL"
              external
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-external-link"
              label="在官方全景页打开"
              size="xl"
              color="neutral"
              variant="soft"
              class="min-h-12 bg-white/90 text-zinc-950 hover:bg-white"
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
              <p class="mt-1 hidden text-xs leading-5 text-white/65 md:block">
                {{ tip.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      id="official-vr-viewer"
      class="page-shell scroll-mt-20 py-8 md:py-12"
    >
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="section-kicker">
            真实 360° 场景
          </p>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-zinc-950 md:text-3xl">
            仰恩大学线上校史馆
          </h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            当前可公开核验的官方全景覆盖校史馆室内展陈，并不是整个校园的户外全景。
          </p>
        </div>
        <UBadge
          label="党委宣传部 2023 年上线"
          color="success"
          variant="soft"
          size="lg"
        />
      </div>

      <div
        ref="viewerShell"
        class="panorama-viewer-shell relative overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-950 shadow-2xl shadow-emerald-950/15"
      >
        <template v-if="viewerLoaded">
          <iframe
            src="https://www.720yun.com/vr/c66jOpeOOa3"
            title="仰恩大学官方校史馆 VR 全景"
            class="absolute inset-0 size-full border-0 bg-black"
            loading="eager"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; fullscreen; gyroscope; xr-spatial-tracking"
            allowfullscreen
            @load="viewerReady = true"
          />

          <div
            v-if="!viewerReady"
            class="absolute inset-0 z-10 grid place-items-center bg-zinc-950 text-white"
            role="status"
          >
            <div class="text-center">
              <UIcon
                name="i-lucide-loader-circle"
                class="mx-auto size-7 animate-spin text-emerald-300"
              />
              <p class="mt-3 text-sm text-white/75">
                正在加载官方全景
              </p>
            </div>
          </div>

          <div class="absolute right-3 top-3 z-20 flex gap-2">
            <UButton
              icon="i-lucide-refresh-cw"
              aria-label="重新加载全景"
              color="neutral"
              variant="solid"
              class="bg-white/90 text-zinc-950 shadow-lg backdrop-blur hover:bg-white"
              @click="reloadViewer"
            />
            <UButton
              icon="i-lucide-maximize-2"
              aria-label="全屏查看全景"
              color="neutral"
              variant="solid"
              class="bg-white/90 text-zinc-950 shadow-lg backdrop-blur hover:bg-white"
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
            <span class="mx-auto grid size-20 place-items-center rounded-full border border-white/25 bg-white/10 text-2xl font-black backdrop-blur">
              360°
            </span>
            <h3 class="mt-5 text-2xl font-black">
              点击后才加载全景
            </h3>
            <p class="mt-2 text-sm leading-6 text-white/65">
              这样首页和普通浏览不会提前下载第三方全景资源，移动网络下更省流量。
            </p>
            <UButton
              icon="i-lucide-play"
              label="进入官方全景"
              size="xl"
              color="success"
              class="mt-6 min-h-12"
              @click="startViewer"
            />
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
        <section class="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6">
          <div class="flex items-center gap-3">
            <span class="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <UIcon
                name="i-lucide-history"
                class="size-5"
              />
            </span>
            <div>
              <p class="text-xs font-semibold text-emerald-700">
                里面能看什么
              </p>
              <h3 class="text-lg font-bold text-zinc-950">
                沿时间轴了解仰恩办学历程
              </h3>
            </div>
          </div>
          <p class="mt-4 text-sm leading-7 text-zinc-600">
            全景中的场景选择包含前言、艰苦筹建、学校初创、教育改革、开放办学、校友风采等篇章。点击展板上的点位可以查看图文，再放大阅读细节。
          </p>
        </section>

        <aside class="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 md:p-6">
          <p class="text-xs font-semibold text-amber-800">
            来源和使用边界
          </p>
          <h3 class="mt-1 text-base font-bold text-amber-950">
            官方全景由 720 云承载
          </h3>
          <p class="mt-3 text-sm leading-6 text-amber-900/80">
            本页只做入口与使用说明，不复制全景素材。第三方页面加载失败时，可以直接打开官方原页。
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <UButton
              :to="OFFICIAL_ANNOUNCEMENT_URL"
              external
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-badge-check"
              label="查看学校上线通知"
              color="warning"
              variant="outline"
            />
            <UButton
              :to="OFFICIAL_VR_URL"
              external
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-external-link"
              label="打开全景原页"
              color="neutral"
              variant="ghost"
            />
          </div>
        </aside>
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
