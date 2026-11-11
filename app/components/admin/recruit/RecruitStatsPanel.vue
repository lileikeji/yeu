<script setup lang="ts">
import type { RecruitStatBucket, RecruitSubmissionStats } from '~~/shared/types'

const props = defineProps<{
  stats: RecruitSubmissionStats | null
}>()

const submissionStats = computed(() => props.stats)

const statsDaily = computed(() => submissionStats.value?.daily ?? [])
const statsDepartments = computed(() => submissionStats.value?.departments ?? [])
const statsClasses = computed(() => submissionStats.value?.classes ?? [])
const statsColleges = computed(() => submissionStats.value?.colleges ?? [])
const maxDailyCount = computed(() => Math.max(1, ...statsDaily.value.map(day => day.count)))
const maxClassCount = computed(() => Math.max(1, ...statsClasses.value.map(bucket => bucket.count)))

function statBarWidth(count: number, max: number): string {
  return `${Math.max(2, Math.round((count / max) * 100))}%`
}

const statPieGroups = computed(() => ([
  { key: 'departments', label: '意向部门分布', buckets: statsDepartments.value },
  { key: 'colleges', label: '学院分布', buckets: statsColleges.value }
]))

function pieTotal(buckets: RecruitStatBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0)
}

// viewBox 42、半径 15.9155 的圆周长恰好为 100，dasharray 直接用百分比。
function pieSlices(buckets: RecruitStatBucket[]) {
  const total = pieTotal(buckets)
  let accumulated = 0
  return buckets.map((bucket, index) => {
    const pct = total ? (bucket.count / total) * 100 : 0
    const slice = {
      label: bucket.label,
      count: bucket.count,
      pct: Math.round(pct * 10) / 10,
      offset: 25 - accumulated,
      color: `hsl(${(index * 67 + 210) % 360} 62% 50%)`
    }
    accumulated += pct
    return slice
  })
}
</script>

<template>
  <section class="space-y-4">
    <div
      v-if="submissionStats"
      class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4"
    >
      <div class="flex flex-wrap items-center gap-x-6 gap-y-1">
        <h3 class="text-sm font-semibold">
          数据概览
        </h3>
        <span class="text-xs text-zinc-500 dark:text-zinc-400">
          总提交 {{ submissionStats.total }} 份 · 已确认缴费 {{ submissionStats.paidCount }} 份 · 缺关键信息 {{ submissionStats.missingCount }} 份
        </span>
      </div>
      <div>
        <p class="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          每日提交
        </p>
        <div class="overflow-x-auto">
          <div class="flex min-w-[560px] items-end gap-1 h-36">
            <div
              v-for="day in statsDaily"
              :key="day.label"
              class="flex min-w-8 flex-1 flex-col items-center justify-end gap-1 h-full"
              :title="`${day.label}：${day.count} 份`"
            >
              <span class="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">{{ day.count || '' }}</span>
              <div
                class="w-full max-w-8 rounded-t bg-primary-500/70"
                :style="{ height: `${Math.max(2, Math.round((day.count / maxDailyCount) * 100))}%` }"
              />
              <span class="text-[9px] whitespace-nowrap text-zinc-400">{{ day.label.slice(5) }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="grid gap-6 md:grid-cols-2">
        <div
          v-for="group in statPieGroups"
          :key="group.key"
        >
          <p class="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {{ group.label }}
          </p>
          <div class="flex items-center gap-5">
            <svg
              viewBox="0 0 42 42"
              class="size-36 shrink-0"
              role="img"
              :aria-label="group.label"
            >
              <circle
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke-width="6"
                class="stroke-zinc-100 dark:stroke-zinc-800"
              />
              <circle
                v-for="slice in pieSlices(group.buckets)"
                :key="slice.label"
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke-width="6"
                :stroke="slice.color"
                :stroke-dasharray="`${slice.pct} ${100 - slice.pct}`"
                :stroke-dashoffset="slice.offset"
              />
              <text
                x="21"
                y="23.5"
                text-anchor="middle"
                class="fill-zinc-700 dark:fill-zinc-200"
                style="font-size: 7px; font-weight: 600;"
              >{{ pieTotal(group.buckets) }}</text>
              <text
                x="21"
                y="30"
                text-anchor="middle"
                class="fill-zinc-400"
                style="font-size: 3.5px;"
              >总人数</text>
            </svg>
            <ul class="min-w-0 flex-1 space-y-1 text-xs">
              <li
                v-for="slice in pieSlices(group.buckets)"
                :key="slice.label"
                class="flex items-center gap-2"
              >
                <span
                  class="size-2.5 shrink-0 rounded-sm"
                  :style="{ backgroundColor: slice.color }"
                />
                <span class="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">{{ slice.label }}</span>
                <span class="tabular-nums text-zinc-400">{{ slice.pct }}%</span>
                <span class="w-7 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{{ slice.count }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div>
        <p class="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          班级分布（共 {{ statsClasses.length }} 个班级）
        </p>
        <div class="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
          <div
            v-for="bucket in statsClasses"
            :key="bucket.label"
            class="flex items-center gap-2 text-xs"
          >
            <span class="w-32 shrink-0 truncate text-right text-zinc-500 dark:text-zinc-400">{{ bucket.label }}</span>
            <div class="h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
              <div
                class="h-full rounded bg-primary-500/70"
                :style="{ width: statBarWidth(bucket.count, maxClassCount) }"
              />
            </div>
            <span class="w-7 tabular-nums text-zinc-500 dark:text-zinc-400">{{ bucket.count }}</span>
          </div>
        </div>
      </div>
    </div>
    <div
      v-else
      class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
    >
      统计加载中，或还没有可统计的提交。
    </div>
  </section>
</template>
