<script setup lang="ts">
import type { ProcedureAudience } from '~~/shared/constants/server'
import type {
  ProcedureForm,
  ProcedureMaterialForm,
  ProcedureSelectOption
} from './procedure-editor-types'
import {
  adminProcedureAudienceOptions as audienceOptions,
  adminProcedureInformationStateOptions as informationStateOptions,
  adminProcedureMethodOptions as methodOptions,
  adminProcedureRequiredOptions as requiredOptions
} from '~/utils/admin-procedure-presentation'

defineProps<{
  editingId: string | null
  editorLoading: boolean
  saving: boolean
  formError: string
  referencesError: string
  referencesLoading: boolean
  departmentOptions: ProcedureSelectOption[]
  guideOptions: ProcedureSelectOption[]
  placeOptions: ProcedureSelectOption[]
  placeOptionsWithEmpty: ProcedureSelectOption[]
  sourceOptions: ProcedureSelectOption[]
}>()

const open = defineModel<boolean>('open', { required: true })
const form = defineModel<ProcedureForm>('form', { required: true })

const emit = defineEmits<{
  save: []
  loadReferences: [force?: boolean]
  toggleAudience: [target: { audience: ProcedureAudience[] }, audience: ProcedureAudience, checked: boolean]
  addStep: []
  removeStep: [index: number]
  moveStep: [index: number, direction: -1 | 1]
  addMaterial: []
  removeMaterial: [index: number]
  moveMaterial: [index: number, direction: -1 | 1]
  setRequired: [material: ProcedureMaterialForm, value: unknown]
}>()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editingId ? '编辑办事流程' : '新增办事流程'"
    :description="editingId ? '更新结构化步骤、材料、关联地点与核验信息。' : '新建内容将先保存为草稿。'"
    scrollable
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-6xl' }"
  >
    <template #body>
      <div
        v-if="editorLoading"
        class="space-y-4 py-3"
        aria-label="正在加载流程详情"
      >
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <div
        v-else
        class="space-y-7"
      >
        <div
          v-if="formError"
          class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <UIcon
            name="i-lucide-circle-alert"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>{{ formError }}</span>
        </div>

        <div
          v-if="referencesError"
          class="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>{{ referencesError }}</span>
          <UButton
            label="重试加载"
            icon="i-lucide-refresh-cw"
            color="warning"
            variant="outline"
            size="sm"
            :loading="referencesLoading"
            @click="emit('loadReferences', true)"
          />
        </div>

        <AdminProcedureBasicsEditor
          v-model:form="form"
          :audience-options="audienceOptions"
          :method-options="methodOptions"
          @toggle-audience="(...args) => emit('toggleAudience', ...args)"
        />

        <AdminProcedureTimingEditor
          v-model:form="form"
          :information-state-options="informationStateOptions"
        />

        <AdminProcedureRelationsEditor
          v-model:form="form"
          :department-options="departmentOptions"
          :guide-options="guideOptions"
          :place-options="placeOptions"
          :source-options="sourceOptions"
          :references-loading="referencesLoading"
        />

        <AdminProcedureStepsEditor
          :steps="form.steps"
          :audience-options="audienceOptions"
          :information-state-options="informationStateOptions"
          :place-options="placeOptionsWithEmpty"
          :department-options="departmentOptions"
          :references-loading="referencesLoading"
          @add="emit('addStep')"
          @remove="(index) => emit('removeStep', index)"
          @move="(index, direction) => emit('moveStep', index, direction)"
          @toggle-audience="(...args) => emit('toggleAudience', ...args)"
        />

        <AdminProcedureMaterialsEditor
          :materials="form.materials"
          :audience-options="audienceOptions"
          :information-state-options="informationStateOptions"
          :required-options="requiredOptions"
          :place-options="placeOptionsWithEmpty"
          :department-options="departmentOptions"
          :references-loading="referencesLoading"
          @add="emit('addMaterial')"
          @remove="(index) => emit('removeMaterial', index)"
          @move="(index, direction) => emit('moveMaterial', index, direction)"
          @toggle-audience="(...args) => emit('toggleAudience', ...args)"
          @set-required="(...args) => emit('setRequired', ...args)"
        />

        <aside class="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div class="flex items-start gap-2">
            <UIcon
              name="i-lucide-shield-check"
              class="mt-0.5 size-4 shrink-0"
            />
            <p class="leading-6">
              保存不会自动发布。发布前系统还会检查核验时间、步骤是否连续、来源是否有效，以及关联部门和地点是否公开。
            </p>
          </div>
        </aside>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="() => { open = false }"
        />
        <UButton
          icon="i-lucide-save"
          label="保存流程"
          :loading="saving"
          :disabled="editorLoading"
          @click="emit('save')"
        />
      </div>
    </template>
  </UModal>
</template>
