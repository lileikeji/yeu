<script setup lang="ts">
import {
  adminDeviceLoginRequestMessage,
  adminLoginMessages,
  adminLoginRequestMessage,
  isAdminSessionAuthenticated,
  resolveAdminLoginRedirectTarget,
  resolveAdminPostLoginTarget
} from '~~/app/utils/admin-login-presentation'
import {
  forgetAdminDeviceKey,
  hasAdminDeviceKey,
  importAdminDeviceKey,
  signAdminDeviceChallenge,
  type AdminDeviceChallengePayload
} from '~~/app/utils/admin-device-key'

definePageMeta({ layout: false })

const route = useRoute()
const requestUrl = useRequestURL()
const isYeucaHost = computed(() => {
  const clientHost = import.meta.client ? window.location.hostname : ''
  return (clientHost || requestUrl.hostname) === 'yeuca.huiliyill.cn'
})

useSeoMeta({
  title: () => isYeucaHost.value ? '计协主站后台登录｜仰恩大学计算机协会' : '后台登录',
  robots: 'noindex, nofollow'
})

const username = ref('')
const password = ref('')
const passwordVisible = ref(false)
const submitting = ref(false)
const checkingSession = ref(true)
const deviceLoginActive = ref(false)
const deviceImporting = ref(false)
const deviceKeyAvailable = ref(false)
const deviceKeyInput = ref<HTMLInputElement | null>(null)
const errorMessage = ref('')

async function checkExistingSession(): Promise<boolean> {
  checkingSession.value = true

  try {
    const payload = await plainFetch<unknown>('/api/admin/auth/session', {
      credentials: 'include'
    })
    if (isAdminSessionAuthenticated(payload)) {
      const baseRedirect = resolveAdminLoginRedirectTarget(route.query.redirect)
      await navigateTo(
        resolveAdminPostLoginTarget(payload, baseRedirect, isYeucaHost.value ? '/admin/yeuca' : undefined),
        { replace: true }
      )
      return true
    }
  } catch {
    // A missing or expired session is the expected login-page state.
  } finally {
    checkingSession.value = false
  }
  return false
}

async function loginWithDevice(): Promise<void> {
  if (!deviceKeyAvailable.value || deviceLoginActive.value) return
  deviceLoginActive.value = true
  errorMessage.value = ''

  try {
    const challenge = await plainFetch<AdminDeviceChallengePayload>(
      '/api/admin/auth/device/challenge',
      {
        method: 'POST',
        credentials: 'include'
      }
    )
    const proof = await signAdminDeviceChallenge(challenge)
    const payload = await plainFetch<unknown>('/api/admin/auth/device/verify', {
      method: 'POST',
      body: proof,
      credentials: 'include'
    })
    clearNuxtData('admin-session')
    await navigateTo(
      resolveAdminPostLoginTarget(payload, route.query.redirect, isYeucaHost.value ? '/admin/yeuca' : undefined),
      { replace: true }
    )
  } catch (error) {
    errorMessage.value = adminDeviceLoginRequestMessage(error)
  } finally {
    deviceLoginActive.value = false
  }
}

function chooseDeviceKey(): void {
  deviceKeyInput.value?.click()
}

async function importDeviceKey(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  deviceImporting.value = true
  errorMessage.value = ''
  try {
    await importAdminDeviceKey(await file.text())
    deviceKeyAvailable.value = true
    await loginWithDevice()
  } catch {
    errorMessage.value = '设备密钥无效，请选择服务器为本设备生成的密钥文件。'
  } finally {
    deviceImporting.value = false
  }
}

async function forgetDeviceKey(): Promise<void> {
  await forgetAdminDeviceKey()
  deviceKeyAvailable.value = false
  errorMessage.value = ''
}

async function login(): Promise<void> {
  if (!username.value.trim() || !password.value) {
    errorMessage.value = adminLoginMessages.missingCredentials
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    const payload = await plainFetch<unknown>('/api/admin/auth/login', {
      method: 'POST',
      body: {
        username: username.value.trim(),
        password: password.value
      },
      credentials: 'include'
    })
    clearNuxtData('admin-session')
    await navigateTo(
      resolveAdminPostLoginTarget(payload, route.query.redirect, isYeucaHost.value ? '/admin/yeuca' : undefined),
      { replace: true }
    )
  } catch (error) {
    errorMessage.value = adminLoginRequestMessage(error)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (await checkExistingSession()) return
  try {
    deviceKeyAvailable.value = await hasAdminDeviceKey()
  } catch {
    deviceKeyAvailable.value = false
  }
  if (route.query.password !== '1') await loginWithDevice()
})
</script>

