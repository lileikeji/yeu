<script setup lang="ts">
import type {
  ProcedureForm,
  ProcedureSelectOption
} from './procedure-editor-types'

defineProps<{
  departmentOptions: ProcedureSelectOption[]
  guideOptions: ProcedureSelectOption[]
  placeOptions: ProcedureSelectOption[]
  sourceOptions: ProcedureSelectOption[]
  referencesLoading: boolean
}>()

const form = defineModel<ProcedureForm>('form', { required: true })
</script>

<template>
  <section>
    <h3 class="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">
      负责部门与关联内容
    </h3>
    <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField label="负责部门">
        <USelectMenu
          v-model="form.departmentId"
          aria-label="负责部门"
          :items="departmentOptions"
          value-key="value"
          label-key="label"
          placeholder="选择负责部门"
          :loading="referencesLoading"
          class="w-full"
        />
      </UFormField>
      <UFormField label="相关指南">
        <USelectMenu
          v-model="form.guideId"
          aria-label="相关指南"
          :items="guideOptions"
          value-key="value"
          label-key="label"
          placeholder="选择相关指南"
          :loading="referencesLoading"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="流程涉及地点"
        description="可选择多个，顺序按选择结果保存。"
        class="sm:col-span-2"
      >
        <USelectMenu
          v-model="form.placeIds"
          aria-label="流程涉及地点"
          :items="placeOptions"
          value-key="value"
          label-key="label"
          multiple
          placeholder="搜索并选择地点"
          :loading="referencesLoading"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="信息来源"
        description="发布至少需要一个有效且达到发布等级的来源。"
        class="sm:col-span-2"
      >
        <USelectMenu
          v-model="form.sourceIds"
          aria-label="信息来源"
          :items="sourceOptions"
          value-key="value"
          label-key="label"
          multiple
          placeholder="搜索并选择来源"
          :loading="referencesLoading"
          class="w-full"
        />
      </UFormField>
    </div>
  </section>
</template>
