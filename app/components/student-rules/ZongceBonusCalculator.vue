<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  zongceBonusCategories,
  zongceDeductions,
  zongceStructure,
  type ZongceCategory,
  type ZongceItem
} from '~~/data/comprehensive-evaluation'

defineProps<{ resourceBase?: never }>()

/** 单选级别：itemId -> level string */
const selectedLevel = ref<Record<string, string>>({})
/** 多选条目：itemId -> 已选级别列表（不同项目可累计，板块封顶） */
const multiSelected = ref<Record<string, string[]>>({})
/** 数量：itemId -> qty */
const qty = ref<Record<string, number>>({})
/** 智育基础分按成绩计算：=（本人平均成绩 ÷ 本专业最高平均成绩）× 60；未填写按满分 60 估算。 */
const myAvgScore = ref<number | string>('')
const maxAvgScore = ref<number | string>('')
const intellectualBase = computed(() => {
  const mine = Number(myAvgScore.value)
  const max = Number(maxAvgScore.value)
  if (!Number.isFinite(mine) || !Number.isFinite(max) || max <= 0) {
    return zongceStructure.intellectual.base
  }
  return Math.max(0, Math.min(1, mine / max)) * zongceStructure.intellectual.base
})
/** 德育基础分：辅导员/班主任按标准酌情评分，满分 6 分（5.4-6 分人数不超过 20%）；未调整按满分 6 估算。 */
const moralBaseScore = ref<number | string>(6)
/** 班内互评分：=（个人自评 + 其他参评人员评分总和）÷ 参评人数，最高 6 分；未调整按满分 6 估算。 */
const peerReviewScore = ref<number | string>(6)
/** 体育基础分：体育课成绩与体质健康测试均 ≥ 60 分得 3 分；任一项不及格得 1 分。 */
const sportsPass = ref(true)

function clampScore(v: number | string, max: number): number {
  const value = Number(v)
  if (!Number.isFinite(value)) return max
  return Math.max(0, Math.min(max, value))
}

function selectedLevelPoints(item: ZongceItem): number {
  if (item.multi) {
    // 多选：同大类下不同项目（不同比赛/证书/专利/论文）可累计，条目自身 cap 存在时先封顶
    const sum = (multiSelected.value[item.id] ?? []).reduce((total, level) => {
      const matched = item.levels?.find(l => l.level === level)
      return total + (matched?.points ?? 0)
    }, 0)
    return item.cap ? Math.min(item.cap, sum) : sum
  }
  const level = selectedLevel.value[item.id]
  const matched = item.levels?.find(l => l.level === level)
  return matched ? matched.points : 0
}

function pointsOfItem(item: ZongceItem): number {
  if (!item.id) return 0
  if (item.points !== undefined) {
    const q = qty.value[item.id] ?? 0
    const raw = item.points * q
    return item.cap ? Math.min(item.cap, raw) : raw
  }
  return selectedLevelPoints(item)
}

function isLevelSelected(item: ZongceItem, level: string): boolean {
  if (item.multi) return (multiSelected.value[item.id] ?? []).includes(level)
  return selectedLevel.value[item.id] === level
}

function toggleLevel(item: ZongceItem, level: string): void {
  if (item.multi) {
    const current = multiSelected.value[item.id] ?? []
    multiSelected.value[item.id] = current.includes(level)
      ? current.filter(itemLevel => itemLevel !== level)
      : [...current, level]
    return
  }
  selectedLevel.value[item.id] = selectedLevel.value[item.id] === level ? '' : level
}

function categoryTotal(category: ZongceCategory): number {
  const raw = category.items.reduce((sum, item) => sum + pointsOfItem(item), 0)
  return category.cap ? Math.min(category.cap, raw) : raw
}

