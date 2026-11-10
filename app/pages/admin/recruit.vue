<script setup lang="ts">
import RecruitStatsPanel from '~/components/admin/recruit/RecruitStatsPanel.vue'
import RecruitExportPanel from '~/components/admin/recruit/RecruitExportPanel.vue'
import RecruitSubmissionEditModal from '~/components/admin/recruit/RecruitSubmissionEditModal.vue'

const sections = [
  { key: 'settings', label: '基础设置', icon: 'i-lucide-sliders-horizontal' },
  { key: 'referrers', label: '纳新人与邀请码', icon: 'i-lucide-user-plus' },
  { key: 'template', label: '申请表模板', icon: 'i-lucide-file-text' },
  { key: 'submissions', label: '提交记录', icon: 'i-lucide-inbox' },
  { key: 'stats', label: '数据概览', icon: 'i-lucide-bar-chart-3' },
  { key: 'export', label: '总表导出', icon: 'i-lucide-table' }
] as const

type RecruitSection = typeof sections[number]['key']

const route = useRoute()
const router = useRouter()

/** URL 里的 tab 只认已注册的面板，其余（含缺省）一律回落到基础设置。 */
function resolveSection(value: unknown): RecruitSection {
  const raw = Array.isArray(value) ? value[0] : value
  return sections.some(section => section.key === raw) ? raw as RecruitSection : 'settings'
}

const activeSection = ref<RecruitSection>(resolveSection(route.query.tab))

const {
  loading,
  loadError,
  adminRole,
  clubs,
  selectedContentId,
  form,
  saving,
  refreshingForm,
  FIELD_TYPE_OPTIONS,
  fieldOptions,
  multiselectFieldOptions,
  columnSourceOptions,
  exportUrl,
  recruitPublicUrl,
  templateFileInput,
  uploadingTemplate,
  paymentFileInput,
  paymentUploadTarget,
  paymentUploading,
  loadSession,
  loadClubs,
  loadForm,
  refreshFormData,
  saveForm,
  onTemplateFileChange,
  copyTemplateLabel,
  addField,
  removeField,
  moveField,
  setFieldOptions,
  fieldOptionsText,
  addMapping,
  removeMapping,
  moveMapping,
  addExportColumn,
  removeExportColumn,
  moveExportColumn,
  onExportColumnKeyChange,
  renameExportColumn,
  downloadTemplate,
  downloadSampleDoc,
  triggerPaymentUpload,
  onPaymentFileChange,
  clearPaymentImage,
  fieldOptionDetailText,
  setFieldOptionDetail
} = useRecruitForms()

const {
  submissions,
  submissionsTotal,
  submissionsPage,
  submissionsPageSize,
  searchQuery,
  loadingSubmissions,
  submissionStats,
  loadSubmissions,
  loadSubmissionStats,
  searchSubmissions,
  changeSubmissionsPage,
  deleteSubmission,
  downloadSubmissionDoc,
  downloadExportWorkbook,
  selectedIds,
  selectedCount,
  allOnPageSelected,
  toggleSelectAll,
  toggleSelectOne,
  downloadSelected,
  selectingAll,
  selectAllFiltered,
  departmentSelectItems,
  downloadDepartment,
  downloadByDepartment,
  downloadGroupedZip,
  sheetRows,
  sheetSavingKey,
  loadSheet,
  saveSheetCell,
  editOpen,
  editSaving,
  editingSubmission,
  openEdit,
  saveEdit,
  formatDateTime
} = useRecruitSubmissions({ contentId: selectedContentId, form, exportUrl })

const {
  referrers,
  referrerNameInput,
  referrerCodeInput,
  referrerBusy,
  referrerLink,
  loadReferrers,
  addReferrer,
  removeReferrer,
  copyReferrerLink
} = useRecruitReferrers({ contentId: selectedContentId, form })

watch(activeSection, (section) => {
  if (section === 'stats') void loadSubmissionStats()
  if (resolveSection(route.query.tab) === section) return
  void router.replace({ query: { ...route.query, tab: section } })
})

watch(() => route.query.tab, (value) => {
  const section = resolveSection(value)
  if (section !== activeSection.value) activeSection.value = section
})

watch(selectedContentId, () => {
  void loadForm()
  submissionsPage.value = 1
  selectedIds.value = new Set()
  void loadSubmissions()
  void loadSheet()
  void loadReferrers()
})

