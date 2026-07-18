<script setup lang="ts">
import type { ApiPlace } from '~~/shared/types/server'
import type { QueuedCoordinateObservation } from '~/utils/coordinate-observation-queue'
import {
  formatCoordinateObservationDate,
  getCoordinateObservationPlaceName
} from '~/utils/field-observation-presentation'

const props = defineProps<{
  records: QueuedCoordinateObservation[]
  places: Array<Pick<ApiPlace, 'id' | 'name'>>
  syncing: boolean
  retryingId: string | null
  errors: Record<string, string>
  deleteTarget: QueuedCoordinateObservation | null
  deleting: boolean
}>()

const emit = defineEmits<{
  sync: []
  retry: [record: QueuedCoordinateObservation]
  requestDelete: [record: QueuedCoordinateObservation]
  confirmDelete: []
}>()

const deleteOpen = defineModel<boolean>('deleteOpen', { required: true })
const expandedId = ref<string | null>(null)

function placeName(placeId: string): string {
  return getCoordinateObservationPlaceName(props.places, placeId)
}

function toggleDetails(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}

watch(() => props.records, (records) => {
  if (expandedId.value && !records.some(record => record.id === expandedId.value)) {
    expandedId.value = null
  }
})
</script>

<template>
  <section class="mt-8 border-y border-amber-200 bg-amber-50/50">
    <div class="flex flex-col gap-3 border-b border-amber-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-medium text-amber-800">
          本机 IndexedDB
        </p>
        <h2 class="mt-1 text-base font-bold text-zinc-950">
          离线观测队列
        </h2>
        <p class="mt-1 text-xs leading-5 text-zinc-600">
          每条记录保留原始幂等键；重试不会创建重复观测。
        </p>
      </div>
      <UButton
        icon="i-lucide-cloud-upload"
        label="全部同步"
        size="sm"
        :loading="syncing"
        :disabled="retryingId !== null"
        @click="emit('sync')"
      />
    </div>

    <div class="divide-y divide-amber-200">
      <article
        v-for="record in records"
        :key="record.id"
        class="px-4 py-4"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h3 class="font-semibold text-zinc-950">
              {{ placeName(record.payload.placeId) }}
            </h3>
            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
              <span>{{ record.payload.samples.length }} 个样本</span>
              <span>{{ record.payload.pointRole === 'main-entrance' ? '主入口' : '场地点' }}</span>
              <span>{{ formatCoordinateObservationDate(record.queuedAt) }}</span>
            </div>
            <p
              v-if="errors[record.id]"
              class="mt-2 text-xs leading-5 text-red-700"
              role="alert"
            >
              {{ errors[record.id] }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton
              :icon="expandedId === record.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              :label="expandedId === record.id ? '收起' : '查看'"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="toggleDetails(record.id)"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              label="重试"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="retryingId === record.id"
              :disabled="syncing || (retryingId !== null && retryingId !== record.id)"
              @click="emit('retry', record)"
            />
            <UTooltip text="删除本地记录">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="soft"
                size="sm"
                :aria-label="`删除${placeName(record.payload.placeId)}的本地观测`"
                :disabled="syncing || retryingId !== null"
                @click="emit('requestDelete', record)"
              />
            </UTooltip>
          </div>
        </div>

        <div
          v-if="expandedId === record.id"
          class="mt-4 border-t border-amber-200 pt-4"
        >
          <dl class="grid gap-x-5 gap-y-3 text-xs sm:grid-cols-2">
            <div>
              <dt class="text-zinc-500">
                现场说明
              </dt>
              <dd class="mt-1 leading-5 text-zinc-800">
                {{ record.payload.evidenceNote }}
              </dd>
            </div>
            <div>
              <dt class="text-zinc-500">
                本地记录编号
              </dt>
              <dd class="mt-1 text-zinc-800">
                {{ record.payload.clientObservationId.slice(0, 12) }}…
              </dd>
            </div>
          </dl>
          <div class="mt-4 overflow-x-auto">
            <table class="min-w-full text-left text-xs">
              <thead class="text-zinc-500">
                <tr>
                  <th class="whitespace-nowrap px-2 py-2 font-medium">
                    样本
                  </th>
                  <th class="whitespace-nowrap px-2 py-2 font-medium">
                    经度
                  </th>
                  <th class="whitespace-nowrap px-2 py-2 font-medium">
                    纬度
                  </th>
                  <th class="whitespace-nowrap px-2 py-2 font-medium">
                    定位精度
                  </th>
                  <th class="whitespace-nowrap px-2 py-2 font-medium">
                    采集时间
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-amber-100 text-zinc-800">
                <tr
                  v-for="(sample, index) in record.payload.samples"
                  :key="`${record.id}-${index}`"
                >
                  <td class="whitespace-nowrap px-2 py-2">
                    {{ index + 1 }}
                  </td>
                  <td class="whitespace-nowrap px-2 py-2 font-mono">
                    {{ sample.longitude.toFixed(7) }}
                  </td>
                  <td class="whitespace-nowrap px-2 py-2 font-mono">
                    {{ sample.latitude.toFixed(7) }}
                  </td>
                  <td class="whitespace-nowrap px-2 py-2">
                    {{ sample.accuracyMeters.toFixed(1) }} m
                  </td>
                  <td class="whitespace-nowrap px-2 py-2">
                    {{ formatCoordinateObservationDate(sample.capturedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </article>
    </div>

    <UModal
      v-model:open="deleteOpen"
      title="删除本地观测"
      :description="deleteTarget ? `确认删除“${placeName(deleteTarget.payload.placeId)}”的离线观测？` : '确认删除此离线观测？'"
      :dismissible="!deleting"
    >
      <template #body>
        <p class="text-sm leading-6 text-zinc-600">
          删除后无法从本机队列恢复。仅当这条记录确定无效或已经通过其他方式提交时执行此操作。
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            :disabled="deleting"
            @click="() => { deleteOpen = false }"
          />
          <UButton
            icon="i-lucide-trash-2"
            label="确认删除"
            color="error"
            :loading="deleting"
            @click="emit('confirmDelete')"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
