<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import { throwPublicDetailError } from '~/utils/public-errors'
import {
  filterProcedureItemsForAudience,
  normalizeProcedureAudience,
  type ProcedureAudienceSelection
} from '~/utils/procedure-audience'
import {
  buildProcedureChecklistStorageKey,
  buildProcedureChecklistStorageValue,
  buildProcedureDetailSources,
  buildProcedureMapLink,
  getProcedureEmptyMaterialText,
  getProcedureMaterialTitle,
  getProcedureNoticeText,
  procedureAudienceLabels,
  procedureAudienceOptions,
  procedureMethodLabels,
  procedureStateLabels,
  resolveProcedureAudienceOptionPresentation,
  resolveProcedureAudienceRouteQuery,
  resolveProcedureChecklistFromStorageText,
  resolveProcedureInformationStateBadgeColor,
  resolveProcedureMaterialsCountBadge,
  resolveProcedureStepCompletionPresentation,
  shouldShowProcedureStepAudienceBadges,
  toggleProcedureStep
} from '~~/app/utils/procedure-detail-presentation'

const route = useRoute()
const router = useRouter()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: procedure, error } = await usePublicProcedure(slug)
if (error.value) throwPublicDetailError(error.value, '办事流程')
if (!procedure.value) throw createError({ statusCode: 404, statusMessage: '办事流程不存在' })

useSeoMeta({
  title: () => procedure.value?.title ?? '办事流程',
  description: () => procedure.value?.summary ?? ''
})

const audienceLabel = procedureAudienceLabels
const methodLabel = procedureMethodLabels
const stateLabel = procedureStateLabels
const audienceOptions = procedureAudienceOptions
const selectedAudience = ref<ProcedureAudienceSelection>(normalizeProcedureAudience(route.query.audience))
const visibleMaterials = computed(() => filterProcedureItemsForAudience(
  procedure.value?.materials ?? [],
  selectedAudience.value
))
const visibleSteps = computed(() => filterProcedureItemsForAudience(
  procedure.value?.steps ?? [],
  selectedAudience.value
))
const feedbackLink = computed(() => buildDetailFeedbackLink({
  targetType: 'procedure',
  targetId: procedure.value!.id,
  targetName: procedure.value!.title,
  reasonType: 'procedure_error',
  from: route.fullPath
}))
const noticeText = computed(() => getProcedureNoticeText(
  procedure.value?.category,
  procedure.value?.informationState
))
const materialTitle = computed(() => getProcedureMaterialTitle(procedure.value?.category))
const emptyMaterialText = computed(() => getProcedureEmptyMaterialText(procedure.value?.category))
const detailSources = computed(() => buildProcedureDetailSources(procedure.value?.sources))

const completedStepIds = ref<string[]>([])
const storageKey = computed(() => buildProcedureChecklistStorageKey(procedure.value?.slug ?? slug))
const ready = ref(false)

onMounted(() => {
  completedStepIds.value = resolveProcedureChecklistFromStorageText(
    localStorage.getItem(storageKey.value),
    procedure.value?.updatedAt,
    procedure.value?.steps.map(step => step.id) ?? []
  )
  localStorage.setItem(
    storageKey.value,
    buildProcedureChecklistStorageValue(procedure.value?.updatedAt, completedStepIds.value)
  )
  ready.value = true
})

watch(completedStepIds, (value) => {
  if (ready.value) {
    localStorage.setItem(
      storageKey.value,
      buildProcedureChecklistStorageValue(procedure.value?.updatedAt, value)
    )
  }
}, { deep: true })

function toggleStep(stepId: string) {
  completedStepIds.value = toggleProcedureStep(completedStepIds.value, stepId)
}

function clearChecklist() {
  completedStepIds.value = []
}

function mapLink(placeSlug: string, stepId: string) {
  return buildProcedureMapLink(slug, placeSlug, stepId)
}

function informationStateBadgeColor(informationState: string | null | undefined) {
  return resolveProcedureInformationStateBadgeColor(informationState)
}

function materialsCountBadge(count: number) {
  return resolveProcedureMaterialsCountBadge(count)
}

function audienceOptionPresentation(optionValue: typeof selectedAudience.value) {
  return resolveProcedureAudienceOptionPresentation(selectedAudience.value, optionValue)
}

function stepCompletionPresentation(stepId: string, stepNumber: number) {
  return resolveProcedureStepCompletionPresentation(
    completedStepIds.value.includes(stepId),
    stepNumber
  )
}

function showStepAudienceBadges(stepAudienceCount: number, procedureAudienceCount: number) {
  return shouldShowProcedureStepAudienceBadges(
    selectedAudience.value,
    stepAudienceCount,
    procedureAudienceCount
  )
}

