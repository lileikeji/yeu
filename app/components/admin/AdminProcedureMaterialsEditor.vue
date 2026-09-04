<script setup lang="ts">
import type { ProcedureAudience } from '~~/shared/constants/server'
import type {
  ProcedureAudienceOption,
  ProcedureInformationStateOption,
  ProcedureMaterialForm,
  ProcedureSelectOption
} from './procedure-editor-types'

defineProps<{
  materials: ProcedureMaterialForm[]
  audienceOptions: ProcedureAudienceOption[]
  informationStateOptions: ProcedureInformationStateOption[]
  requiredOptions: ProcedureSelectOption[]
  placeOptions: ProcedureSelectOption[]
  departmentOptions: ProcedureSelectOption[]
  referencesLoading: boolean
}>()

const emit = defineEmits<{
  add: []
  remove: [index: number]
  move: [index: number, direction: -1 | 1]
  toggleAudience: [target: ProcedureMaterialForm, audience: ProcedureAudience, checked: boolean]
  setRequired: [target: ProcedureMaterialForm, value: unknown]
}>()

function requiredValue(value: boolean | null): string {
  if (value === true) return 'required'
  if (value === false) return 'optional'
  return 'unknown'
}
</script>

<template>
  <section>
    <div class="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          所需材料
        </h3>
        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          材料可留空；已添加材料按此处顺序展示。
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="添加材料"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('add')"
      />
    </div>

    <div class="mt-3 space-y-3">
      <article
        v-for="(material, index) in materials"
        :key="material.key"
        class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/40 p-3 sm:p-4"
      >
        <header class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            材料 {{ index + 1 }}
          </p>
          <div class="flex items-center gap-1">
            <UTooltip text="上移">
              <UButton
                icon="i-lucide-arrow-up"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="index === 0"
                :aria-label="`上移材料 ${index + 1}`"
                @click="emit('move', index, -1)"
              />
            </UTooltip>
            <UTooltip text="下移">
              <UButton
                icon="i-lucide-arrow-down"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="index === materials.length - 1"
                :aria-label="`下移材料 ${index + 1}`"
                @click="emit('move', index, 1)"
              />
            </UTooltip>
            <UTooltip text="删除材料">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="`删除材料 ${index + 1}`"
                @click="emit('remove', index)"
              />
            </UTooltip>
          </div>
        </header>
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField
            label="材料名称"
            required
            class="sm:col-span-2"
          >
            <UInput
              v-model="material.name"
              placeholder="使用通知中的正式名称"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="材料说明"
            class="sm:col-span-2"
          >
            <UTextarea
              v-model="material.description"
              :rows="2"
              autoresize
              placeholder="说明原件、复印件、份数等已确认要求。"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="适用人群"
            required
            class="sm:col-span-2"
          >
            <div class="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
              <UCheckbox
                v-for="option in audienceOptions"
                :key="option.value"
                :model-value="material.audience.includes(option.value)"
                :label="option.label"
                @update:model-value="value => emit('toggleAudience', material, option.value, value === true)"
              />
            </div>
          </UFormField>
          <UFormField label="信息状态">
            <USelect
              v-model="material.informationState"
              :items="informationStateOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="是否必需">
            <USelect
              :model-value="requiredValue(material.isRequired)"
              :items="requiredOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              @update:model-value="value => emit('setRequired', material, value)"
            />
          </UFormField>
          <UFormField label="提交地点">
            <USelectMenu
              v-model="material.placeId"
              :items="placeOptions"
              value-key="value"
              label-key="label"
              placeholder="选择地点"
              :loading="referencesLoading"
              class="w-full"
            />
          </UFormField>
          <UFormField label="负责部门">
            <USelectMenu
              v-model="material.departmentId"
              :items="departmentOptions"
              value-key="value"
              label-key="label"
              placeholder="选择部门"
              :loading="referencesLoading"
              class="w-full"
            />
          </UFormField>
        </div>
      </article>

      <div
        v-if="materials.length === 0"
        class="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-5 text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        当前流程未登记所需材料。
      </div>
    </div>
  </section>
</template>
