<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface AdminSessionPayload {
  authenticated?: boolean
  admin?: {
    role?: 'super' | 'organization'
    organization?: { contentId?: string, title?: string } | null
  }
}

const loading = ref(true)
const errorMessage = ref('')
const role = ref<'super' | 'organization'>('super')
const organizationTitle = ref('')
const route = useRoute()

const initialStatus = computed(() => route.query.status === 'pending' ? 'pending' as const : 'all' as const)

async function loadSession(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const session = await adminFetch<AdminSessionPayload>('/api/admin/auth/session')
    if (!session.authenticated) {
      errorMessage.value = '登录状态已失效，请重新登录。'
      return
    }
    role.value = session.admin?.role === 'organization' ? 'organization' : 'super'
    organizationTitle.value = session.admin?.organization?.title || ''
  } catch {
    errorMessage.value = '后台信息加载失败，请重新登录。'
  } finally {
    loading.value = false
  }
}

useSeoMeta({
  title: '活动管理',
  robots: 'noindex, nofollow'
})

onMounted(() => {
  void loadSession()
})
</script>

<template>
  <div class="mx-auto max-w-[1400px] space-y-5">
    <div
      v-if="loading"
      class="grid min-h-80 place-items-center"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-7 animate-spin text-green-700 dark:text-green-400"
      />
    </div>
    <div
      v-else-if="errorMessage"
      class="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-5 text-sm text-red-800 dark:text-red-300"
      role="alert"
    >
      {{ errorMessage }}
    </div>
    <AdminActivityManager
      v-else
      :role="role"
      :organization-title="organizationTitle"
      :initial-status="initialStatus"
    />
  </div>
</template>
