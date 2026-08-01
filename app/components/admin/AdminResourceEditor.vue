<script setup lang="ts">
import type { GeoPoint } from '~~/map/core/types'
import type { AdminFieldDefinition, AdminFormValue, AdminRecord, AdminResourceConfig } from './types'
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
  visualEditorPath?: string
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  updateField: [key: string, value: unknown]
  coordinatePicked: [point: GeoPoint]
  clearCoordinates: []
  save: []
}>()

const imageUploadState = reactive<Record<string, { uploading: boolean, error: string }>>({})
const isNoticeEditor = computed(() => props.config.key === 'content' && props.formState.kind === 'notice')
const editorTitle = computed(() => isNoticeEditor.value
  ? props.editingRecord ? '编辑公告' : '新增公告'
  : props.editingRecord ? `编辑${props.config.title}` : props.config.createLabel)
const editorDescription = computed(() => isNoticeEditor.value
  ? props.editingRecord
    ? `更新“${props.editingRecordTitle}”的公告内容、展示时间和置顶状态。`
    : '填写公告内容和展示时间，保存后可在列表中发布。'
  : props.editingRecord
    ? `更新“${props.editingRecordTitle}”的内容和发布状态。`
    : '填写完成后保存，可稍后继续修改。')

function inputValue(key: string): string {
  return getAdminResourceInputValue(props.formState, key)
}

function selectValue(key: string): string | undefined {
  return getAdminResourceSelectValue(props.formState, key)
}

function checkboxValue(key: string): boolean {
  return getAdminResourceCheckboxValue(props.formState, key)
}

function shouldRenderField(field: AdminFieldDefinition): boolean {
  return !(isNoticeEditor.value && field.key === 'metadata.autoPopup')
}

function imageState(key: string) {
  return imageUploadState[key] ??= { uploading: false, error: '' }
}

function listValues(key: string): string[] {
  const value = inputValue(key)
  return value ? value.split('\n').map(item => item.trim()).filter(Boolean) : []
}

function imageTitleKey(key: string): string | null {
  if (key === 'metadata.groupQrUrls') return 'metadata.groupQrTitles'
  if (key === 'metadata.contactQrUrls') return 'metadata.contactQrTitles'
  return null
}

function imageTitleValues(key: string): string[] {
  const titleKey = imageTitleKey(key)
  if (!titleKey) return []
  const value = inputValue(titleKey)
  return value === '' ? [] : value.split('\n')
}

function phoneListValues(key: string): string[] {
  const value = inputValue(key)
  return value === '' ? [''] : value.split('\n')
}

function updateListItem(key: string, index: number, value: string): void {
  const items = phoneListValues(key)
  items[index] = value
  emit('updateField', key, items.join('\n'))
}

function addListItem(key: string): void {
  emit('updateField', key, [...phoneListValues(key), ''].join('\n'))
}

function removeListItem(key: string, index: number): void {
  const items = phoneListValues(key)
  items.splice(index, 1)
  emit('updateField', key, items.join('\n'))
}

