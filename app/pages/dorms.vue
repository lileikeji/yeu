<script setup lang="ts">
type DormId = 'ordinary' | 'comfort'

const route = useRoute()

interface DormTour {
  id: DormId
  name: string
  badge: string
  duration: string
  summary: string
  video: string
  poster: string
  icon: string
  tone: string
  highlights: string[]
}

useSeoMeta({
  title: '宿舍实拍',
  description: '普通型和舒适型宿舍的竖屏实拍，拍到了床桌柜、洗漱台、卫生间和洗衣区。'
})

const dormTours: DormTour[] = [
  {
    id: 'ordinary',
    name: '普通型宿舍',
    badge: '28 秒实拍',
    duration: '约 28 秒',
    summary: '从宿舍内部走到公共洗衣、洗漱和卫生间区域。',
    video: '/media/ordinary-dorm-tour.mp4',
    poster: '/images/panorama/ordinary-dorm-poster.jpg',
    icon: 'i-lucide-bed-single',
    tone: 'border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950 text-sky-950 dark:text-sky-300',
    highlights: [
      '视频内可见上床下桌和储物柜',
      '洗衣、洗漱与卫生间位于公共区域',
      '普通型洗澡通常使用水卡，单次约 0.5 至 1 元'
    ]
  },
  {
    id: 'comfort',
    name: '舒适型宿舍',
    badge: '24 秒实拍',
    duration: '约 24 秒',
    summary: '查看卧室、床桌柜、空调、独立卫浴和洗衣区域。',
    video: '/media/comfort-dorm-tour.mp4',
    poster: '/images/panorama/comfort-dorm-poster.jpg',
    icon: 'i-lucide-bed-double',
    tone: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 text-emerald-950 dark:text-emerald-300',
    highlights: [
      '视频内可见床桌柜、空调和独立卫浴',
      '舒适型宿舍全天有热水，不使用普通宿舍水卡',
      '视频里的洗衣机和家具状态只代表拍摄房间'
    ]
  }
]

const activeDormId = ref<DormId>(route.query.type === 'comfort' ? 'comfort' : 'ordinary')
const videoFailed = ref(false)
const activeDorm = computed(() => (
  dormTours.find(item => item.id === activeDormId.value) ?? dormTours[0]!
))

function selectDorm(id: DormId) {
  activeDormId.value = id
  videoFailed.value = false
  nextTick(() => {
    document.querySelector('#dorm-video')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  })
}
</script>

