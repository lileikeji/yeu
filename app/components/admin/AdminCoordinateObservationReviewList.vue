<script setup lang="ts">
import {
  COORDINATE_OBSERVATION_STATUSES,
  MAX_APPROVABLE_COORDINATE_ACCURACY_METERS
} from '~~/shared/constants/server'
import type { ApiCoordinateObservation } from '~~/shared/types/server'
import type { ObservationStatusFilter } from '~/utils/field-observation-catalog'
import {
  formatCoordinateObservationDate as formatDate,
  getCoordinateObservationStatusColor as observationStatusColor,
  getCoordinateObservationStatusLabel as observationStatusLabel,
  getCoordinatePointRoleLabel as pointRoleLabel
} from '~/utils/field-observation-presentation'

defineProps<{
  observations: ApiCoordinateObservation[]
  total: number
  pageCount: number
  loading: boolean
}>()

const emit = defineEmits<{
  applySearch: []
}>()

const searchInput = defineModel<string>('searchInput', { default: '' })
const status = defineModel<ObservationStatusFilter>('status', { default: 'pending' })
const pageSize = defineModel<number>('pageSize', { default: 20 })
const page = defineModel<number>('page', { default: 1 })
const selectedObservationId = defineModel<string | null>('selectedObservationId', {
  default: null
})

const statusOptions = [
  { label: '全部状态', value: 'all' },
  ...COORDINATE_OBSERVATION_STATUSES.map(statusValue => ({
    label: observationStatusLabel(statusValue),
    value: statusValue
  }))
]
const pageSizeOptions = [
  { label: '每页 10 条', value: 10 },
  { label: '每页 20 条', value: 20 },
  { label: '每页 50 条', value: 50 }
]

function goToPreviousPage(): void {
  page.value -= 1
}

function goToNextPage(): void {
  page.value += 1
}
</script>

<template>
  <section class="mt-8">
    <div class="border-b border-zinc-200 pb-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-medium text-green-700">
            审核队列
          </p>
          <h2 class="mt-1 text-lg font-bold text-zinc-950">
            坐标观测记录
          </h2>
          <p class="mt-1 text-xs text-zinc-500">
            共 {{ total }} 条符合条件的观测
          </p>
        </div>
        <div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem_9rem] lg:w-[42rem]">
          <UInput
            v-model="searchInput"
            icon="i-lucide-search"
            placeholder="搜索地点名称"
            aria-label="搜索观测地点"
            @keydown.enter="emit('applySearch')"
          />
          <USelect
            v-model="status"
            :items="statusOptions"
            value-key="value"
            label-key="label"
            aria-label="筛选审核状态"
          />
          <USelect
            v-model="pageSize"
            :items="pageSizeOptions"
            value-key="value"
            label-key="label"
            aria-label="每页条数"
          />
        </div>
      </div>
    </div>

    <div
      v-if="loading && !observations.length"
      class="grid min-h-52 place-items-center text-zinc-500"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin"
      />
    </div>

    <div
      v-else-if="observations.length"
      class="grid gap-6 pt-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)]"
    >
      <div class="order-2 min-w-0 xl:order-1">
        <div class="divide-y divide-zinc-200 border-y border-zinc-200">
          <button
            v-for="observation in observations"
            :key="observation.id"
            type="button"
            class="block w-full px-3 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            :class="selectedObservationId === observation.id ? 'bg-green-50' : 'hover:bg-zinc-50'"
            :aria-pressed="selectedObservationId === observation.id"
            @click="selectedObservationId = observation.id"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-zinc-950">{{ observation.placeName }}</span>
              <UBadge
                :label="observationStatusLabel(observation.reviewStatus)"
                :color="observationStatusColor(observation.reviewStatus)"
                variant="soft"
                size="sm"
              />
              <UBadge
                :label="`${observation.accuracyMeters.toFixed(1)} m`"
                :color="observation.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS ? 'success' : 'error'"
                variant="soft"
                size="sm"
              />
            </div>
            <p class="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600">
              {{ observation.evidenceNote }}
            </p>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span>{{ observation.sampleCount }} 个样本</span>
              <span>{{ pointRoleLabel(observation.pointRole) }}</span>
              <span>{{ formatDate(observation.capturedAt) }}</span>
            </div>
          </button>
        </div>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-zinc-500">
            第 {{ page }} / {{ pageCount }} 页
          </p>
          <div class="flex items-center gap-2">
            <UTooltip text="上一页">
              <UButton
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="outline"
                aria-label="上一页"
                :disabled="page <= 1 || loading"
                @click="goToPreviousPage"
              />
            </UTooltip>
            <span class="min-w-20 text-center text-sm tabular-nums text-zinc-700">
              {{ page }} / {{ pageCount }}
            </span>
            <UTooltip text="下一页">
              <UButton
                icon="i-lucide-chevron-right"
                color="neutral"
                variant="outline"
                aria-label="下一页"
                :disabled="page >= pageCount || loading"
                @click="goToNextPage"
              />
            </UTooltip>
          </div>
        </div>
      </div>

      <slot name="details" />
    </div>

    <p
      v-else-if="!loading"
      class="py-12 text-center text-sm text-zinc-500"
    >
      当前筛选条件下暂无坐标观测
    </p>
  </section>
</template>
