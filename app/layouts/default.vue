<script setup lang="ts">
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const { sharePage } = useShareActions()

const desktopNavigation = [
  { label: '首页', to: '/', icon: 'i-lucide-house' },
  { label: '地图', to: '/map', icon: 'i-lucide-map' },
  { label: '办事', to: '/procedures', icon: 'i-lucide-list-checks' },
  { label: '新生专题', to: '/guides', icon: 'i-lucide-notebook-tabs' },
  { label: '服务导航', to: '/discover', icon: 'i-lucide-layout-grid' }
]
const mobileNavigation = [
  { label: '首页', to: '/', icon: 'i-lucide-house' },
  { label: '地图', to: '/map', icon: 'i-lucide-map' },
  { label: '办事', to: '/procedures', icon: 'i-lucide-list-checks' },
  { label: '服务', to: '/discover', icon: 'i-lucide-layout-grid' }
]
const icpNumber = computed(() => String(runtimeConfig.public.icpNumber || '').trim())
const isHomePage = computed(() => route.path === '/')
const isMapPage = computed(() => route.path === '/map' || route.path.startsWith('/map/'))
const isSearchPage = computed(() => route.path === '/search' || route.path.startsWith('/search/'))
const useCompactPageDensity = computed(() => !isHomePage.value && !isMapPage.value)

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

function shareCurrentPage(): void {
  void sharePage()
}

</script>

<template>
  <div class="min-h-screen bg-white">
    <a
      href="#main-content"
      class="fixed left-3 top-3 z-50 inline-flex min-h-11 -translate-y-20 items-center rounded-md bg-white px-4 text-sm font-semibold text-green-800 shadow-lg focus:translate-y-0"
    >跳至主要内容</a>
    <header class="sticky top-0 z-40 border-b border-[var(--line)] bg-white/95 backdrop-blur">
      <div class="page-shell flex h-16 items-center justify-between gap-2 md:h-[4.5rem] md:gap-6">
        <NuxtLink
          to="/"
          class="flex min-h-11 min-w-0 flex-1 items-center gap-2 md:flex-none"
          aria-label="迎新指南首页"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-700 text-white">
              <UIcon
                name="i-lucide-compass"
                class="size-5"
                aria-hidden="true"
              />
            </span>
            <span class="truncate text-base font-bold text-zinc-950">迎新指南</span>
            <span class="hidden shrink-0 text-[11px] font-medium text-zinc-500 sm:inline">学生整理 · 非官方</span>
          </span>
        </NuxtLink>

        <nav
          class="hidden items-center gap-2 md:flex lg:gap-4"
          aria-label="主导航"
        >
          <UButton
            v-for="item in desktopNavigation"
            :key="item.to"
            :to="item.to"
            color="neutral"
            variant="ghost"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            :class="isActive(item.to) ? 'rounded-none border-b-2 border-green-700 text-sm font-bold text-green-700' : 'rounded-none border-b-2 border-transparent text-sm text-zinc-700'"
          >
            {{ item.label }}
          </UButton>
        </nav>

        <div class="flex shrink-0 items-center gap-0 md:gap-1">
          <PublicNoticeCenter />
          <UButton
            to="/contact"
            icon="i-lucide-phone"
            color="primary"
            variant="ghost"
            aria-label="联系我们"
            class="min-h-10 min-w-10 md:min-h-11 md:min-w-11"
          >
            <span class="hidden lg:inline">联系我们</span>
          </UButton>
          <UButton
            to="/search?mode=ai"
            icon="i-lucide-search"
            color="neutral"
            variant="ghost"
            aria-label="AI 搜索与站内搜索"
            class="min-h-10 min-w-10 md:min-h-11 md:min-w-11"
          />
          <UButton
            icon="i-lucide-share-2"
            color="neutral"
            variant="ghost"
            aria-label="分享当前页面"
            class="hidden min-h-11 min-w-11 sm:inline-flex"
            @click="shareCurrentPage"
          />
        </div>
      </div>
    </header>

    <main
      id="main-content"
      :class="[
        isMapPage
          ? 'min-h-0 overflow-hidden'
          : 'safe-bottom min-h-[calc(100vh-var(--header-height))]',
        useCompactPageDensity ? 'compact-page-density' : ''
      ]"
      tabindex="-1"
    >
      <slot />
    </main>

    <PublicPageViewStats v-if="!isMapPage && !isSearchPage" />

    <PwaUpdatePrompt />

    <footer
      v-if="!isMapPage"
      class="border-t border-[var(--line)] bg-white pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] md:pb-0"
    >
      <div class="page-shell flex flex-col gap-4 py-6 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between md:gap-6">
        <div class="space-y-2">
          <p>本网站为个人整理，非学校官方发布；重要事项以学校最新通知为准。</p>
          <a
            v-if="icpNumber"
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-7 items-center font-medium hover:text-green-700"
          >{{ icpNumber }}</a>
          <a
            v-else
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-7 items-center hover:text-green-700"
          >工信部备案查询</a>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
          <NuxtLink
            to="/about"
            class="hover:text-green-700"
          >关于本站</NuxtLink>
          <NuxtLink
            to="/feedback"
            class="hover:text-green-700"
          >反馈纠错</NuxtLink>
          <NuxtLink
            to="/contact"
            class="font-semibold text-green-700 hover:text-green-800"
          >联系我们</NuxtLink>
          <NuxtLink
            to="/privacy"
            class="hover:text-green-700"
          >隐私说明</NuxtLink>
          <NuxtLink
            to="/sources"
            class="hover:text-green-700"
          >信息从哪里来</NuxtLink>
        </div>
      </div>
    </footer>

    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="移动端主导航"
    >
      <div class="grid h-[var(--mobile-nav-height)] grid-cols-4">
        <NuxtLink
          v-for="item in mobileNavigation"
          :key="item.to"
          :to="item.to"
          class="flex min-w-0 flex-col items-center justify-center gap-1 text-xs"
          :class="isActive(item.to) ? 'text-green-700' : 'text-zinc-500'"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          <UIcon
            :name="item.icon"
            class="size-5"
          />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>
