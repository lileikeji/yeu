<script setup lang="ts">
import { getRequestMessage } from '~~/app/utils/request-error'
import { userFetch } from '~~/app/utils/user-request'

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
const regCodeSentHint = ref('')
const accountHelpLink = '/feedback?type=other&from=%2Flogin'

function togglePasswordVisibility(): void {
  passwordVisible.value = !passwordVisible.value
}
const submitting = ref(false)
const checkingSession = ref(true)
const errorMessage = ref('')

// ---------- 注册（邮箱验证码） ----------
const mode = ref<'login' | 'register'>('login')
const regUsername = ref('')
const regNickname = ref('')
const regEmail = ref('')
const regPassword = ref('')
const regCode = ref('')
const regCaptchaId = ref('')
const regCaptchaSvg = ref('')
const regCaptchaInput = ref('')
const regCaptchaRefreshKey = ref(0)
const regSending = ref(false)
const regCodeCountdown = ref(0)
let regCountdownTimer: ReturnType<typeof globalThis.setInterval> | null = null

function switchMode(next: 'login' | 'register'): void {
  mode.value = next
  errorMessage.value = ''
  if (next === 'register' && !regCaptchaSvg.value) void refreshCaptcha()
}

async function refreshCaptcha(): Promise<void> {
  regCaptchaRefreshKey.value += 1
  try {
    const payload = await userFetch<{ captchaId: string, svg: string }>('/api/auth/captcha')
    regCaptchaId.value = payload.captchaId
    regCaptchaSvg.value = payload.svg
    regCaptchaInput.value = ''
  } catch (error) {
    errorMessage.value = getRequestMessage(error, '图形验证码加载失败')
  }
}

async function sendRegisterCode(): Promise<void> {
  if (regCodeCountdown.value > 0 || regSending.value) return
  if (!regUsername.value.trim() || !regEmail.value.trim() || regPassword.value.length < 8) {
    errorMessage.value = '先填好用户名、邮箱和密码（至少 8 位），再获取验证码'
    return
  }
  if (!regCaptchaId.value || regCaptchaInput.value.trim().length < 4) {
    errorMessage.value = '请先填写图形验证码'
    return
  }
  regSending.value = true
  errorMessage.value = ''
  try {
    await userFetch('/api/auth/register-code', {
      method: 'POST',
      body: {
        username: regUsername.value.trim(),
        nickname: regNickname.value.trim() || undefined,
        email: regEmail.value.trim(),
        password: regPassword.value,
        captchaId: regCaptchaId.value,
        captchaCode: regCaptchaInput.value.trim()
      }
    })
    regCodeCountdown.value = 60
    regCountdownTimer = setInterval(() => {
      regCodeCountdown.value -= 1
      if (regCodeCountdown.value <= 0 && regCountdownTimer) {
        clearInterval(regCountdownTimer)
        regCountdownTimer = null
      }
    }, 1000)
    errorMessage.value = ''
    regCodeSentHint.value = '验证码已发送到邮箱，注意查收垃圾箱'
  } catch (error) {
    errorMessage.value = getRequestMessage(error, '验证码发送失败')
    void refreshCaptcha()
  } finally {
    regSending.value = false
  }
}

