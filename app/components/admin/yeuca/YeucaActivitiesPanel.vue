<script setup lang="ts">
import type {
  YeucaActivityRegistrationItem,
  YeucaActivityRegStatus,
  YeucaActivityStatus,
  YeucaAdminActivityItem,
  YeucaAdminScopePayload,
  YeucaDepartment
} from '~~/shared/types/yeuca'
import { adminFetch } from '~~/app/utils/admin-request'

const props = defineProps<{
  activities: YeucaAdminActivityItem[]
  departments: YeucaDepartment[]
  adminScope?: YeucaAdminScopePayload
}>()

const emit = defineEmits<{
  changed: []
}>()

const toast = useToast()
const isMinister = computed(() => props.adminScope?.role === 'minister')
const scopedDepartment = computed(() => props.adminScope?.departmentName || '')

const categories = ['技术培训', '竞赛备赛', '分享交流', '招新迎新']

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const form = reactive({
  title: '',
  deptName: '协会全体',
  category: '技术培训',
  summary: '',
  body: '',
  placeName: '图信楼机房 / 待通知',
  room: '',
  startsAtLocal: '',
  endsAtLocal: '',
  allowRegistration: true,
  maxParticipants: 0,
  status: 'published' as YeucaActivityStatus
})

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getErrDesc(err: unknown): string {
  const e = err as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message || e?.statusMessage || '请求失败'
}

function openCreate(): void {
  editingId.value = null
  const nextEvening = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  nextEvening.setHours(19, 0, 0, 0)
  form.title = ''
  form.deptName = isMinister.value && scopedDepartment.value
    ? scopedDepartment.value
    : (props.departments[0]?.name || '协会全体')
  form.category = '技术培训'
  form.summary = ''
  form.body = ''
  form.placeName = '校内实训机房'
  form.room = ''
  form.startsAtLocal = toLocalDatetimeInput(nextEvening.toISOString())
  form.endsAtLocal = ''
  form.allowRegistration = true
  form.maxParticipants = 0
  form.status = 'published'
  modalOpen.value = true
}

function openEdit(item: YeucaAdminActivityItem): void {
  editingId.value = item.id
  form.title = item.title
  form.deptName = item.deptName
  form.category = item.category
  form.summary = item.summary
  form.body = item.body
  form.placeName = item.placeName
  form.room = item.room
  form.startsAtLocal = toLocalDatetimeInput(item.startsAt)
  form.endsAtLocal = toLocalDatetimeInput(item.endsAt)
  form.allowRegistration = item.allowRegistration
  form.maxParticipants = item.maxParticipants
  form.status = item.status
  modalOpen.value = true
}

