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
const domainNoticeOpen = ref(false)
const canonicalOrganizationAdminUrl = 'https://yx.huiliyill.cn/admin/organization'
const { copyText } = useShareActions()

function dismissDomainNotice(): void {
  domainNoticeOpen.value = false
  if (import.meta.client) {
    localStorage.setItem('yeu-admin-domain-notice-v1', 'dismissed')
  }
}

async function copyCanonicalAdminUrl(): Promise<void> {
  await copyText(canonicalOrganizationAdminUrl, '新后台地址')
}

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
    domainNoticeOpen.value = !mustChangePassword.value
      && import.meta.client
      && localStorage.getItem('yeu-admin-domain-notice-v1') !== 'dismissed'
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
      <UModal
        v-model:open="domainNoticeOpen"
        title="管理后台域名已更换"
        description="请保存新的社团或部门管理后台地址。"
        :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-lg' }"
      >
        <template #body>
          <div class="space-y-4">
            <div class="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <UIcon
                name="i-lucide-triangle-alert"
                class="mt-0.5 size-5 shrink-0 text-amber-700"
              />
              <p>原来的管理后台域名已经弃用，之后请使用下面的新地址进入。旧地址可能会逐步停止服务。</p>
            </div>
            <UFormField label="新的管理后台地址">
              <div class="flex flex-col gap-2 sm:flex-row">
                <UInput
                  :model-value="canonicalOrganizationAdminUrl"
                  readonly
                  class="min-w-0 flex-1"
                />
                <UButton
                  icon="i-lucide-copy"
                  label="复制地址"
                  color="primary"
                  class="shrink-0"
                  @click="copyCanonicalAdminUrl"
                />
              </div>
            </UFormField>
            <div class="flex justify-end">
              <UButton
                label="我知道了"
                color="neutral"
                variant="soft"
                @click="dismissDomainNotice"
              />
            </div>
          </div>
        </template>
      </UModal>
      <AdminPasswordChangePanel :required="mustChangePassword" />
      <AdminOrganizationVisualEditor
        v-if="!mustChangePassword"
        :content-id="contentId"
        organization-mode
      />
    </template>
  </div>
</template>
