<script setup lang="ts">
import {
  checklistAudienceOptions
} from '~~/app/utils/checklist-presentation'
import {
  buildArrivalCountdown,
  buildTodayFocus
} from '~~/app/utils/arrival-timeline-presentation'

useSeoMeta({
  title: '新生清单',
  description: '新生到校前、报到当天、第一周与行李材料自查清单。进度只保存在这台设备，无需登录。'
})

const {
  progress,
  hydrated,
  overview,
  setAudience,
  toggleItem,
  resetProgress,
  isCompleted
} = useFreshmanChecklist()

const arrival = computed(() => buildArrivalCountdown())
const todayFocus = computed(() => buildTodayFocus(
  progress.value.completedIds,
  progress.value.audience,
  new Date(),
  1
))
const checklistSectionLinks = computed(() => [
  ...overview.value.tasks,
  ...(overview.value.packing.totalCount > 0 ? [overview.value.packing] : [])
].map(section => ({
  id: `checklist-${section.stage.id}`,
  label: section.stage.label,
  completedCount: section.completedCount,
  totalCount: section.totalCount
})))

const confirmReset = ref(false)

function onAudienceChange(value: string | number | boolean | undefined) {
  if (value === 'all' || value === 'undergraduate' || value === 'transfer') {
    setAudience(value)
  }
}

function requestReset() {
  confirmReset.value = true
}

function cancelReset() {
  confirmReset.value = false
}

