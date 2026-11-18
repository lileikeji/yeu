<script setup lang="ts">
import type {
  YeucaDepartment,
  YeucaGiteaAdminOverview,
  YeucaMemberItem,
  YeucaMemberStatus
} from '~~/shared/types/yeuca'
import {
  parseMatrixToMemberImportRows,
  parsePastedTextToMemberImportRows,
  type ParsedYeucaImportRow
} from '~~/shared/utils/yeuca-member-import'
import { adminFetch } from '~~/app/utils/admin-request'

const props = defineProps<{
  members: YeucaMemberItem[]
  departments: YeucaDepartment[]
  gitea: YeucaGiteaAdminOverview
}>()

const emit = defineEmits<{
  changed: []
}>()

const toast = useToast()

const searchKeyword = ref('')
const filterDept = ref('')
const filterStatus = ref<'all' | YeucaMemberStatus>('all')

const roleOptions = ['会员', '干事', '副部长', '部长', '副会长', '会长', '技术顾问']

const filteredMembers = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  return props.members.filter((m) => {
    if (filterDept.value && m.department !== filterDept.value) return false
    if (filterStatus.value !== 'all' && m.memberStatus !== filterStatus.value) return false
    if (!kw) return true
    return [
      m.studentNo,
      m.name,
      m.gradeMajorClass,
      m.department,
      m.roleTitle,
      m.gitUsername,
      m.qq
    ].some(field => field.toLowerCase().includes(kw))
  })
})

const memberCounts = computed(() => ({
  total: props.members.length,
  active: props.members.filter(m => m.memberStatus === 'active').length,
  pending: props.members.filter(m => m.memberStatus === 'pending').length,
  disabled: props.members.filter(m => m.memberStatus === 'disabled').length,
  gitSynced: props.members.filter(m => m.gitSynced && m.memberStatus === 'active').length
}))

function getErrDesc(err: unknown, fallback = '请稍后重试'): string {
  const e = err as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message || e?.statusMessage || fallback
}

/* ---------- 新增 / 编辑单个成员 ---------- */
const memberModalOpen = ref(false)
const editingMemberId = ref<string | null>(null)
const savingMember = ref(false)
const memberForm = reactive({
  studentNo: '',
  name: '',
  gradeMajorClass: '',
  department: '',
  roleTitle: '会员',
  term: '',
  phone: '',
  qq: '',
  email: '',
  gitUsername: '',
  memberStatus: 'pending' as YeucaMemberStatus,
  initialPassword: '',
  notes: ''
})

function openNewMember(): void {
  editingMemberId.value = null
  memberForm.studentNo = ''
  memberForm.name = ''
  memberForm.gradeMajorClass = ''
  memberForm.department = props.departments[0]?.name || ''
  memberForm.roleTitle = '会员'
  memberForm.term = '2025-2026学年'
  memberForm.phone = ''
  memberForm.qq = ''
  memberForm.email = ''
  memberForm.gitUsername = ''
  memberForm.memberStatus = 'pending'
  memberForm.initialPassword = ''
  memberForm.notes = ''
  memberModalOpen.value = true
}

function openEditMember(member: YeucaMemberItem): void {
  editingMemberId.value = member.id
  memberForm.studentNo = member.studentNo
  memberForm.name = member.name
  memberForm.gradeMajorClass = member.gradeMajorClass
  memberForm.department = member.department
  memberForm.roleTitle = member.roleTitle || '会员'
  memberForm.term = member.term
  memberForm.phone = member.phone
  memberForm.qq = member.qq
  memberForm.email = member.email
  memberForm.gitUsername = member.gitUsername
  memberForm.memberStatus = member.memberStatus
  memberForm.initialPassword = ''
  memberForm.notes = member.notes
  memberModalOpen.value = true
}

