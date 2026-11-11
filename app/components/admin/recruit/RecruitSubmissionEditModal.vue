<script setup lang="ts">
import type { RecruitFormField, RecruitSubmission } from '~~/shared/types'
import { formatRecruitDateTime } from '~/composables/useRecruitSubmissions'

const props = defineProps<{
  submission: RecruitSubmission | null
  fields: RecruitFormField[]
  saving: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  save: [data: Record<string, string | string[]>]
}>()

const textValues = ref<Record<string, string>>({})
const multiValues = ref<Record<string, string[]>>({})

/** 每次打开都从提交记录重建草稿，取消后重开不会残留上一次的输入。 */
function hydrate(submission: RecruitSubmission): void {
  textValues.value = Object.fromEntries(props.fields
    .filter(field => field.type !== 'multiselect')
    .map(field => [field.key, typeof submission.data[field.key] === 'string'
      ? submission.data[field.key] as string
      : '']))
  multiValues.value = Object.fromEntries(props.fields
    .filter(field => field.type === 'multiselect')
    .map(field => [field.key, Array.isArray(submission.data[field.key])
      ? submission.data[field.key] as string[]
      : []]))
}

watch([() => props.submission, open], ([submission, isOpen]) => {
  if (submission && isOpen) hydrate(submission)
}, { immediate: true })

function multiselectSelected(fieldKey: string, option: string): boolean {
  return (multiValues.value[fieldKey] ?? []).includes(option)
}

function toggleMultiselect(fieldKey: string, option: string, checked: boolean): void {
  const current = multiValues.value[fieldKey] ?? []
  multiValues.value = {
    ...multiValues.value,
    [fieldKey]: checked
      ? [...new Set([...current, option])]
      : current.filter(item => item !== option)
  }
}

function submit(): void {
  emit('save', { ...textValues.value, ...multiValues.value })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="submission ? `查看 / 编辑 - ${submission.name || '未署名'}` : '查看 / 编辑'"
    :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-xl' }"
  >
    <template #body>
      <div
        v-if="submission"
        class="space-y-4"
      >
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          提交于 {{ formatRecruitDateTime(submission.createdAt) }} · 保存后重新校验并同步到申请表文档与总表
        </p>
        <div
          v-for="field in fields"
          :key="field.key"
        >
          <label
            class="flex items-baseline gap-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            :for="`edit-field-${field.key}`"
          >
            <span>{{ field.label }}</span>
            <span
              v-if="field.required"
              class="text-red-600 dark:text-red-400"
              aria-hidden="true"
            >*</span>
          </label>
          <div class="mt-2">
            <UTextarea
              v-if="field.type === 'textarea'"
              :id="`edit-field-${field.key}`"
              v-model="textValues[field.key]"
              :rows="3"
              class="w-full"
            />
            <USelect
              v-else-if="field.type === 'select'"
              :id="`edit-field-${field.key}`"
              v-model="textValues[field.key]"
              :items="field.options ?? []"
              class="w-full"
            />
            <div
              v-else-if="field.type === 'multiselect'"
              class="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2"
            >
              <UCheckbox
                v-for="option in field.options ?? []"
                :key="option"
                :model-value="multiselectSelected(field.key, option)"
                :label="option"
                @update:model-value="value => toggleMultiselect(field.key, option, value === true)"
              />
            </div>
            <UInput
              v-else
              :id="`edit-field-${field.key}`"
              v-model="textValues[field.key]"
              :placeholder="field.placeholder"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="soft"
          @click="open = false"
        />
        <UButton
          label="保存修改"
          icon="i-lucide-save"
          :loading="saving"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