function confirmResetProgress() {
  resetProgress()
  confirmReset.value = false
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              新生清单
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
              新生入学清单
            </h1>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              to="/map"
              icon="i-lucide-map"
              label="打开地图"
              color="neutral"
              variant="outline"
              class="min-h-11"
            />
            <UButton
              to="/procedures/arrival"
              icon="i-lucide-clipboard-check"
              label="报到流程"
              class="min-h-11"
            />
          </div>
        </div>
      </div>
    </header>

    <div class="page-shell py-8 md:py-10">
      <section class="rounded-lg border border-orange-200 bg-orange-50/60 dark:bg-orange-950/60 p-4 md:p-6">
        <p class="text-xs font-semibold text-orange-800 dark:text-orange-300">
          {{ arrival.phaseLabel }} · {{ arrival.reportWindowLabel }}
        </p>
        <h2 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          <template v-if="arrival.daysNumber != null && arrival.phase === 'before-report'">
            还有 <span class="text-orange-700 dark:text-orange-300">{{ arrival.daysNumber }}</span> 天报到
          </template>
          <template v-else>
            {{ arrival.headline }}
          </template>
        </h2>
        <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {{ arrival.detail }}
        </p>

        <ol class="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-orange-200 bg-orange-200">
          <li
            v-for="milestone in arrival.milestones"
            :key="milestone.id"
            class="min-h-20 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] dark:bg-zinc-900/90 p-3 text-xs leading-5"
            :class="milestone.active
              ? 'font-semibold text-orange-950 dark:text-orange-200 ring-2 ring-inset ring-orange-400 dark:ring-orange-400'
              : milestone.done
                ? 'text-green-800 dark:text-green-300'
                : 'text-zinc-600 dark:text-zinc-300'"
            :aria-current="milestone.active ? 'step' : undefined"
          >
            <p class="font-semibold">
              {{ milestone.label }}
            </p>
            <p class="mt-1">
              {{ milestone.dateLabel }}
            </p>
          </li>
        </ol>

        <p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {{ arrival.honestyNote }}
        </p>
      </section>

      <section class="mt-6 border-y border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-950/60 py-4 md:px-5 md:py-5">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div class="min-w-0">
            <div class="flex items-baseline gap-3">
              <p class="text-2xl font-bold text-zinc-950 dark:text-zinc-100">
                {{ overview.percent }}%
              </p>
              <p class="text-sm text-zinc-600 dark:text-zinc-300">
                已完成 {{ overview.completedCount }} / {{ overview.totalCount }} 项
              </p>
            </div>
            <div
              class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface)] dark:bg-zinc-900 ring-1 ring-green-100 dark:ring-green-900"
              role="progressbar"
              :aria-valuenow="overview.percent"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="`清单完成 ${overview.percent}%`"
            >
              <div
                class="h-full rounded-full bg-green-600 transition-all duration-300"
                :style="{ width: `${overview.percent}%` }"
              />
            </div>
            <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {{ hydrated ? '进度只保存在这台设备' : '正在读取已保存进度…' }}
            </p>
          </div>

          <div>
            <p class="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              我的身份
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                v-for="option in checklistAudienceOptions"
                :key="option.value"
                size="sm"
                class="min-h-10"
                :color="progress.audience === option.value ? 'primary' : 'neutral'"
                :variant="progress.audience === option.value ? 'solid' : 'outline'"
                :label="option.label"
                @click="onAudienceChange(option.value)"
              />
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap justify-end gap-2">
          <UButton
            v-if="overview.completedCount > 0 && !confirmReset"
            icon="i-lucide-rotate-ccw"
            label="清空勾选"
            color="neutral"
            variant="ghost"
            class="min-h-10"
            @click="requestReset"
          />
          <template v-else-if="confirmReset">
            <UButton
              label="确认清空"
              color="error"
              variant="soft"
              class="min-h-10"
              @click="confirmResetProgress"
            />
            <UButton
              label="取消"
              color="neutral"
              variant="ghost"
              class="min-h-10"
              @click="cancelReset"
            />
          </template>
        </div>
      </section>

      <section class="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 md:p-5">
        <div class="flex items-start gap-3">
          <button
            v-if="todayFocus.items[0]"
            type="button"
            class="group -m-1 grid size-11 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-700"
            :aria-pressed="isCompleted(todayFocus.items[0].id)"
            :aria-label="`${isCompleted(todayFocus.items[0].id) ? '取消完成' : '标记完成'}：${todayFocus.items[0].title}`"
            @click="toggleItem(todayFocus.items[0].id)"
          >
            <span
              class="grid size-7 place-items-center rounded-md border transition"
              :class="isCompleted(todayFocus.items[0].id)
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 text-transparent group-hover:border-green-500 dark:group-hover:border-green-600'"
            >
              <UIcon
                name="i-lucide-check"
                class="size-4"
              />
            </span>
          </button>

          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold text-green-700 dark:text-green-400">
              下一件事 · {{ arrival.phaseLabel }}
            </p>
            <template v-if="todayFocus.items[0]">
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <h2 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
                  {{ todayFocus.items[0].title }}
                </h2>
                <UBadge
                  v-if="todayFocus.items[0].awaitingNotice"
                  label="以通知为准"
                  color="warning"
                  variant="soft"
                  size="sm"
                />
              </div>
              <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {{ todayFocus.items[0].description }}
              </p>
              <NuxtLink
                v-if="todayFocus.items[0].to"
                :to="todayFocus.items[0].to"
                class="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
              >
                打开相关页面
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5"
                />
              </NuxtLink>
            </template>
            <p
              v-else
              class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300"
            >
              {{ todayFocus.emptyLabel }}
            </p>
          </div>
        </div>
      </section>

      <nav
        class="mt-6"
        aria-labelledby="checklist-section-nav-title"
      >
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="section-kicker">
              分段查看
            </p>
            <h2
              id="checklist-section-nav-title"
              class="mt-1 text-base font-bold text-zinc-950 dark:text-zinc-100"
            >
              跳到
            </h2>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            {{ checklistSectionLinks.length }} 个阶段
          </p>
        </div>

        <div class="mt-3 grid grid-cols-5 gap-px overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-800">
          <a
            v-for="section in checklistSectionLinks"
            :key="section.id"
            :href="`#${section.id}`"
            class="flex min-h-16 flex-col items-center justify-center bg-[var(--surface)] dark:bg-zinc-900 px-1 py-2 text-center transition hover:bg-green-50 dark:hover:bg-green-950 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700"
          >
            <span class="text-xs font-semibold leading-4 text-zinc-900 dark:text-zinc-100">{{ section.label }}</span>
            <span class="mt-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
              {{ section.completedCount }}/{{ section.totalCount }} 项
            </span>
          </a>
        </div>
      </nav>

      <section
        v-for="stage in overview.tasks"
        :id="`checklist-${stage.stage.id}`"
        :key="stage.stage.id"
        class="mt-8 scroll-mt-[calc(var(--header-height)+1rem)] md:mt-10"
      >
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-3">
              <span
                class="grid size-10 place-items-center rounded-lg"
                :class="stage.stage.tone"
              >
                <UIcon
                  :name="stage.stage.icon"
                  class="size-5"
                />
              </span>
              <div>
                <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {{ stage.stage.label }}
                </p>
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
                  {{ stage.stage.title }}
                </h2>
              </div>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {{ stage.stage.description }}
            </p>
          </div>
          <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {{ stage.completedCount }}/{{ stage.totalCount }} · {{ stage.percent }}%
          </p>
        </div>

        <ul class="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
          <li
            v-for="item in stage.items"
            :key="item.id"
            class="flex items-start gap-3 px-1 py-4 transition"
            :class="isCompleted(item.id) ? 'bg-green-50/50 dark:bg-green-950/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'"
          >
            <button
              type="button"
              class="group -m-2 grid size-10 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-700"
              :aria-pressed="isCompleted(item.id)"
              :aria-label="`${isCompleted(item.id) ? '取消完成' : '标记完成'}：${item.title}`"
              @click="toggleItem(item.id)"
            >
              <span
                class="grid size-6 place-items-center rounded-md border transition"
                :class="isCompleted(item.id)
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 text-transparent group-hover:border-green-500 dark:group-hover:border-green-600'"
              >
                <UIcon
                  name="i-lucide-check"
                  class="size-3.5"
                />
              </span>
            </button>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p
                  class="font-semibold text-zinc-950 dark:text-zinc-100"
                  :class="isCompleted(item.id) ? 'line-through decoration-zinc-400' : ''"
                >
                  {{ item.title }}
                </p>
                <UBadge
                  v-if="item.awaitingNotice"
                  label="以通知为准"
                  color="warning"
                  variant="soft"
                  size="sm"
                />
              </div>
              <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {{ item.description }}
              </p>
              <NuxtLink
                v-if="item.to"
                :to="item.to"
                class="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
              >
                打开相关页面
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5"
                />
              </NuxtLink>
            </div>

            <span
              class="hidden size-9 shrink-0 place-items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 sm:grid"
            >
              <UIcon
                :name="item.icon"
                class="size-4"
              />
            </span>
          </li>
        </ul>
      </section>

      <section
        v-if="overview.packing.totalCount > 0"
        id="checklist-packing"
        class="mt-10 scroll-mt-[calc(var(--header-height)+1rem)]"
      >
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-3">
              <span
                class="grid size-10 place-items-center rounded-lg"
                :class="overview.packing.stage.tone"
              >
                <UIcon
                  :name="overview.packing.stage.icon"
                  class="size-5"
                />
              </span>
              <div>
                <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {{ overview.packing.stage.label }}
                </p>
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
                  {{ overview.packing.stage.title }}
                </h2>
              </div>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {{ overview.packing.stage.description }}
            </p>
          </div>
          <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {{ overview.packing.completedCount }}/{{ overview.packing.totalCount }} · {{ overview.packing.percent }}%
          </p>
        </div>

        <ul class="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800 sm:grid sm:grid-cols-2 sm:divide-y-0">
          <li
            v-for="item in overview.packing.items"
            :key="item.id"
            class="flex items-start gap-3 px-1 py-4 sm:border-b sm:border-zinc-200 dark:sm:border-zinc-800 sm:odd:pr-4 sm:even:pl-4"
            :class="isCompleted(item.id) ? 'bg-amber-50/50 dark:bg-amber-950/50' : ''"
          >
            <button
              type="button"
              class="group -m-2 grid size-10 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700"
              :aria-pressed="isCompleted(item.id)"
              :aria-label="`${isCompleted(item.id) ? '取消完成' : '标记完成'}：${item.title}`"
              @click="toggleItem(item.id)"
            >
              <span
                class="grid size-6 place-items-center rounded-md border transition"
                :class="isCompleted(item.id)
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 text-transparent group-hover:border-amber-500 dark:group-hover:border-amber-700'"
              >
                <UIcon
                  name="i-lucide-check"
                  class="size-3.5"
                />
              </span>
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p
                  class="text-sm font-semibold text-zinc-950 dark:text-zinc-100"
                  :class="isCompleted(item.id) ? 'line-through decoration-zinc-400' : ''"
                >
                  {{ item.title }}
                </p>
                <UBadge
                  v-if="item.awaitingNotice"
                  label="以通知为准"
                  color="warning"
                  variant="soft"
                  size="sm"
                />
              </div>
              <p class="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                {{ item.description }}
              </p>
              <NuxtLink
                v-if="item.to"
                :to="item.to"
                class="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400"
              >
                相关页面
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5"
                />
              </NuxtLink>
            </div>
          </li>
        </ul>
      </section>

      <p class="mt-10 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs text-zinc-500 dark:text-zinc-400">
        报到安排以学校当年通知为准
      </p>
    </div>
  </div>
</template>