async function submitMember(): Promise<void> {
  if (!memberForm.studentNo.trim() || !memberForm.name.trim()) {
    toast.add({ title: '学号与姓名必填', color: 'warning' })
    return
  }
  savingMember.value = true
  try {
    if (editingMemberId.value) {
      await adminFetch(`/api/admin/yeuca/members/${editingMemberId.value}`, {
        method: 'PUT',
        body: {
          studentNo: memberForm.studentNo.trim(),
          name: memberForm.name.trim(),
          gradeMajorClass: memberForm.gradeMajorClass.trim(),
          department: memberForm.department.trim(),
          roleTitle: memberForm.roleTitle.trim() || '会员',
          term: memberForm.term.trim(),
          phone: memberForm.phone.trim(),
          qq: memberForm.qq.trim(),
          email: memberForm.email.trim(),
          gitUsername: memberForm.gitUsername.trim(),
          memberStatus: memberForm.memberStatus,
          notes: memberForm.notes.trim()
        }
      })
      toast.add({ title: '成员资料已更新', color: 'success' })
    } else {
      await adminFetch('/api/admin/yeuca/members', {
        method: 'POST',
        body: {
          studentNo: memberForm.studentNo.trim(),
          name: memberForm.name.trim(),
          gradeMajorClass: memberForm.gradeMajorClass.trim(),
          department: memberForm.department.trim(),
          roleTitle: memberForm.roleTitle.trim() || '会员',
          term: memberForm.term.trim(),
          phone: memberForm.phone.trim(),
          qq: memberForm.qq.trim(),
          email: memberForm.email.trim(),
          gitUsername: memberForm.gitUsername.trim(),
          memberStatus: memberForm.memberStatus,
          ...(memberForm.initialPassword.trim() ? { initialPassword: memberForm.initialPassword.trim() } : {}),
          notes: memberForm.notes.trim()
        }
      })
      toast.add({ title: '已将成员录入白名单', color: 'success' })
    }
    memberModalOpen.value = false
    emit('changed')
  } catch (error) {
    toast.add({ title: '保存成员失败', description: getErrDesc(error), color: 'error' })
  } finally {
    savingMember.value = false
  }
}

/* ---------- 停用 / 恢复 / 重设密码 / 重试 Git / 删除 ---------- */
const resetModalOpen = ref(false)
const resetTarget = ref<YeucaMemberItem | null>(null)
const resetPasswordValue = ref('')
const resetActivatePending = ref(true)
const resettingPassword = ref(false)

function openResetPassword(member: YeucaMemberItem): void {
  resetTarget.value = member
  resetPasswordValue.value = ''
  resetActivatePending.value = true
  resetModalOpen.value = true
}

async function confirmResetPassword(): Promise<void> {
  if (!resetTarget.value || resetPasswordValue.value.length < 8) {
    toast.add({ title: '新密码至少需要 8 位字符', color: 'warning' })
    return
  }
  resettingPassword.value = true
  try {
    await adminFetch(`/api/admin/yeuca/members/${resetTarget.value.id}/reset-password`, {
      method: 'POST',
      body: {
        newPassword: resetPasswordValue.value,
        activateIfPending: resetActivatePending.value
      }
    })
    toast.add({ title: `已为「${resetTarget.value.name}」重置密码并同步 Git 站`, color: 'success' })
    resetModalOpen.value = false
    emit('changed')
  } catch (error) {
    toast.add({ title: '重置密码失败', description: getErrDesc(error), color: 'error' })
  } finally {
    resettingPassword.value = false
  }
}

async function toggleMemberDisabled(member: YeucaMemberItem): Promise<void> {
  const nextStatus: YeucaMemberStatus = member.memberStatus === 'disabled' ? 'active' : 'disabled'
  if (nextStatus === 'active' && !member.gitUsername && !member.registeredAt) {
    toast.add({ title: '该成员尚未注册激活', description: '请让其去官网「会员入口」完成注册或点「重置密码」手动激活', color: 'warning' })
    return
  }
  try {
    await adminFetch(`/api/admin/yeuca/members/${member.id}`, {
      method: 'PUT',
      body: { memberStatus: nextStatus }
    })
    toast.add({
      title: nextStatus === 'disabled' ? `已停用「${member.name}」并同步冻结 Git 权限` : `已恢复「${member.name}」账号及 Git 权限`,
      color: 'success'
    })
    emit('changed')
  } catch (error) {
    toast.add({ title: '状态切换失败', description: getErrDesc(error), color: 'error' })
  }
}

