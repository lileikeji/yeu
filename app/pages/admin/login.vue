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

useSeoMeta({
  title: '后台登录',
  robots: 'noindex, nofollow'
})

const route = useRoute()
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

function redirectTarget(): string {
  return resolveAdminLoginRedirectTarget(route.query.redirect)
}

async function checkExistingSession(): Promise<boolean> {
  checkingSession.value = true

  try {
    const payload = await $fetch<unknown>('/api/admin/auth/session', {
      credentials: 'include'
    })
    if (isAdminSessionAuthenticated(payload)) {
      await navigateTo(redirectTarget(), { replace: true })
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
    const challenge = await $fetch<AdminDeviceChallengePayload>(
      '/api/admin/auth/device/challenge',
      {
        method: 'POST',
        credentials: 'include'
      }
    )
    const proof = await signAdminDeviceChallenge(challenge)
    const payload = await $fetch<unknown>('/api/admin/auth/device/verify', {
      method: 'POST',
      body: proof,
      credentials: 'include'
    })
    await navigateTo(resolveAdminPostLoginTarget(payload, route.query.redirect), { replace: true })
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
    const payload = await $fetch<unknown>('/api/admin/auth/login', {
      method: 'POST',
      body: {
        username: username.value.trim(),
        password: password.value
      },
      credentials: 'include'
    })
    await navigateTo(resolveAdminPostLoginTarget(payload, route.query.redirect), { replace: true })
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
  <div class="grid min-h-screen bg-[#f5f7f4] lg:grid-cols-[minmax(20rem,0.72fr)_minmax(30rem,1fr)]">
    <section class="hidden border-r border-green-950 bg-green-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-md bg-green-600 text-sm font-bold">YEU</span>
        <div>
          <p class="font-semibold">
            仰恩新生指南
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
        非仰恩大学官方系统
      </p>
    </section>

    <main class="grid place-items-center p-5 sm:p-8">
      <div class="w-full max-w-md">
        <div class="mb-7 flex items-center gap-3 lg:hidden">
          <span class="grid size-10 place-items-center rounded-md bg-green-700 text-sm font-bold text-white">YEU</span>
          <div>
            <p class="font-semibold text-zinc-950">
              仰恩新生指南
            </p>
            <p class="text-xs text-zinc-500">
              内容管理后台
            </p>
          </div>
        </div>

        <div class="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <p class="text-xs font-semibold text-green-700">
              ADMIN
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950">
              管理员登录
            </h1>
          </div>

          <div
            v-if="errorMessage"
            class="mt-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
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
              label="登录"
              size="lg"
              block
              :loading="submitting || checkingSession"
            />
          </form>

          <div class="mt-5 border-t border-zinc-200 pt-5">
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
              :label="deviceKeyAvailable ? '使用本机设备密钥' : '导入设备密钥'"
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

        <div class="mt-5 flex items-center justify-between text-xs text-zinc-500">
          <span>仅限维护者访问</span>
          <NuxtLink
            to="/"
            class="inline-flex items-center gap-1 font-medium text-green-700 hover:text-green-800"
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
