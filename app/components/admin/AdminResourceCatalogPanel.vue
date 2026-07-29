<script setup lang="ts">
import type { AdminRecord, AdminResourceConfig } from './types'
import {
  displayAdminResourceCell,
  getAdminResourceRecordId,
  getAdminResourceRecordStatus,
  getAdminResourceRowTitle,
  readAdminColumnValue
} from '~/utils/admin-resource-presentation'

const props = defineProps<{
  config: AdminResourceConfig
  records: AdminRecord[]
  total: number
  stats: Record<string, number>
  page: number
  pageCount: number
  loading: boolean
  loadError: string
  canEdit: boolean
  canDelete: boolean
  writeBusy: boolean
  rowActionId: string | null
}>()

const searchQuery = defineModel<string>('searchQuery', { required: true })
const filterValues = defineModel<Record<string, string>>('filterValues', { required: true })

const emit = defineEmits<{
  refresh: []
  changePage: [page: number]
  edit: [record: AdminRecord]
  setPublicationStatus: [record: AdminRecord, status: 'published' | 'archived']
  requestDelete: [record: AdminRecord]
}>()

function recordId(record: AdminRecord): string {
  return getAdminResourceRecordId(record)
}

function rowTitle(record: AdminRecord): string {
  return getAdminResourceRowTitle(record, props.config.rowTitleKey)
}

function recordStatus(record: AdminRecord): string {
  return getAdminResourceRecordStatus(record, props.config.statusKey || 'status')
}
</script>

