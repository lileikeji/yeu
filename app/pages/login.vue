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

const loginHint = computed(() => {
  const target = requestedRedirectTarget()
  if (!target) return ''
  if (target === '/chat' || target.startsWith('/chat?') || target.startsWith('/chat/')) {
    return '群聊需要登录后才能使用。登录成功后将自动返回群聊。'
  }
  if (target === '/me' || target.startsWith('/me?') || target.startsWith('/me/')) {
    return '个人中心需要登录后才能访问。'
  }
  if (target && target !== '/me') {
    return '该功能需要登录后才能继续使用。'
  }
  return ''
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
          账号服务
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950">
          账号登录
        </h1>
        <p class="mt-2 text-sm leading-6 text-zinc-500">
          看地图和办事指南不用登录。群聊和个人中心需要账号；账号由工作人员提前创建，暂不开放自行注册。
        </p>

        <div
          v-if="loginHint"
          class="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
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
          class="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
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
            登录
          </UButton>
        </form>

        <div class="mt-6 flex flex-wrap gap-2 border-t border-zinc-100 pt-5">
          <UButton
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
