<script setup lang="ts">
import type { ProcedureAudience } from '~~/shared/constants/server'
import type {
  ProcedureAudienceOption,
  ProcedureInformationStateOption,
  ProcedureSelectOption,
  ProcedureStepForm
} from './procedure-editor-types'

defineProps<{
  steps: ProcedureStepForm[]
  audienceOptions: ProcedureAudienceOption[]
  informationStateOptions: ProcedureInformationStateOption[]
  placeOptions: ProcedureSelectOption[]
  departmentOptions: ProcedureSelectOption[]
  referencesLoading: boolean
}>()

const emit = defineEmits<{
  add: []
  remove: [index: number]
  move: [index: number, direction: -1 | 1]
  toggleAudience: [target: ProcedureStepForm, audience: ProcedureAudience, checked: boolean]
}>()
</script>

<template>
  <section>
    <div class="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          办理步骤
        </h3>
        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          发布至少需要一个步骤，前台按此处顺序展示。
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="添加步骤"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('add')"
      />
    </div>

    <div class="mt-3 space-y-3">
      <article
        v-for="(step, index) in steps"
        :key="step.key"
        class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/40 p-3 sm:p-4"
      >
        <header class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            步骤 {{ index + 1 }}
          </p>
          <div class="flex items-center gap-1">
            <UTooltip text="上移">
              <UButton
                icon="i-lucide-arrow-up"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="index === 0"
                :aria-label="`上移步骤 ${index + 1}`"
                @click="emit('move', index, -1)"
              />
            </UTooltip>
            <UTooltip text="下移">
              <UButton
                icon="i-lucide-arrow-down"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="index === steps.length - 1"
                :aria-label="`下移步骤 ${index + 1}`"
                @click="emit('move', index, 1)"
              />
            </UTooltip>
            <UTooltip text="删除步骤">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="`删除步骤 ${index + 1}`"
                @click="emit('remove', index)"
              />
            </UTooltip>
          </div>
        </header>
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField
            label="步骤标题"
            required
            class="sm:col-span-2"
          >
            <UInput
              v-model="step.title"
              placeholder="清晰描述本步要完成的事项"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="步骤说明"
            class="sm:col-span-2"
          >
            <UTextarea
              v-model="step.description"
              :rows="3"
              autoresize
              placeholder="填写操作、材料核对和注意事项。"
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
                :model-value="step.audience.includes(option.value)"
                :label="option.label"
                @update:model-value="value => emit('toggleAudience', step, option.value, value === true)"
              />
            </div>
          </UFormField>
          <UFormField label="信息状态">
            <USelect
              v-model="step.informationState"
              :items="informationStateOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="时间说明">
            <UInput
              v-model="step.timeText"
              placeholder="例：到校当天 08:00-17:00"
              class="w-full"
            />
          </UFormField>
          <UFormField label="办理地点">
            <USelectMenu
              v-model="step.placeId"
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
              v-model="step.departmentId"
              :items="departmentOptions"
              value-key="value"
              label-key="label"
              placeholder="选择部门"
              :loading="referencesLoading"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="线上办理链接"
            class="sm:col-span-2"
          >
            <UInput
              v-model="step.actionUrl"
              type="url"
              placeholder="https://"
              class="w-full"
            />
          </UFormField>
        </div>
      </article>

      <div
        v-if="steps.length === 0"
        class="rounded-md border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-5 text-center text-sm text-amber-900 dark:text-amber-300"
      >
        发布流程至少需要一个办理步骤。
      </div>
    </div>
  </section>
</template>
