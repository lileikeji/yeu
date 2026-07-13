<script setup lang="ts">
import { throwPublicDetailError } from '~/utils/public-errors'

const route = useRoute()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: procedure, error } = await usePublicProcedure(slug)
if (error.value) throwPublicDetailError(error.value, '办事流程')
if (!procedure.value) throw createError({ statusCode: 404, statusMessage: '办事流程不存在' })

useSeoMeta({
  title: () => procedure.value?.title ?? '办事流程',
  description: () => procedure.value?.summary ?? ''
})

const audienceLabel = {
  undergraduate: '普通本科新生',
  transfer: '专升本新生'
} as const
const methodLabel = {
  online: '线上办理',
  offline: '到校办理',
  mixed: '线上核对 + 到校办理'
} as const
const stateLabel = {
  'confirmed': '已确认',
  'partial': '部分确认',
  'awaiting-notice': '待通知'
} as const

const completedStepIds = ref<string[]>([])
const storageKey = computed(() => `yeu:procedure-checklist:${procedure.value?.slug ?? slug}`)
const ready = ref(false)

onMounted(() => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey.value) ?? 'null')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const record = saved as Record<string, unknown>
      const validStepIds = new Set(procedure.value?.steps.map(step => step.id) ?? [])
      if (record.version === procedure.value?.updatedAt && Array.isArray(record.stepIds)) {
        completedStepIds.value = record.stepIds.filter((value): value is string => (
          typeof value === 'string' && validStepIds.has(value)
        ))
      }
    }
  } catch {
    completedStepIds.value = []
  }
  localStorage.setItem(storageKey.value, JSON.stringify({
    version: procedure.value?.updatedAt,
    stepIds: completedStepIds.value
  }))
  ready.value = true
})

watch(completedStepIds, (value) => {
  if (ready.value) {
    localStorage.setItem(storageKey.value, JSON.stringify({
      version: procedure.value?.updatedAt,
      stepIds: value
    }))
  }
}, { deep: true })

function toggleStep(stepId: string) {
  completedStepIds.value = completedStepIds.value.includes(stepId)
    ? completedStepIds.value.filter(value => value !== stepId)
    : [...completedStepIds.value, stepId]
}

function clearChecklist() {
  completedStepIds.value = []
}

