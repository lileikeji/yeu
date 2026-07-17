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
const submitting = ref(false)
const checkingSession = ref(true)
const errorMessage = ref('')

function redirectTarget(): string {
  const raw = Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/admin')) {
    return raw
  }
  return '/me'
}

const loginHint = computed(() => {
  const target = redirectTarget()
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
    <div class="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(18rem,0.75fr)]">
      <section class="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-8">
        <p class="text-xs font-semibold tracking-wide text-green-700">
          ACCOUNT
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950">
          账号登录
        </h1>
        <p class="mt-2 text-sm leading-6 text-zinc-500">
          浏览指南、地图与办事流程无需登录。群聊需要账号；当前暂不开放自助注册，请联系管理员开号。
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
              class="w-full"
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
              class="w-full"
              :disabled="checkingSession || submitting"
              :ui="{ trailing: 'pe-1' }"
            >
              <template #trailing>
                <UButton
                  :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  type="button"
                  :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
                  @click="passwordVisible = !passwordVisible"
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
          >
            登录
          </UButton>
        </form>
      </section>

      <aside class="rounded-2xl border border-green-100 bg-green-50/70 p-6 text-sm leading-7 text-green-950">
        <h2 class="text-base font-semibold">
          登录后可做什么
        </h2>
        <ul class="mt-3 space-y-2">
          <li>· 修改显示名、专业与宿舍楼</li>
          <li>· 进入公共群聊</li>
          <li>· 自动进入对应宿舍楼群</li>
        </ul>
        <p class="mt-5 text-xs text-green-800/80">
          不登录也能正常使用地图、办事与指南。管理员入口不在公开导航中展示。
        </p>
        <div class="mt-6 flex flex-wrap gap-2">
          <UButton
            to="/"
            color="neutral"
            variant="outline"
            size="sm"
          >
            返回首页
          </UButton>
          <UButton
            to="/privacy"
            color="neutral"
            variant="ghost"
            size="sm"
          >
            隐私说明
          </UButton>
        </div>
      </aside>
    </div>
  </div>
</template>
