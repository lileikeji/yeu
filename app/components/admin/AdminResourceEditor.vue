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

const imageUploadState = reactive<Record<string, { uploading: boolean, error: string }>>({})

function inputValue(key: string): string {
  return getAdminResourceInputValue(props.formState, key)
}

function selectValue(key: string): string | undefined {
  return getAdminResourceSelectValue(props.formState, key)
}

function checkboxValue(key: string): boolean {
  return getAdminResourceCheckboxValue(props.formState, key)
}

function imageState(key: string) {
  return imageUploadState[key] ??= { uploading: false, error: '' }
}

async function uploadImage(key: string, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const state = imageState(key)
  state.uploading = true
  state.error = ''
  try {
    const body = new FormData()
    body.set('image', file)
    const result = await adminFetch<{ url: string }>('/api/admin/media/images', {
      method: 'POST',
      body
    })
    emit('updateField', key, result.url)
  } catch {
    state.error = '上传失败，请确认图片为 PNG、JPEG 或 WebP，且不超过 5MB。'
  } finally {
    state.uploading = false
    input.value = ''
  }
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
              <div
                v-if="field.type === 'image'"
                class="space-y-3"
              >
                <div
                  v-if="inputValue(field.key)"
                  class="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
                >
                  <img
                    :src="inputValue(field.key)"
                    :alt="`${field.label}预览`"
                    class="size-28 shrink-0 rounded-md border border-zinc-200 bg-white object-contain"
                  >
                  <div class="min-w-0 flex-1">
                    <p class="break-all text-xs leading-5 text-zinc-500">
                      {{ inputValue(field.key) }}
                    </p>
                    <UButton
                      icon="i-lucide-x"
                      label="清除图片"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      class="mt-3"
                      :disabled="imageState(field.key).uploading"
                      @click="emit('updateField', field.key, '')"
                    />
                  </div>
                </div>
                <label class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:border-green-400 hover:bg-green-50">
                  <UIcon
                    :name="imageState(field.key).uploading ? 'i-lucide-loader-circle' : 'i-lucide-image-up'"
                    class="size-4"
                    :class="imageState(field.key).uploading ? 'animate-spin' : ''"
                  />
                  <span>{{ imageState(field.key).uploading ? '正在上传' : (inputValue(field.key) ? '替换图片' : '上传图片') }}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="sr-only"
                    :disabled="imageState(field.key).uploading"
                    @change="uploadImage(field.key, $event)"
                  >
                </label>
                <p
                  v-if="imageState(field.key).error"
                  class="text-xs leading-5 text-red-700"
                  role="alert"
                >
                  {{ imageState(field.key).error }}
                </p>
              </div>
              <UTextarea
                v-else-if="field.type === 'textarea' || field.type === 'json'"
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