/** 三大板块：德育 / 智育 / 体育 —— 由 2025 版办法结构（基础 + 奖励封顶）组成。 */
const sections = computed(() => {
  const moralIds = new Set(['moral-honor', 'moral-work', 'moral-competition', 'moral-others'])
  const intellectualIds = new Set(['intellectual-research', 'intellectual-cert'])
  const pick = (ids: Set<string>) => zongceBonusCategories.filter(c => ids.has(c.id))

  const build = (
    key: 'moral' | 'intellectual' | 'sports',
    name: string,
    categories: ZongceCategory[],
    base: number
  ) => {
    const reward = categories.reduce((sum, c) => sum + categoryTotal(c), 0)
    const baseCap = zongceStructure[key].rewardCap
    const rewardCapped = Math.min(baseCap, reward)
    const subtotal = base + rewardCapped
    return { key, name, base, reward: rewardCapped, rawReward: reward, subtotal }
  }

  const moralBase = clampScore(moralBaseScore.value, zongceStructure.moral.base) + clampScore(peerReviewScore.value, zongceStructure.moral.peerReview)
  const moral = build('moral', '德育', pick(moralIds), moralBase)
  const intellectual = build('intellectual', '智育', pick(intellectualIds), intellectualBase.value)
  const sportsBase = sportsPass.value ? zongceStructure.sports.base : 1
  const sports = build('sports', '体育', pick(new Set(['sports'])), sportsBase)
  const total = moral.subtotal + intellectual.subtotal + sports.subtotal
  return { moral, intellectual, sports, total }
})

const deductionRows = computed(() => zongceDeductions)

const reset = (): void => {
  selectedLevel.value = {}
  multiSelected.value = {}
  qty.value = {}
  myAvgScore.value = ''
  maxAvgScore.value = ''
  moralBaseScore.value = 6
  peerReviewScore.value = 6
  sportsPass.value = true
}
</script>

