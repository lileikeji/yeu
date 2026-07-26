<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface OrganizationSession {
  authenticated?: boolean
  admin?: {
    mustChangePassword?: boolean
    organization?: {
      contentId?: string
      title?: string
    } | null
  }
}

const loading = ref(true)
const errorMessage = ref('')
const contentId = ref('')
const organizationTitle = ref('')
const mustChangePassword = ref(false)

async function loadSession(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const session = await adminFetch<OrganizationSession>('/api/admin/auth/session')
    const organization = session.admin?.organization
    if (!session.authenticated || !organization?.contentId) {
      errorMessage.value = '当前账号没有绑定社团或部门，请联系总管理员重新授权。'
      return
    }
    contentId.value = organization.contentId
    organizationTitle.value = organization.title || '我的组织'
    mustChangePassword.value = session.admin?.mustChangePassword === true
  } catch {
    errorMessage.value = '组织账号信息加载失败，请重新登录。'
  } finally {
    loading.value = false
  }
}

useSeoMeta({
  title: () => organizationTitle.value || '组织后台',
  robots: 'noindex, nofollow'
})

onMounted(() => {
  void loadSession()
})
</script>

<template>
  <div class="mx-auto max-w-[1500px] space-y-5">
    <div
      v-if="loading"
      class="grid min-h-80 place-items-center"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-7 animate-spin text-green-700"
      />
    </div>
    <div
      v-else-if="errorMessage"
      class="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800"
      role="alert"
    >
      {{ errorMessage }}
    </div>
    <template v-else>
      <AdminPasswordChangePanel :required="mustChangePassword" />
      <AdminOrganizationVisualEditor
        v-if="!mustChangePassword"
        :content-id="contentId"
      />
    </template>
  </div>
</template>
