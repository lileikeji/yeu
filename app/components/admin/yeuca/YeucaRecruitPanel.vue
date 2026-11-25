<script setup lang="ts">
import type {
  YeucaAdminScopePayload,
  YeucaDepartment,
  YeucaRecruitAdminConfig
} from '~~/shared/types/yeuca'
import { adminFetch } from '~~/app/utils/admin-request'

const props = defineProps<{
  recruit: YeucaRecruitAdminConfig
  departments: YeucaDepartment[]
  adminScope?: YeucaAdminScopePayload
}>()

const emit = defineEmits<{
  changed: []
}>()

const toast = useToast()
const isMinister = computed(() => props.adminScope?.role === 'minister')
const scopedDepartment = computed(() => props.adminScope?.departmentName || '')

const form = reactive({
  open: props.recruit.open,
  title: props.recruit.title,
  slogan: props.recruit.slogan,
  intro: props.recruit.intro
})

watch(() => props.recruit, (val) => {
  form.open = val.open
  form.title = val.title
  form.slogan = val.slogan
  form.intro = val.intro
}, { deep: true })

const savingConfig = ref(false)
const searchKw = ref('')
const selectedIds = ref<string[]>([])
const approving = ref(false)
const defaultTerm = ref('2025-2026学年')
const defaultDepartment = ref(props.adminScope?.role === 'minister' ? (props.adminScope.departmentName || '') : '')

watch(() => props.adminScope, (scope) => {
  if (scope?.role === 'minister' && scope.departmentName) {
    defaultDepartment.value = scope.departmentName
  }
}, { immediate: true })

const filteredSubs = computed(() => {
  const kw = searchKw.value.trim().toLowerCase()
  return props.recruit.submissions.filter((sub) => {
    if (!kw) return true
    return [sub.name, sub.studentNo, sub.major, sub.className, sub.departments, sub.qq]
      .some(f => f.toLowerCase().includes(kw))
  })
})

const pendingImportableIds = computed(() =>
  filteredSubs.value
    .filter(s => !s.memberImported && Boolean(s.studentNo.trim()))
    .map(s => s.id)
)

function getErrDesc(err: unknown): string {
  const e = err as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message || e?.statusMessage || '操作失败，请重试'
}

async function saveRecruitConfig(): Promise<void> {
  if (!form.title.trim()) {
    toast.add({ title: '表单标题不能为空', color: 'warning' })
    return
  }
  savingConfig.value = true
  try {
    await adminFetch('/api/admin/yeuca/recruit/config', {
      method: 'PUT',
      body: {
        open: form.open,
        title: form.title.trim(),
        slogan: form.slogan.trim(),
        intro: form.intro.trim()
      }
    })
    toast.add({ title: form.open ? '已开放官网招新报名通道' : '已关闭线上招新通道', color: 'success' })
    emit('changed')
  } catch (error) {
    toast.add({ title: '保存失败', description: getErrDesc(error), color: 'error' })
  } finally {
    savingConfig.value = false
  }
}

function toggleAllPending(): void {
  if (selectedIds.value.length === pendingImportableIds.value.length && pendingImportableIds.value.length > 0) {
    selectedIds.value = []
    return
  }
  selectedIds.value = [...pendingImportableIds.value]
}

async function approveSubmissions(ids: string[]): Promise<void> {
  if (!ids.length) return
  approving.value = true
  try {
    const res = await adminFetch<{ imported: number, skippedNoStudentNo: number, skippedAlreadyExists: number }>(
      '/api/admin/yeuca/recruit/approve',
      {
        method: 'POST',
        body: {
          submissionIds: ids,
          defaultDepartment: defaultDepartment.value,
          defaultTerm: defaultTerm.value
        }
      }
    )
    toast.add({
      title: `已入档 ${res.imported} 名成员到白名单`,
      description: `已存在跳过 ${res.skippedAlreadyExists} 条，缺学号跳过 ${res.skippedNoStudentNo} 条；入档人员可去主站会员入口注册激活。`,
      color: 'success'
    })
    selectedIds.value = []
    emit('changed')
  } catch (error) {
    toast.add({ title: '转入成员名录失败', description: getErrDesc(error), color: 'error' })
  } finally {
    approving.value = false
  }
}

