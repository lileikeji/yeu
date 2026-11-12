<script setup lang="ts">
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const { isAuthenticated } = useUserSession()
const { sharePage } = useShareActions()
const { mode: activeHomeMode, setMode: setHomeMode } = useHomeMode()
const { isDark: isSiteDark } = useThemeMode()

type NavigationKey = 'home' | 'map' | 'procedures' | 'life' | 'campus' | 'me'

interface NavigationItem {
  key: NavigationKey
  label: string
  to: string
  icon: string
}

const desktopNavigation: NavigationItem[] = [
  { key: 'home', label: '首页', to: '/', icon: 'i-lucide-house' },
  { key: 'map', label: '地图', to: '/map', icon: 'i-lucide-map' },
  { key: 'procedures', label: '办事', to: '/procedures', icon: 'i-lucide-list-checks' },
  { key: 'life', label: '生活', to: '/guides', icon: 'i-lucide-notebook-tabs' },
  { key: 'campus', label: '校园', to: '/campus', icon: 'i-lucide-school' },
  { key: 'me', label: '我的', to: '/me', icon: 'i-lucide-user-round' }
]
const mobileNavigation: NavigationItem[] = [
  { key: 'home', label: '首页', to: '/', icon: 'i-lucide-house' },
  { key: 'map', label: '地图', to: '/map', icon: 'i-lucide-map' },
  { key: 'procedures', label: '办事', to: '/procedures', icon: 'i-lucide-list-checks' },
  { key: 'life', label: '生活', to: '/guides', icon: 'i-lucide-notebook-tabs' },
  { key: 'me', label: '我的', to: '/me', icon: 'i-lucide-user-round' }
]

// 页面族 → 一级项的前缀表。匹配规则：path === prefix 或 path 以 `${prefix}/` 开头，
// 所以 /me 不会吞掉 /mex；`/` 只命中首页。13 个页面族（checklist、clubs、transport、
// campus、dorms、nearby、search、me、panorama、student-rules、sources、feedback、
// guides）全部在此表内，进入后底栏一定有 aria-current="page"。
const navigationSections: Array<{ prefix: string, key: NavigationKey }> = [
  { prefix: '/', key: 'home' },
  { prefix: '/checklist', key: 'procedures' },
  { prefix: '/procedures', key: 'procedures' },
  { prefix: '/departments', key: 'procedures' },
  { prefix: '/guides', key: 'life' },
  { prefix: '/clubs', key: 'life' },
  { prefix: '/dorms', key: 'life' },
  { prefix: '/transport', key: 'life' },
  { prefix: '/campus', key: 'campus' },
  { prefix: '/hot', key: 'campus' },
  { prefix: '/student-rules', key: 'campus' },
  { prefix: '/map', key: 'map' },
  { prefix: '/nearby', key: 'map' },
  { prefix: '/panorama', key: 'map' },
  { prefix: '/search', key: 'map' },
  { prefix: '/me', key: 'me' },
  { prefix: '/feedback', key: 'me' },
  { prefix: '/sources', key: 'me' }
]

// 窄屏 5 项没有「校园」，校园页族回落到「生活」，避免底栏全灭。
const sectionFallbacks: Partial<Record<NavigationKey, NavigationKey>> = {
  campus: 'life'
}

function matchesSectionPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function sectionKeyForPath(rawPath: string): NavigationKey | null {
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath
  const match = navigationSections.find(section => matchesSectionPath(path, section.prefix))
  return match?.key ?? null
}

function resolveActiveKey(items: NavigationItem[]): NavigationKey | null {
  const key = sectionKeyForPath(route.path)
  if (!key) return null
  if (items.some(item => item.key === key)) return key
  const fallback = sectionFallbacks[key]
  return fallback && items.some(item => item.key === fallback) ? fallback : null
}