<template>
  <div
    class="grid min-h-dvh lg:grid-cols-[minmax(22rem,0.82fr)_minmax(28rem,1fr)]"
    :class="isYeucaHost ? 'bg-[#f6f6f4] dark:bg-zinc-950' : 'bg-[#f5f7f4] dark:bg-zinc-950'"
  >
    <!-- 计协主站专属视觉品牌栏 -->
    <section
      v-if="isYeucaHost"
      class="relative hidden overflow-hidden border-r border-zinc-800 bg-[#121211] px-10 py-11 text-white lg:flex lg:flex-col lg:justify-between"
    >
      <div
        class="pointer-events-none absolute inset-0 opacity-15"
        style="background-image: radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px); background-size: 22px 22px;"
        aria-hidden="true"
      />

      <div class="relative flex items-center gap-3.5">
        <img
          src="/images/yeuca-logo.jpg"
          alt="仰恩大学计算机协会徽标"
          class="size-11 rounded-full border border-white/25 object-cover shadow-md"
        >
        <div>
          <p class="font-bold tracking-tight text-white">
            仰恩大学计算机协会
          </p>
          <p class="font-mono text-xs text-zinc-400">
            管理后台
          </p>
        </div>
      </div>

      <div class="relative max-w-md space-y-6">
        <div>
          <span class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[11px] text-zinc-200">
            <span class="size-1.5 rounded-full bg-zinc-400" />
            yeuca.huiliyill.cn / yx.huiliyill.cn 数据同步
          </span>
          <h1 class="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white">
            维护官网部门、动态、项目与图片素材
          </h1>
        </div>

        <div class="grid gap-2.5 text-xs">
          <div class="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-sm">
            <UIcon
              name="i-lucide-layers"
              class="mt-0.5 size-4 shrink-0 text-zinc-300"
            />
            <div>
              <p class="font-semibold text-zinc-100">
                部门与招新状态
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-sm">
            <UIcon
              name="i-lucide-newspaper"
              class="mt-0.5 size-4 shrink-0 text-zinc-300"
            />
            <div>
              <p class="font-semibold text-zinc-100">
                动态、笔记与 Git 项目联动
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-sm">
            <UIcon
              name="i-lucide-images"
              class="mt-0.5 size-4 shrink-0 text-zinc-300"
            />
            <div>
              <p class="font-semibold text-zinc-100">
                首屏实景图、迎新群码与相册直传
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="relative flex items-center justify-between border-t border-white/10 pt-4 text-xs text-zinc-400">
        <span>1999 年创会 · 仰恩大学洛江校区</span>
        <span class="font-mono text-zinc-500">yeuca.huiliyill.cn</span>
      </div>
    </section>

    <!-- 迎新指南原默认左栏（保持独立互不干扰） -->
    <section
      v-else
      class="hidden border-r border-green-950 bg-green-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between"
    >
      <div class="flex items-center gap-3">
        <span class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-transparent p-0">
          <img
            src="/images/brand/system-logo-mark.png?v=20261126r2"
            alt=""
            aria-hidden="true"
            class="size-9 object-contain"
            decoding="async"
          >
        </span>
        <div>
          <p class="font-semibold">
            迎新指南
          </p>
          <p class="text-xs text-green-200">
            内容管理后台
          </p>
        </div>
      </div>
      <div class="max-w-md">
        <p class="text-sm font-medium text-green-200">
          总管理员与组织管理员共用入口
        </p>
        <h1 class="mt-3 text-3xl font-bold leading-tight">
          维护新生指南与组织公开页面
        </h1>
        <p class="mt-4 text-sm leading-7 text-green-100/80">
          总管理员维护全站内容；社团和部门管理员只会看到自己被授权的页面。
        </p>
      </div>
      <p class="text-xs text-green-200/70">
        非学校官方系统
      </p>
    </section>

    <main class="grid place-items-center p-5 sm:p-8">
      <div class="w-full max-w-md">
        <div class="mb-7 flex items-center gap-3 lg:hidden">
          <img
            v-if="isYeucaHost"
            src="/images/yeuca-logo.jpg"
            alt="仰恩大学计算机协会徽标"
            class="size-10 rounded-full border border-zinc-200 dark:border-zinc-700 object-cover shadow-xs"
          >
          <span
            v-else
            class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-transparent p-0"
          >
            <img
              src="/images/brand/system-logo-mark-light.png?v=20261126r2"
              alt=""
              aria-hidden="true"
              class="size-full object-contain dark:hidden"
              decoding="async"
            >
            <img
              src="/images/brand/system-logo-mark.png?v=20261126r2"
              alt=""
              aria-hidden="true"
              class="hidden size-full object-contain dark:block"
              decoding="async"
            >
          </span>
          <div>
            <p class="font-semibold text-zinc-950 dark:text-zinc-100">
              {{ isYeucaHost ? '仰恩大学计算机协会' : '迎新指南' }}
            </p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ isYeucaHost ? '主站管理后台' : '内容管理后台' }}
            </p>
          </div>
        </div>

        <div
          class="overflow-hidden rounded-xl border bg-[var(--surface)] dark:bg-zinc-900"
          :class="isYeucaHost ? 'border-zinc-200/90 dark:border-zinc-800 shadow-[0_14px_36px_rgba(17,17,16,0.06)]' : 'border-zinc-200 dark:border-zinc-800 shadow-sm'"
        >
          <div class="p-5 sm:p-7">
            <div>
              <p
                class="font-mono text-xs font-semibold"
                :class="isYeucaHost ? 'text-zinc-500 dark:text-zinc-400' : 'text-green-700 dark:text-green-400'"
              >
                {{ isYeucaHost ? 'YEUCA ADMIN CONSOLE' : 'ADMIN' }}
              </p>
              <h1 class="mt-1.5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
                {{ isYeucaHost ? '计协官网管理登录' : '管理员登录' }}
              </h1>
            </div>

            <div
              v-if="errorMessage"
              class="mt-5 flex items-start gap-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-300"
              role="alert"
            >
              <UIcon
                name="i-lucide-circle-alert"
                class="mt-0.5 size-4 shrink-0"
              />
              <span>{{ errorMessage }}</span>
            </div>

            <form
              class="mt-6 space-y-4"
              @submit.prevent="login"
            >
              <UFormField
                label="管理员账号"
                required
              >
                <UInput
                  v-model="username"
                  name="username"
                  autocomplete="username"
                  icon="i-lucide-user-round"
                  placeholder="请输入账号"
                  size="lg"
                  autofocus
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="密码"
                required
              >
                <UInput
                  v-model="password"
                  name="password"
                  :type="passwordVisible ? 'text' : 'password'"
                  autocomplete="current-password"
                  icon="i-lucide-lock-keyhole"
                  placeholder="请输入密码"
                  size="lg"
                  class="w-full"
                >
                  <template #trailing>
                    <UButton
                      :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
                      @click="() => { passwordVisible = !passwordVisible }"
                    />
                  </template>
                </UInput>
              </UFormField>

              <UButton
                type="submit"
                icon="i-lucide-log-in"
                :label="isYeucaHost ? '登录计协控制台' : '登录'"
                size="lg"
                block
                :loading="submitting || checkingSession"
                :class="isYeucaHost ? '!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white transition-colors' : ''"
              />
            </form>

            <div class="mt-5 border-t border-zinc-200 dark:border-zinc-800 pt-5">
              <input
                ref="deviceKeyInput"
                type="file"
                accept=".json,application/json"
                class="hidden"
                @change="importDeviceKey"
              >
              <UButton
                type="button"
                icon="i-lucide-key-round"
                :label="deviceKeyAvailable ? '使用本机设备密钥登录' : '导入设备密钥文件'"
                color="neutral"
                variant="outline"
                size="lg"
                block
                :loading="deviceLoginActive || deviceImporting"
                @click="deviceKeyAvailable ? loginWithDevice() : chooseDeviceKey()"
              />
              <UButton
                v-if="deviceKeyAvailable && route.query.password === '1'"
                type="button"
                icon="i-lucide-key-round"
                label="移除本机密钥"
                color="error"
                variant="ghost"
                size="sm"
                block
                class="mt-2"
                @click="forgetDeviceKey"
              />
            </div>
          </div>
        </div>

        <div class="mt-5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>{{ isYeucaHost ? '支持计协管理员 / 总管理员账号' : '仅限维护者访问' }}</span>
          <a
            v-if="isYeucaHost"
            href="/"
            class="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:underline"
          >
            返回计协主站
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </a>
          <NuxtLink
            v-else
            to="/"
            class="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
          >
            返回前台
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </NuxtLink>
        </div>
      </div>
    </main>
  </div>
</template>
