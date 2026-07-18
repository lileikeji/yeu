<script setup lang="ts">
import {
  adminLoginMessages,
  adminLoginRequestMessage,
  isAdminSessionAuthenticated,
  resolveAdminLoginRedirectTarget
} from '~~/app/utils/admin-login-presentation'

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
const errorMessage = ref('')

function redirectTarget(): string {
  return resolveAdminLoginRedirectTarget(route.query.redirect)
}

async function checkExistingSession(): Promise<void> {
  checkingSession.value = true

  try {
    const payload = await $fetch<unknown>('/api/admin/auth/session', {
      credentials: 'include'
    })
    if (isAdminSessionAuthenticated(payload)) await navigateTo(redirectTarget(), { replace: true })
  } catch {
    // A missing or expired session is the expected login-page state.
  } finally {
    checkingSession.value = false
  }
}

async function login(): Promise<void> {
  if (!username.value.trim() || !password.value) {
    errorMessage.value = adminLoginMessages.missingCredentials
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    await $fetch('/api/admin/auth/login', {
      method: 'POST',
      body: {
        username: username.value.trim(),
        password: password.value
      },
      credentials: 'include'
    })
    await navigateTo(redirectTarget(), { replace: true })
  } catch (error) {
    errorMessage.value = adminLoginRequestMessage(error)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void checkExistingSession()
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
          单管理员工作台
        </p>
        <h1 class="mt-3 text-3xl font-bold leading-tight">
          管理地点、指南与信息确认记录
        </h1>
        <p class="mt-4 text-sm leading-7 text-green-100/80">
          发布前核对坐标、来源和有效时间；草稿与已下架内容不会进入公开列表。
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