<template>
  <div class="overflow-x-clip pb-16">
    <section class="relative isolate min-h-[24rem] overflow-hidden border-b border-zinc-900/10 text-white md:min-h-[30rem]">
      <img
        src="/images/panorama/ordinary-dorm-poster.jpg"
        alt=""
        class="absolute inset-0 size-full object-cover object-[center_30%]"
      >
      <div class="absolute inset-0 bg-[linear-gradient(100deg,rgba(8,20,30,.96),rgba(8,35,46,.78)_55%,rgba(8,20,30,.35))]" />

      <div class="page-shell relative z-10 flex min-h-[24rem] items-end py-8 md:min-h-[30rem] md:py-12">
        <div class="max-w-3xl">
          <p class="text-sm font-semibold text-cyan-200">
            新生住宿参考
          </p>
          <h1 class="mt-3 text-3xl font-black sm:text-4xl md:text-5xl">
            宿舍实拍
          </h1>
          <p class="mt-4 max-w-2xl text-xs leading-6 text-white/70">
            自行拍摄 · 非官方样板 · 不代表最终分配
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <UButton
              icon="i-lucide-bed-single"
              label="普通型宿舍"
              size="xl"
              color="neutral"
              class="min-h-12 bg-[var(--surface)] dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              @click="selectDorm('ordinary')"
            />
            <UButton
              icon="i-lucide-bed-double"
              label="舒适型宿舍"
              size="xl"
              color="neutral"
              variant="soft"
              class="min-h-12 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] dark:bg-zinc-900/85 text-zinc-950 dark:text-zinc-100 hover:bg-[var(--surface)] dark:hover:bg-zinc-900"
              @click="selectDorm('comfort')"
            />
          </div>
        </div>
      </div>
    </section>

    <main class="page-shell py-10 md:py-14">
      <section aria-labelledby="dorm-options-title">
        <div class="max-w-2xl">
          <p class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            两种住宿类型
          </p>
          <h2
            id="dorm-options-title"
            class="mt-2 text-2xl font-black text-zinc-950 dark:text-zinc-100 md:text-3xl"
          >
            先选你想看的宿舍
          </h2>
        </div>

        <div class="mt-6 grid gap-4 md:grid-cols-2">
          <button
            v-for="dorm in dormTours"
            :key="dorm.id"
            type="button"
            class="group overflow-hidden rounded-lg border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            :class="[
              dorm.tone,
              activeDormId === dorm.id ? 'ring-2 ring-emerald-500 ring-offset-2' : 'hover:-translate-y-0.5 hover:shadow-lg'
            ]"
            @click="selectDorm(dorm.id)"
          >
            <div class="grid grid-cols-[7.5rem_1fr] sm:grid-cols-[10rem_1fr]">
              <img
                :src="dorm.poster"
                :alt="`${dorm.name}视频封面`"
                class="h-full min-h-40 w-full object-cover"
              >
              <div class="p-5">
                <div class="flex items-center justify-between gap-3">
                  <UIcon
                    :name="dorm.icon"
                    class="size-6"
                  />
                  <span class="text-xs font-semibold opacity-70">{{ dorm.badge }}</span>
                </div>
                <h3 class="mt-5 text-xl font-black">
                  {{ dorm.name }}
                </h3>
                <p class="mt-2 text-sm leading-6 opacity-75">
                  {{ dorm.summary }}
                </p>
              </div>
            </div>
          </button>
        </div>
      </section>

      <section
        id="dorm-video"
        class="scroll-mt-24 py-10 md:py-14"
        :aria-labelledby="`${activeDorm.id}-title`"
      >
        <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div>
            <p class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              正在看 · {{ activeDorm.duration }}
            </p>
            <h2
              :id="`${activeDorm.id}-title`"
              class="mt-2 text-3xl font-black text-zinc-950 dark:text-zinc-100"
            >
              {{ activeDorm.name }}
            </h2>

            <ul class="mt-6 space-y-3">
              <li
                v-for="item in activeDorm.highlights"
                :key="item"
                class="flex gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200"
              >
                <UIcon
                  name="i-lucide-circle-check"
                  class="mt-0.5 size-5 shrink-0 text-emerald-600"
                />
                <span>{{ item }}</span>
              </li>
            </ul>

            <div class="mt-7 flex flex-wrap gap-3">
              <UButton
                :to="activeDorm.video"
                external
                target="_blank"
                rel="noopener noreferrer"
                icon="i-lucide-external-link"
                label="单独打开视频"
                color="neutral"
                variant="outline"
              />
              <UButton
                to="/map?category=dorm"
                icon="i-lucide-map-pinned"
                label="去地图找宿舍楼"
                color="neutral"
                variant="soft"
              />
            </div>
          </div>

          <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-950 dark:bg-zinc-800 shadow-xl shadow-zinc-950/10">
            <video
              v-if="!videoFailed"
              :key="activeDorm.id"
              :src="activeDorm.video"
              :poster="activeDorm.poster"
              class="mx-auto block aspect-[9/16] max-h-[48rem] w-full max-w-[27rem] bg-black dark:bg-zinc-900 object-contain"
              controls
              playsinline
              preload="metadata"
              @error="videoFailed = true"
            >
              当前浏览器不支持播放这段宿舍实拍视频。
            </video>
            <div
              v-else
              class="grid min-h-80 place-items-center px-6 py-12 text-center text-white"
            >
              <div>
                <UIcon
                  name="i-lucide-circle-alert"
                  class="mx-auto size-8 text-amber-300"
                />
                <p class="mt-4 font-semibold">
                  视频暂时没有加载成功
                </p>
                <UButton
                  :to="activeDorm.video"
                  external
                  target="_blank"
                  rel="noopener noreferrer"
                  label="单独打开"
                  color="neutral"
                  class="mt-5"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <p class="border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs text-zinc-500 dark:text-zinc-400">
        实拍非官方样板 · 床位与设施以实际分配为准
      </p>
    </main>
  </div>
</template>