onMounted(async () => {
  try {
    await loadSession()
    if (adminRole.value === 'super') await loadClubs()
    await loadForm()
    await loadSubmissions()
    await loadSheet()
    await loadReferrers()
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthenticated') return
    loadError.value = '纳新管理加载失败，请刷新重试。'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          纳新管理
        </h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-if="adminRole === 'super' && clubs.length > 0"
          v-model="selectedContentId"
          :items="clubs.map(club => ({ label: club.title, value: club.id }))"
          class="w-56"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新表单数据"
          color="neutral"
          variant="soft"
          :loading="refreshingForm"
          @click="refreshFormData"
        />
        <UButton
          v-if="recruitPublicUrl"
          :to="recruitPublicUrl"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="查看报名页"
          color="neutral"
          variant="soft"
        />
        <UButton
          icon="i-lucide-save"
          label="保存配置"
          :loading="saving"
          :disabled="!form"
          @click="saveForm"
        />
      </div>
    </div>

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
      v-else-if="loadError"
      class="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-5 text-sm text-red-800 dark:text-red-300"
      role="alert"
    >
      {{ loadError }}
    </div>
    <div
      v-else-if="!form"
      class="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-5 text-sm text-amber-900 dark:text-amber-300"
    >
      还没有可选的社团内容，请先在内容管理中创建社团。
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-1">
        <button
          v-for="section in sections"
          :key="section.key"
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          :class="activeSection === section.key
            ? 'bg-zinc-900 dark:bg-zinc-700 text-white'
            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
          @click="activeSection = section.key"
        >
          {{ section.label }}
        </button>
      </div>

      <section
        v-show="activeSection === 'settings'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="表单标题">
              <UInput
                v-model="form.title"
                class="w-full"
                placeholder="入会申请表"
              />
            </UFormField>
            <UFormField label="纳新状态">
              <div class="flex items-center gap-3 pt-1">
                <USwitch
                  :model-value="form.status === 'open'"
                  @update:model-value="value => form && (form.status = value ? 'open' : 'closed')"
                />
                <span class="text-sm text-zinc-600 dark:text-zinc-300">
                  {{ form.status === 'open' ? '开放报名中' : '已关闭' }}
                </span>
              </div>
            </UFormField>
          </div>
          <UFormField label="纳新语（展示在报名页标题下方）">
            <UInput
              v-model="form.slogan"
              class="w-full"
              placeholder="例如：用音符遇见同频的你！"
            />
          </UFormField>
          <UFormField label="社团介绍（展示在报名页）">
            <UTextarea
              v-model="form.intro"
              :rows="4"
              class="w-full"
              placeholder="介绍社团活动、部门构成、纳新安排等"
            />
          </UFormField>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              表单字段
            </h2>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="添加字段"
              variant="soft"
              @click="addField"
            />
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            字段顺序即报名页展示顺序；单选/多选字段用「、」分隔选项；手机号、QQ、学号会做格式校验。
          </p>
          <div class="space-y-3">
            <div
              v-for="(field, index) in form.fields"
              :key="field.key"
              class="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
            >
              <div class="flex flex-wrap items-end gap-3">
                <UFormField
                  label="字段名称"
                  class="w-40"
                >
                  <UInput
                    v-model="field.label"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="类型"
                  class="w-32"
                >
                  <USelect
                    v-model="field.type"
                    :items="FIELD_TYPE_OPTIONS"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  v-if="field.type === 'select' || field.type === 'multiselect'"
                  label="选项（用、分隔）"
                  class="min-w-56 flex-1"
                >
                  <UInput
                    :model-value="fieldOptionsText(field)"
                    class="w-full"
                    @update:model-value="value => setFieldOptions(field, value)"
                  />
                </UFormField>
                <UFormField
                  v-else
                  label="填写提示"
                  class="min-w-56 flex-1"
                >
                  <UInput
                    v-model="field.placeholder"
                    class="w-full"
                  />
                </UFormField>
                <UCheckbox
                  :model-value="field.required"
                  label="必填"
                  @update:model-value="value => (field.required = value === true)"
                />
                <div class="flex items-center gap-1 pb-0.5">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-arrow-up"
                    :disabled="index === 0"
                    aria-label="上移"
                    @click="moveField(index, -1)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-arrow-down"
                    :disabled="index === form.fields.length - 1"
                    aria-label="下移"
                    @click="moveField(index, 1)"
                  />
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    icon="i-lucide-trash-2"
                    aria-label="删除字段"
                    @click="removeField(index)"
                  />
                </div>
              </div>
              <div
                v-if="field.type === 'multiselect' && (field.options?.length ?? 0) > 0"
                class="mt-3 space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3"
              >
                <p class="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  部门介绍（新生在表单中点「?」展开查看，可留空）
                </p>
                <div
                  v-for="option in field.options ?? []"
                  :key="option"
                  class="flex flex-wrap items-start gap-2"
                >
                  <span class="w-24 shrink-0 pt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{{ option }}</span>
                  <UTextarea
                    :model-value="fieldOptionDetailText(field, option)"
                    :rows="2"
                    class="min-w-64 flex-1"
                    placeholder="该部门的介绍，如活动内容、招新要求等"
                    @update:model-value="value => setFieldOptionDetail(field, option, value)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                缴费设置（可选）
              </h2>
              <div class="flex items-center gap-2">
                <USwitch
                  :model-value="form.payment.enabled"
                  @update:model-value="value => form && (form.payment.enabled = value === true)"
                />
                <span class="text-xs text-zinc-600 dark:text-zinc-300">
                  {{ form.payment.enabled ? '报名页展示收款码并要求确认缴费' : '未启用' }}
                </span>
              </div>
            </div>
            <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              启用后报名页会展示收款码（点击可放大，微信可长按识别）并要求新生确认已缴费才能提交；会提示备注「{{ form.payment.note }}」。
            </p>
            <div class="grid gap-3 md:grid-cols-2">
              <div
                v-for="slot in [
                  { key: 'wechat' as const, label: '微信收款码', image: form.payment.wechatImage },
                  { key: 'alipay' as const, label: '支付宝收款码', image: form.payment.alipayImage }
                ]"
                :key="slot.key"
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{{ slot.label }}</span>
                  <UButton
                    size="xs"
                    variant="soft"
                    icon="i-lucide-upload"
                    :label="slot.image ? '更换' : '上传'"
                    :loading="paymentUploading && paymentUploadTarget === slot.key"
                    @click="triggerPaymentUpload(slot.key)"
                  />
                </div>
                <img
                  v-if="slot.image"
                  :src="slot.image"
                  :alt="slot.label"
                  class="mt-2 max-h-40 rounded border border-zinc-200 dark:border-zinc-700"
                >
                <p
                  v-else
                  class="mt-2 text-xs text-zinc-400"
                >
                  未上传
                </p>
                <UButton
                  v-if="slot.image"
                  size="xs"
                  color="error"
                  variant="ghost"
                  label="清除"
                  class="mt-1"
                  @click="clearPaymentImage(slot.key)"
                />
              </div>
            </div>
            <UFormField label="付款提示文案">
              <UInput
                v-model="form.payment.note"
                class="w-full"
                placeholder="付款请备注：班级+姓名+电话"
              />
            </UFormField>
          </div>
        </div>
      </section>

      <section
        v-show="activeSection === 'referrers'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
          <div>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                添加纳新人
              </h2>
              <span class="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                报名页累计浏览 {{ form.views }} 次（含各邀请链接浏览）
              </span>
            </div>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              为每个纳新人生成专属邀请码；通过 TA 的链接报名的记录会在数据库与总表最后一列自动标注邀请人。不带邀请码的报名不记录邀请人。
            </p>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <UFormField
              label="纳新人姓名"
              class="w-44"
            >
              <UInput
                v-model="referrerNameInput"
                placeholder="如：张三"
                class="w-full"
                @keydown.enter="addReferrer"
              />
            </UFormField>
            <UFormField
              label="自定义邀请码（留空自动生成）"
              class="w-56"
            >
              <UInput
                v-model="referrerCodeInput"
                placeholder="如：ZHANGSAN"
                class="w-full"
                @keydown.enter="addReferrer"
              />
            </UFormField>
            <UButton
              icon="i-lucide-user-plus"
              label="添加纳新人"
              :loading="referrerBusy"
              @click="addReferrer"
            />
          </div>
        </div>

        <div
          v-if="referrers.length === 0"
          class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          还没有纳新人，添加后即可分发带邀请码的报名链接。
        </div>
        <div
          v-else
          class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <table class="w-full min-w-[860px] text-sm">
            <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-left text-xs text-zinc-500 dark:text-zinc-400">
              <tr>
                <th class="px-3 py-2 font-medium">
                  纳新人
                </th>
                <th class="px-3 py-2 font-medium">
                  邀请码
                </th>
                <th class="px-3 py-2 font-medium">
                  浏览
                </th>
                <th class="px-3 py-2 font-medium">
                  专属报名链接
                </th>
                <th class="px-3 py-2 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr
                v-for="referrer in referrers"
                :key="referrer.id"
                class="text-zinc-800 dark:text-zinc-200"
              >
                <td class="px-3 py-2 font-medium">
                  {{ referrer.name }}
                </td>
                <td class="px-3 py-2">
                  <code class="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-mono">{{ referrer.code }}</code>
                </td>
                <td class="px-3 py-2 tabular-nums">
                  {{ referrer.views }}
                </td>
                <td class="px-3 py-2 max-w-0">
                  <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ referrerLink(referrer.code) }}</span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-copy"
                      label="复制链接"
                      @click="copyReferrerLink(referrer)"
                    />
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      icon="i-lucide-trash-2"
                      aria-label="删除"
                      @click="removeReferrer(referrer)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        v-show="activeSection === 'template'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                申请表模板
              </h2>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {{ form.templateName
                  ? `当前模板：${form.templateName}`
                  : '尚未上传模板，新生提交后将无法生成文档' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <input
                ref="templateFileInput"
                type="file"
                accept=".docx"
                class="hidden"
                @change="onTemplateFileChange"
              >
              <input
                ref="paymentFileInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onPaymentFileChange"
              >
              <UButton
                icon="i-lucide-upload"
                :label="form.templateName ? '重新上传模板' : '上传模板'"
                :loading="uploadingTemplate"
                variant="soft"
                @click="templateFileInput?.click()"
              />
              <UButton
                v-if="form.templateName"
                icon="i-lucide-download"
                label="下载模板"
                color="neutral"
                variant="soft"
                @click="downloadTemplate"
              />
              <UButton
                v-if="form.templateName"
                icon="i-lucide-file-check-2"
                label="下载示例文档"
                color="neutral"
                variant="soft"
                @click="downloadSampleDoc"
              />
            </div>
          </div>
          <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            模板为 .docx 文件（3MB 以内）。生成规则：文档中与「标签」文字完全一致的单元格，其右侧第一个空单元格会被填入对应表单数据；多选字段（如意向部门）按选项文字匹配，在选项右侧空单元格打勾。
          </p>
          <div v-if="form.templateLabels.length > 0">
            <p class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              模板中识别到的标签（可点击填入映射）
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <UButton
                v-for="label in form.templateLabels"
                :key="label"
                size="xs"
                color="neutral"
                variant="soft"
                :label="label"
                @click="copyTemplateLabel(label)"
              />
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              文档标签映射
            </h2>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="添加映射"
              variant="soft"
              @click="addMapping"
            />
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            左侧填写模板单元格里的原文（如「姓名」），右侧选择要把哪个字段填到它旁边的空格里。
          </p>
          <div class="space-y-2">
            <div
              v-for="(mapping, index) in form.doc.mappings"
              :key="`${mapping.label}-${index}`"
              class="flex flex-wrap items-center gap-2"
            >
              <UInput
                v-model="mapping.label"
                placeholder="文档标签，如：姓名"
                class="w-56"
                list="recruit-template-labels"
              />
              <span class="text-xs text-zinc-400">→</span>
              <USelect
                v-model="mapping.fieldKey"
                :items="fieldOptions"
                class="w-52"
              />
              <div class="flex items-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-up"
                  aria-label="上移"
                  @click="moveMapping(index, -1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-down"
                  aria-label="下移"
                  @click="moveMapping(index, 1)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  icon="i-lucide-trash-2"
                  aria-label="删除映射"
                  @click="removeMapping(index)"
                />
              </div>
            </div>
          </div>
          <datalist id="recruit-template-labels">
            <option
              v-for="label in form.templateLabels"
              :key="label"
              :value="label"
            />
          </datalist>

          <div class="flex flex-wrap items-center gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <UFormField label="多选勾选字段（如意向部门）">
              <USelect
                :model-value="form.doc.multiSelect?.fieldKey ?? null"
                :items="[{ label: '不使用', value: null }, ...multiselectFieldOptions]"
                class="w-52"
                @update:model-value="value => form && (form.doc.multiSelect = value
                  ? { fieldKey: value, mark: form.doc.multiSelect?.mark || '√' }
                  : null)"
              />
            </UFormField>
            <UFormField
              v-if="form.doc.multiSelect"
              label="勾选符号"
            >
              <UInput
                v-model="form.doc.multiSelect.mark"
                class="w-20"
              />
            </UFormField>
          </div>
        </div>
      </section>

      <section
        v-show="activeSection === 'submissions'"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索姓名 / 专业班级 / 学号 / 手机号"
            class="w-72"
            @keydown.enter="searchSubmissions"
          />
          <UButton
            label="搜索"
            color="neutral"
            variant="soft"
            @click="searchSubmissions"
          />
          <UButton
            icon="i-lucide-package-open"
            :label="`下载选中（${selectedCount}）`"
            :disabled="selectedCount === 0"
            @click="downloadSelected"
          />
          <span class="text-xs text-zinc-500 dark:text-zinc-400">
            共 {{ submissionsTotal }} 条
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            icon="i-lucide-check-check"
            label="全选全部结果"
            color="neutral"
            variant="soft"
            :loading="selectingAll"
            @click="selectAllFiltered"
          />
          <USelect
            v-model="downloadDepartment"
            :items="departmentSelectItems"
            placeholder="选部门单独下载"
            class="w-44"
          />
          <UButton
            icon="i-lucide-package"
            label="下载该部门"
            color="neutral"
            variant="soft"
            :disabled="!downloadDepartment"
            @click="downloadByDepartment"
          />
          <UButton
            icon="i-lucide-folder-down"
            label="下载分部门合集"
            color="neutral"
            variant="soft"
            @click="downloadGroupedZip"
          />
          <span class="text-xs text-zinc-500 dark:text-zinc-400">
            合集包按五个部门分文件夹，另带「全部」文件夹
          </span>
        </div>

        <div
          v-if="loadingSubmissions"
          class="grid min-h-40 place-items-center"
          role="status"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-6 animate-spin text-zinc-400"
          />
        </div>
        <div
          v-else-if="submissions.length === 0"
          class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          还没有收到报名，开放表单后把报名页链接发给新生即可。
        </div>
        <div
          v-else
          class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <table class="w-full min-w-[1040px] text-sm">
            <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-left text-xs text-zinc-500 dark:text-zinc-400">
              <tr>
                <th class="w-10 px-3 py-2">
                  <UCheckbox
                    :model-value="allOnPageSelected"
                    aria-label="全选本页"
                    @update:model-value="value => toggleSelectAll(value)"
                  />
                </th>
                <th class="px-3 py-2 font-medium">
                  提交时间
                </th>
                <th class="px-3 py-2 font-medium">
                  姓名
                </th>
                <th class="px-3 py-2 font-medium">
                  性别
                </th>
                <th class="px-3 py-2 font-medium">
                  学号
                </th>
                <th class="px-3 py-2 font-medium">
                  专业班级
                </th>
                <th class="px-3 py-2 font-medium">
                  手机号
                </th>
                <th class="px-3 py-2 font-medium">
                  意向部门
                </th>
                <th class="px-3 py-2 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr
                v-for="submission in submissions"
                :key="submission.id"
                class="text-zinc-800 dark:text-zinc-200"
              >
                <td class="px-3 py-2">
                  <UCheckbox
                    :model-value="selectedIds.has(submission.id)"
                    :aria-label="`选中 ${submission.name || '该提交'}`"
                    @update:model-value="value => toggleSelectOne(submission.id, value)"
                  />
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                  {{ formatDateTime(submission.createdAt) }}
                </td>
                <td class="px-3 py-2 font-medium">
                  {{ submission.name || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.gender || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.studentNo || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.className || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.phone || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.departments || '—' }}
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-pencil"
                      label="查看编辑"
                      @click="openEdit(submission)"
                    />
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-file-down"
                      label="下载文档"
                      @click="downloadSubmissionDoc(submission)"
                    />
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      icon="i-lucide-trash-2"
                      aria-label="删除"
                      @click="deleteSubmission(submission)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-zinc-500 dark:text-zinc-400">
            第 {{ submissionsPage }} 页
          </span>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-left"
              label="上一页"
              :disabled="submissionsPage <= 1 || loadingSubmissions"
              @click="changeSubmissionsPage(-1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              label="下一页"
              trailing-icon="i-lucide-arrow-right"
              :disabled="submissionsPage * submissionsPageSize >= submissionsTotal || loadingSubmissions"
              @click="changeSubmissionsPage(1)"
            />
          </div>
        </div>
      </section>

      <RecruitStatsPanel
        v-show="activeSection === 'stats'"
        :stats="submissionStats"
      />

      <RecruitExportPanel
        v-show="activeSection === 'export'"
        :columns="form?.exportColumns ?? []"
        :sources="columnSourceOptions"
        :rows="sheetRows"
        :fields="form?.fields ?? []"
        :saving-key="sheetSavingKey"
        @download="downloadExportWorkbook"
        @add-column="addExportColumn"
        @remove-column="removeExportColumn"
        @move-column="moveExportColumn"
        @change-column-key="onExportColumnKeyChange"
        @change-column-label="renameExportColumn"
        @save-cell="saveSheetCell"
      />
    </template>

    <RecruitSubmissionEditModal
      v-model:open="editOpen"
      :submission="editingSubmission"
      :fields="form?.fields ?? []"
      :saving="editSaving"
      @save="saveEdit"
    />
  </div>
</template>
