<script setup lang="ts">
const route = useRoute()
const { sharePage } = useShareActions()
const { user, isAuthenticated, refreshSession } = useUserSession()

const navigation = [
  { label: '首页', to: '/', icon: 'i-lucide-house' },
  { label: '地图', to: '/map', icon: 'i-lucide-map' },
  { label: '办事', to: '/procedures', icon: 'i-lucide-list-checks' },
  { label: '更多', to: '/discover', icon: 'i-lucide-layout-grid' }
]

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
  <div class="min-h-screen bg-[var(--page-bg)]">
    <a
      href="#main-content"
      class="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-white px-4 py-2 text-sm font-semibold text-green-800 shadow-lg focus:translate-y-0"
    >跳至主要内容</a>
    <header class="sticky top-0 z-40 border-b border-[var(--line)] bg-white/95 backdrop-blur">
      <div class="page-shell flex h-16 items-center justify-between gap-2 md:gap-6">
        <NuxtLink
          to="/"
          class="flex min-h-11 min-w-0 flex-1 items-center gap-2 sm:gap-3 md:flex-none"
          aria-label="仰恩新生指南首页"
        >
          <img
            src="/icons/site-logo.png"
            alt=""
            aria-hidden="true"
            width="325"
            height="72"
            class="h-9 w-auto max-w-[9.5rem] shrink-0 object-contain object-left sm:max-w-none"
          >
        </NuxtLink>

        <nav
          class="hidden items-center gap-1 md:flex"
          aria-label="主导航"
        >
          <UButton
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            :icon="item.icon"
            :color="isActive(item.to) ? 'primary' : 'neutral'"
            :variant="isActive(item.to) ? 'soft' : 'ghost'"
            :aria-current="isActive(item.to) ? 'page' : undefined"
          >
            {{ item.label }}
          </UButton>
        </nav>

        <div class="flex shrink-0 items-center gap-0 sm:gap-1">
          <UButton
            to="/search"
            icon="i-lucide-search"
            color="neutral"
            variant="ghost"
            aria-label="全站搜索"
            class="min-h-11 min-w-11"
          />
          <UButton
            icon="i-lucide-share-2"
            color="neutral"
            variant="ghost"
            aria-label="分享当前页面"
            class="min-h-11 min-w-11"
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
              class="min-h-11 min-w-11"
            >
              <span class="hidden max-w-[5.5rem] truncate sm:inline">{{ user?.displayName || '我的' }}</span>
            </UButton>
          </template>
          <UButton
            v-else
            to="/login"
            icon="i-lucide-log-in"
            color="neutral"
            variant="ghost"
            aria-label="账号登录"
            class="min-h-11 min-w-11"
          >
            <span class="hidden sm:inline">登录</span>
          </UButton>
        </div>
      </div>
    </header>

    <main
      id="main-content"
      class="safe-bottom min-h-[calc(100vh-4rem)]"
      tabindex="-1"
    >
      <slot />
    </main>

    <PwaUpdatePrompt />

    <footer class="hidden border-t border-[var(--line)] bg-white md:block">
      <div class="page-shell flex items-center justify-between gap-6 py-6 text-xs text-zinc-500">
        <p>学生团队维护的非官方指南，重要事项以学校最新通知为准。</p>
        <div class="flex items-center gap-4">
          <NuxtLink
            to="/about"
            class="hover:text-green-700"
          >关于本站</NuxtLink>
          <NuxtLink
            to="/feedback"
            class="hover:text-green-700"
          >反馈纠错</NuxtLink>
          <NuxtLink
            to="/privacy"
            class="hover:text-green-700"
          >隐私说明</NuxtLink>
          <NuxtLink
            to="/sources"
            class="hover:text-green-700"
          >来源说明</NuxtLink>
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
          v-for="item in navigation"
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