watch(selectedAudience, (value) => {
  void router.replace({
    query: resolveProcedureAudienceRouteQuery(
      route.query as Record<string, unknown>,
      value
    ) as typeof route.query
  })
})
</script>

<template>
  <div v-if="procedure">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="面包屑"
        >
          <NuxtLink
            to="/procedures"
            class="hover:text-green-700"
          >办事流程</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ procedure.title }}</span>
        </nav>

        <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div class="max-w-3xl">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :color="informationStateBadgeColor(procedure.informationState)"
                variant="soft"
              >
                {{ procedure.statusText }}
              </UBadge>
              <UBadge
                v-for="audience in procedure.audience"
                :key="audience"
                color="neutral"
                variant="subtle"
              >
                {{ audienceLabel[audience] }}
              </UBadge>
            </div>
            <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
              {{ procedure.title }}
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
              {{ procedure.summary }}
            </p>
            <div
              class="scrollbar-none mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-1"
              role="group"
              aria-label="选择新生类型"
            >
              <UButton
                v-for="option in audienceOptions"
                :key="option.value"
                :label="option.label"
                size="sm"
                :color="audienceOptionPresentation(option.value).color"
                :variant="audienceOptionPresentation(option.value).variant"
                class="shrink-0"
                :aria-pressed="audienceOptionPresentation(option.value).ariaPressed"
                @click="() => { selectedAudience = option.value }"
              />
            </div>
          </div>

          <dl class="divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div class="flex items-start justify-between gap-4 py-3">
              <dt class="text-zinc-500">
                办理方式
              </dt>
              <dd class="text-right font-medium text-zinc-900">
                {{ methodLabel[procedure.method] }}
              </dd>
            </div>
            <div
              v-if="procedure.deadlineText"
              class="py-3"
            >
              <dt class="text-zinc-500">
                时间边界
              </dt>
              <dd class="mt-1 leading-6 text-zinc-900">
                {{ procedure.deadlineText }}
              </dd>
            </div>
            <div
              v-if="procedure.processingTime"
              class="flex items-start justify-between gap-4 py-3"
            >
              <dt class="text-zinc-500">
                预计耗时
              </dt>
              <dd class="text-right font-medium text-zinc-900">
                {{ procedure.processingTime }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <div class="mx-auto min-w-0 max-w-4xl">
        <section class="border-l-2 border-orange-500 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-950">
          <div class="flex items-start gap-2">
            <UIcon
              name="i-lucide-bell-ring"
              class="mt-0.5 size-4 shrink-0"
            />
            <div>
              <p class="font-semibold">
                先看提醒
              </p>
              <p class="mt-1">
                {{ noticeText }}
              </p>
            </div>
          </div>
        </section>

        <section
          id="materials"
          class="scroll-mt-24 border-b border-zinc-200 py-7"
        >
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-xs font-semibold text-green-700">
                材料清单
              </p>
              <h2 class="mt-1 text-lg font-bold text-zinc-950">
                {{ materialTitle }}
              </h2>
            </div>
            <UBadge
              :color="materialsCountBadge(visibleMaterials.length).color"
              variant="soft"
            >
              {{ materialsCountBadge(visibleMaterials.length).label }}
            </UBadge>
          </div>

          <ul
            v-if="visibleMaterials.length"
            class="mt-5 divide-y divide-zinc-100 border-y border-zinc-200"
          >
            <li
              v-for="material in visibleMaterials"
              :key="material.id"
              class="py-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h3 class="text-sm font-semibold text-zinc-900">
                    {{ material.name }}
                  </h3>
                  <p
                    v-if="material.description"
                    class="mt-1 text-sm leading-6 text-zinc-600"
                  >
                    {{ material.description }}
                  </p>
                </div>
                <UBadge
                  :color="informationStateBadgeColor(material.informationState)"
                  variant="soft"
                  class="shrink-0"
                >
                  {{ material.isRequired === null ? stateLabel[material.informationState] : material.isRequired ? '必需' : '按需' }}
                </UBadge>
              </div>
            </li>
          </ul>
          <p
            v-else
            class="mt-4 border-y border-zinc-200 bg-white py-5 text-sm leading-6 text-zinc-600"
          >
            {{ emptyMaterialText }}
          </p>
        </section>

        <section
          id="steps"
          class="scroll-mt-24 pt-7"
        >
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="text-xs font-semibold text-green-700">
                本机清单
              </p>
              <h2 class="mt-1 text-lg font-bold text-zinc-950">
                按顺序核对
              </h2>
              <p class="mt-1 text-xs text-zinc-500">
                勾选状态只保存在当前设备，不会上传。
              </p>
            </div>
            <UButton
              v-if="completedStepIds.length"
              icon="i-lucide-rotate-ccw"
              label="清空勾选"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="clearChecklist"
            />
          </div>

          <ol class="mt-5 space-y-3">
            <li
              v-for="(step, stepIndex) in visibleSteps"
              :id="`step-${step.id}`"
              :key="step.id"
              class="surface-panel grid grid-cols-[2.75rem_minmax(0,1fr)] overflow-hidden"
            >
              <button
                type="button"
                class="grid min-h-32 place-items-center border-r border-zinc-100 bg-zinc-50 text-green-700 transition hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700"
                :aria-label="stepCompletionPresentation(step.id, stepIndex + 1).ariaLabel"
                :aria-pressed="stepCompletionPresentation(step.id, stepIndex + 1).ariaPressed"
                @click="toggleStep(step.id)"
              >
                <UIcon
                  :name="stepCompletionPresentation(step.id, stepIndex + 1).icon"
                  class="size-5"
                />
              </button>

              <div class="min-w-0 p-4 md:p-5">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs font-bold text-green-700">第 {{ stepIndex + 1 }} 步</span>
                  <UBadge
                    :color="informationStateBadgeColor(step.informationState)"
                    variant="soft"
                    size="sm"
                  >
                    {{ stateLabel[step.informationState] }}
                  </UBadge>
                  <span
                    v-if="step.timeText"
                    class="inline-flex items-center gap-1 text-xs text-zinc-500"
                  >
                    <UIcon
                      name="i-lucide-clock-3"
                      class="size-3.5"
                    />
                    {{ step.timeText }}
                  </span>
                  <template v-if="showStepAudienceBadges(step.audience.length, procedure.audience.length)">
                    <UBadge
                      v-for="stepAudience in step.audience"
                      :key="stepAudience"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    >
                      {{ audienceLabel[stepAudience] }}
                    </UBadge>
                  </template>
                </div>
                <h3
                  class="mt-2 text-sm font-bold text-zinc-950 md:text-base"
                  :class="stepCompletionPresentation(step.id, stepIndex + 1).titleClass"
                >
                  {{ step.title }}
                </h3>
                <p class="mt-2 text-sm leading-6 text-zinc-600">
                  {{ step.description }}
                </p>
                <div
                  v-if="step.department || step.place || step.actionUrl"
                  class="mt-4 flex flex-wrap gap-2"
                >
                  <UButton
                    v-if="step.department"
                    :to="`/departments/${step.department.slug}`"
                    icon="i-lucide-landmark"
                    :label="step.department.name"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  />
                  <UButton
                    v-if="step.place"
                    :to="mapLink(step.place.slug, step.id)"
                    icon="i-lucide-map-pin"
                    :label="step.place.name"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  />
                  <UButton
                    v-if="safeExternalHref(step.actionUrl)"
                    :to="safeExternalHref(step.actionUrl) || undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    icon="i-lucide-external-link"
                    label="打开官方入口"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                </div>
              </div>
            </li>
          </ol>
          <p
            v-if="visibleSteps.length === 0"
            class="mt-5 border-y border-zinc-200 bg-white py-5 text-sm leading-6 text-zinc-600"
          >
            当前没有适用于所选新生类型的已确认步骤。
          </p>
        </section>

        <section
          v-if="procedure.department || procedure.relatedGuide"
          class="mt-8 border-t border-zinc-200 pt-6"
        >
          <h2 class="text-sm font-bold text-zinc-950">
            需要帮助时
          </h2>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              v-if="procedure.department"
              :to="`/departments/${procedure.department.slug}`"
              icon="i-lucide-landmark"
              :label="`查看${procedure.department.name}`"
              color="neutral"
              variant="soft"
            />
            <UButton
              v-if="procedure.relatedGuide"
              :to="`/guides/${procedure.relatedGuide.slug}`"
              icon="i-lucide-book-open-text"
              :label="procedure.relatedGuide.title"
              color="neutral"
              variant="soft"
            />
          </div>
        </section>

        <div class="mt-6">
          <PublicSourceDetails
            :sources="detailSources"
            :verified-at="(procedure.lastVerifiedAt ?? procedure.updatedAt).slice(0, 10)"
          />
        </div>

        <UButton
          :to="feedbackLink"
          icon="i-lucide-message-square-warning"
          label="反馈流程错误或补充资料"
          color="neutral"
          variant="outline"
          class="mt-6"
        />
      </div>
    </div>
  </div>
</template>