<template>
  <div class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 shadow-sm md:p-7">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="max-w-2xl">
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          综合测评加分计算器
        </p>
        <h3 class="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100 md:text-2xl">
          按 2025 版办法估算总成绩
        </h3>
        <p class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          德育 · 智育 · 体育三项加权 · 同级不重复
        </p>
      </div>
      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        @click="reset"
      >
        清空重选
      </button>
    </div>

    <!-- 实时汇总：选择加分项时始终可见 -->
    <div class="sticky top-[calc(var(--header-height)+0.75rem)] z-20 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] dark:bg-zinc-900/95 px-4 py-3 shadow-sm backdrop-blur">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
        <span>德育 <strong class="ml-0.5 font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{{ sections.moral.subtotal.toFixed(2) }}</strong></span>
        <span class="text-zinc-300 dark:text-zinc-600">+</span>
        <span>智育 <strong class="ml-0.5 font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{{ sections.intellectual.subtotal.toFixed(2) }}</strong></span>
        <span class="text-zinc-300 dark:text-zinc-600">+</span>
        <span>体育 <strong class="ml-0.5 font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{{ sections.sports.subtotal.toFixed(2) }}</strong></span>
        <span class="text-zinc-300 dark:text-zinc-600">=</span>
      </div>
      <p class="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
        {{ sections.total.toFixed(2) }}<span class="ml-1 text-sm font-normal text-zinc-400 dark:text-zinc-500">/ 100 分</span>
      </p>
    </div>

    <!-- 德育板块 -->
    <section class="mt-7">
      <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <p class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          德育
          <span class="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">基础 {{ sections.moral.base.toFixed(2) }} + 奖励（上限 {{ zongceStructure.moral.rewardCap }}）</span>
        </p>
        <p class="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {{ sections.moral.subtotal.toFixed(2) }} <span class="text-xs font-normal text-zinc-400 dark:text-zinc-500">/ 25 分</span>
        </p>
      </div>

      <!-- 德育基础分：辅导员评分 + 班内互评（均按满分估算） -->
      <div class="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/60 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            德育基础分（评分制）
            <span class="ml-1 font-normal text-zinc-500 dark:text-zinc-400">基础分由辅导员/班主任按标准评分，满分 6 分（5.4-6 分人数不超过 20%）</span>
          </p>
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
            基础合计
            <strong class="ml-1 text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{{ sections.moral.base.toFixed(2) }}</strong>
            <span class="text-xs text-zinc-400 dark:text-zinc-500">/ 12</span>
          </p>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            德育基础分
            <input
              v-model.number="moralBaseScore"
              type="number"
              min="0"
              max="6"
              step="0.1"
              class="w-20 rounded-md border border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 px-2 py-1 text-sm focus:border-zinc-500 dark:focus:border-zinc-500 focus:outline-none"
              aria-label="德育基础分"
            ><span class="text-xs text-zinc-400 dark:text-zinc-500">/ 6</span>
          </label>
          <label class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            班内互评分
            <input
              v-model.number="peerReviewScore"
              type="number"
              min="0"
              max="6"
              step="0.1"
              class="w-20 rounded-md border border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 px-2 py-1 text-sm focus:border-zinc-500 dark:focus:border-zinc-500 focus:outline-none"
              aria-label="班内互评分"
            ><span class="text-xs text-zinc-400 dark:text-zinc-500">/ 6</span>
          </label>
        </div>
        <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          班内互评分 =（自评 + 他评）÷ 参评人数；未改按 6 分估算
        </p>
      </div>

      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div
          v-for="category in zongceBonusCategories.filter(c => ['moral-honor', 'moral-work', 'moral-competition', 'moral-others'].includes(c.id))"
          :key="category.id"
          class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 p-4"
        >
          <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {{ category.label.replace(/^德育奖励·/, '') }}
            <span
              v-if="category.cap"
              class="ml-1 text-xs font-normal text-zinc-400 dark:text-zinc-500"
            >上限 {{ category.cap }} 分</span>
          </p>
          <div
            v-for="item in category.items"
            :key="item.id"
            class="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3"
          >
            <p class="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {{ item.name }}
            </p>
            <p
              v-if="item.note"
              class="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              {{ item.note }}
            </p>
            <div
              v-if="item.levels && item.levels.length"
              class="mt-2 flex flex-wrap gap-1.5"
            >
              <button
                v-for="lv in item.levels"
                :key="lv.level"
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="isLevelSelected(item, lv.level)
                  ? 'border-zinc-900 bg-zinc-900 dark:bg-zinc-700 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-500 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'"
                @click="toggleLevel(item, lv.level)"
              >
                {{ lv.level }} +{{ lv.points }}
              </button>
            </div>
            <p
              v-if="item.multi && selectedLevelPoints(item) > 0"
              class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400"
            >
              已选 {{ selectedLevelPoints(item).toFixed(2) }} 分 · 计入本板块上限
            </p>
            <div
              v-else-if="item.points !== undefined && item.cap != null"
              class="mt-2 flex flex-wrap items-center gap-2"
            >
              <input
                v-model.number="qty[item.id]"
                type="number"
                min="0"
                class="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm focus:border-zinc-500 dark:focus:border-zinc-500 focus:outline-none"
                :aria-label="item.name + '数量'"
              >
              <span class="text-xs text-zinc-500 dark:text-zinc-400">次 / 项 × {{ item.points }} 分{{ item.cap ? '（最多 ' + item.cap + ' 分）' : '' }}</span>
            </div>
            <div
              v-else
              class="mt-2 flex items-center gap-2"
            >
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-200">+{{ item.points }} 分</span>
              <button
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="qty[item.id] === undefined || qty[item.id] === 0
                  ? 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-500 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  : 'border-zinc-900 bg-zinc-900 dark:bg-zinc-700 text-white'"
                @click="qty[item.id] = qty[item.id] ? 0 : 1"
              >
                {{ qty[item.id] ? '已计入' : '计入' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 智育板块 -->
    <section class="mt-8">
      <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <p class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          智育
          <span class="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">基础（按成绩，当前 {{ sections.intellectual.base.toFixed(2) }}）+ 奖励（上限 {{ zongceStructure.intellectual.rewardCap }}）</span>
        </p>
        <p class="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {{ sections.intellectual.subtotal.toFixed(2) }} <span class="text-xs font-normal text-zinc-400 dark:text-zinc-500">/ 70 分</span>
        </p>
      </div>

      <!-- 智育基础分：按成绩折算 -->
      <div class="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/60 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            智育基础分（按成绩）
            <span class="ml-1 font-normal text-zinc-500 dark:text-zinc-400">=（本人平均成绩 ÷ 本专业最高平均成绩）× 60</span>
          </p>
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
            基础分
            <strong class="ml-1 text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{{ intellectualBase.toFixed(2) }}</strong>
            <span class="text-xs text-zinc-400 dark:text-zinc-500">/ 60</span>
          </p>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            我的平均成绩
            <input
              v-model.number="myAvgScore"
              type="number"
              min="0"
              max="100"
              step="0.1"
              class="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 px-2 py-1 text-sm focus:border-zinc-500 dark:focus:border-zinc-500 focus:outline-none"
              placeholder="如 86"
              aria-label="我的平均成绩"
            >
          </label>
          <label class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            本专业最高平均成绩
            <input
              v-model.number="maxAvgScore"
              type="number"
              min="0"
              max="100"
              step="0.1"
              class="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 px-2 py-1 text-sm focus:border-zinc-500 dark:focus:border-zinc-500 focus:outline-none"
              placeholder="如 90"
              aria-label="本专业最高平均成绩"
            >
          </label>
        </div>
        <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          智育基础分 = 平均成绩 ÷ <strong>本专业最高平均成绩</strong> × 60；未填按 60 估算
        </p>
      </div>

      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div
          v-for="category in zongceBonusCategories.filter(c => ['intellectual-research', 'intellectual-cert'].includes(c.id))"
          :key="category.id"
          class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 p-4"
        >
          <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {{ category.label.replace(/^智育奖励·/, '') }}
            <span
              v-if="category.cap"
              class="ml-1 text-xs font-normal text-zinc-400 dark:text-zinc-500"
            >上限 {{ category.cap }} 分</span>
          </p>
          <div
            v-for="item in category.items"
            :key="item.id"
            class="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3"
          >
            <p class="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {{ item.name }}
            </p>
            <p
              v-if="item.note"
              class="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              {{ item.note }}
            </p>
            <div
              v-if="item.levels && item.levels.length"
              class="mt-2 flex flex-wrap gap-1.5"
            >
              <button
                v-for="lv in item.levels"
                :key="lv.level"
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="isLevelSelected(item, lv.level)
                  ? 'border-zinc-900 bg-zinc-900 dark:bg-zinc-700 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-500 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'"
                @click="toggleLevel(item, lv.level)"
              >
                {{ lv.level }} +{{ lv.points }}
              </button>
            </div>
            <p
              v-if="item.multi && selectedLevelPoints(item) > 0"
              class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400"
            >
              已选 {{ selectedLevelPoints(item).toFixed(2) }} 分 · 计入本板块上限
            </p>
            <div
              v-else-if="item.points !== undefined && item.cap != null"
              class="mt-2 flex flex-wrap items-center gap-2"
            >
              <input
                v-model.number="qty[item.id]"
                type="number"
                min="0"
                class="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm focus:border-zinc-500 dark:focus:border-zinc-500 focus:outline-none"
                :aria-label="item.name + '数量'"
              >
              <span class="text-xs text-zinc-500 dark:text-zinc-400">次 / 项 × {{ item.points }} 分{{ item.cap ? '（最多 ' + item.cap + ' 分）' : '' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 体育板块 -->
    <section class="mt-8">
      <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <p class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          体育
          <span class="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">基础 {{ sections.sports.base }}（及格 3 / 不及格 1）+ 奖励（上限 {{ zongceStructure.sports.rewardCap }}）</span>
        </p>
        <p class="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {{ sections.sports.subtotal.toFixed(2) }} <span class="text-xs font-normal text-zinc-400 dark:text-zinc-500">/ 5 分</span>
        </p>
      </div>

      <!-- 体育基础分：看体育课与体测是否及格 -->
      <div class="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/60 p-4">
        <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          体育基础分（看体测）
          <span class="ml-1 font-normal text-zinc-500 dark:text-zinc-400">体育课成绩与体质健康测试均 ≥ 60 分得 3 分；任一项不及格得 1 分</span>
        </p>
        <div class="mt-3 flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            class="rounded-md border px-3 py-1.5 transition-colors"
            :class="sportsPass ? 'border-zinc-900 bg-zinc-900 dark:bg-zinc-700 dark:bg-zinc-700 text-white' : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 dark:text-zinc-300 hover:border-zinc-500 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'"
            @click="sportsPass = true"
          >
            体育课与体测均及格（基础 3 分）
          </button>
          <button
            type="button"
            class="rounded-md border px-3 py-1.5 transition-colors"
            :class="!sportsPass ? 'border-zinc-900 bg-zinc-900 dark:bg-zinc-700 dark:bg-zinc-700 text-white' : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 dark:text-zinc-300 hover:border-zinc-500 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'"
            @click="sportsPass = false"
          >
            任一项不及格（基础 1 分）
          </button>
        </div>
      </div>

      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div
          v-for="category in zongceBonusCategories.filter(c => c.id === 'sports')"
          :key="category.id"
          class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 p-4"
        >
          <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {{ category.label.replace(/^体育奖励（.+）/, '体育比赛') }}
            <span
              v-if="category.cap"
              class="ml-1 text-xs font-normal text-zinc-400 dark:text-zinc-500"
            >上限 {{ category.cap }} 分</span>
          </p>
          <div
            v-for="item in category.items"
            :key="item.id"
            class="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3"
          >
            <p class="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {{ item.name }}
            </p>
            <p
              v-if="item.note"
              class="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              {{ item.note }}
            </p>
            <div
              v-if="item.levels && item.levels.length"
              class="mt-2 flex flex-wrap gap-1.5"
            >
              <button
                v-for="lv in item.levels"
                :key="lv.level"
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="isLevelSelected(item, lv.level)
                  ? 'border-zinc-900 bg-zinc-900 dark:bg-zinc-700 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-500 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'"
                @click="toggleLevel(item, lv.level)"
              >
                {{ lv.level }} +{{ lv.points }}
              </button>
            </div>
            <p
              v-if="item.multi && selectedLevelPoints(item) > 0"
              class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400"
            >
              已选 {{ selectedLevelPoints(item).toFixed(2) }} 分 · 计入本板块上限
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 总成绩 -->
    <div class="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-5 md:p-6">
      <p class="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        总成绩估算
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg bg-[var(--surface)] dark:bg-zinc-900 p-3 ring-1 ring-zinc-100 dark:ring-zinc-800">
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            德育小计
          </p>
          <p class="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {{ sections.moral.subtotal.toFixed(2) }}
          </p>
        </div>
        <div class="rounded-lg bg-[var(--surface)] dark:bg-zinc-900 p-3 ring-1 ring-zinc-100 dark:ring-zinc-800">
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            智育小计
          </p>
          <p class="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {{ sections.intellectual.subtotal.toFixed(2) }}
          </p>
        </div>
        <div class="rounded-lg bg-[var(--surface)] dark:bg-zinc-900 p-3 ring-1 ring-zinc-100 dark:ring-zinc-800">
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            体育小计
          </p>
          <p class="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {{ sections.sports.subtotal.toFixed(2) }}
          </p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          德育 {{ sections.moral.subtotal.toFixed(2) }} + 智育 {{ sections.intellectual.subtotal.toFixed(2) }} + 体育 {{ sections.sports.subtotal.toFixed(2) }}
          <span class="text-zinc-400 dark:text-zinc-500">=</span>
        </p>
        <p class="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {{ sections.total.toFixed(2) }}
          <span class="text-base font-normal text-zinc-400 dark:text-zinc-500">/ 100 分</span>
        </p>
      </div>
    </div>

    <!-- 常见扣分项 -->
    <div class="mt-7">
      <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        常见扣分项（参考）
      </p>
      <ul class="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-300 sm:grid-cols-2">
        <li
          v-for="d in deductionRows"
          :key="d.name"
          class="flex justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 py-1.5"
        >
          <span>{{ d.name }}</span><span class="shrink-0 text-zinc-400 dark:text-zinc-500">-{{ d.points }} 分{{ d.unit }}</span>
        </li>
      </ul>
    </div>

    <p class="mt-4 text-xs leading-5 text-zinc-400 dark:text-zinc-500">
      同名项目按最高项计 · 团体获奖减半 · 以学院审核为准
    </p>
  </div>
</template>