function mapLink(placeSlug: string, stepId: string) {
  return {
    path: '/map',
    query: { place: placeSlug, from: `/procedures/${slug}#step-${stepId}` }
  }
}
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
                :color="procedure.informationState === 'confirmed' ? 'success' : 'warning'"
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

    <div class="page-shell grid gap-10 py-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div class="min-w-0">
        <section class="border-l-2 border-orange-500 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-950">
          <div class="flex items-start gap-2">
            <UIcon
              name="i-lucide-bell-ring"
              class="mt-0.5 size-4 shrink-0"
            />
            <div>
              <p class="font-semibold">
                待通知内容不会按往年安排补写
              </p>
              <p class="mt-1">
                个人时段、材料、报到点和接站仍需查看录取通知书及学校后续通知；这里仅在官方来源确认后更新。
              </p>
            </div>
          </div>
        </section>

        <section class="border-b border-zinc-200 py-8">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-xs font-semibold text-green-700">
                材料清单
              </p>
              <h2 class="mt-1 text-lg font-bold text-zinc-950">
                到校前需要准备
              </h2>
            </div>
            <UBadge
              :color="procedure.materials.length ? 'neutral' : 'warning'"
              variant="soft"
            >
              {{ procedure.materials.length ? `${procedure.materials.length} 项` : '待通知' }}
            </UBadge>
          </div>

          <ul
            v-if="procedure.materials.length"
            class="mt-5 divide-y divide-zinc-100 border-y border-zinc-200"
          >
            <li
              v-for="material in procedure.materials"
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
                  :color="material.informationState === 'confirmed' ? 'success' : 'warning'"
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
            2026公开来源尚未给出可核验的个人材料清单。本页不会用往年材料填充；收到录取通知书或当年报到通知后再逐项核对。
          </p>
        </section>

        <section class="pt-8">
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
              v-for="step in procedure.steps"
              :id="`step-${step.id}`"
              :key="step.id"
              class="surface-panel grid grid-cols-[2.75rem_minmax(0,1fr)] overflow-hidden"
            >
              <button
                type="button"
                class="grid min-h-32 place-items-center border-r border-zinc-100 bg-zinc-50 text-green-700 transition hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700"
                :aria-label="completedStepIds.includes(step.id) ? `取消完成第${step.order}步` : `标记第${step.order}步完成`"
                :aria-pressed="completedStepIds.includes(step.id)"
                @click="toggleStep(step.id)"
              >
                <UIcon
                  :name="completedStepIds.includes(step.id) ? 'i-lucide-circle-check-big' : 'i-lucide-circle'"
                  class="size-5"
                />
              </button>

              <div class="min-w-0 p-4 md:p-5">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs font-bold text-green-700">第 {{ step.order }} 步</span>
                  <UBadge
                    :color="step.informationState === 'confirmed' ? 'success' : 'warning'"
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
                </div>
                <h3
                  class="mt-2 text-sm font-bold text-zinc-950 md:text-base"
                  :class="completedStepIds.includes(step.id) ? 'line-through opacity-60' : ''"
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
                    v-if="step.actionUrl"
                    :to="step.actionUrl"
                    target="_blank"
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
        </section>
      </div>

      <aside class="min-w-0">
        <div class="space-y-6 lg:sticky lg:top-24">
          <section
            v-if="procedure.department"
            class="surface-panel p-4"
          >
            <p class="text-xs text-zinc-500">
              咨询边界
            </p>
            <h2 class="mt-1 text-sm font-bold text-zinc-950">
              {{ procedure.department.name }}
            </h2>
            <p class="mt-2 text-xs leading-5 text-zinc-600">
              {{ procedure.department.summary }}
            </p>
            <UButton
              :to="`/departments/${procedure.department.slug}`"
              icon="i-lucide-arrow-right"
              label="查看部门资料"
              color="neutral"
              variant="ghost"
              size="sm"
              class="mt-3"
            />
          </section>

          <section
            v-if="procedure.relatedGuide"
            class="border-y border-zinc-200 py-4"
          >
            <p class="text-xs text-zinc-500">
              背景与安全说明
            </p>
            <NuxtLink
              :to="`/guides/${procedure.relatedGuide.slug}`"
              class="mt-2 flex items-start justify-between gap-3 text-sm font-semibold text-zinc-900 hover:text-green-700"
            >
              <span>{{ procedure.relatedGuide.title }}</span>
              <UIcon
                name="i-lucide-arrow-up-right"
                class="mt-0.5 size-4 shrink-0"
              />
            </NuxtLink>
          </section>

          <section class="border-y border-zinc-200 py-4">
            <h2 class="text-sm font-bold text-zinc-950">
              参考来源
            </h2>
            <ul class="mt-3 space-y-3">
              <li
                v-for="source in procedure.sources"
                :key="source.id"
              >
                <a
                  :href="source.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block text-xs leading-5 text-zinc-600 hover:text-green-700"
                >
                  <span class="inline-flex items-start gap-2">
                    <UIcon
                      name="i-lucide-external-link"
                      class="mt-0.5 size-3.5 shrink-0"
                    />
                    <span>{{ source.title }}</span>
                  </span>
                  <span
                    v-if="source.claimScope"
                    class="mt-1 block pl-5 text-zinc-400"
                  >{{ source.claimScope }}</span>
                </a>
              </li>
            </ul>
            <p class="mt-4 text-xs text-zinc-400">
              核验于 {{ (procedure.lastVerifiedAt ?? procedure.updatedAt).slice(0, 10) }}
            </p>
          </section>
        </div>
      </aside>
    </div>
  </div>
</template>
