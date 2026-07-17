<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { userFetch } from '~~/app/utils/user-request'

useSeoMeta({
  title: '个人中心',
  robots: 'noindex, nofollow'
})

const { user, isAuthenticated, refreshSession, logout, setUser } = useUserSession()

const loading = ref(true)
const saving = ref(false)
const loggingOut = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const displayName = ref('')
const major = ref('')
const dormBuilding = ref('')
const dormSuggestions = ref<string[]>([])
const dormLoading = ref(false)
let dormTimer: ReturnType<typeof setTimeout> | null = null

async function ensureAuth(): Promise<boolean> {
  await refreshSession(true)
  if (!isAuthenticated.value) {
    await navigateTo({ path: '/login', query: { redirect: '/me' } }, { replace: true })
    return false
  }
  return true
}

function hydrateForm(): void {
  displayName.value = user.value?.displayName || ''
  major.value = user.value?.major || ''
  dormBuilding.value = user.value?.dormBuilding || ''
}

async function loadDormSuggestions(q = ''): Promise<void> {
  dormLoading.value = true
  try {
    const payload = await userFetch<{ items: string[] }>('/api/me/dorm-suggestions', {
      query: q ? { q } : {}
    })
    dormSuggestions.value = payload.items || []
  } catch {
    dormSuggestions.value = []
  } finally {
    dormLoading.value = false
  }
}

function onDormInput(): void {
  if (dormTimer) clearTimeout(dormTimer)
  dormTimer = setTimeout(() => {
    void loadDormSuggestions(dormBuilding.value.trim())
  }, 220)
}

function pickDorm(name: string): void {
  dormBuilding.value = name
}

async function saveProfile(): Promise<void> {
  if (!displayName.value.trim()) {
    errorMessage.value = '显示名不能为空'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const payload = await userFetch<{ user: NonNullable<typeof user.value> }>('/api/me', {
      method: 'PATCH',
      body: {
        displayName: displayName.value.trim(),
        major: major.value.trim() || null,
        dormBuilding: dormBuilding.value.trim() || null
      }
    })
    setUser(payload.user)
    hydrateForm()
    successMessage.value = '资料已保存'
    await loadDormSuggestions(dormBuilding.value.trim())
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo({ path: '/login', query: { redirect: '/me' } }, { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

async function handleLogout(): Promise<void> {
  loggingOut.value = true
  try {
    await logout()
    await navigateTo('/', { replace: true })
  } catch (error) {
    errorMessage.value = getRequestMessage(error, '退出失败')
  } finally {
    loggingOut.value = false
  }
}

onMounted(async () => {
  loading.value = true
  const ok = await ensureAuth()
  if (!ok) return
  hydrateForm()
  await loadDormSuggestions(dormBuilding.value.trim())
  loading.value = false
})
</script>

<template>
  <div class="page-shell py-6 sm:py-10">
    <div class="mx-auto max-w-2xl">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-green-700">
            个人中心
          </p>
          <h1 class="mt-1 text-2xl font-bold text-zinc-950">
            资料与宿舍
          </h1>
          <p class="mt-1 text-sm text-zinc-500">
            登录后可改名、填写专业与宿舍楼；宿舍楼决定楼群入口。
          </p>
        </div>
        <UButton
          to="/chat"
          icon="i-lucide-messages-square"
          color="primary"
          variant="soft"
        >
          群聊
        </UButton>
      </div>

      <div
        v-if="loading"
        class="rounded-2xl border border-[var(--line)] bg-white p-8 text-sm text-zinc-500"
      >
        正在加载…
      </div>

      <div
        v-else
        class="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7"
      >
        <div class="flex flex-wrap items-center gap-3 border-b border-zinc-100 pb-4">
          <span class="grid size-11 place-items-center rounded-full bg-green-100 text-sm font-bold text-green-800">
            {{ (user?.displayName || user?.username || '?').slice(0, 1) }}
          </span>
          <div class="min-w-0">
            <p class="truncate font-semibold text-zinc-950">
              {{ user?.displayName }}
            </p>
            <p class="truncate text-xs text-zinc-500">
              账号 {{ user?.username }}
            </p>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {{ errorMessage }}
        </div>
        <div
          v-if="successMessage"
          class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {{ successMessage }}
        </div>

        <form
          class="mt-5 space-y-4"
          @submit.prevent="saveProfile"
        >
          <UFormField
            label="显示名"
            required
          >
            <UInput
              v-model="displayName"
              maxlength="40"
              class="w-full"
              placeholder="聊天与资料中展示的名字"
            />
          </UFormField>

          <UFormField label="专业">
            <UInput
              v-model="major"
              maxlength="80"
              class="w-full"
              placeholder="例如：计算机科学与技术"
            />
          </UFormField>

          <UFormField label="宿舍楼">
            <UInput
              v-model="dormBuilding"
              maxlength="80"
              class="w-full"
              placeholder="输入后下方会出现已有宿舍楼"
              @update:model-value="onDormInput"
            />
            <p class="mt-1 text-xs text-zinc-500">
              填写后可进入对应楼群；公共群始终可用。
            </p>
            <div
              v-if="dormSuggestions.length"
              class="mt-2 flex flex-wrap gap-2"
            >
              <button
                v-for="item in dormSuggestions"
                :key="item"
                type="button"
                class="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 transition hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                @click="pickDorm(item)"
              >
                {{ item }}
              </button>
            </div>
            <p
              v-else-if="dormLoading"
              class="mt-2 text-xs text-zinc-400"
            >
              正在加载宿舍建议…
            </p>
          </UFormField>

          <div class="flex flex-wrap gap-2 pt-2">
            <UButton
              type="submit"
              color="primary"
              :loading="saving"
              icon="i-lucide-save"
            >
              保存资料
            </UButton>
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              :loading="loggingOut"
              icon="i-lucide-log-out"
              @click="handleLogout"
            >
              退出登录
            </UButton>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
