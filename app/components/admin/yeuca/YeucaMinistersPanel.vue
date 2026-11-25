<script setup lang="ts">
import type { YeucaDepartment, YeucaMinisterAdminItem } from '~~/shared/types/yeuca'
import { adminFetch } from '~~/app/utils/admin-request'

const props = defineProps<{
  departments: YeucaDepartment[]
}>()

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const busyId = ref('')
const items = ref<YeucaMinisterAdminItem[]>([])
const copied = ref(false)

const form = reactive({
  departmentName: props.departments[0]?.name || '',
  title: '部长' as '部长' | '副部长',
  username: '',
  displayName: ''
})

watch(() => props.departments, (list) => {
  if (!form.departmentName && list.length > 0) {
    form.departmentName = list[0]?.name || ''
  }
}, { immediate: true })

const issuedCredentials = ref<{
  departmentName: string
  title: string
  username: string
  initialPassword: string
} | null>(null)

const adminOrigin = useRequestURL().origin

const inviteText = computed(() => {
  const c = issuedCredentials.value
  if (!c) return ''
  return [
    `【仰恩大学计算机协会】${c.departmentName}${c.title}后台账号`,
    '',
    `登录地址：${adminOrigin}/admin`,
    `账号：${c.username}`,
    `初始密码：${c.initialPassword}`,
    `负责部门：${c.departmentName}`,
    '',
    '请打开后台登录，首次登录需先修改初始密码。登录后可查看与管理本部门成员名录、招新入档、本部门活动及笔记。'
  ].join('\n')
})

function getErrDesc(err: unknown, fallback = '请稍后重试'): string {
  const e = err as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message || e?.statusMessage || fallback
}

