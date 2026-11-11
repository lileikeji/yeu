<script setup lang="ts">
import type { ApiNoticeAction } from '~~/shared/types/server'

interface QuickEntryOption extends ApiNoticeAction {
  value: string
}

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const quickEntryOptions: QuickEntryOption[] = [
  { value: '/', label: '首页', href: '/', icon: 'i-lucide-house' },
  { value: '/map', label: '校园地图', href: '/map', icon: 'i-lucide-map-pinned' },
  { value: '/procedures/arrival', label: '报到流程', href: '/procedures/arrival', icon: 'i-lucide-clipboard-check' },
  { value: '/checklist', label: '新生待办清单', href: '/checklist', icon: 'i-lucide-list-checks' },
  { value: '/dorms', label: '宿舍信息', href: '/dorms', icon: 'i-lucide-bed-double' },
  { value: '/nearby', label: '吃喝玩乐', href: '/nearby', icon: 'i-lucide-coffee' },
  { value: '/panorama', label: '校园全景', href: '/panorama', icon: 'i-lucide-orbit' },
  { value: '/major-lookup', label: '专业查询', href: '/major-lookup', icon: 'i-lucide-graduation-cap' },
  { value: '/student-rules', label: '学生手册', href: '/student-rules', icon: 'i-lucide-book-open' },
  { value: '/clubs', label: '社团入口', href: '/clubs', icon: 'i-lucide-users-round' },
  { value: '/departments', label: '部门入口', href: '/departments', icon: 'i-lucide-landmark' },
  { value: '/transport', label: '交通指南', href: '/transport', icon: 'i-lucide-bus-front' },
  { value: '/search', label: '问答', href: '/search', icon: 'i-lucide-sparkles' },
  { value: '/contact', label: '联系整理者', href: '/contact', icon: 'i-lucide-message-circle' }
]

const customEntryValue = '__custom__'

function parseActions(value: string): ApiNoticeAction[] {
  if (!value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): ApiNoticeAction[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      const label = typeof record.label === 'string' ? record.label : ''
      const href = typeof record.href === 'string' ? record.href : ''
      const icon = typeof record.icon === 'string' ? record.icon : 'i-lucide-link'
      return [{ label, href, icon }]
    }).slice(0, 12)
  } catch {
    return []
  }
}

const actions = computed(() => parseActions(props.modelValue))

function writeActions(next: ApiNoticeAction[]): void {
  emit('update:modelValue', JSON.stringify(next))
}

function addAction(): void {
  writeActions([
    ...actions.value,
    { label: '', href: '', icon: 'i-lucide-link' }
  ])
}

function updateAction(index: number, patch: Partial<ApiNoticeAction>): void {
  writeActions(actions.value.map((action, actionIndex) => (
    actionIndex === index ? { ...action, ...patch } : action
  )))
}

function removeAction(index: number): void {
  writeActions(actions.value.filter((_, actionIndex) => actionIndex !== index))
}

function selectedEntry(action: ApiNoticeAction): string {
  return quickEntryOptions.find(option => option.href === action.href)?.value ?? customEntryValue
}

function chooseEntry(index: number, value: string): void {
  if (value === customEntryValue) {
    updateAction(index, { href: '', icon: 'i-lucide-link' })
    return
  }

  const option = quickEntryOptions.find(item => item.value === value)
  if (!option) return
  updateAction(index, { label: option.label, href: option.href, icon: option.icon })
}

function isIncomplete(action: ApiNoticeAction): boolean {
  return !action.label.trim() || !action.href.trim()
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="actions.length"
      class="space-y-3"
    >
      <div
        v-for="(action, index) in actions"
        :key="index"
        class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/70 p-3"
      >
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
          <UInput
            :model-value="action.label"
            placeholder="按钮文字，例如：查看报到流程"
            aria-label="快捷入口按钮文字"
            @update:model-value="updateAction(index, { label: String($event ?? '') })"
          />
          <USelect
            :model-value="selectedEntry(action)"
            :items="[{ label: '自定义链接', value: customEntryValue }, ...quickEntryOptions]"
            value-key="value"
            label-key="label"
            aria-label="选择快捷入口"
            @update:model-value="chooseEntry(index, String($event ?? ''))"
          />
          <UButton
            icon="i-lucide-trash-2"
            label="删除"
            color="error"
            variant="ghost"
            size="sm"
            @click="removeAction(index)"
          />
        </div>
        <div class="mt-2 flex items-center gap-2">
          <UInput
            v-if="selectedEntry(action) === customEntryValue"
            :model-value="action.href"
            placeholder="站内路径 /map，或 https:// 开头的链接"
            aria-label="自定义快捷入口链接"
            class="min-w-0 flex-1"
            @update:model-value="updateAction(index, { href: String($event ?? '') })"
          />
          <p
            v-else
            class="min-w-0 flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400"
            :title="action.href"
          >
            {{ action.href }}
          </p>
          <span
            v-if="isIncomplete(action)"
            class="shrink-0 text-xs text-amber-700 dark:text-amber-300"
          >请补全</span>
        </div>
      </div>
    </div>

    <UButton
      icon="i-lucide-plus"
      label="添加快捷入口"
      color="neutral"
      variant="outline"
      size="sm"
      :disabled="actions.length >= 12"
      @click="addAction"
    />
    <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
      选择已有功能会自动填入入口；自定义链接支持站内路径或安全的 https 链接，最多 12 个。
    </p>
  </div>
</template>
