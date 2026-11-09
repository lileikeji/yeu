<script setup lang="ts">
definePageMeta({ layout: false })

useSeoMeta({
  title: '评委登录',
  robots: 'noindex, nofollow'
})

const username = ref('')
const password = ref('')
const passwordVisible = ref(false)
const submitting = ref(false)
const checking = ref(true)
const errorMessage = ref('')

function loginErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null
    ? (error as { data?: { data?: { code?: string } } }).data?.data?.code
    : undefined
  const status = typeof error === 'object' && error !== null
    ? (error as { statusCode?: number }).statusCode
    : undefined
  if (code === 'INVALID_CREDENTIALS') return '账号或密码错误，请联系负责同学确认。'
  if (code === 'RATE_LIMITED' || status === 429) return '尝试次数过多，请 15 分钟后再试。'
  if (code === 'ORIGIN_REJECTED') return '请在比赛后台的正式域名下登录。'
  return '登录失败，请检查网络后重试。'
}

async function checkSession(): Promise<void> {
  checking.value = true
  try {
    const session = await judgeFetch<{ authenticated?: boolean }>('/api/judge/auth/session')
    if (session.authenticated) {
      await navigateTo('/judge', { replace: true })
      return
    }
  } catch {
    // Missing session is the expected state on the login page.
  } finally {
    checking.value = false
  }
}

async function login(): Promise<void> {
  if (submitting.value) return
  if (!username.value.trim() || !password.value) {
    errorMessage.value = '请输入评委账号和密码。'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await judgeFetch('/api/judge/auth/login', {
      method: 'POST',
      body: {
        username: username.value.trim(),
        password: password.value
      }
    })
    await navigateTo('/judge', { replace: true })
  } catch (error) {
    errorMessage.value = loginErrorMessage(error)
  } finally {
    submitting.value = false
  }
}

onMounted(checkSession)
</script>

<template>
  <div class="grid min-h-dvh bg-[#f5f7f4] dark:bg-zinc-950 lg:grid-cols-[minmax(20rem,0.72fr)_minmax(30rem,1fr)]">
    <section class="hidden border-r border-green-950 bg-green-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-md bg-green-600 text-white">
          <UIcon
            name="i-lucide-mic-vocal"
            class="size-5"
            aria-hidden="true"
          />
        </span>
        <div>
          <p class="font-semibold">
            音乐协会
          </p>
          <p class="text-xs text-green-200">
            新声歌手大赛 · 评委端
          </p>
        </div>
      </div>
      <div class="max-w-md">
        <p class="text-sm font-medium text-green-200">
          评分入口
        </p>
        <h1 class="mt-3 text-3xl font-bold leading-tight">
          为每一位选手打分
        </h1>
        <p class="mt-4 text-sm leading-7 text-green-100/80">
          账号仅限本人使用。
        </p>
      </div>
    </section>

    <section class="flex items-center justify-center px-4 py-10 sm:px-8">
      <div class="w-full max-w-md">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <span class="grid size-10 place-items-center rounded-md bg-green-700 text-white">
            <UIcon
              name="i-lucide-mic-vocal"
              class="size-5"
              aria-hidden="true"
            />
          </span>
          <div>
            <p class="font-semibold text-zinc-900 dark:text-zinc-100">
              音乐协会 · 新声歌手大赛
            </p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              评委登录
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <h2 class="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            评委登录
          </h2>

          <div
            v-if="checking"
            class="mt-8 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"
            role="status"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin"
            />
            正在检查登录状态
          </div>

          <form
            v-else
            class="mt-6 space-y-4"
            @submit.prevent="login"
          >
            <UFormField label="评委账号">
              <UInput
                v-model="username"
                class="w-full"
                size="lg"
                autocomplete="username"
                placeholder="例如 judge1"
                :ui="{ base: 'h-11' }"
              />
            </UFormField>

            <UFormField label="密码">
              <div class="relative">
                <UInput
                  v-model="password"
                  class="w-full"
                  size="lg"
                  :type="passwordVisible ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="输入密码"
                  :ui="{ base: 'h-11 pr-11' }"
                  @keydown.enter.prevent="login"
                />
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 grid w-11 place-items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
                  @click="passwordVisible = !passwordVisible"
                >
                  <UIcon
                    :name="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    class="size-4"
                  />
                </button>
              </div>
            </UFormField>

            <p
              v-if="errorMessage"
              class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              role="alert"
            >
              {{ errorMessage }}
            </p>

            <UButton
              type="submit"
              block
              size="lg"
              icon="i-lucide-log-in"
              label="登录评分"
              :loading="submitting"
            />
          </form>
        </div>

        <p class="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          忘记密码联系协会负责人重置。
        </p>
      </div>
    </section>
  </div>
</template>