async function submitRegister(): Promise<void> {
  if (!regUsername.value.trim() || !regEmail.value.trim() || regPassword.value.length < 8 || regCode.value.trim().length !== 6) {
    errorMessage.value = '请完整填写用户名、邮箱、密码（至少 8 位）和 6 位验证码'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  try {
    await userFetch('/api/auth/register', {
      method: 'POST',
      body: {
        username: regUsername.value.trim(),
        email: regEmail.value.trim(),
        password: regPassword.value,
        code: regCode.value.trim()
      }
    })
    await refreshSession(true)
    await navigateTo(redirectTarget(), { replace: true })
  } catch (error) {
    errorMessage.value = getRequestMessage(error, '注册失败')
  } finally {
    submitting.value = false
  }
}

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
watch(mode, (next) => {
  if (next === 'register' && !regCaptchaSvg.value) void refreshCaptcha()
})
</script>

<template>
  <div class="page-shell py-8 sm:py-12">
    <div class="mx-auto max-w-md">
      <section class="rounded-lg border border-[var(--line)] bg-white dark:bg-zinc-900 p-5 shadow-sm sm:p-7">
        <p class="text-xs font-semibold text-green-700 dark:text-green-400">
          新生账号
        </p>
        <div class="mt-2 flex items-center justify-between gap-3">
          <h1 class="text-2xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ mode === 'login' ? '账号登录' : '注册账号' }}
          </h1>
          <div class="flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800 p-0.5">
            <button
              type="button"
              class="rounded px-2.5 py-1 text-xs font-medium transition"
              :class="mode === 'login' ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400'"
              @click="switchMode('login')"
            >
              登录
            </button>
            <button
              type="button"
              class="rounded px-2.5 py-1 text-xs font-medium transition"
              :class="mode === 'register' ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400'"
              @click="switchMode('register')"
            >
              注册
            </button>
          </div>
        </div>
        <p class="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {{ mode === 'login' ? '登录后可进入群聊与个人中心。没有账号也不影响使用校园指南。' : '邮箱验证后即可注册，注册后可直接进入楼栋群聊。' }}
        </p>

        <div class="mt-4 flex items-start gap-2 rounded-md border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950 p-3 text-sm text-sky-950 dark:text-sky-300" role="note">
          <UIcon
            name="i-lucide-info"
            class="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300"
          />
          <span>现在开放注册了：切到「注册」填用户名、邮箱并验证即可拥有账号；没有账号也可以正常浏览公开内容。</span>
        </div>

        <div class="mt-5 border-y border-zinc-100 dark:border-zinc-800">
          <div class="flex items-start gap-3 py-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
              <UIcon
                name="i-lucide-compass"
                class="size-4"
              />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                不登录也能用
              </p>
              <p class="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                查地图、看办事指南、勾选新生清单
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3 border-t border-zinc-100 dark:border-zinc-800 py-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              <UIcon
                name="i-lucide-users-round"
                class="size-4"
              />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                登录后可以
              </p>
              <p class="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                修改个人资料，进入公共群和宿舍楼群
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="loginHint"
          class="mt-4 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-950 dark:text-amber-100"
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
          class="mt-5 flex items-start gap-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-300"
          role="alert"
        >
          <UIcon
            name="i-lucide-circle-alert"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>{{ errorMessage }}</span>
        </div>
        <p
          v-if="mode === 'register' && regCodeSentHint"
          class="mt-3 text-xs text-emerald-600 dark:text-emerald-400"
        >
          {{ regCodeSentHint }}
        </p>

        <form
          v-if="mode === 'register'"
          class="mt-5 space-y-4"
          @submit.prevent="submitRegister"
        >
          <UFormField label="用户名" required>
            <UInput
              v-model="regUsername"
              name="reg-username"
              autocomplete="username"
              icon="i-lucide-user-round"
              placeholder="2-20 位：中文、字母、数字、下划线"
              size="lg"
              class="min-h-11 w-full"
              :disabled="submitting"
            />
          </UFormField>
          <UFormField label="昵称（选填）">
            <UInput
              v-model="regNickname"
              name="reg-nickname"
              icon="i-lucide-smile"
              placeholder="群聊里显示的名字，不填默认用用户名"
              size="lg"
              class="min-h-11 w-full"
              :disabled="submitting"
              :maxlength="12"
            />
          </UFormField>
          <UFormField label="邮箱" required>
            <UInput
              v-model="regEmail"
              name="reg-email"
              type="email"
              autocomplete="email"
              icon="i-lucide-mail"
              placeholder="用于接收验证码"
              size="lg"
              class="min-h-11 w-full"
              :disabled="submitting"
            />
          </UFormField>
          <UFormField label="密码" required>
            <UInput
              v-model="regPassword"
              name="reg-password"
              type="password"
              autocomplete="new-password"
              icon="i-lucide-lock-keyhole"
              placeholder="至少 8 位"
              size="lg"
              class="min-h-11 w-full"
              :disabled="submitting"
            />
          </UFormField>
          <UFormField label="图形验证码" required>
            <div class="flex items-center gap-2">
              <UInput
                v-model="regCaptchaInput"
                name="reg-captcha"
                maxlength="5"
                placeholder="图中字符"
                size="lg"
                class="min-h-11 flex-1"
                :disabled="submitting"
              />
              <button
                :key="regCaptchaRefreshKey"
                type="button"
                class="min-h-11 shrink-0 rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800"
                aria-label="点击刷新图形验证码"
                @click="refreshCaptcha"
              >
                <span
                  v-if="regCaptchaSvg"
                  class="block h-9 w-[130px]"
                  v-html="regCaptchaSvg"
                />
                <span
                  v-else
                  class="flex h-9 w-[130px] items-center justify-center text-[11px] text-zinc-400"
                >
                  加载中…
                </span>
              </button>
            </div>
          </UFormField>
          <UFormField label="邮箱验证码" required>
            <div class="flex items-center gap-2">
              <UInput
                v-model="regCode"
                name="reg-code"
                inputmode="numeric"
                maxlength="6"
                placeholder="6 位验证码"
                size="lg"
                class="min-h-11 flex-1"
                :disabled="submitting"
              />
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                size="lg"
                :label="regCodeCountdown > 0 ? `${regCodeCountdown}s` : '获取验证码'"
                :disabled="regCodeCountdown > 0 || regSending"
                :loading="regSending"
                @click="sendRegisterCode"
              />
            </div>
          </UFormField>
          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="submitting"
            label="注册并进入"
          />
        </form>

        <form
          v-else
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
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                请不要向任何人提供密码
              </p>
              <NuxtLink
                :to="accountHelpLink"
                class="-mr-1 inline-flex min-h-10 items-center gap-1 px-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
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

        <div class="mt-6 flex flex-wrap gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-5">
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