function removeImageListItem(key: string, index: number): void {
  const items = listValues(key)
  items.splice(index, 1)
  emit('updateField', key, items.join('\n'))
  const titleKey = imageTitleKey(key)
  if (titleKey) {
    const titles = imageTitleValues(key)
    titles.splice(index, 1)
    emit('updateField', titleKey, titles.join('\n'))
  }
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

async function uploadImageList(key: string, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  if (!files.length) return

  const state = imageState(key)
  const existing = listValues(key)
  if (existing.length + files.length > 8) {
    state.error = '每项最多上传 8 张二维码，请先删除不再使用的图片。'
    input.value = ''
    return
  }

  state.uploading = true
  state.error = ''
  try {
    const uploaded = await Promise.all(files.map(async (file) => {
      const body = new FormData()
      body.set('image', file)
      const result = await adminFetch<{ url: string }>('/api/admin/media/images', {
        method: 'POST',
        body
      })
      return result.url
    }))
    const nextUrls = [...new Set([...existing, ...uploaded])]
    emit('updateField', key, nextUrls.join('\n'))
    const titleKey = imageTitleKey(key)
    if (titleKey) {
      const titles = imageTitleValues(key)
      while (titles.length < existing.length) titles.push('')
      titles.push(...Array.from({ length: nextUrls.length - existing.length }, () => ''))
      emit('updateField', titleKey, titles.join('\n'))
    }
  } catch {
    state.error = '上传失败，请确认图片为 PNG、JPEG 或 WebP，且每张不超过 5MB。'
  } finally {
    state.uploading = false
    input.value = ''
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editorTitle"
    :description="editorDescription"
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

        <section
          v-if="isNoticeEditor"
          class="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm"
          aria-labelledby="notice-display-settings-title"
        >
          <div class="flex items-start gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <UIcon
                name="i-lucide-megaphone"
                class="size-5"
              />
            </div>
            <div class="min-w-0 flex-1">
              <h3
                id="notice-display-settings-title"
                class="text-sm font-semibold text-amber-950"
              >
                前台显示方式
              </h3>
              <p class="mt-1 text-xs leading-5 text-amber-900/75">
                控制用户打开网站时是否直接看到这条公告。已读状态仍用于未读角标、列表颜色和阅读统计。
              </p>
              <UCheckbox
                class="mt-3"
                :model-value="checkboxValue('metadata.autoPopup')"
                label="进入前台时自动弹出"
                description="关闭后，用户仍可从前台公告入口手动查看。"
                @update:model-value="emit('updateField', 'metadata.autoPopup', $event === true)"
              />
            </div>
          </div>
        </section>

        <details
          v-for="group in groupedFields"
          :key="group.label"
          :open="!group.label.includes('高级设置')"
          class="group"
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            <span>{{ group.label }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-zinc-400 transition-transform group-open:rotate-180"
            />
          </summary>
          <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <template
              v-for="field in group.fields"
              :key="field.key"
            >
              <UFormField
                v-if="shouldRenderField(field)"
                :label="field.label"
                :description="field.description"
                :required="field.required"
                :class="getAdminResourceFieldSpan(field)"
              >
              <div
                v-if="field.type === 'image-list'"
                class="space-y-3"
              >
                <div
                  v-if="listValues(field.key).length"
                  class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <figure
                    v-for="(url, index) in listValues(field.key)"
                    :key="url"
                    class="rounded-md border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <ImagePreviewButton
                      :src="url"
                      :alt="`${field.label}第 ${index + 1} 张预览`"
                      button-class="mx-auto aspect-square w-full max-w-40 rounded-md border border-zinc-200 bg-white"
                      image-class="size-full object-contain"
                    />
                    <div class="mt-2 flex items-center justify-between gap-2">
                      <span class="text-xs font-medium text-zinc-500">
                        第 {{ index + 1 }} 张
                      </span>
                      <UButton
                        icon="i-lucide-trash-2"
                        label="删除"
                        color="error"
                        variant="ghost"
                        size="xs"
                        :disabled="imageState(field.key).uploading"
                        @click="removeImageListItem(field.key, index)"
                      />
                    </div>
                  </figure>
                </div>
                <label class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:border-green-400 hover:bg-green-50">
                  <UIcon
                    :name="imageState(field.key).uploading ? 'i-lucide-loader-circle' : 'i-lucide-images'"
                    class="size-4"
                    :class="imageState(field.key).uploading ? 'animate-spin' : ''"
                  />
                  <span>{{ imageState(field.key).uploading ? '正在上传' : '选择多张二维码' }}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    class="sr-only"
                    :disabled="imageState(field.key).uploading || listValues(field.key).length >= 8"
                    @change="uploadImageList(field.key, $event)"
                  >
                </label>
                <p class="text-xs leading-5 text-zinc-500">
                  已上传 {{ listValues(field.key).length }} / 8 张
                </p>
                <p
                  v-if="imageState(field.key).error"
                  class="text-xs leading-5 text-red-700"
                  role="alert"
                >
                  {{ imageState(field.key).error }}
                </p>
              </div>
              <div
                v-else-if="field.type === 'image'"
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
              <div
                v-else-if="field.type === 'tel-list'"
                class="space-y-2"
              >
                <div
                  v-for="(phone, index) in phoneListValues(field.key)"
                  :key="index"
                  class="flex items-center gap-2"
                >
                  <UInput
                    :model-value="phone"
                    type="tel"
                    :placeholder="field.placeholder || '请输入联系电话'"
                    class="min-w-0 flex-1"
                    @update:model-value="updateListItem(field.key, index, String($event ?? ''))"
                  />
                  <UButton
                    v-if="phoneListValues(field.key).length > 1 || phone"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    :aria-label="`删除第 ${index + 1} 个联系电话`"
                    @click="removeListItem(field.key, index)"
                  />
                </div>
                <UButton
                  icon="i-lucide-plus"
                  label="添加联系电话"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :disabled="phoneListValues(field.key).length >= 12"
                  @click="addListItem(field.key)"
                />
              </div>
              <UTextarea
                v-else-if="field.type === 'textarea' || field.type === 'text-list' || field.type === 'json'"
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
            </template>
          </div>
        </details>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          v-if="visualEditorPath"
          :to="visualEditorPath"
          icon="i-lucide-panels-top-left"
          label="切换到可视化编辑"
          color="neutral"
          variant="outline"
        />
        <span v-else />
        <div class="flex justify-end gap-2">
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
      </div>
    </template>
  </UModal>
</template>
