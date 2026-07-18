<script setup lang="ts">
import type { GeoPoint } from '~~/map/core/types'
import type { AdminFormValue, AdminRecord, AdminResourceConfig } from './types'
import type { AdminResourceFieldGroup } from '~/utils/admin-resource-form'
import {
  getAdminResourceCheckboxValue,
  getAdminResourceCoordinateNumber,
  getAdminResourceCoordinateSystem,
  getAdminResourceInputValue,
  getAdminResourceSelectValue
} from '~/utils/admin-resource-form'
import {
  getAdminResourceFieldInputType,
  getAdminResourceFieldSpan
} from '~/utils/admin-resource-presentation'

const props = defineProps<{
  config: AdminResourceConfig
  editingRecord: AdminRecord | null
  editingRecordTitle: string
  groupedFields: AdminResourceFieldGroup[]
  formState: Record<string, AdminFormValue>
  saving: boolean
  formError: string
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  updateField: [key: string, value: unknown]
  coordinatePicked: [point: GeoPoint]
  clearCoordinates: []
  save: []
}>()

function inputValue(key: string): string {
  return getAdminResourceInputValue(props.formState, key)
}

function selectValue(key: string): string | undefined {
  return getAdminResourceSelectValue(props.formState, key)
}

function checkboxValue(key: string): boolean {
  return getAdminResourceCheckboxValue(props.formState, key)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editingRecord ? `编辑${config.title}` : config.createLabel"
    :description="editingRecord ? `更新“${editingRecordTitle}”的内容和发布状态。` : '填写完成后保存，可稍后继续修改。'"
    scrollable
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #body>
      <div
        v-if="formError"
        class="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        role="alert"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        <span>{{ formError }}</span>
      </div>

      <div class="space-y-6">
        <AdminCoordinatePicker
          v-if="config.key === 'places'"
          :name="inputValue('name')"
          :longitude="getAdminResourceCoordinateNumber(formState, 'longitude')"
          :latitude="getAdminResourceCoordinateNumber(formState, 'latitude')"
          :coordinate-system="getAdminResourceCoordinateSystem(formState)"
          :scope="inputValue('scope')"
          @pick="emit('coordinatePicked', $event)"
          @clear="emit('clearCoordinates')"
        />

        <details
          v-for="group in groupedFields"
          :key="group.label"
          :open="!group.label.includes('高级设置')"
          class="group"
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            <span>{{ group.label }}</span>
            <UIcon name="i-lucide-chevron-down" class="size-4 text-zinc-400 transition-transform group-open:rotate-180" />
          </summary>
          <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField
              v-for="field in group.fields"
              :key="field.key"
              :label="field.label"
              :description="field.description"
              :required="field.required"
              :class="getAdminResourceFieldSpan(field)"
            >
              <UTextarea
                v-if="field.type === 'textarea' || field.type === 'json'"
                :model-value="inputValue(field.key)"
                :placeholder="field.placeholder"
                :rows="field.rows ?? (field.type === 'json' ? 10 : 4)"
                autoresize
                :class="field.type === 'json' ? 'w-full font-mono text-xs' : 'w-full'"
                @update:model-value="emit('updateField', field.key, $event)"
              />
              <USelect
                v-else-if="field.type === 'select'"
                :model-value="selectValue(field.key)"
                :items="field.options ?? []"
                value-key="value"
                label-key="label"
                :placeholder="field.placeholder || `请选择${field.label}`"
                class="w-full"
                @update:model-value="emit('updateField', field.key, $event)"
              />
              <UCheckbox
                v-else-if="field.type === 'checkbox'"
                :model-value="checkboxValue(field.key)"
                :label="field.label"
                :description="field.description"
                @update:model-value="emit('updateField', field.key, $event === true)"
              />
              <UInput
                v-else
                :model-value="inputValue(field.key)"
                :type="getAdminResourceFieldInputType(field)"
                :placeholder="field.placeholder"
                :min="field.min"
                :max="field.max"
                :step="field.step"
                class="w-full"
                @update:model-value="emit('updateField', field.key, $event)"
              />
            </UFormField>
          </div>
        </details>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="() => { open = false }"
        />
        <UButton
          icon="i-lucide-save"
          label="保存"
          :loading="saving"
          @click="() => { emit('save') }"
        />
      </div>
    </template>
  </UModal>
</template>
