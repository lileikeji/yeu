<script setup lang="ts">
import { getRequestMessage } from '~~/app/utils/request-error'

useSeoMeta({
  title: '账号登录',
  description: '登录后可进入个人中心与宿舍群聊。浏览指南无需登录。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const { isAuthenticated, refreshSession, login } = useUserSession()

const username = ref('')
const password = ref('')
const passwordVisible = ref(false)
const accountHelpLink = '/feedback?type=other&from=%2Flogin'

function togglePasswordVisibility(): void {
  passwordVisible.value = !passwordVisible.value
}
const submitting = ref(false)
const checkingSession = ref(true)
const errorMessage = ref('')

function requestedRedirectTarget(): string | null {
  const raw = Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/admin')) {
    return raw
  }
  return null
}

function redirectTarget(): string {
  return requestedRedirectTarget() ?? '/me'
}

const isChatRedirect = computed(() => {
  const target = requestedRedirectTarget()
  return target === '/chat' || target?.startsWith('/chat?') || target?.startsWith('/chat/') || false
})

const loginHint = computed(() => {
  const target = requestedRedirectTarget()
  if (!target) return ''
  if (isChatRedirect.value) {
    return '群聊需要登录。公共群对所有已登录同学开放；填写宿舍楼后，还会显示对应楼群。'
  }
  if (target === '/me' || target.startsWith('/me?') || target.startsWith('/me/')) {
    return '请先登录，再进入个人中心。'
  }
  if (target && target !== '/me') {
    return '请先登录，登录后会回到刚才的页面。'
  }
  return ''
})

const loginButtonLabel = computed(() => {
  const target = requestedRedirectTarget()
  if (isChatRedirect.value) {
    return '登录并进入群聊'
  }
  if (target === '/me' || target?.startsWith('/me?') || target?.startsWith('/me/')) {
    return '登录并进入个人中心'
  }
  return '登录'
})

async function checkExistingSession(): Promise<void> {
  checkingSession.value = true
  try {
    await refreshSession(true)
    if (isAuthenticated.value) {
      await navigateTo(redirectTarget(), { replace: true })
    }
  } finally {
    checkingSession.value = false
  }
}

async function submitLogin(): Promise<void> {
  if (!username.value.trim() || !password.value) {
    errorMessage.value = '请输入账号和密码'
    return
  }
  if (password.value.length < 8) {
    errorMessage.value = '密码至少 8 位'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await login(username.value.trim(), password.value)
    await navigateTo(redirectTarget(), { replace: true })
  } catch (error) {
    errorMessage.value = getRequestMessage(error, '账号或密码不正确')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void checkExistingSession()
})
</script>

<template>
  <div class="page-shell py-8 sm:py-12">
    <div class="mx-auto max-w-md">
      <section class="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
        <p class="text-xs font-semibold text-green-700">
          新生账号
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950">
          账号登录
        </h1>
        <p class="mt-2 text-sm leading-6 text-zinc-500">
          目前只支持已有账号，暂不能自己注册。没有账号也不影响使用校园指南。
        </p>

        <div class="mt-5 border-y border-zinc-100">
          <div class="flex items-start gap-3 py-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
              <UIcon
                name="i-lucide-compass"
                class="size-4"
              />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-zinc-900">
                不登录也能用
              </p>
              <p class="mt-0.5 text-xs leading-5 text-zinc-500">
                查地图、看办事指南、勾选新生清单
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3 border-t border-zinc-100 py-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-sky-50 text-sky-700">
              <UIcon
                name="i-lucide-users-round"
                class="size-4"
              />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-zinc-900">
                登录后可以
              </p>
              <p class="mt-0.5 text-xs leading-5 text-zinc-500">
                修改个人资料，进入公共群和宿舍楼群
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="loginHint"
          class="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
        >
          <UIcon
            name="i-lucide-shield-check"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>{{ loginHint }}</span>
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
          @submit.prevent="submitLogin"
        >
          <UFormField
            label="账号"
            required
          >
            <UInput
              v-model="username"
              name="username"
              autocomplete="username"
              icon="i-lucide-user-round"
              placeholder="请输入账号"
              size="lg"
              class="min-h-11 w-full"
              :ui="{ base: 'min-h-11' }"
              :disabled="checkingSession || submitting"
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
              placeholder="至少 8 位"
              size="lg"
              class="min-h-11 w-full"
              :disabled="checkingSession || submitting"
              :ui="{ base: 'min-h-11', trailing: 'pe-1' }"
            >
              <template #trailing>
                <UButton
                  :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  type="button"
                  :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
                  class="min-h-11 min-w-11"
                  @click="togglePasswordVisibility"
                />
              </template>
            </UInput>
            <div class="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p class="text-xs text-zinc-500">
                请不要向任何人提供密码
              </p>
              <NuxtLink
                :to="accountHelpLink"
                class="-mr-1 inline-flex min-h-10 items-center gap-1 px-1 text-xs font-semibold text-green-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              >
                登录有问题？告诉我们
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5"
                />
              </NuxtLink>
            </div>
          </UFormField>

          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="submitting || checkingSession"
            icon="i-lucide-log-in"
            class="min-h-11"
          >
            {{ loginButtonLabel }}
          </UButton>
        </form>

        <div class="mt-6 flex flex-wrap gap-2 border-t border-zinc-100 pt-5">
          <template v-if="isChatRedirect">
            <UButton
              to="/map"
              icon="i-lucide-map"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-h-11"
            >
              先看地图
            </UButton>
            <UButton
              to="/procedures"
              icon="i-lucide-list-checks"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-h-11"
            >
              先看办事指南
            </UButton>
          </template>
          <UButton
            v-else
            to="/"
            icon="i-lucide-house"
            color="neutral"
            variant="outline"
            size="sm"
            class="min-h-11"
          >
            返回首页
          </UButton>
          <UButton
            to="/privacy"
            icon="i-lucide-shield-check"
            color="neutral"
            variant="ghost"
            size="sm"
            class="min-h-11"
          >
            隐私说明
          </UButton>
        </div>
      </section>
    </div>
  </div>
</template>