async function resyncMemberGit(member: YeucaMemberItem): Promise<void> {
  try {
    const res = await adminFetch<YeucaMemberItem>(`/api/admin/yeuca/members/${member.id}/sync-git`, {
      method: 'POST'
    })
    toast.add({
      title: res.gitSynced ? `已同步「${member.name}」到 Git 站` : '尚未同步成功',
      description: res.gitSynced ? `Git 账号：${res.gitUsername}` : (res.gitSyncError || '如该成员仍未设密，请先让其激活或重置密码'),
      color: res.gitSynced ? 'success' : 'warning'
    })
    emit('changed')
  } catch (error) {
    toast.add({ title: '同步失败', description: getErrDesc(error), color: 'error' })
  }
}

async function removeMember(member: YeucaMemberItem): Promise<void> {
  if (!window.confirm(`确认将「${member.name} (${member.studentNo})」从名录移除？其官网访问将终止，已开通的 Git 账号将被冻结。`)) return
  try {
    await adminFetch(`/api/admin/yeuca/members/${member.id}`, { method: 'DELETE' })
    toast.add({ title: '成员记录已移除', color: 'success' })
    emit('changed')
  } catch (error) {
    toast.add({ title: '删除失败', description: getErrDesc(error), color: 'error' })
  }
}

/* ---------- 批量导入名单 (.xlsx / .csv / 粘贴文本) ---------- */
const importModalOpen = ref(false)
const importInputMode = ref<'file' | 'paste'>('file')
const importConflictMode = ref<'update_existing' | 'skip_existing'>('update_existing')
const pasteText = ref('')
const parsedRows = ref<ParsedYeucaImportRow[]>([])
const importing = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const validImportRows = computed(() => parsedRows.value.filter(r => r.valid))
const invalidImportRows = computed(() => parsedRows.value.filter(r => !r.valid))

function openImportModal(): void {
  pasteText.value = ''
  parsedRows.value = []
  importModalOpen.value = true
}

function handlePasteInput(): void {
  parsedRows.value = parsePastedTextToMemberImportRows(pasteText.value)
}

async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const buffer = await file.arrayBuffer()
    const XLSX = await import('@e965/xlsx')
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      toast.add({ title: '表格里没有工作表', color: 'warning' })
      return
    }
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    parsedRows.value = parseMatrixToMemberImportRows(matrix)
    if (!parsedRows.value.length) {
      toast.add({ title: '没有从文件中识别出数据行', color: 'warning' })
    }
  } catch (error) {
    toast.add({ title: '读取文件失败', description: getErrDesc(error, '请检查是否为合法 .xlsx 或 .csv 文件'), color: 'error' })
  }
}

async function confirmBatchImport(): Promise<void> {
  if (!validImportRows.value.length) {
    toast.add({ title: '没有可导入的有效数据行', color: 'warning' })
    return
  }
  importing.value = true
  try {
    const result = await adminFetch<{ inserted: number, updated: number, skipped: number, total: number }>('/api/admin/yeuca/members/import', {
      method: 'POST',
      body: {
        mode: importConflictMode.value,
        items: validImportRows.value.map(row => ({
          studentNo: row.studentNo,
          name: row.name,
          gradeMajorClass: row.gradeMajorClass,
          department: row.department,
          roleTitle: row.roleTitle || '会员',
          term: row.term,
          phone: row.phone,
          qq: row.qq,
          email: row.email,
          gitUsername: row.gitUsername,
          notes: row.notes
        }))
      }
    })
    toast.add({
      title: '批量名单导入完成',
      description: `新增 ${result.inserted} 人，更新 ${result.updated} 人，跳过 ${result.skipped} 条。名单内成员现在可以到官网「会员入口」激活注册。`,
      color: 'success'
    })
    importModalOpen.value = false
    emit('changed')
  } catch (error) {
    toast.add({ title: '批量导入失败', description: getErrDesc(error), color: 'error' })
  } finally {
    importing.value = false
  }
}