function formatTime(iso: string | null): string {
  if (!iso) return '尚未登录'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadMinisters(): Promise<void> {
  loading.value = true
  try {
    const res = await adminFetch<{ items: YeucaMinisterAdminItem[] }>('/api/admin/yeuca/admins')
    items.value = res.items ?? []
  } catch (err) {
    toast.add({ title: '加载部长账号失败', description: getErrDesc(err), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function createAccount(): Promise<void> {
  if (!form.departmentName) {
    toast.add({ title: '请先选择所属部门', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const res = await adminFetch<{ account: YeucaMinisterAdminItem, initialPassword: string }>('/api/admin/yeuca/admins', {
      method: 'POST',
      body: {
        departmentName: form.departmentName,
        title: form.title,
        ...(form.username.trim() ? { username: form.username.trim() } : {}),
        ...(form.displayName.trim() ? { displayName: form.displayName.trim() } : {})
      }
    })
    issuedCredentials.value = {
      departmentName: res.account.departmentName,
      title: res.account.title,
      username: res.account.username,
      initialPassword: res.initialPassword
    }
    form.username = ''
    form.displayName = ''
    toast.add({
      title: `已开通 ${res.account.departmentName}${res.account.title}账号`,
      description: '请及时复制下方初始密码发送给本人。',
      color: 'success'
    })
    await loadMinisters()
  } catch (err) {
    toast.add({ title: '创建部长账号失败', description: getErrDesc(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleActive(item: YeucaMinisterAdminItem): Promise<void> {
  const nextActive = !item.isActive
  const tip = nextActive
    ? `确认恢复「${item.displayName} (${item.username})」后台登录权限？`
    : `确认停用「${item.displayName} (${item.username})」？已登录会话将立即失效。`
  if (!window.confirm(tip)) return
  busyId.value = item.id
  try {
    await adminFetch(`/api/admin/yeuca/admins/${item.id}`, {
      method: 'PATCH',
      body: { isActive: nextActive }
    })
    toast.add({ title: nextActive ? '已恢复该部长账号' : '已停用该部长账号并强制下线', color: 'success' })
    await loadMinisters()
  } catch (err) {
    toast.add({ title: '状态修改失败', description: getErrDesc(err), color: 'error' })
  } finally {
    busyId.value = ''
  }
}

async function resetPassword(item: YeucaMinisterAdminItem): Promise<void> {
  if (!window.confirm(`确认为「${item.displayName} (${item.username})」重设随机初始密码？旧密码和当前会话将立即失效。`)) return
  busyId.value = item.id
  try {
    const res = await adminFetch<{ account: YeucaMinisterAdminItem, initialPassword?: string }>(`/api/admin/yeuca/admins/${item.id}`, {
      method: 'PATCH',
      body: { resetPassword: true }
    })
    if (res.initialPassword) {
      issuedCredentials.value = {
        departmentName: res.account.departmentName,
        title: res.account.title,
        username: res.account.username,
        initialPassword: res.initialPassword
      }
    }
    toast.add({ title: '已重设部长初始密码', color: 'success' })
    await loadMinisters()
  } catch (err) {
    toast.add({ title: '重设密码失败', description: getErrDesc(err), color: 'error' })
  } finally {
    busyId.value = ''
  }
}

async function changeDepartment(item: YeucaMinisterAdminItem, nextDept: string): Promise<void> {
  if (!nextDept || nextDept === item.departmentName) return
  busyId.value = item.id
  try {
    await adminFetch(`/api/admin/yeuca/admins/${item.id}`, {
      method: 'PATCH',
      body: { departmentName: nextDept }
    })
    toast.add({ title: `已调整「${item.username}」归属部门为 ${nextDept}`, color: 'success' })
    await loadMinisters()
  } catch (err) {
    toast.add({ title: '调整部门失败', description: getErrDesc(err), color: 'error' })
  } finally {
    busyId.value = ''
  }
}

async function copyInvite(): Promise<void> {
  if (!inviteText.value) return
  try {
    await navigator.clipboard.writeText(inviteText.value)
    copied.value = true
    toast.add({ title: '已复制发送文本', color: 'success' })
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    toast.add({ title: '复制失败，请手动复制文本', color: 'error' })
  }
}

onMounted(() => {
  void loadMinisters()
})
</script>

<template>
  <div class="space-y-4">
    <!-- 创建部长账号表单 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
            分部部长账号
          </h2>
          <p class="text-xs text-zinc-500">
            首次登录强制改密，仅可管理所属部门。
          </p>
        </div>
        <UBadge
          :label="`已建 ${items.length} 个分部账号`"
          color="neutral"
          variant="soft"
          size="xs"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField
          label="负责部门"
          required
        >
          <select
            v-model="form.departmentName"
            class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
          >
            <option
              v-for="dept in departments"
              :key="dept.id"
              :value="dept.name"
            >
              {{ dept.name }}
            </option>
          </select>
        </UFormField>

        <UFormField label="职务">
          <select
            v-model="form.title"
            class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
          >
            <option value="部长">
              部长
            </option>
            <option value="副部长">
              副部长
            </option>
          </select>
        </UFormField>

        <UFormField label="登录账号（留空自动生成）">
          <UInput
            v-model="form.username"
            placeholder="如 yeuca-ai 或姓名拼音"
            class="w-full"
          />
        </UFormField>

        <UFormField label="展示姓名（选填）">
          <UInput
            v-model="form.displayName"
            placeholder="如 AI部部长 · 张三"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          icon="i-lucide-user-plus"
          label="生成部长账号与一次性初始密码"
          class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
          :loading="saving"
          @click="createAccount"
        />
      </div>

      <!-- 一次性密码颁发框 -->
      <div
        v-if="issuedCredentials"
        class="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-4 space-y-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            <UIcon
              name="i-lucide-shield-check"
              class="size-4"
            />
            <span>新初始密码仅展示这一次，请立即复制发送给 {{ issuedCredentials.departmentName }}{{ issuedCredentials.title }}</span>
          </div>
          <div class="flex gap-1.5">
            <UButton
              size="xs"
              color="success"
              variant="solid"
              :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
              :label="copied ? '已复制邀请文案' : '复制邀请文案'"
              @click="copyInvite"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              label="收起"
              @click="issuedCredentials = null"
            />
          </div>
        </div>
        <pre class="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-900 bg-[var(--surface)] dark:bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-800 dark:text-zinc-200">{{ inviteText }}</pre>
      </div>
    </div>

    <!-- 部长账号台账 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 overflow-hidden">
      <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <h3 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          已分配部长账号
        </h3>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          label="刷新"
          :loading="loading"
          @click="loadMinisters"
        />
      </div>

      <div
        v-if="loading && items.length === 0"
        class="p-10 text-center text-sm text-zinc-500"
      >
        正在加载部长账号列表…
      </div>

      <div
        v-else-if="items.length === 0"
        class="p-10 text-center text-sm text-zinc-500"
      >
        暂无分部部长账号
      </div>

      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="w-full text-left text-sm">
          <thead class="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-500">
            <tr>
              <th class="px-4 py-3">
                登录账号 / 展示名
              </th>
              <th class="px-4 py-3">
                分管部门
              </th>
              <th class="px-4 py-3">
                状态
              </th>
              <th class="px-4 py-3">
                最近登录
              </th>
              <th class="px-4 py-3 text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr
              v-for="item in items"
              :key="item.id"
            >
              <td class="px-4 py-3 align-top">
                <div class="font-mono font-semibold text-zinc-950 dark:text-zinc-100">
                  {{ item.username }}
                </div>
                <div class="text-xs text-zinc-500">
                  {{ item.displayName }} · {{ item.title }}
                </div>
              </td>
              <td class="px-4 py-3 align-top">
                <select
                  :value="item.departmentName"
                  :disabled="busyId === item.id"
                  class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2 text-xs"
                  @change="changeDepartment(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="dept in departments"
                    :key="dept.id"
                    :value="dept.name"
                  >
                    {{ dept.name }}
                  </option>
                </select>
              </td>
              <td class="px-4 py-3 align-top whitespace-nowrap">
                <div class="flex flex-wrap gap-1.5">
                  <UBadge
                    :label="item.isActive ? '正常使用' : '已停用'"
                    :color="item.isActive ? 'success' : 'error'"
                    variant="soft"
                    size="xs"
                  />
                  <UBadge
                    v-if="item.mustChangePassword"
                    label="待首次改密"
                    color="warning"
                    variant="outline"
                    size="xs"
                  />
                </div>
              </td>
              <td class="px-4 py-3 align-top font-mono text-xs text-zinc-500 whitespace-nowrap">
                {{ formatTime(item.lastLoginAt) }}
              </td>
              <td class="px-4 py-3 align-top text-right whitespace-nowrap">
                <div class="inline-flex gap-1.5">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-lock-keyhole"
                    label="重置密码"
                    :loading="busyId === item.id"
                    @click="resetPassword(item)"
                  />
                  <UButton
                    size="xs"
                    :color="item.isActive ? 'error' : 'success'"
                    variant="ghost"
                    :label="item.isActive ? '停用' : '恢复'"
                    :loading="busyId === item.id"
                    @click="toggleActive(item)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