function exportRecruitCsv(): void {
  const bom = '\uFEFF'
  const header = ['姓名', '学号', '专业', '班级', '意向部门', '手机', 'QQ', '提交时间', '是否已入档']
  const rows = filteredSubs.value.map(s => [
    s.name,
    s.studentNo,
    s.major,
    s.className,
    s.departments,
    s.phone,
    s.qq,
    s.createdAt.slice(0, 16),
    s.memberImported ? '已入档' : '未入档'
  ].map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([`${bom}${header.join(',')}\n${rows.join('\n')}\n`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `计协招新报名记录-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4">
    <!-- 招新通道配置卡（仅总管可调） -->
    <div
      v-if="!isMinister"
      class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
            招新通道
          </h2>
        </div>

        <label class="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium cursor-pointer">
          <input
            v-model="form.open"
            type="checkbox"
            class="rounded border-zinc-300"
          >
          <span :class="form.open ? 'text-emerald-600 font-semibold' : 'text-zinc-500'">
            {{ form.open ? '线上招新已开放' : '招新通道暂关闭' }}
          </span>
        </label>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="表单标题">
          <UInput
            v-model="form.title"
            class="w-full"
          />
        </UFormField>
        <UFormField label="口号">
          <UInput
            v-model="form.slogan"
            placeholder="例如：第一天先加群，逛逛再选组"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField label="引导说明">
        <UTextarea
          v-model="form.intro"
          :rows="2"
          class="w-full"
        />
      </UFormField>

      <div class="flex justify-end gap-2">
        <UButton
          to="/admin/recruit"
          size="sm"
          variant="outline"
          color="neutral"
          icon="i-lucide-file-text"
          label="字段与 Word 模板"
        />
        <UButton
          size="sm"
          icon="i-lucide-save"
          label="保存"
          class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
          :loading="savingConfig"
          @click="saveRecruitConfig"
        />
      </div>
    </div>

    <!-- 招新名单审批入档表格 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="searchKw"
            icon="i-lucide-search"
            placeholder="搜姓名、学号、班级、部门"
            size="sm"
            class="w-56"
          />
          <select
            v-if="!isMinister"
            v-model="defaultDepartment"
            class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2 text-xs"
          >
            <option value="">
              按报名意向部门
            </option>
            <option
              v-for="d in departments"
              :key="d.id"
              :value="d.name"
            >
              未选归入：{{ d.name }}
            </option>
          </select>
          <span
            v-else
            class="inline-flex items-center rounded-md border border-sky-300/70 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-800 dark:text-sky-200"
          >
            仅显示意向含「{{ scopedDepartment }}」报名 · 转正归入本部门
          </span>
          <UInput
            v-model="defaultTerm"
            size="sm"
            placeholder="届别"
            class="w-32"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-download"
            label="导出报名表"
            @click="exportRecruitCsv"
          />
          <UButton
            size="xs"
            color="primary"
            icon="i-lucide-user-check"
            :label="`转入白名单 (${selectedIds.length})`"
            :disabled="selectedIds.length === 0"
            :loading="approving"
            @click="approveSubmissions(selectedIds)"
          />
        </div>
      </div>

      <div
        v-if="filteredSubs.length === 0"
        class="p-8 text-center text-xs text-zinc-500"
      >
        暂无招新提交记录。
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-lg border border-zinc-100 dark:border-zinc-800"
      >
        <table class="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
          <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500">
            <tr>
              <th class="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  :checked="selectedIds.length > 0 && selectedIds.length === pendingImportableIds.length"
                  @change="toggleAllPending"
                >
              </th>
              <th class="px-3 py-2 text-left">
                姓名 / 学号
              </th>
              <th class="px-3 py-2 text-left">
                专业班级
              </th>
              <th class="px-3 py-2 text-left">
                意向部门
              </th>
              <th class="px-3 py-2 text-left">
                联系方式
              </th>
              <th class="px-3 py-2 text-left">
                入档状态
              </th>
              <th class="px-3 py-2 text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            <tr
              v-for="sub in filteredSubs"
              :key="sub.id"
              class="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
            >
              <td class="px-3 py-2.5">
                <input
                  v-model="selectedIds"
                  type="checkbox"
                  :value="sub.id"
                  :disabled="sub.memberImported || !sub.studentNo.trim()"
                >
              </td>
              <td class="px-3 py-2.5">
                <div class="font-semibold text-zinc-950 dark:text-zinc-100">
                  {{ sub.name || '未填姓名' }}
                </div>
                <div class="font-mono text-[11px] text-zinc-500">
                  {{ sub.studentNo || '未填学号' }}
                </div>
              </td>
              <td class="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                {{ [sub.major, sub.className].filter(Boolean).join(' · ') || '-' }}
              </td>
              <td class="px-3 py-2.5">
                {{ sub.departments || '未选' }}
              </td>
              <td class="px-3 py-2.5 font-mono text-[11px] text-zinc-500">
                <div>{{ sub.phone || '-' }}</div>
                <div v-if="sub.qq">
                  QQ {{ sub.qq }}
                </div>
              </td>
              <td class="px-3 py-2.5">
                <UBadge
                  v-if="sub.memberImported"
                  :label="sub.memberStatus === 'active' ? '已入档并激活' : '已入档(待注册)'"
                  color="success"
                  variant="soft"
                  size="xs"
                />
                <UBadge
                  v-else
                  label="待审批入档"
                  color="neutral"
                  variant="outline"
                  size="xs"
                />
              </td>
              <td class="px-3 py-2.5 text-right">
                <UButton
                  v-if="!sub.memberImported && sub.studentNo.trim()"
                  size="xs"
                  variant="ghost"
                  color="primary"
                  label="转入成员名单"
                  :loading="approving"
                  @click="approveSubmissions([sub.id])"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
