<script setup lang="ts">
defineProps<{
  targetTitle: string
  deleting: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <UModal
    v-model:open="open"
    title="删除办事流程"
    :description="targetTitle ? `确认删除“${targetTitle}”？` : '确认删除此流程？'"
    :dismissible="!deleting"
  >
    <template #body>
      <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        删除后流程会自动归档并从前台隐藏，历史记录和操作记录仍会保留。
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          :disabled="deleting"
          @click="() => { open = false }"
        />
        <UButton
          icon="i-lucide-trash-2"
          label="确认删除"
          color="error"
          :loading="deleting"
          @click="() => { emit('confirm') }"
        />
      </div>
    </template>
  </UModal>
</template>
