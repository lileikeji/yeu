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
  description: '仰恩大学新生到校前、报到当天、第一周与行李材料自查清单。进度只保存在本机，无需登录。'
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
const todayFocus = computed(() => buildTodayFocus(progress.value.completedIds, progress.value.audience))

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
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              本地清单
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
              新生入学清单
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              按到校前、报到当天、第一周和行李材料逐项勾选。进度只保存在这台设备，不会上传，也不需要登录。
              标有「以通知为准」的条目请再核对本年官方通知。
            </p>
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
      <section class="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-green-50 p-5 md:p-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold text-orange-800">
              {{ arrival.phaseLabel }} · {{ arrival.reportWindowLabel }}
            </p>
            <h2 class="mt-2 text-2xl font-bold tracking-tight text-zinc-950 md:text-3xl">
              <template v-if="arrival.daysNumber != null && arrival.phase === 'before-report'">
                还有 <span class="text-orange-700">{{ arrival.daysNumber }}</span> 天报到
              </template>
              <template v-else>
                {{ arrival.headline }}
              </template>
            </h2>
            <p class="mt-2 text-sm leading-6 text-zinc-600">
              {{ arrival.detail }}
            </p>
            <p class="mt-2 text-xs leading-5 text-zinc-500">
              {{ arrival.honestyNote }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <UButton
                :to="arrival.primaryCtaTo"
                :label="arrival.primaryCtaLabel"
                icon="i-lucide-list-checks"
                class="min-h-11"
              />
              <UButton
                :to="arrival.secondaryCtaTo"
                :label="arrival.secondaryCtaLabel"
                color="neutral"
                variant="outline"
                class="min-h-11"
              />
            </div>
          </div>
          <ol class="grid w-full max-w-sm gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <li
              v-for="milestone in arrival.milestones"
              :key="milestone.id"
              class="rounded-xl border px-3 py-3 text-xs leading-5"
              :class="milestone.active
                ? 'border-orange-300 bg-orange-50 text-orange-950'
                : milestone.done
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-zinc-200 bg-white text-zinc-600'"
            >
              <p class="font-semibold">
                {{ milestone.label }}
              </p>
              <p class="mt-1 opacity-80">
                {{ milestone.dateLabel }}
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section class="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 md:p-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-green-700">
              今日优先
            </p>
            <h2 class="mt-1 text-lg font-bold text-zinc-950">
              {{ todayFocus.title }}
            </h2>
            <p class="mt-1 text-sm leading-6 text-zinc-600">
              {{ todayFocus.description }}
            </p>
          </div>
        </div>

        <p
          v-if="!todayFocus.items.length"
          class="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
        >
          {{ todayFocus.emptyLabel }}
        </p>
        <ul
          v-else
          class="mt-4 grid gap-2 sm:grid-cols-2"
        >
          <li
            v-for="item in todayFocus.items"
            :key="`focus-${item.id}`"
            class="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4"
          >
            <button
              type="button"
              class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border transition"
              :class="isCompleted(item.id)
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-zinc-300 bg-white text-transparent hover:border-green-500'"
              :aria-pressed="isCompleted(item.id)"
              :aria-label="`${isCompleted(item.id) ? '取消完成' : '标记完成'}：${item.title}`"
              @click="toggleItem(item.id)"
            >
              <UIcon
                name="i-lucide-check"
                class="size-3.5"
              />
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-zinc-950">
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
              <p class="mt-1 text-xs leading-5 text-zinc-600">
                {{ item.description }}
              </p>
              <NuxtLink
                v-if="item.to"
                :to="item.to"
                class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700"
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

      <section class="mt-6 rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 via-white to-orange-50 p-5 md:p-6">
        <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-green-800">
              完成进度
            </p>
            <p class="mt-1 text-3xl font-bold tracking-tight text-zinc-950">
              {{ overview.percent }}%
            </p>
            <p class="mt-2 text-sm leading-6 text-zinc-600">
              已完成 {{ overview.completedCount }} / {{ overview.totalCount }} 项
              <span v-if="overview.remainingCount > 0">
                · 还剩 {{ overview.remainingCount }} 项
              </span>
              <span v-else>
                · 当前筛选项都勾完了
              </span>
            </p>
            <p
              v-if="overview.nextItem"
              class="mt-2 text-sm font-medium text-zinc-800"
            >
              下一项：{{ overview.nextItem.title }}
            </p>
          </div>

          <div class="w-full max-w-xs">
            <div
              class="h-2.5 overflow-hidden rounded-full bg-white/80 ring-1 ring-green-100"
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
            <p class="mt-3 text-xs leading-5 text-zinc-500">
              {{ hydrated ? '进度已同步到本机缓存' : '正在读取本机进度…' }}
            </p>
          </div>
        </div>
      </section>

      <section class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-semibold text-zinc-500">
            按身份筛选
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

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="!confirmReset"
            icon="i-lucide-rotate-ccw"
            label="清空勾选"
            color="neutral"
            variant="ghost"
            class="min-h-10"
            :disabled="overview.completedCount === 0"
            @click="requestReset"
          />
          <template v-else>
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

      <section
        v-for="stage in overview.tasks"
        :key="stage.stage.id"
        class="mt-10"
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
                <p class="text-xs font-semibold text-zinc-500">
                  {{ stage.stage.label }}
                </p>
                <h2 class="text-lg font-bold text-zinc-950">
                  {{ stage.stage.title }}
                </h2>
              </div>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              {{ stage.stage.description }}
            </p>
          </div>
          <p class="text-xs font-medium text-zinc-500">
            {{ stage.completedCount }}/{{ stage.totalCount }} · {{ stage.percent }}%
          </p>
        </div>

        <ul class="mt-4 space-y-2">
          <li
            v-for="item in stage.items"
            :key="item.id"
            class="surface-panel flex items-start gap-3 p-4 transition"
            :class="isCompleted(item.id) ? 'border-green-200 bg-green-50/40' : 'hover:border-green-200'"
          >
            <button
              type="button"
              class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border transition"
              :class="isCompleted(item.id)
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-zinc-300 bg-white text-transparent hover:border-green-500'"
              :aria-pressed="isCompleted(item.id)"
              :aria-label="`${isCompleted(item.id) ? '取消完成' : '标记完成'}：${item.title}`"
              @click="toggleItem(item.id)"
            >
              <UIcon
                name="i-lucide-check"
                class="size-3.5"
              />
            </button>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p
                  class="font-semibold text-zinc-950"
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
              <p class="mt-1 text-sm leading-6 text-zinc-600">
                {{ item.description }}
              </p>
              <NuxtLink
                v-if="item.to"
                :to="item.to"
                class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"
              >
                打开相关页面
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5"
                />
              </NuxtLink>
            </div>

            <span
              class="hidden size-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 sm:grid"
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
        class="mt-10"
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
                <p class="text-xs font-semibold text-zinc-500">
                  {{ overview.packing.stage.label }}
                </p>
                <h2 class="text-lg font-bold text-zinc-950">
                  {{ overview.packing.stage.title }}
                </h2>
              </div>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              {{ overview.packing.stage.description }}
            </p>
          </div>
          <p class="text-xs font-medium text-zinc-500">
            {{ overview.packing.completedCount }}/{{ overview.packing.totalCount }} · {{ overview.packing.percent }}%
          </p>
        </div>

        <ul class="mt-4 grid gap-2 sm:grid-cols-2">
          <li
            v-for="item in overview.packing.items"
            :key="item.id"
            class="surface-panel flex items-start gap-3 p-4"
            :class="isCompleted(item.id) ? 'border-amber-200 bg-amber-50/50' : ''"
          >
            <button
              type="button"
              class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border transition"
              :class="isCompleted(item.id)
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-zinc-300 bg-white text-transparent hover:border-amber-500'"
              :aria-pressed="isCompleted(item.id)"
              :aria-label="`${isCompleted(item.id) ? '取消完成' : '标记完成'}：${item.title}`"
              @click="toggleItem(item.id)"
            >
              <UIcon
                name="i-lucide-check"
                class="size-3.5"
              />
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p
                  class="text-sm font-semibold text-zinc-950"
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
              <p class="mt-1 text-xs leading-5 text-zinc-600">
                {{ item.description }}
              </p>
              <NuxtLink
                v-if="item.to"
                :to="item.to"
                class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700"
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

      <section class="mt-10 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-xs leading-6 text-zinc-600">
        <p class="font-semibold text-zinc-800">
          使用说明
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-4">
          <li>清单进度使用浏览器本地存储，换设备或清除站点数据后会丢失。</li>
          <li>本清单为自助整理工具，不替代学校官方通知、录取通知书或现场安排。</li>
          <li>涉及报到时段、材料、接站、招新等以当年学校通知为准。</li>
        </ul>
      </section>
    </div>
  </div>
</template>