async function submitActivity(): Promise<void> {
  if (!form.title.trim() || !form.summary.trim() || !form.startsAtLocal) {
    toast.add({ title: '请填写活动标题、简介和开始时间', color: 'warning' })
    return
  }
  const startsIso = new Date(form.startsAtLocal).toISOString()
  const endsIso = form.endsAtLocal ? new Date(form.endsAtLocal).toISOString() : null
  saving.value = true
  try {
    const body = {
      title: form.title.trim(),
      deptName: form.deptName.trim() || '协会全体',
      category: form.category.trim() || '技术培训',
      summary: form.summary.trim(),
      body: form.body.trim(),
      placeName: form.placeName.trim() || '校内场地',
      room: form.room.trim(),
      startsAt: startsIso,
      endsAt: endsIso,
      allowRegistration: form.allowRegistration,
      maxParticipants: Number(form.maxParticipants) || 0,
      status: form.status
    }
    if (editingId.value) {
      await adminFetch(`/api/admin/yeuca/activities/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: '活动排期已更新', color: 'success' })
    } else {
      await adminFetch('/api/admin/yeuca/activities', { method: 'POST', body })
      toast.add({ title: '活动已创建并同步官网', color: 'success' })
    }
    modalOpen.value = false
    emit('changed')
  } catch (error) {
    toast.add({ title: '保存活动失败', description: getErrDesc(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleStatus(item: YeucaAdminActivityItem): Promise<void> {
  const next: YeucaActivityStatus = item.status === 'published' ? 'draft' : 'published'
  try {
    await adminFetch(`/api/admin/yeuca/activities/${item.id}`, {
      method: 'PUT',
      body: { status: next }
    })
    toast.add({ title: next === 'published' ? '活动已上线展示' : '已撤回为草稿', color: 'success' })
    emit('changed')
  } catch (error) {
    toast.add({ title: '切换失败', description: getErrDesc(error), color: 'error' })
  }
}

async function removeActivity(item: YeucaAdminActivityItem): Promise<void> {
  if (!window.confirm(`确认删除活动「${item.title}」及其关联报名记录？`)) return
  try {
    await adminFetch(`/api/admin/yeuca/activities/${item.id}`, { method: 'DELETE' })
    toast.add({ title: '活动已删除', color: 'success' })
    emit('changed')
  } catch (error) {
    toast.add({ title: '删除失败', description: getErrDesc(error), color: 'error' })
  }
}

/* ---------- 报名与现场签到查看弹窗 ---------- */
const regModalOpen = ref(false)
const regActivity = ref<YeucaAdminActivityItem | null>(null)
const regLoading = ref(false)
const regList = ref<YeucaActivityRegistrationItem[]>([])

async function openRegistrations(item: YeucaAdminActivityItem): Promise<void> {
  regActivity.value = item
  regModalOpen.value = true
  regLoading.value = true
  try {
    regList.value = await adminFetch<YeucaActivityRegistrationItem[]>(
      `/api/admin/yeuca/activities/${item.id}/registrations`
    )
  } catch (error) {
    toast.add({ title: '读取报名名单失败', description: getErrDesc(error), color: 'error' })
  } finally {
    regLoading.value = false
  }
}

async function changeRegStatus(reg: YeucaActivityRegistrationItem, status: YeucaActivityRegStatus): Promise<void> {
  try {
    await adminFetch(`/api/admin/yeuca/activities/registrations/${reg.id}`, {
      method: 'PUT',
      body: { status }
    })
    reg.status = status
    reg.checkedInAt = status === 'checked_in' ? new Date().toISOString() : null
    toast.add({ title: status === 'checked_in' ? `已标记「${reg.name}」现场签到` : '已更新状态', color: 'success' })
    emit('changed')
  } catch (error) {
    toast.add({ title: '状态更新失败', description: getErrDesc(error), color: 'error' })
  }
}

function exportRegCsv(): void {
  if (!regActivity.value || !regList.value.length) return
  const bom = '\uFEFF'
  const header = ['学号', '姓名', '班级', '部门', '角色', '状态', '报名时间', '签到时间', '备注']
  const rows = regList.value.map(r => [
    r.studentNo,
    r.name,
    r.gradeMajorClass,
    r.department,
    r.roleTitle,
    r.status === 'checked_in' ? '已签到' : r.status === 'cancelled' ? '已取消' : '已报名',
    r.createdAt.slice(0, 16),
    r.checkedInAt ? r.checkedInAt.slice(0, 16) : '',
    r.note
  ].map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([`${bom}${header.join(',')}\n${rows.join('\n')}\n`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `活动报名表-${regActivity.value.title}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 flex flex-wrap items-center justify-end gap-3">
      <div class="flex gap-2">
        <UButton
          v-if="!isMinister"
          to="/admin/activities"
          size="sm"
          variant="outline"
          color="neutral"
          icon="i-lucide-calendar-days"
          label="总平台活动"
        />
        <UButton
          size="sm"
          icon="i-lucide-plus"
          label="新建活动"
          class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
          @click="openCreate"
        />
      </div>
    </div>

    <div
      v-if="activities.length === 0"
      class="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500"
    >
      暂无活动
    </div>

    <div
      v-else
      class="grid gap-3.5 md:grid-cols-2"
    >
      <article
        v-for="item in activities"
        :key="item.id"
        class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 flex flex-col justify-between gap-3"
      >
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                :label="item.status === 'published' ? '已上线' : item.status === 'archived' ? '已归档' : '草稿'"
                :color="item.status === 'published' ? 'success' : 'neutral'"
                variant="soft"
                size="xs"
              />
              <UBadge
                :label="item.category"
                color="info"
                variant="outline"
                size="xs"
              />
              <span class="text-xs text-zinc-500">{{ item.deptName }}</span>
            </div>
            <span class="font-mono text-xs text-zinc-500">
              {{ item.startsAt.slice(0, 16).replace('T', ' ') }}
            </span>
          </div>

          <h3 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
            {{ item.title }}
          </h3>
          <p class="text-xs leading-5 text-zinc-600 dark:text-zinc-300">
            {{ item.summary }}
          </p>

          <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-500 pt-1">
            <span>地点：{{ item.placeName }}{{ item.room ? ` · ${item.room}` : '' }}</span>
            <span v-if="item.allowRegistration">
              会员报名：<strong class="text-zinc-900 dark:text-zinc-100">{{ item.registrationCount }}</strong>
              <span v-if="item.maxParticipants > 0"> / {{ item.maxParticipants }}</span>
              （签到 {{ item.checkedInCount }}）
            </span>
            <span v-else>免线上报名</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
          <UButton
            size="xs"
            color="neutral"
            variant="subtle"
            icon="i-lucide-users"
            :label="`报名/签到名单 (${item.registrationCount})`"
            @click="openRegistrations(item)"
          />
          <div class="flex items-center gap-1">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              label="编辑"
              @click="openEdit(item)"
            />
            <UButton
              size="xs"
              variant="ghost"
              :color="item.status === 'published' ? 'warning' : 'success'"
              :label="item.status === 'published' ? '转草稿' : '发布'"
              @click="toggleStatus(item)"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              aria-label="删除活动"
              @click="removeActivity(item)"
            />
          </div>
        </div>
      </article>
    </div>

    <!-- 新建 / 编辑活动弹窗 -->
    <UModal
      v-model:open="modalOpen"
      :title="editingId ? '编辑活动' : '新建活动'"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-3.5">
          <UFormField
            label="活动标题"
            required
          >
            <UInput
              v-model="form.title"
              placeholder="例：Agent 工作流实战分享"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="牵头部门">
              <select
                v-model="form.deptName"
                :disabled="isMinister"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm disabled:opacity-70"
              >
                <option
                  v-if="!isMinister"
                  value="协会全体"
                >
                  协会全体
                </option>
                <option
                  v-for="d in (isMinister && scopedDepartment ? [{ id: 'scoped', name: scopedDepartment }] : departments)"
                  :key="d.id"
                  :value="d.name"
                >
                  {{ d.name }}
                </option>
              </select>
            </UFormField>
            <UFormField label="活动类别">
              <select
                v-model="form.category"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option
                  v-for="cat in categories"
                  :key="cat"
                  :value="cat"
                >
                  {{ cat }}
                </option>
              </select>
            </UFormField>
            <UFormField label="发布状态">
              <select
                v-model="form.status"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option value="published">
                  立即发布到官网
                </option>
                <option value="draft">
                  保存为草稿
                </option>
                <option value="archived">
                  归档结束
                </option>
              </select>
            </UFormField>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              label="开始时间"
              required
            >
              <UInput
                v-model="form.startsAtLocal"
                type="datetime-local"
                class="w-full"
              />
            </UFormField>
            <UFormField label="结束时间">
              <UInput
                v-model="form.endsAtLocal"
                type="datetime-local"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="地点楼宇">
              <UInput
                v-model="form.placeName"
                placeholder="如：图信楼 / 工程楼"
                class="w-full"
              />
            </UFormField>
            <UFormField label="具体教室 / 机房">
              <UInput
                v-model="form.room"
                placeholder="如：402 机房"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            label="摘要"
            required
          >
            <UInput
              v-model="form.summary"
              placeholder="讲什么、要带什么"
              class="w-full"
            />
          </UFormField>

          <UFormField label="议程与注意事项（Markdown）">
            <UTextarea
              v-model="form.body"
              :rows="4"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-xs">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="form.allowRegistration"
                type="checkbox"
                class="rounded border-zinc-300"
              >
              <span>允许已登录协会成员在官网点击「报名参加」</span>
            </label>
            <div class="flex items-center gap-2">
              <span>名额上限（0 为不限）</span>
              <UInput
                v-model.number="form.maxParticipants"
                type="number"
                size="xs"
                class="w-24"
              />
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
            @click="modalOpen = false"
          />
          <UButton
            label="保存"
            class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
            :loading="saving"
            @click="submitActivity"
          />
        </div>
      </template>
    </UModal>

    <!-- 活动报名 & 现场签到管理弹窗 -->
    <UModal
      v-model:open="regModalOpen"
      :title="`活动报名与签到 · ${regActivity?.title || ''}`"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-zinc-500">
              共 {{ regList.length }} 条记录（已签到 {{ regList.filter(r => r.status === 'checked_in').length }} 人）
            </span>
            <UButton
              size="xs"
              variant="outline"
              color="neutral"
              icon="i-lucide-download"
              label="导出签到 CSV"
              :disabled="!regList.length"
              @click="exportRegCsv"
            />
          </div>

          <div
            v-if="regLoading"
            class="p-6 text-center text-xs text-zinc-500"
          >
            正在加载报名名单...
          </div>
          <div
            v-else-if="!regList.length"
            class="p-6 text-center text-xs text-zinc-500"
          >
            暂无协会会员报名此活动。
          </div>
          <div
            v-else
            class="max-h-80 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <table class="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              <thead class="bg-zinc-50 dark:bg-zinc-800/60">
                <tr>
                  <th class="px-3 py-2 text-left">
                    学号 / 姓名
                  </th>
                  <th class="px-3 py-2 text-left">
                    班级 · 部门
                  </th>
                  <th class="px-3 py-2 text-left">
                    状态
                  </th>
                  <th class="px-3 py-2 text-right">
                    现场操作
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="reg in regList"
                  :key="reg.id"
                >
                  <td class="px-3 py-2">
                    <div class="font-semibold">
                      {{ reg.name }}
                    </div>
                    <div class="font-mono text-[11px] text-zinc-500">
                      {{ reg.studentNo }}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                    {{ reg.gradeMajorClass || '-' }} · {{ reg.department || '未分' }}
                  </td>
                  <td class="px-3 py-2">
                    <UBadge
                      :label="reg.status === 'checked_in' ? '已签到' : reg.status === 'cancelled' ? '已取消' : '已报名'"
                      :color="reg.status === 'checked_in' ? 'success' : reg.status === 'cancelled' ? 'neutral' : 'info'"
                      variant="subtle"
                      size="xs"
                    />
                  </td>
                  <td class="px-3 py-2 text-right space-x-1">
                    <UButton
                      v-if="reg.status !== 'checked_in'"
                      size="xs"
                      color="success"
                      variant="soft"
                      label="标记已签到"
                      @click="changeRegStatus(reg, 'checked_in')"
                    />
                    <UButton
                      v-else
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      label="撤销签到"
                      @click="changeRegStatus(reg, 'registered')"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
