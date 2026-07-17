<script setup lang="ts">
import {
  adminNavigationGroups,
  adminNavigationItems
} from '~~/app/utils/admin-dashboard-presentation'

const route = useRoute()
const navigationGroups = adminNavigationGroups
const navigation = adminNavigationItems

const authState = ref<'checking' | 'authenticated' | 'error'>('checking')
const authError = ref('')
const adminLabel = ref('管理员')
const mobileNavigationOpen = ref(false)
const mobileNavigationDialog = ref<HTMLDialogElement | null>(null)
const mobileNavigationButton = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const loggingOut = ref(false)

useSeoMeta({
  robots: 'noindex, nofollow'
})

const currentTitle = computed(() => {
  const exact = navigation.find(item => item.to === route.path)
  if (exact) return exact.label
  return navigation.find(item => item.to !== '/admin' && route.path.startsWith(item.to))?.label ?? '管理后台'
})

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function statusCode(error: unknown): number | null {
  if (!isObject(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  if (isObject(error.response) && typeof error.response.status === 'number') return error.response.status
  return null
}

function sessionUser(payload: Record<string, unknown>): Record<string, unknown> | null {
  if (isObject(payload.user)) return payload.user
  if (isObject(payload.admin)) return payload.admin
  if (isObject(payload.session) && isObject(payload.session.user)) return payload.session.user
  return null
}

function isAuthenticated(payload: unknown): payload is Record<string, unknown> {
  if (!isObject(payload)) return false
  if (payload.authenticated === true || payload.isAuthenticated === true || payload.loggedIn === true) return true
  if (payload.authenticated === false || payload.isAuthenticated === false || payload.loggedIn === false) return false
  return sessionUser(payload) !== null
}

function resolveAdminLabel(payload: Record<string, unknown>): string {
  const user = sessionUser(payload)
  if (!user) return '管理员'

  for (const key of ['displayName', 'name', 'username', 'email']) {
    if (typeof user[key] === 'string' && user[key].trim()) return user[key]
  }

  return '管理员'
}

async function redirectToLogin(): Promise<void> {
  await navigateTo({
    path: '/admin/login',
    query: { redirect: route.fullPath }
  }, { replace: true })
}

async function checkSession(): Promise<void> {
  authState.value = 'checking'
  authError.value = ''

  try {
    const payload = await adminFetch<unknown>('/api/admin/auth/session')

    if (!isAuthenticated(payload)) {
      await redirectToLogin()
      return
    }

    adminLabel.value = resolveAdminLabel(payload)
    authState.value = 'authenticated'
  } catch (error) {
    const code = statusCode(error)
    if (code === 401 || code === 403) {
      await redirectToLogin()
      return
    }

    authError.value = '无法验证管理会话，请检查网络或服务状态。'
    authState.value = 'error'
  }
}

async function logout(): Promise<void> {
  loggingOut.value = true

  try {
    await adminFetch('/api/admin/auth/logout', {
      method: 'POST'
    })
  } catch {
    // Redirect even when the session has already expired server-side.
  } finally {
    loggingOut.value = false
    await navigateTo('/admin/login', { replace: true })
  }
}

function isActive(to: string): boolean {
  return to === '/admin' ? route.path === '/admin' : route.path.startsWith(to)
}

function openMobileNavigation(): void {
  mobileNavigationOpen.value = true
}

function closeMobileNavigation(): void {
  mobileNavigationOpen.value = false
}

function handleMobileDialogClosed(): void {
  mobileNavigationOpen.value = false
  void nextTick(() => {
    const button = mobileNavigationButton.value
    if (button instanceof HTMLElement) button.focus()
    else button?.$el?.focus()
  })
}

watch(mobileNavigationOpen, async (open) => {
  await nextTick()
  const dialog = mobileNavigationDialog.value
  if (!dialog) return

  if (open && !dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  } else if (!open && dialog.open) {
    dialog.close()
  }
})

watch(() => route.path, () => {
  closeMobileNavigation()
})

onMounted(() => {
  void checkSession()
})
</script>

<template>
  <div class="min-h-screen bg-[#f6f7f5] text-zinc-900">
    <div
      v-if="authState === 'checking'"
      class="grid min-h-screen place-items-center p-6"
      role="status"
      aria-live="polite"
    >
      <div class="text-center">
        <UIcon
          name="i-lucide-loader-circle"
          class="mx-auto size-7 animate-spin text-green-700"
        />
        <p class="mt-3 text-sm font-medium text-zinc-600">
          正在验证管理会话
        </p>
      </div>
    </div>

    <div
      v-else-if="authState === 'error'"
      class="grid min-h-screen place-items-center p-6"
    >
      <div class="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 text-center">
        <UIcon
          name="i-lucide-shield-alert"
          class="mx-auto size-7 text-orange-700"
        />
        <h1 class="mt-3 text-lg font-bold text-zinc-950">
          会话验证失败
        </h1>
        <p class="mt-2 text-sm leading-6 text-zinc-500">
          {{ authError }}
        </p>
        <div class="mt-5 flex justify-center gap-2">
          <UButton
            to="/"
            label="返回前台"
            color="neutral"
            variant="outline"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            label="重新验证"
            @click="checkSession"
          />
        </div>
      </div>
    </div>

    <template v-else>
      <aside class="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-zinc-800 bg-zinc-950 text-white lg:flex lg:flex-col">
        <div class="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-600 text-xs font-bold">YEU</span>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">
              新生指南后台
            </p>
            <p class="truncate text-xs text-zinc-400">
              单管理员模式
            </p>
          </div>
        </div>

        <nav
          class="flex-1 space-y-4 overflow-y-auto p-3"
          aria-label="管理后台导航"
        >
          <div
            v-for="group in navigationGroups"
            :key="group.key"
            class="space-y-1"
          >
            <p
              v-if="group.key !== 'overview'"
              class="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500"
            >
              {{ group.label }}
            </p>
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
              :class="isActive(item.to) ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-white/10 hover:text-white'"
              :aria-current="isActive(item.to) ? 'page' : undefined"
            >
              <UIcon
                :name="item.icon"
                class="size-4 shrink-0"
              />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </nav>

        <div class="border-t border-white/10 p-3">
          <div class="flex items-center gap-3 px-2 py-2">
            <span class="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-zinc-200">
              <UIcon
                name="i-lucide-user-round"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-white">
                {{ adminLabel }}
              </p>
              <p class="text-xs text-zinc-500">
                已登录
              </p>
            </div>
            <UTooltip text="退出登录">
              <UButton
                icon="i-lucide-log-out"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="loggingOut"
                aria-label="退出登录"
                @click="logout"
              />
            </UTooltip>
          </div>
        </div>
      </aside>

      <div class="lg:pl-60">
        <header class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur sm:px-5 lg:px-6">
          <UButton
            ref="mobileNavigationButton"
            icon="i-lucide-menu"
            color="neutral"
            variant="ghost"
            aria-label="打开管理导航"
            class="lg:hidden"
            @click="openMobileNavigation"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-zinc-900">
              {{ currentTitle }}
            </p>
          </div>
          <UButton
            to="/"
            icon="i-lucide-external-link"
            label="查看前台"
            color="neutral"
            variant="ghost"
            class="hidden sm:inline-flex"
          />
          <UTooltip text="退出登录">
            <UButton
              icon="i-lucide-log-out"
              color="neutral"
              variant="ghost"
              :loading="loggingOut"
              aria-label="退出登录"
              class="lg:hidden"
              @click="logout"
            />
          </UTooltip>
        </header>

        <main class="p-4 sm:p-5 lg:p-6">
          <slot />
        </main>
      </div>

      <dialog
        ref="mobileNavigationDialog"
        class="fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-black/40 lg:hidden"
        aria-label="管理后台导航"
        @cancel="closeMobileNavigation"
        @close="handleMobileDialogClosed"
        @click.self="closeMobileNavigation"
        @keydown.esc.prevent.stop="closeMobileNavigation"
      >
        <aside class="absolute inset-y-0 left-0 flex w-[min(19rem,88vw)] flex-col border-r border-zinc-200 bg-white shadow-xl">
          <div class="flex h-16 items-center justify-between border-b border-zinc-200 px-4">
            <div class="flex items-center gap-3">
              <span class="grid size-8 place-items-center rounded-md bg-green-700 text-xs font-bold text-white">YEU</span>
              <span class="text-sm font-semibold text-zinc-950">内容管理</span>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              aria-label="关闭管理导航"
              @click="closeMobileNavigation"
            />
          </div>
          <nav
            class="flex-1 space-y-4 overflow-y-auto p-3"
            aria-label="移动端管理导航"
          >
            <div
              v-for="group in navigationGroups"
              :key="group.key"
              class="space-y-1"
            >
              <p
                v-if="group.key !== 'overview'"
                class="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
              >
                {{ group.label }}
              </p>
              <NuxtLink
                v-for="item in group.items"
                :key="item.to"
                :to="item.to"
                class="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm"
                :class="isActive(item.to) ? 'bg-green-50 font-medium text-green-800' : 'text-zinc-600'"
                :aria-current="isActive(item.to) ? 'page' : undefined"
              >
                <UIcon
                  :name="item.icon"
                  class="size-4"
                />
                {{ item.label }}
              </NuxtLink>
            </div>
          </nav>
          <div class="border-t border-zinc-200 p-3">
            <UButton
              icon="i-lucide-log-out"
              label="退出登录"
              color="neutral"
              variant="ghost"
              block
              :loading="loggingOut"
              @click="logout"
            />
          </div>
        </aside>
      </dialog>
    </template>
  </div>
</template>
