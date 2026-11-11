<script setup lang="ts">
import type {
  RecruitExportColumn,
  RecruitFormField,
  RecruitSubmission
} from '~~/shared/types'
import { recruitSheetCellText } from '~/composables/useRecruitSubmissions'

const props = defineProps<{
  columns: RecruitExportColumn[]
  sources: { key: string, label: string }[]
  rows: RecruitSubmission[]
  fields: RecruitFormField[]
  savingKey: string
}>()

const emit = defineEmits<{
  download: []
  addColumn: []
  removeColumn: [index: number]
  moveColumn: [index: number, delta: number]
  changeColumnKey: [column: RecruitExportColumn, key: string]
  changeColumnLabel: [column: RecruitExportColumn, label: string]
  saveCell: [row: RecruitSubmission, key: string, value: string]
}>()

function sheetFieldType(key: string): string | undefined {
  return props.fields.find(field => field.key === key)?.type
}
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            总表导出列
          </h2>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            调整导出 Excel 的列与顺序，保存配置后生效。
          </p>
        </div>
        <UButton
          icon="i-lucide-file-spreadsheet"
          label="下载总表（xlsx）"
          @click="emit('download')"
        />
      </div>
      <div class="space-y-2">
        <div
          v-for="(column, index) in columns"
          :key="`${column.key}-${index}`"
          class="flex flex-wrap items-center gap-2"
        >
          <USelect
            :model-value="column.key"
            :items="sources.map(source => ({ label: source.label, value: source.key }))"
            class="w-52"
            @update:model-value="value => emit('changeColumnKey', column, String(value))"
          />
          <UInput
            :model-value="column.label"
            placeholder="表头显示名"
            class="w-44"
            @update:model-value="value => emit('changeColumnLabel', column, String(value))"
          />
          <div class="flex items-center gap-1">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-up"
              aria-label="上移"
              @click="emit('moveColumn', index, -1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-down"
              aria-label="下移"
              @click="emit('moveColumn', index, 1)"
            />
            <UButton
              size="xs"
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              aria-label="删除列"
              @click="emit('removeColumn', index)"
            />
          </div>
        </div>
      </div>
      <UButton
        size="xs"
        icon="i-lucide-plus"
        label="添加导出列"
        variant="soft"
        @click="emit('addColumn')"
      />
    </div>

    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
      <div>
        <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          总表在线预览
        </h2>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          按上方导出列实时预览全部提交，单元格可直接修改，失焦后自动保存并同步到文档与 Excel。
        </p>
      </div>
      <div
        v-if="rows.length === 0"
        class="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md p-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        还没有提交数据
      </div>
      <div
        v-else
        class="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800"
      >
        <table class="w-full text-sm">
          <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-left text-xs text-zinc-500 dark:text-zinc-400">
            <tr>
              <th
                v-for="column in columns"
                :key="`head-${column.key}`"
                class="px-3 py-2 font-medium whitespace-nowrap"
              >
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr
              v-for="row in rows"
              :key="row.id"
              class="text-zinc-800 dark:text-zinc-200"
            >
              <td
                v-for="column in columns"
                :key="`${row.id}:${column.key}`"
                class="px-2 py-1.5 min-w-[9rem]"
              >
                <span
                  v-if="sheetFieldType(column.key) === 'multiselect'"
                  class="text-xs leading-6"
                >{{ recruitSheetCellText(row, column.key) || '—' }}</span>
                <UInput
                  v-else
                  size="xs"
                  class="w-full"
                  :model-value="recruitSheetCellText(row, column.key)"
                  :loading="savingKey === `${row.id}:${column.key}`"
                  @change="event => emit('saveCell', row, column.key, (event.target as HTMLInputElement)?.value ?? '')"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
