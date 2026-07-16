<script setup lang="ts">
import type {
  ProcedureForm,
  ProcedureInformationStateOption
} from './procedure-editor-types'

defineProps<{
  informationStateOptions: ProcedureInformationStateOption[]
}>()

const form = defineModel<ProcedureForm>('form', { required: true })
</script>

<template>
  <section>
    <h3 class="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">
      状态与时间
    </h3>
    <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField
        label="信息确认状态"
        required
      >
        <USelect
          v-model="form.informationState"
          :items="informationStateOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="前台状态说明"
        required
      >
        <UInput
          v-model="form.statusText"
          placeholder="例：等待 2026 级通知"
          class="w-full"
        />
      </UFormField>
      <UFormField label="预计办理时长">
        <UInput
          v-model="form.processingTime"
          placeholder="例：约 20 分钟"
          class="w-full"
        />
      </UFormField>
      <UFormField label="截止时间说明">
        <UInput
          v-model="form.deadlineText"
          placeholder="以录取通知书或当年通知为准"
          class="w-full"
        />
      </UFormField>
      <UFormField label="办理开始时间">
        <UInput
          v-model="form.startsAt"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
      <UFormField label="办理结束时间">
        <UInput
          v-model="form.endsAt"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="公开有效期开始"
        description="留空表示不限制开始时间。"
      >
        <UInput
          v-model="form.validFrom"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="公开有效期结束"
        description="过期后前台自动隐藏。"
      >
        <UInput
          v-model="form.validUntil"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="最后核验时间"
        description="发布前必须填写，且不能晚于当前时间。"
        class="sm:col-span-2"
      >
        <UInput
          v-model="form.lastVerifiedAt"
          type="datetime-local"
          class="w-full sm:max-w-md"
        />
      </UFormField>
    </div>
  </section>
</template>
