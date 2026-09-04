<script setup lang="ts">
import type { ProcedureAudience } from '~~/shared/constants/server'
import type {
  ProcedureAudienceOption,
  ProcedureForm,
  ProcedureMethodOption
} from './procedure-editor-types'

defineProps<{
  audienceOptions: ProcedureAudienceOption[]
  methodOptions: ProcedureMethodOption[]
}>()

const form = defineModel<ProcedureForm>('form', { required: true })

const emit = defineEmits<{
  toggleAudience: [target: ProcedureForm, audience: ProcedureAudience, checked: boolean]
}>()
</script>

<template>
  <section>
    <h3 class="border-b border-zinc-200 dark:border-zinc-800 pb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      基本信息
    </h3>
    <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField
        label="流程标题"
        required
      >
        <UInput
          v-model="form.title"
          placeholder="例：新生到校报到"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="网页地址名称"
        description="用于生成网页地址，仅使用小写字母、数字和短横线。"
        required
      >
        <UInput
          v-model="form.slug"
          placeholder="例如 arrival-registration"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="分类"
        description="可留空，用于前台分组。"
      >
        <UInput
          v-model="form.category"
          placeholder="例如 报到入学"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="办理方式"
        required
      >
        <USelect
          v-model="form.method"
          :items="methodOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="适用人群"
        description="至少选择一种。"
        required
        class="sm:col-span-2"
      >
        <div class="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2">
          <UCheckbox
            v-for="option in audienceOptions"
            :key="option.value"
            :model-value="form.audience.includes(option.value)"
            :label="option.label"
            @update:model-value="value => emit('toggleAudience', form, option.value, value === true)"
          />
        </div>
      </UFormField>
      <UFormField
        label="摘要"
        required
        class="sm:col-span-2"
      >
        <UTextarea
          v-model="form.summary"
          :rows="3"
          autoresize
          placeholder="概括适用对象、办理目标和关键信息。"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="详细说明"
        class="sm:col-span-2"
      >
        <UTextarea
          v-model="form.body"
          :rows="6"
          autoresize
          placeholder="填写流程背景、注意事项和统一说明。"
          class="w-full"
        />
      </UFormField>
    </div>
  </section>
</template>