<template>
  <section class="mt-5 overflow-hidden rounded-md border border-zinc-200 bg-white">
    <div
      v-if="config.stats"
      class="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-zinc-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-5"
      role="group"
      aria-label="地点坐标统计"
    >
      <div
        v-for="item in config.stats.items"
        :key="item.key"
        class="flex min-w-0 items-center gap-3"
      >
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500">
          <UIcon
            :name="item.icon"
            class="size-4"
          />
        </span>
        <dl class="min-w-0">
          <dt class="truncate text-xs text-zinc-500">
            {{ item.label }}
          </dt>
          <dd class="mt-0.5 text-lg font-semibold tabular-nums text-zinc-950">
            {{ stats[item.key] ?? 0 }}
          </dd>
        </dl>
      </div>
    </div>

    <div class="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/70 p-3 lg:flex-row lg:items-center">
      <UInput
        v-if="config.searchable !== false"
        v-model="searchQuery"
        icon="i-lucide-search"
        :placeholder="config.searchPlaceholder"
        aria-label="搜索记录"
        class="w-full lg:max-w-sm"
      />

      <div class="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:justify-end">
        <USelect
          v-for="filter in config.filters ?? []"
          :key="filter.key"
          v-model="filterValues[filter.key]"
          :items="[{ label: filter.allLabel, value: 'all' }, ...filter.options]"
          value-key="value"
          label-key="label"
          :aria-label="filter.label"
          class="w-full lg:w-44"
        />
      </div>
    </div>

    <div
      v-if="loadError"
      class="flex flex-col items-start gap-3 border-b border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div class="flex items-start gap-2 text-sm text-red-800">
        <UIcon
          name="i-lucide-circle-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        <span>{{ loadError }}</span>
      </div>
      <UButton
        label="重试"
        icon="i-lucide-refresh-cw"
        color="error"
        variant="outline"
        size="sm"
        @click="emit('refresh')"
      />
    </div>

    <div
      v-if="loading && records.length === 0"
      class="divide-y divide-zinc-100"
      aria-label="正在加载"
    >
      <div
        v-for="index in 6"
        :key="index"
        class="flex items-center gap-4 px-4 py-4"
      >
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-4 w-24" />
        <USkeleton class="ml-auto h-8 w-28" />
      </div>
    </div>

    <template v-else-if="records.length">
      <div class="hidden overflow-x-auto md:block">
        <table class="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead class="bg-zinc-50 text-xs font-semibold text-zinc-500">
            <tr>
              <th
                v-for="column in config.columns"
                :key="column.key"
                class="border-b border-zinc-200 px-4 py-2.5"
                :class="column.class"
              >
                {{ column.label }}
              </th>
              <th class="w-44 border-b border-zinc-200 px-4 py-2.5 text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr
              v-for="record in records"
              :key="recordId(record)"
              class="hover:bg-zinc-50/70"
            >
              <td
                v-for="column in config.columns"
                :key="column.key"
                class="max-w-xs px-4 py-3 text-zinc-600"
                :class="column.class"
              >
                <AdminStatusBadge
                  v-if="column.kind === 'status'"
                  :value="readAdminColumnValue(record, column)"
                />
                <span
                  v-else
                  class="line-clamp-2"
                  :class="column.key === config.rowTitleKey ? 'font-semibold text-zinc-950' : ''"
                >
                  {{ displayAdminResourceCell(record, column) }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UTooltip
                    v-if="canEdit"
                    text="编辑"
                  >
                    <UButton
                      icon="i-lucide-pencil"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :disabled="writeBusy"
                      :aria-label="`编辑${rowTitle(record)}`"
                      @click="emit('edit', record)"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="config.publicationActions && recordStatus(record) !== 'published'"
                    text="发布"
                  >
                    <UButton
                      icon="i-lucide-send"
                      color="success"
                      variant="ghost"
                      size="sm"
                      :loading="rowActionId === recordId(record)"
                      :disabled="writeBusy"
                      :aria-label="`发布${rowTitle(record)}`"
                      @click="emit('setPublicationStatus', record, 'published')"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="config.publicationActions && recordStatus(record) === 'published'"
                    text="下架"
                  >
                    <UButton
                      icon="i-lucide-archive"
                      color="warning"
                      variant="ghost"
                      size="sm"
                      :loading="rowActionId === recordId(record)"
                      :disabled="writeBusy"
                      :aria-label="`下架${rowTitle(record)}`"
                      @click="emit('setPublicationStatus', record, 'archived')"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="canDelete"
                    text="删除"
                  >
                    <UButton
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="sm"
                      class="!text-red-800 hover:!bg-red-50"
                      :disabled="writeBusy"
                      :aria-label="`删除${rowTitle(record)}`"
                      @click="emit('requestDelete', record)"
                    />
                  </UTooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-zinc-100 md:hidden">
        <article
          v-for="record in records"
          :key="recordId(record)"
          class="p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-zinc-950">
                {{ rowTitle(record) }}
              </p>
              <dl class="mt-2 space-y-1.5 text-xs">
                <div
                  v-for="column in config.columns.slice(1, 4)"
                  :key="column.key"
                  class="flex gap-2"
                >
                  <dt class="w-16 shrink-0 text-zinc-400">
                    {{ column.label }}
                  </dt>
                  <dd class="min-w-0 text-zinc-600">
                    <AdminStatusBadge
                      v-if="column.kind === 'status'"
                      :value="readAdminColumnValue(record, column)"
                    />
                    <span
                      v-else
                      class="line-clamp-2"
                    >{{ displayAdminResourceCell(record, column) }}</span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-2">
            <UButton
              v-if="canEdit"
              icon="i-lucide-pencil"
              label="编辑"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="writeBusy"
              @click="emit('edit', record)"
            />
            <UButton
              v-if="config.publicationActions && recordStatus(record) !== 'published'"
              icon="i-lucide-send"
              label="发布"
              color="success"
              variant="ghost"
              size="sm"
              :loading="rowActionId === recordId(record)"
              :disabled="writeBusy"
              @click="emit('setPublicationStatus', record, 'published')"
            />
            <UButton
              v-if="config.publicationActions && recordStatus(record) === 'published'"
              icon="i-lucide-archive"
              label="下架"
              color="warning"
              variant="ghost"
              size="sm"
              :loading="rowActionId === recordId(record)"
              :disabled="writeBusy"
              @click="emit('setPublicationStatus', record, 'archived')"
            />
            <UButton
              v-if="canDelete"
              icon="i-lucide-trash-2"
              label="删除"
              color="error"
              variant="ghost"
              size="sm"
              class="ml-auto !text-red-800 hover:!bg-red-50"
              :disabled="writeBusy"
              @click="emit('requestDelete', record)"
            />
          </div>
        </article>
      </div>
    </template>

    <div
      v-else-if="!loadError"
      class="grid min-h-64 place-items-center p-8 text-center"
    >
      <div>
        <span class="mx-auto grid size-10 place-items-center rounded-md bg-zinc-100 text-zinc-500">
          <UIcon
            name="i-lucide-inbox"
            class="size-5"
          />
        </span>
        <p class="mt-3 text-sm font-semibold text-zinc-800">
          没有匹配记录
        </p>
        <p class="mt-1 text-xs text-zinc-500">
          {{ config.searchable === false ? '暂无记录。' : '调整搜索或筛选条件后重试。' }}
        </p>
      </div>
    </div>

    <footer class="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
      <span>共 {{ total }} 条，第 {{ page }} / {{ pageCount }} 页</span>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          label="上一页"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="page <= 1 || loading"
          @click="emit('changePage', page - 1)"
        />
        <UButton
          icon="i-lucide-chevron-right"
          trailing
          label="下一页"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="page >= pageCount || loading"
          @click="emit('changePage', page + 1)"
        />
      </div>
    </footer>
  </section>
</template>
