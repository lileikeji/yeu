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
    title="删除记录"
    :description="`确认删除“${targetTitle}”？已公开内容优先使用下架。`"
    :dismissible="!deleting"
  >
    <template #body>
      <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        删除操作不能在当前界面撤销。如果记录仍被其他内容使用，系统会阻止删除。
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
