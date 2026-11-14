<script setup lang="ts">
import type { ApiProcedure } from '~~/shared/types/server'
import type { ProcedurePublicationStatus } from '~/utils/admin-procedure-catalog'
import {
  adminProcedureStatusOptions as statusOptions,
  formatAdminProcedureDate as formatDate,
  getProcedureAudienceLabel as audienceLabel,
  getProcedureInformationStateColor as informationStateColor,
  getProcedureInformationStateLabel as informationStateLabel,
  getProcedureMethodLabel as methodLabel
} from '~/utils/admin-procedure-presentation'

defineProps<{
  procedures: ApiProcedure[]
  total: number
  page: number
  pageCount: number
  loading: boolean
  loadError: string
  rowActionId: string | null
}>()

const searchQuery = defineModel<string>('searchQuery', { required: true })
const statusFilter = defineModel<'all' | ProcedurePublicationStatus>('statusFilter', { required: true })

const emit = defineEmits<{
  refresh: []
  changePage: [page: number]
  edit: [procedure: ApiProcedure]
  rowAction: [procedure: ApiProcedure, action: 'publish' | 'unpublish']
  requestDelete: [procedure: ApiProcedure]
}>()
</script>

<template>
  <section class="mt-5 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900">
    <div class="grid gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/70 p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="搜索流程、步骤或材料"
        aria-label="搜索办事流程"
      />
      <USelect
        v-model="statusFilter"
        :items="statusOptions"
        value-key="value"
        label-key="label"
        aria-label="按发布状态筛选"
      />
    </div>

    <div
      v-if="loadError"
      class="flex flex-col items-start gap-3 border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div class="flex items-start gap-2 text-sm text-red-800 dark:text-red-300">
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
      v-if="loading && procedures.length === 0"
      class="divide-y divide-zinc-100 dark:divide-zinc-800"
      aria-label="正在加载流程"
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

    <template v-else-if="procedures.length">
      <div class="hidden overflow-x-auto md:block">
        <table class="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <tr>
              <th class="min-w-64 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
                流程
              </th>
              <th class="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
                适用人群
              </th>
              <th class="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
                办理方式
              </th>
              <th class="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
                信息状态
              </th>
              <th class="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
                发布状态
              </th>
              <th class="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
                最后确认
              </th>
              <th class="w-44 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
            <tr
              v-for="procedure in procedures"
              :key="procedure.id"
              class="hover:bg-zinc-50/70"
            >
              <td class="px-4 py-3">
                <p class="line-clamp-1 font-semibold text-zinc-950 dark:text-zinc-100">
                  {{ procedure.title }}
                </p>
                <p class="mt-1 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {{ procedure.steps.length }} 个步骤 · {{ procedure.materials.length }} 项材料
                </p>
              </td>
              <td class="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                {{ audienceLabel(procedure.audience) }}
              </td>
              <td class="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                {{ methodLabel(procedure.method) }}
              </td>
              <td class="px-4 py-3">
                <UBadge
                  :color="informationStateColor(procedure.informationState)"
                  variant="soft"
                  size="sm"
                >
                  {{ informationStateLabel(procedure.informationState) }}
                </UBadge>
              </td>
              <td class="px-4 py-3">
                <AdminStatusBadge :value="procedure.status" />
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                {{ formatDate(procedure.lastVerifiedAt) }}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UTooltip text="编辑">
                    <UButton
                      icon="i-lucide-pencil"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :aria-label="`编辑${procedure.title}`"
                      @click="emit('edit', procedure)"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="procedure.status !== 'published'"
                    text="发布"
                  >
                    <UButton
                      icon="i-lucide-send"
                      color="success"
                      variant="ghost"
                      size="sm"
                      :loading="rowActionId === procedure.id"
                      :disabled="rowActionId !== null && rowActionId !== procedure.id"
                      :aria-label="`发布${procedure.title}`"
                      @click="emit('rowAction', procedure, 'publish')"
                    />
                  </UTooltip>
                  <UTooltip
                    v-else
                    text="下架"
                  >
                    <UButton
                      icon="i-lucide-archive"
                      color="warning"
                      variant="ghost"
                      size="sm"
                      :loading="rowActionId === procedure.id"
                      :disabled="rowActionId !== null && rowActionId !== procedure.id"
                      :aria-label="`下架${procedure.title}`"
                      @click="emit('rowAction', procedure, 'unpublish')"
                    />
                  </UTooltip>
                  <UTooltip text="删除">
                    <UButton
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="sm"
                      :aria-label="`删除${procedure.title}`"
                      @click="emit('requestDelete', procedure)"
                    />
                  </UTooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-zinc-100 dark:divide-zinc-800 md:hidden">
        <article
          v-for="procedure in procedures"
          :key="procedure.id"
          class="p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="line-clamp-2 text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                {{ procedure.title }}
              </p>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {{ procedure.steps.length }} 个步骤 · {{ procedure.materials.length }} 项材料
              </p>
            </div>
            <AdminStatusBadge :value="procedure.status" />
          </div>
          <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div>
              <dt class="text-zinc-400 dark:text-zinc-500">
                适用人群
              </dt>
              <dd class="mt-0.5 text-zinc-700 dark:text-zinc-200">
                {{ audienceLabel(procedure.audience) }}
              </dd>
            </div>
            <div>
              <dt class="text-zinc-400 dark:text-zinc-500">
                办理方式
              </dt>
              <dd class="mt-0.5 text-zinc-700 dark:text-zinc-200">
                {{ methodLabel(procedure.method) }}
              </dd>
            </div>
          </dl>
          <div class="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
            <UButton
              icon="i-lucide-pencil"
              label="编辑"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="emit('edit', procedure)"
            />
            <UButton
              v-if="procedure.status !== 'published'"
              icon="i-lucide-send"
              label="发布"
              color="success"
              variant="ghost"
              size="sm"
              :loading="rowActionId === procedure.id"
              :disabled="rowActionId !== null && rowActionId !== procedure.id"
              @click="emit('rowAction', procedure, 'publish')"
            />
            <UButton
              v-else
              icon="i-lucide-archive"
              label="下架"
              color="warning"
              variant="ghost"
              size="sm"
              :loading="rowActionId === procedure.id"
              :disabled="rowActionId !== null && rowActionId !== procedure.id"
              @click="emit('rowAction', procedure, 'unpublish')"
            />
            <UButton
              icon="i-lucide-trash-2"
              label="删除"
              color="error"
              variant="ghost"
              size="sm"
              class="ml-auto"
              @click="emit('requestDelete', procedure)"
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
        <span class="mx-auto grid size-10 place-items-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
          <UIcon
            name="i-lucide-list-x"
            class="size-5"
          />
        </span>
        <p class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          没有匹配流程
        </p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          调整搜索或状态筛选后重试。
        </p>
      </div>
    </div>

    <footer class="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/70 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
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
