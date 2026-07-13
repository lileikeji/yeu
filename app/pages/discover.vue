<script setup lang="ts">
useSeoMeta({
  title: '更多服务',
  description: '按新生当前要做的事，快速进入仰恩校园地图、报到、指南、部门、社团与周边目录。'
})

const taskEntries = [
  {
    title: '新生报到',
    description: '核对2026级日期、待通知材料与安全提醒',
    to: '/procedures/arrival',
    icon: 'i-lucide-clipboard-check',
    tone: 'bg-green-50 text-green-700'
  },
  {
    title: '找宿舍 / 教学楼',
    description: '先查地点目录和坐标状态，未核验点不导航',
    to: '/guides/find-campus',
    icon: 'i-lucide-map-pinned',
    tone: 'bg-blue-50 text-blue-700'
  },
  {
    title: '校园卡与网络',
    description: '查看校园网、VPN与图书馆借阅权限资料',
    to: '/guides/campus-card-network',
    icon: 'i-lucide-wifi',
    tone: 'bg-cyan-50 text-cyan-700'
  },
  {
    title: '快递 / 外卖',
    description: '查看站点、取餐点和配送边界的当前核验状态',
    to: '/map?category=express',
    icon: 'i-lucide-package-open',
    tone: 'bg-orange-50 text-orange-700'
  },
  {
    title: '周边商铺',
    description: '只展示达到位置与营业状态发布标准的地点',
    to: '/nearby',
    icon: 'i-lucide-store',
    tone: 'bg-amber-50 text-amber-700'
  },
  {
    title: '社团与招新',
    description: '查看近期活动可核验社团，当年招新以新通知为准',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    tone: 'bg-violet-50 text-violet-700'
  }
]

const directoryEntries = [
  { title: '校园地图', description: '搜索地点、筛选类别、查看坐标核验状态', to: '/map', icon: 'i-lucide-map' },
  { title: '全部指南', description: '按入学、校园、生活与社团浏览', to: '/guides', icon: 'i-lucide-notebook-tabs' },
  { title: '校园概览', description: '学校简介、常用入口与当前公告', to: '/campus', icon: 'i-lucide-school' },
  { title: '校内部门', description: '按办理事项查找职责、官网与公开联系方式', to: '/departments', icon: 'i-lucide-landmark' },
  { title: '学生社团', description: '搜索已发布社团资料与招新状态', to: '/clubs', icon: 'i-lucide-users-round' },
  { title: '全站搜索', description: '同时搜索指南、地点、部门和社团', to: '/search', icon: 'i-lucide-search' }
]

const trustEntries = [
  { title: '来源说明', description: '资料分级、核验方法与已发布引用', to: '/sources', icon: 'i-lucide-list-checks' },
  { title: '反馈纠错', description: '提交位置错误、过期内容或可靠来源', to: '/feedback', icon: 'i-lucide-message-square-warning' },
  { title: '隐私说明', description: '定位、反馈、缓存与数据删除边界', to: '/privacy', icon: 'i-lucide-shield-check' },
  { title: '关于项目', description: '维护主体、非官方声明与服务边界', to: '/about', icon: 'i-lucide-info' },
  { title: '离线状态', description: '网络不可用时的缓存边界和重试入口', to: '/offline', icon: 'i-lucide-cloud-off' }
]
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              功能目录
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
              你现在要找什么
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              从具体任务直接进入，或按地图、指南、部门和社团浏览。
            </p>
          </div>
          <UButton
            to="/search"
            icon="i-lucide-search"
            label="搜索全站"
            size="lg"
            class="min-h-11 self-start sm:self-auto"
          />
        </div>
      </div>
    </header>

    <div>
      <section class="page-shell py-8 md:py-10">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="section-kicker">
              新生任务
            </p>
            <h2 class="mt-1 text-xl font-bold text-zinc-950">
              按当前事项进入
            </h2>
          </div>
          <UButton
            to="/map"
            icon="i-lucide-map"
            label="地图"
            color="neutral"
            variant="ghost"
          />
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="entry in taskEntries"
            :key="entry.to"
            :to="entry.to"
            class="surface-panel group flex min-h-40 items-start gap-4 p-4 transition hover:border-green-300 hover:shadow-sm"
          >
            <span
              class="grid size-10 shrink-0 place-items-center rounded-md"
              :class="entry.tone"
            >
              <UIcon
                :name="entry.icon"
                class="size-5"
              />
            </span>
            <span class="flex min-w-0 flex-1 flex-col self-stretch">
              <span class="font-bold text-zinc-950">{{ entry.title }}</span>
              <span class="mt-2 flex-1 text-sm leading-6 text-zinc-600">{{ entry.description }}</span>
              <span class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                查看
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5 transition group-hover:translate-x-0.5"
                />
              </span>
            </span>
          </NuxtLink>
        </div>
      </section>

      <section class="border-y border-[var(--line)] bg-white">
        <div class="page-shell py-8 md:py-10">
          <p class="section-kicker">
            内容目录
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            按类别浏览
          </h2>

          <div class="mt-5 grid gap-x-8 md:grid-cols-2">
            <NuxtLink
              v-for="entry in directoryEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-24 items-center gap-4 border-b border-zinc-200 py-4"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-green-50 group-hover:text-green-700">
                <UIcon
                  :name="entry.icon"
                  class="size-5"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-zinc-950">{{ entry.title }}</span>
                <span class="mt-1 block text-xs leading-5 text-zinc-500">{{ entry.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-zinc-300 group-hover:text-green-700"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          说明与共建
        </p>
        <h2 class="mt-1 text-xl font-bold text-zinc-950">
          查看信息边界或提交纠错
        </h2>

        <div class="mt-5 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="entry in trustEntries"
            :key="entry.to"
            :to="entry.to"
            class="group flex min-h-28 gap-3 border-t border-zinc-200 py-4"
          >
            <UIcon
              :name="entry.icon"
              class="mt-0.5 size-5 shrink-0 text-green-700"
            />
            <span class="min-w-0">
              <span class="block text-sm font-bold text-zinc-950 group-hover:text-green-700">{{ entry.title }}</span>
              <span class="mt-1.5 block text-xs leading-5 text-zinc-500">{{ entry.description }}</span>
            </span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