const activeDesktopKey = computed(() => resolveActiveKey(desktopNavigation))
const activeMobileKey = computed(() => resolveActiveKey(mobileNavigation))
const icpNumber = computed(() => String(runtimeConfig.public.icpNumber || '').trim())
const isHomePage = computed(() => route.path === '/')
const isMapPage = computed(() => route.path === '/map' || route.path.startsWith('/map/'))
const isSearchPage = computed(() => route.path === '/search' || route.path.startsWith('/search/'))
const useCompactPageDensity = computed(() => !isHomePage.value && !isMapPage.value)

function shareCurrentPage(): void {
  void sharePage()
}
</script>

<template>
  <div class="min-h-dvh bg-white dark:bg-zinc-900">
    <a
      href="#main-content"
      class="fixed left-3 top-3 z-50 inline-flex min-h-11 -translate-y-20 items-center rounded-md bg-white dark:bg-zinc-900 px-4 text-sm font-semibold text-green-800 dark:text-green-300 shadow-lg focus:translate-y-0"
    >跳至主要内容</a>
    <a
      href="/__yeu_crawl_trap__"
      aria-hidden="true"
      tabindex="-1"
      rel="nofollow noindex"
      class="pointer-events-none fixed -left-[9999px] -top-[9999px] size-px overflow-hidden opacity-0"
    >site index</a>
    <header class="sticky top-0 z-40 border-b border-[var(--line)] bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
      <div class="page-shell relative flex min-h-16 flex-wrap items-center justify-between gap-2 py-2 md:h-[4.5rem] md:flex-nowrap md:gap-6 md:py-0">
        <NuxtLink
          to="/"
          class="flex min-h-11 min-w-0 flex-none items-center gap-2"
          aria-label="迎新指南首页"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-transparent p-0">
              <img
                :src="isSiteDark ? '/images/brand/system-logo-mark.png' : '/images/brand/system-logo-mark-light.png'"
                alt=""
                aria-hidden="true"
                class="size-full object-contain"
                decoding="async"
              >
            </span>
            <span class="hidden truncate text-base font-bold text-zinc-950 dark:text-zinc-100 sm:inline">迎新指南</span>
            <span class="hidden shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:inline">学生整理 · 非官方</span>
          </span>
        </NuxtLink>

        <nav
          class="hidden items-center gap-2 md:mr-auto md:ml-4 md:flex lg:gap-4"
          aria-label="主导航"
        >
          <UButton
            v-for="item in desktopNavigation"
            :key="item.to"
            :to="item.to"
            color="neutral"
            variant="ghost"
            :aria-current="activeDesktopKey === item.key ? 'page' : undefined"
            :class="activeDesktopKey === item.key ? 'rounded-none border-b-2 border-green-700 text-sm font-bold text-green-700 dark:text-green-400' : 'rounded-none border-b-2 border-transparent text-sm text-zinc-700 dark:text-zinc-200'"
          >
            {{ item.label }}
          </UButton>
        </nav>

        <!-- 窄屏两行：品牌 + 右侧按钮占第一行，首页「完整/简洁」切换落第二行整宽，
             避免绝对居中时压住右侧按钮（360px 实测重叠 34px）。
             md 断点仍保留原来的 static/z-auto/translate 复位类，布局契约不变。 -->
        <div
          v-if="isHomePage"
          class="order-3 grid w-full grid-cols-2 rounded-md bg-zinc-100 dark:bg-zinc-800 p-0.5 md:order-none md:static md:z-auto md:ml-auto md:shrink-0 md:translate-x-0 md:translate-y-0 md:w-auto"
          aria-label="首页显示模式"
        >
          <button
            type="button"
            class="inline-flex min-h-8 min-w-10 items-center justify-center rounded px-2 text-[11px] font-semibold transition sm:min-w-12 sm:px-2.5"
            :class="activeHomeMode === 'full' ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100'"
            :aria-pressed="activeHomeMode === 'full'"
            @click="setHomeMode('full')"
          >
            完整
          </button>
          <button
            type="button"
            class="inline-flex min-h-8 min-w-10 items-center justify-center rounded px-2 text-[11px] font-semibold transition sm:min-w-12 sm:px-2.5"
            :class="activeHomeMode === 'compact' ? 'bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400 dark:text-green-400 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100'"
            :aria-pressed="activeHomeMode === 'compact'"
            @click="setHomeMode('compact')"
          >
            简洁
          </button>
        </div>

        <div class="relative z-20 flex shrink-0 items-center gap-0 md:gap-1">
          <UButton
            v-if="!isAuthenticated"
            to="/login"
            icon="i-lucide-user-round"
            color="primary"
            variant="ghost"
            aria-label="登录"
            class="justify-center min-h-10 min-w-10 md:min-h-11 md:min-w-11"
          >
            <span class="hidden sm:inline">登录</span>
          </UButton>
          <UButton
            v-else
            to="/me"
            icon="i-lucide-user-round"
            color="neutral"
            variant="ghost"
            aria-label="个人中心"
            class="justify-center min-h-10 min-w-10 md:min-h-11 md:min-w-11"
          />
          <ThemeModeToggle />
          <PublicNoticeCenter />
          <UButton
            to="/contact"
            icon="i-lucide-phone"
            color="primary"
            variant="ghost"
            aria-label="联系我们"
            class="justify-center hidden min-h-10 min-w-10 sm:inline-flex md:min-h-11 md:min-w-11"
          >
            <span class="hidden lg:inline">联系我们</span>
          </UButton>
          <UButton
            to="/search?mode=ai"
            icon="i-lucide-search"
            color="neutral"
            variant="ghost"
            aria-label="搜索"
            class="justify-center min-h-10 min-w-10 md:min-h-11 md:min-w-11"
          />
          <UButton
            icon="i-lucide-share-2"
            color="neutral"
            variant="ghost"
            aria-label="分享当前页面"
            class="justify-center hidden min-h-11 min-w-11 sm:inline-flex"
            @click="shareCurrentPage"
          />
        </div>
      </div>
    </header>

    <main
      id="main-content"
      :class="[
        isMapPage
          ? 'map-page min-h-0 overflow-hidden overscroll-none'
          : 'safe-bottom min-h-[calc(100dvh-var(--header-height))]',
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
      class="border-t border-[var(--line)] bg-white dark:bg-zinc-900 pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] md:pb-0"
    >
      <div class="page-shell flex flex-col gap-4 py-6 text-xs text-zinc-500 dark:text-zinc-400 md:flex-row md:items-center md:justify-between md:gap-6">
        <div class="space-y-2">
          <p>本网站为个人整理，非学校官方发布；重要事项以学校最新通知为准。</p>
          <a
            v-if="icpNumber"
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-7 items-center font-medium hover:text-green-700 dark:hover:text-green-400"
          >{{ icpNumber }}</a>
          <a
            v-else
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-7 items-center hover:text-green-700 dark:hover:text-green-400"
          >工信部备案查询</a>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
          <NuxtLink
            to="/about"
            class="hover:text-green-700 dark:hover:text-green-400"
          >关于本站</NuxtLink>
          <NuxtLink
            to="/feedback"
            class="hover:text-green-700 dark:hover:text-green-400"
          >反馈纠错</NuxtLink>
          <NuxtLink
            to="/contact"
            class="font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
          >联系我们</NuxtLink>
          <NuxtLink
            to="/privacy"
            class="hover:text-green-700 dark:hover:text-green-400"
          >隐私说明</NuxtLink>
          <NuxtLink
            to="/sources"
            class="hover:text-green-700 dark:hover:text-green-400"
          >信息来源</NuxtLink>
        </div>
      </div>
    </footer>

    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-white/95 dark:bg-zinc-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="移动端主导航"
    >
      <div class="grid h-[var(--mobile-nav-height)] grid-cols-5">
        <NuxtLink
          v-for="item in mobileNavigation"
          :key="item.to"
          :to="item.to"
          class="flex min-w-0 flex-col items-center justify-center gap-1 text-xs"
          :class="activeMobileKey === item.key ? 'text-green-700 dark:text-green-400' : 'text-zinc-500 dark:text-zinc-400'"
          :aria-current="activeMobileKey === item.key ? 'page' : undefined"
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