function downloadTemplateCsv(): void {
  const bom = '\uFEFF'
  const header = '学号,姓名,专业班级,所属部门,会内角色,届别,手机,QQ,邮箱,备注'
  const sample = '125920250165,示例同学,25电子信息1班,AI 部,会员,2025-2026学年,13800000000,100000000,,百团纳新录入'
  const blob = new Blob([`${bom}${header}\n${sample}\n`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '仰恩计协成员名单导入模板.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function exportMembersCsv(): void {
  const bom = '\uFEFF'
  const header = ['学号', '姓名', '专业班级', '部门', '会内角色', '届别', '状态', 'Git账号', 'Git已同步', '手机', 'QQ', '邮箱', '注册时间', '备注']
  const rows = filteredMembers.value.map(m => [
    m.studentNo,
    m.name,
    m.gradeMajorClass,
    m.department,
    m.roleTitle,
    m.term,
    m.memberStatus === 'active' ? '已激活' : m.memberStatus === 'disabled' ? '已停用' : '待激活',
    m.gitUsername,
    m.gitSynced ? '是' : '否',
    m.phone,
    m.qq,
    m.email,
    m.registeredAt || '',
    m.notes
  ].map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))

  const blob = new Blob([`${bom}${header.join(',')}\n${rows.join('\n')}\n`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `计协成员名录-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function statusBadgeMeta(status: YeucaMemberStatus): { label: string, color: 'success' | 'warning' | 'error' } {
  if (status === 'active') return { label: '已激活', color: 'success' }
  if (status === 'disabled') return { label: '已停用', color: 'error' }
  return { label: '待注册激活', color: 'warning' }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Git 站门禁与账号同步状态卡 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          <UIcon
            name="i-lucide-git-branch"
            class="size-4 text-[#a8121e]"
          />
          <span>Git 代码站状态</span>
          <UBadge
            :label="gitea.reachable ? `在线 v${gitea.version || '28.4'}` : (gitea.configured ? '连接异常' : '未配令牌')"
            :color="gitea.reachable ? 'success' : 'warning'"
            variant="subtle"
            size="xs"
          />
          <UBadge
            label="门禁已启"
            color="neutral"
            variant="outline"
            size="xs"
          />
        </div>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          只有名录内成员能在主站会员入口激活，同时开通同账密 Git 账号。停用或未激活进不了 {{ gitea.publicGitUrl }}。
          <span
            v-if="gitea.error"
            class="text-rose-600 dark:text-rose-400 font-medium"
          >
            （{{ gitea.error }}）
          </span>
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 font-mono text-zinc-700 dark:text-zinc-300">
          名录 {{ memberCounts.total }} · 已激活 {{ memberCounts.active }} · 待激活 {{ memberCounts.pending }} · Git同步 {{ memberCounts.gitSynced }}
        </span>
        <UButton
          :to="gitea.publicGitUrl"
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-external-link"
          label="打开 Git 站"
        />
      </div>
    </div>

    <!-- 搜索筛选与操作条 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
        <UInput
          v-model="searchKeyword"
          icon="i-lucide-search"
          placeholder="搜学号、姓名、班级、Git 或 QQ"
          size="sm"
          class="w-full sm:w-64"
        />
        <select
          v-model="filterDept"
          class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-xs text-zinc-700 dark:text-zinc-200"
        >
          <option value="">
            全部部门
          </option>
          <option
            v-for="dept in departments"
            :key="dept.id"
            :value="dept.name"
          >
            {{ dept.name }}
          </option>
        </select>
        <select
          v-model="filterStatus"
          class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-xs text-zinc-700 dark:text-zinc-200"
        >
          <option value="all">
            全部状态 ({{ memberCounts.total }})
          </option>
          <option value="active">
            已激活 ({{ memberCounts.active }})
          </option>
          <option value="pending">
            待注册 ({{ memberCounts.pending }})
          </option>
          <option value="disabled">
            已停用 ({{ memberCounts.disabled }})
          </option>
        </select>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          label="下载模板"
          @click="downloadTemplateCsv"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-file-spreadsheet"
          label="导出名单"
          @click="exportMembersCsv"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="subtle"
          icon="i-lucide-upload"
          label="导入"
          @click="openImportModal"
        />
        <UButton
          size="sm"
          icon="i-lucide-user-plus"
          label="新增成员"
          class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
          @click="openNewMember"
        />
      </div>
    </div>

    <!-- 成员列表表格 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 overflow-hidden">
      <div
        v-if="filteredMembers.length === 0"
        class="p-10 text-center text-sm text-zinc-500"
      >
        没有匹配的成员。右上角可以导入或新增，通过后对方就能注册。
      </div>

      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
          <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400">
            <tr>
              <th class="px-4 py-2.5 text-left font-medium">
                学号 / 姓名
              </th>
              <th class="px-4 py-2.5 text-left font-medium">
                专业班级 · 届别
              </th>
              <th class="px-4 py-2.5 text-left font-medium">
                部门与角色
              </th>
              <th class="px-4 py-2.5 text-left font-medium">
                Git 站账号与状态
              </th>
              <th class="px-4 py-2.5 text-left font-medium">
                成员状态
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                管理操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            <tr
              v-for="member in filteredMembers"
              :key="member.id"
              class="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
            >
              <td class="px-4 py-3">
                <div class="font-semibold text-zinc-950 dark:text-zinc-100">
                  {{ member.name }}
                </div>
                <div class="font-mono text-[11px] text-zinc-500">
                  {{ member.studentNo }}
                </div>
              </td>
              <td class="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                <div>{{ member.gradeMajorClass || '未填写班级' }}</div>
                <div class="text-[11px] text-zinc-400">
                  {{ member.term || '常规在册' }}
                  <span v-if="member.qq"> · QQ {{ member.qq }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <span class="font-medium text-zinc-800 dark:text-zinc-200">{{ member.department || '暂未分配' }}</span>
                <UBadge
                  :label="member.roleTitle || '会员'"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                  class="ml-1.5"
                />
              </td>
              <td class="px-4 py-3">
                <div
                  v-if="member.gitUsername"
                  class="space-y-0.5"
                >
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-medium text-zinc-800 dark:text-zinc-200">@{{ member.gitUsername }}</span>
                    <UBadge
                      :label="member.gitSynced ? '已同步' : '未同步'"
                      :color="member.gitSynced ? 'success' : 'warning'"
                      variant="outline"
                      size="xs"
                    />
                  </div>
                  <div
                    v-if="member.gitSyncError"
                    class="text-[11px] text-rose-500 max-w-[200px] truncate"
                    :title="member.gitSyncError"
                  >
                    {{ member.gitSyncError }}
                  </div>
                </div>
                <span
                  v-else
                  class="text-zinc-400"
                >待会员注册自设</span>
              </td>
              <td class="px-4 py-3">
                <UBadge
                  :label="statusBadgeMeta(member.memberStatus).label"
                  :color="statusBadgeMeta(member.memberStatus).color"
                  variant="soft"
                  size="xs"
                />
              </td>
              <td class="px-4 py-3 text-right">
                <div class="inline-flex flex-wrap justify-end gap-1">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    label="编辑"
                    @click="openEditMember(member)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    label="设密/激活"
                    @click="openResetPassword(member)"
                  />
                  <UButton
                    v-if="member.gitUsername && !member.gitSynced"
                    size="xs"
                    variant="ghost"
                    color="info"
                    label="重同步Git"
                    @click="resyncMemberGit(member)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    :color="member.memberStatus === 'disabled' ? 'success' : 'warning'"
                    :label="member.memberStatus === 'disabled' ? '恢复' : '停用'"
                    @click="toggleMemberDisabled(member)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    aria-label="删除成员"
                    @click="removeMember(member)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 弹窗 1：新增 / 编辑成员 -->
    <UModal
      v-model:open="memberModalOpen"
      :title="editingMemberId ? '编辑成员' : '新增成员'"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField
              label="学号"
              required
            >
              <UInput
                v-model="memberForm.studentNo"
                placeholder="如 125920250165"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField
              label="真实姓名"
              required
            >
              <UInput
                v-model="memberForm.name"
                placeholder="用于白名单核验"
                class="w-full"
              />
            </UFormField>
            <UFormField label="年级班级">
              <UInput
                v-model="memberForm.gradeMajorClass"
                placeholder="如 25电子专升本1班"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="所属部门">
              <select
                v-model="memberForm.department"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option value="">
                  暂不分配 / 全部
                </option>
                <option
                  v-for="dept in departments"
                  :key="dept.id"
                  :value="dept.name"
                >
                  {{ dept.name }}
                </option>
              </select>
            </UFormField>
            <UFormField label="会内角色">
              <select
                v-model="memberForm.roleTitle"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option
                  v-for="r in roleOptions"
                  :key="r"
                  :value="r"
                >
                  {{ r }}
                </option>
              </select>
            </UFormField>
            <UFormField label="学年">
              <UInput
                v-model="memberForm.term"
                placeholder="2025-2026学年"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="QQ">
              <UInput
                v-model="memberForm.qq"
                class="w-full"
              />
            </UFormField>
            <UFormField label="手机号">
              <UInput
                v-model="memberForm.phone"
                class="w-full"
              />
            </UFormField>
            <UFormField label="邮箱">
              <UInput
                v-model="memberForm.email"
                placeholder="留空则注册时自动生成"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Git 用户名（留空由本人填）">
              <UInput
                v-model="memberForm.gitUsername"
                placeholder="字母/数字，留空由本人注册时设"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField label="账号状态">
              <select
                v-model="memberForm.memberStatus"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option value="pending">
                  待注册激活（开放白名单由本人注册）
                </option>
                <option value="active">
                  已激活可用
                </option>
                <option value="disabled">
                  已停用（禁止登录官网与 Git）
                </option>
              </select>
            </UFormField>
          </div>

          <UFormField
            v-if="!editingMemberId"
            label="初始密码（留空由本人注册时设）"
          >
            <UInput
              v-model="memberForm.initialPassword"
              type="password"
              placeholder="至少 8 位"
              class="w-full"
            />
          </UFormField>

          <UFormField label="备注">
            <UInput
              v-model="memberForm.notes"
              placeholder="如：百团招新第一批 / 校队队员"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="取消"
            @click="memberModalOpen = false"
          />
          <UButton
            label="保存成员"
            class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
            :loading="savingMember"
            @click="submitMember"
          />
        </div>
      </template>
    </UModal>

    <!-- 弹窗 2：重置密码 / 同步开通 Git -->
    <UModal
      v-model:open="resetModalOpen"
      :title="`重置成员密码 · ${resetTarget?.name || ''}`"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p class="text-xs text-zinc-500">
            会改掉「{{ resetTarget?.name }} ({{ resetTarget?.studentNo }})」官网和 Git 的密码。没开过 Git 账号的一并补建。
          </p>
          <UFormField
            label="新密码（至少 8 位）"
            required
          >
            <UInput
              v-model="resetPasswordValue"
              type="password"
              placeholder="输入新密码..."
              class="w-full"
            />
          </UFormField>
          <label
            v-if="resetTarget?.memberStatus === 'pending'"
            class="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
          >
            <input
              v-model="resetActivatePending"
              type="checkbox"
              class="rounded border-zinc-300"
            >
            <span>顺带激活并开通 Git 账号（默认用学号）</span>
          </label>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="取消"
            @click="resetModalOpen = false"
          />
          <UButton
            label="确认重置并同步 Git"
            color="primary"
            :loading="resettingPassword"
            @click="confirmResetPassword"
          />
        </div>
      </template>
    </UModal>

    <!-- 弹窗 3：批量导入名单（Excel / CSV / 文本粘贴） -->
    <UModal
      v-model:open="importModalOpen"
      title="批量导入协会成员名单（开放白名单注册）"
      :ui="{ content: 'max-w-4xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <div class="rounded-lg border border-sky-200 dark:border-sky-900/70 bg-sky-50/70 dark:bg-sky-950/30 p-3 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
            导入名录内的同学，进入主站「会员入口」输入<strong>学号 + 姓名</strong>核验通过后，即可自设密码完成注册并自动获得 Git 代码站账号。
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex gap-2">
              <UButton
                size="xs"
                label="上传 Excel (.xlsx) / CSV 文件"
                :variant="importInputMode === 'file' ? 'solid' : 'outline'"
                color="neutral"
                @click="importInputMode = 'file'"
              />
              <UButton
                size="xs"
                label="批量文本粘贴"
                :variant="importInputMode === 'paste' ? 'solid' : 'outline'"
                color="neutral"
                @click="importInputMode = 'paste'"
              />
            </div>

            <select
              v-model="importConflictMode"
              class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-xs"
            >
              <option value="update_existing">
                若学号已存在：更新班级/部门等基础资料（不动已设密码）
              </option>
              <option value="skip_existing">
                若学号已存在：跳过保留原记录
              </option>
            </select>
          </div>

          <div
            v-if="importInputMode === 'file'"
            class="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center space-y-2"
          >
            <input
              ref="fileInputRef"
              type="file"
              accept=".xlsx,.xls,.csv"
              class="hidden"
              @change="handleImportFile"
            >
            <p class="text-xs text-zinc-500">
              自动识别表头：学号、姓名、专业班级、所属部门、会内角色、届别、手机、QQ、邮箱、备注
            </p>
            <div class="flex justify-center gap-2 pt-1">
              <UButton
                size="sm"
                icon="i-lucide-upload"
                label="选择本地 Excel / CSV 文件"
                color="primary"
                @click="fileInputRef?.click()"
              />
              <UButton
                size="sm"
                variant="outline"
                color="neutral"
                label="下载标准模板"
                @click="downloadTemplateCsv"
              />
            </div>
          </div>

          <div
            v-else
            class="space-y-2"
          >
            <UTextarea
              v-model="pasteText"
              :rows="5"
              placeholder="每行一位成员（逗号、空格或从 Excel 直接复制多列粘贴），例如：&#10;学号,姓名,专业班级,所属部门,角色&#10;125920250165,李磊,25电子专升本1班,AI 部,副会长"
              class="w-full font-mono text-xs"
              @input="handlePasteInput"
            />
          </div>

          <!-- 解析预览区 -->
          <div
            v-if="parsedRows.length > 0"
            class="space-y-2"
          >
            <div class="flex flex-wrap items-center justify-between text-xs">
              <span class="font-medium text-zinc-800 dark:text-zinc-200">
                共识别 {{ parsedRows.length }} 行：
                <span class="text-emerald-600">有效 {{ validImportRows.length }} 条</span>
                <span
                  v-if="invalidImportRows.length"
                  class="text-rose-600 ml-2"
                >异常 {{ invalidImportRows.length }} 条（将自动略过）</span>
              </span>
            </div>

            <div class="max-h-60 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table class="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                <thead class="bg-zinc-50 dark:bg-zinc-800/60 sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-left">
                      行号
                    </th>
                    <th class="px-3 py-2 text-left">
                      学号
                    </th>
                    <th class="px-3 py-2 text-left">
                      姓名
                    </th>
                    <th class="px-3 py-2 text-left">
                      班级
                    </th>
                    <th class="px-3 py-2 text-left">
                      部门 / 角色
                    </th>
                    <th class="px-3 py-2 text-left">
                      校验
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                  <tr
                    v-for="row in parsedRows.slice(0, 120)"
                    :key="`${row.rowIndex}-${row.studentNo}`"
                  >
                    <td class="px-3 py-1.5 font-mono text-zinc-400">
                      #{{ row.rowIndex }}
                    </td>
                    <td class="px-3 py-1.5 font-mono">
                      {{ row.studentNo || '-' }}
                    </td>
                    <td class="px-3 py-1.5 font-medium">
                      {{ row.name || '-' }}
                    </td>
                    <td class="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">
                      {{ row.gradeMajorClass || '-' }}
                    </td>
                    <td class="px-3 py-1.5">
                      {{ row.department || '未分' }} · {{ row.roleTitle }}
                    </td>
                    <td class="px-3 py-1.5">
                      <span
                        v-if="row.valid"
                        class="text-emerald-600"
                      >就绪</span>
                      <span
                        v-else
                        class="text-rose-600"
                      >{{ row.reason }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="取消"
            @click="importModalOpen = false"
          />
          <UButton
            :label="`确认导入 ${validImportRows.length} 名成员`"
            class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
            :disabled="validImportRows.length === 0"
            :loading="importing"
            @click="confirmBatchImport"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
