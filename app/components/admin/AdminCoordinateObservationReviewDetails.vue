<script setup lang="ts">
import { MAX_APPROVABLE_COORDINATE_ACCURACY_METERS } from '~~/shared/constants/server'
import type { ApiCoordinateObservation, ApiPlace } from '~~/shared/types/server'
import {
  formatCoordinateObservationDate as formatDate,
  getCoordinateObservationStatusColor as observationStatusColor,
  getCoordinateObservationStatusLabel as observationStatusLabel,
  getCoordinateCaptureMethodLabel as captureMethodLabel
} from '~/utils/field-observation-presentation'
import { buildCoordinateReviewHint } from '~/utils/field-observation-review'

const props = defineProps<{
  observation: ApiCoordinateObservation
  place: ApiPlace | null
  places: ApiPlace[]
  actionId: string | null
}>()

const emit = defineEmits<{
  review: [observation: ApiCoordinateObservation, action: 'approve' | 'reject']
}>()

const reviewNote = defineModel<string>('reviewNote', { default: '' })
const reviewHint = computed(() => buildCoordinateReviewHint(props.observation, props.place))
</script>

<template>
  <aside
    class="order-1 min-w-0 xl:order-2"
    aria-label="选中定位记录详情"
  >
    <div class="border-b border-zinc-200 pb-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-base font-bold text-zinc-950">
              {{ observation.placeName }}
            </h3>
            <UBadge
              :label="observationStatusLabel(observation.reviewStatus)"
              :color="observationStatusColor(observation.reviewStatus)"
              variant="soft"
            />
            <UBadge
              v-if="observation.outsideCampusReviewBounds"
              label="超出校界缓冲区"
              color="error"
              variant="soft"
            />
          </div>
          <p class="mt-2 text-sm leading-6 text-zinc-600">
            {{ observation.evidenceNote }}
          </p>
        </div>
        <UBadge
          :label="`精度 ${observation.accuracyMeters.toFixed(1)} m`"
          :color="observation.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS ? 'success' : 'error'"
          variant="soft"
        />
      </div>
      <dl class="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt class="text-zinc-500">
            计算结果
          </dt>
          <dd class="mt-1 font-mono text-zinc-900">
            {{ observation.longitude.toFixed(7) }}, {{ observation.latitude.toFixed(7) }}
          </dd>
        </div>
        <div>
          <dt class="text-zinc-500">
            采集方式
          </dt>
          <dd class="mt-1 text-zinc-900">
            {{ captureMethodLabel(observation.captureMethod) }}
          </dd>
        </div>
        <div>
          <dt class="text-zinc-500">
            采集时间
          </dt>
          <dd class="mt-1 text-zinc-900">
            {{ formatDate(observation.capturedAt) }}
          </dd>
        </div>
      </dl>
    </div>

    <div
      v-if="reviewHint"
      class="mt-4 flex gap-3 border-l-4 px-3 py-3 text-sm"
      :class="reviewHint.stage === 'dual-verified'
        ? 'border-green-700 bg-green-50 text-green-950'
        : reviewHint.stage === 'possible-dual'
          ? 'border-blue-700 bg-blue-50 text-blue-950'
          : reviewHint.stage === 'replacement'
            ? 'border-amber-600 bg-amber-50 text-amber-950'
            : 'border-zinc-500 bg-zinc-50 text-zinc-800'"
      role="status"
    >
      <UIcon
        :name="reviewHint.stage === 'dual-verified'
          ? 'i-lucide-badge-check'
          : reviewHint.stage === 'possible-dual'
            ? 'i-lucide-scan-search'
            : reviewHint.stage === 'replacement'
              ? 'i-lucide-triangle-alert'
              : 'i-lucide-map-pin-check-inside'"
        class="mt-0.5 size-4 shrink-0"
      />
      <div>
        <p class="font-semibold">
          {{ reviewHint.title }}
        </p>
        <p class="mt-1 leading-5 opacity-80">
          {{ reviewHint.description }}
        </p>
      </div>
    </div>

    <AdminCoordinateReviewMap
      class="mt-5"
      :observation="observation"
      :place="place"
      :places="places"
    />

    <div
      v-if="observation.reviewStatus === 'pending'"
      class="mt-5 border-t border-zinc-200 pt-4"
    >
      <UFormField
        label="审核依据与现场比对结果"
        required
      >
        <UTextarea
          v-model="reviewNote"
          :rows="3"
          maxlength="2000"
          placeholder="说明定位记录分布、准确范围、入口位置和邻近地点的比对结果"
          class="w-full"
        />
      </UFormField>
      <div class="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UButton
          icon="i-lucide-x"
          label="驳回"
          color="neutral"
          variant="outline"
          :loading="actionId === observation.id"
          :disabled="actionId !== null && actionId !== observation.id"
          @click="emit('review', observation, 'reject')"
        />
        <UButton
          icon="i-lucide-check"
          label="批准这条定位记录"
          :disabled="actionId !== null || observation.accuracyMeters > MAX_APPROVABLE_COORDINATE_ACCURACY_METERS || observation.outsideCampusReviewBounds"
          :loading="actionId === observation.id"
          @click="emit('review', observation, 'approve')"
        />
      </div>
    </div>
    <div
      v-else
      class="mt-5 border-t border-zinc-200 pt-4 text-sm"
    >
      <p class="font-medium text-zinc-800">
        历史审核记录
      </p>
      <p class="mt-2 leading-6 text-zinc-600">
        {{ observation.reviewNote || '未填写审核说明。' }}
      </p>
      <p
        v-if="observation.reviewedAt"
        class="mt-2 text-xs text-zinc-500"
      >
        {{ formatDate(observation.reviewedAt) }}
      </p>
    </div>
  </aside>
</template>
