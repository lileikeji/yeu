<script setup lang="ts">
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const { sharePage } = useShareActions()
const { user, isAuthenticated, refreshSession } = useUserSession()

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
const useCompactPageDensity = computed(() => !isHomePage.value && !isMapPage.value)

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

function shareCurrentPage(): void {
  void sharePage()
}

onMounted(() => {
  void refreshSession()
})
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
          aria-label="仰恩新生指南首页"
        >
          <span class="flex min-w-0 items-center gap-2 md:hidden">
            <img
              src="/icons/yeu-seal.jpg"
              alt=""
              aria-hidden="true"
              width="36"
              height="36"
              class="size-9 shrink-0 rounded-full object-contain"
            >
            <span class="truncate text-base font-bold text-zinc-950">仰恩新生指南</span>
          </span>
          <img
            src="/icons/site-logo.png"
            alt=""
            aria-hidden="true"
            width="325"
            height="72"
            class="hidden h-11 w-auto max-w-[12rem] shrink-0 object-contain object-left md:block"
          >
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
          <template v-if="isAuthenticated">
            <UButton
              to="/chat"
              icon="i-lucide-messages-square"
              color="neutral"
              variant="ghost"
              aria-label="群聊"
              class="hidden min-h-11 min-w-11 sm:inline-flex"
            />
            <UButton
              to="/me"
              icon="i-lucide-user-round"
              color="primary"
              variant="soft"
              :aria-label="user?.displayName || '个人中心'"
              class="min-h-10 min-w-10 md:min-h-11 md:min-w-11"
            >
              <span class="hidden max-w-[5.5rem] truncate sm:inline">{{ user?.displayName || '我的' }}</span>
            </UButton>
          </template>
          <UButton
            v-else
            to="/login"
            icon="i-lucide-user-round"
            color="primary"
            variant="ghost"
            aria-label="账号登录"
            class="min-h-10 min-w-10 md:min-h-11 md:min-w-11"
          >
            <span class="hidden sm:inline">登录</span>
          </UButton>
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

    <PwaUpdatePrompt />

    <footer
      v-if="!isMapPage && !isHomePage"
      class="border-t border-[var(--line)] bg-white pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] md:pb-0"
    >
      <div class="page-shell flex flex-col gap-4 py-6 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between md:gap-6">
        <div class="space-y-2">
          <p>本指南由学生团队整理，重要事项以学校最新通知为准。</p>
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
          <NuxtLink
            to="/login"
            class="hover:text-green-700"
          >账号登录</NuxtLink>
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
