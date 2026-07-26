<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface OrganizationOption {
  id: string
  title: string
  kind: 'club' | 'department'
  slug: string
}

interface OrganizationAccount {
  id: string
  username: string
  displayName: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: number | null
  contentId: string
  contentKind: 'club' | 'department'
  contentSlug: string
  contentTitle: string
}

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const accounts = ref<OrganizationAccount[]>([])
const organizations = ref<OrganizationOption[]>([])
const selectedContentId = ref('')
const username = ref('')
const createdCredentials = ref<{ username: string, password: string } | null>(null)
const busyAccountId = ref('')

const organizationItems = computed(() => organizations.value
  .filter(item => !accounts.value.some(account => account.contentId === item.id))
  .map(item => ({
    label: `${item.kind === 'club' ? '社团' : '部门'} · ${item.title}`,
    value: item.id
  })))

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [accountPayload, contentPayload] = await Promise.all([
      adminFetch<{ items: OrganizationAccount[] }>('/api/admin/organization-admins'),
      adminFetch<{ items: OrganizationOption[] }>('/api/admin/content', {
        query: { page: 1, pageSize: 100 }
      })
    ])
    accounts.value = accountPayload.items ?? []
    organizations.value = (contentPayload.items ?? [])
      .filter(item => item.kind === 'club' || item.kind === 'department')
  } catch {
    errorMessage.value = '组织管理员账号加载失败。'
  } finally {
    loading.value = false
  }
}

async function createAccount(): Promise<void> {
  if (!selectedContentId.value) return
  saving.value = true
  createdCredentials.value = null
  try {
    const result = await adminFetch<{
      account: { username: string, initialPassword: string }
    }>('/api/admin/organization-admins', {
      method: 'POST',
      body: {
        contentId: selectedContentId.value,
        ...(username.value.trim() && { username: username.value.trim() })
      }
    })
    createdCredentials.value = {
      username: result.account.username,
      password: result.account.initialPassword
    }
    selectedContentId.value = ''
    username.value = ''
    await load()
  } catch {
    toast.add({ title: '账号创建失败', description: '该组织可能已经授权，或账号名已被使用。', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function updateAccount(account: OrganizationAccount, input: { isActive?: boolean, resetPassword?: boolean }): Promise<void> {
  busyAccountId.value = account.id
  try {
    const result = await adminFetch<{
      account: { initialPassword?: string }
    }>(`/api/admin/organization-admins/${encodeURIComponent(account.id)}`, {
      method: 'PATCH',
      body: input
    })
    if (result.account.initialPassword) {
      createdCredentials.value = {
        username: account.username,
        password: result.account.initialPassword
      }
    }
    await load()
  } catch {
    toast.add({ title: '操作失败', color: 'error' })
  } finally {
    busyAccountId.value = ''
  }
}

function formatTime(value: number | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '尚未登录'
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <AdminPageHeader
      title="组织管理员"
      description="为社团或部门创建独立后台账号。每个账号只能编辑被授权的一个组织页面。"
      icon="i-lucide-shield-user"
    />

    <section class="mt-5 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 class="font-bold text-zinc-950">
        创建组织账号
      </h2>
      <p class="mt-1 text-sm leading-6 text-zinc-500">
        账号默认使用社团或部门中文名的全拼；初始密码为 asd123456789，首次登录必须修改。
      </p>
      <div class="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] md:items-end">
        <UFormField label="授权社团或部门">
          <USelect
            v-model="selectedContentId"
            :items="organizationItems"
            value-key="value"
            label-key="label"
            placeholder="选择一个未授权的组织"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="账号名"
          hint="留空自动生成"
        >
          <UInput
            v-model="username"
            placeholder="例如 computer-association"
            class="w-full"
          />
        </UFormField>
        <UButton
          icon="i-lucide-user-plus"
          label="授权并创建"
          :loading="saving"
          :disabled="!selectedContentId"
          class="min-h-10"
          @click="createAccount"
        />
      </div>
      <div
        v-if="createdCredentials"
        class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
        role="status"
      >
        <p class="font-semibold text-emerald-950">
          账号已创建或重置，请把下面两项交给负责人
        </p>
        <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-emerald-700">
              账号
            </dt>
            <dd class="mt-1 font-mono font-bold text-emerald-950">
              {{ createdCredentials.username }}
            </dd>
          </div>
          <div>
            <dt class="text-emerald-700">
              初始密码
            </dt>
            <dd class="mt-1 font-mono font-bold text-emerald-950">
              {{ createdCredentials.password }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="mt-5 overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 px-5 py-4">
        <h2 class="font-bold text-zinc-950">
          已授权账号
        </h2>
      </div>
      <div
        v-if="loading"
        class="grid min-h-48 place-items-center"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin text-green-700"
        />
      </div>
      <p
        v-else-if="errorMessage"
        class="p-5 text-sm text-red-700"
        role="alert"
      >
        {{ errorMessage }}
      </p>
      <div
        v-else-if="accounts.length"
        class="divide-y divide-zinc-100"
      >
        <article
          v-for="account in accounts"
          :key="account.id"
          class="flex flex-col gap-4 p-5 lg:flex-row lg:items-center"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-bold text-zinc-950">
                {{ account.contentTitle }}
              </p>
              <UBadge
                :label="account.contentKind === 'club' ? '社团' : '部门'"
                color="neutral"
                variant="soft"
              />
              <UBadge
                :label="account.isActive ? '启用' : '停用'"
                :color="account.isActive ? 'success' : 'error'"
                variant="soft"
              />
            </div>
            <p class="mt-2 text-sm text-zinc-600">
              账号：<span class="font-mono font-semibold text-zinc-900">{{ account.username }}</span>
            </p>
            <p class="mt-1 text-xs text-zinc-500">
              {{ account.mustChangePassword ? '等待负责人首次修改密码' : `最近登录：${formatTime(account.lastLoginAt)}` }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              :to="`/admin/content/${account.contentId}/visual`"
              icon="i-lucide-panels-top-left"
              label="可视化编辑"
              color="neutral"
              variant="outline"
            />
            <UButton
              icon="i-lucide-rotate-ccw-key"
              label="重置密码"
              color="warning"
              variant="outline"
              :loading="busyAccountId === account.id"
              @click="updateAccount(account, { resetPassword: true })"
            />
            <UButton
              :icon="account.isActive ? 'i-lucide-user-x' : 'i-lucide-user-check'"
              :label="account.isActive ? '停用' : '启用'"
              :color="account.isActive ? 'error' : 'success'"
              variant="outline"
              :loading="busyAccountId === account.id"
              @click="updateAccount(account, { isActive: !account.isActive })"
            />
          </div>
        </article>
      </div>
      <p
        v-else
        class="p-8 text-center text-sm text-zinc-500"
      >
        还没有组织管理员账号。
      </p>
    </section>
  </div>
</template>
