<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  zongceBonusCategories,
  zongceDeductions,
  zongceStructure,
  type ZongceCategory,
  type ZongceItem
} from '~~/data/comprehensive-evaluation'

const props = defineProps<{ resourceBase?: never }>()

/** 单选级别：itemId -> level string */
const selectedLevel = ref<Record<string, string>>({})
/** 数量：itemId -> qty */
const qty = ref<Record<string, number>>({})

function pointsOfItem(item: ZongceItem, category: ZongceCategory): number {
  if (!item.id) return 0
  if (item.points !== undefined) {
    const q = qty.value[item.id] ?? 0
    const raw = item.points * q
    return item.cap ? Math.min(item.cap, raw) : raw
  }
  const level = selectedLevel.value[item.id]
  const matched = item.levels?.find(l => l.level === level)
  return matched ? matched.points : 0
}

function categoryTotal(category: ZongceCategory): number {
  const raw = category.items.reduce((sum, item) => sum + pointsOfItem(item, category), 0)
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

  const moral = build('moral', '德育', pick(moralIds), zongceStructure.moral.base + zongceStructure.moral.peerReview)
  const intellectual = build('intellectual', '智育', pick(intellectualIds), zongceStructure.intellectual.base)
  const sports = build('sports', '体育', pick(new Set(['sports'])), zongceStructure.sports.base)
  const total = moral.subtotal + intellectual.subtotal + sports.subtotal
  return { moral, intellectual, sports, total }
})

const deductionRows = computed(() => zongceDeductions)

const reset = (): void => {
  selectedLevel.value = {}
  qty.value = {}
}
</script>

<template>
  <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:p-7">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="max-w-2xl">
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">
          综合测评加分计算器
        </p>
        <h3 class="mt-1 text-xl font-bold text-zinc-900 md:text-2xl">
          按 2025 版办法估算总成绩
        </h3>
        <p class="mt-1.5 text-sm leading-6 text-zinc-600">
          综测由德育、智育、体育三部分构成，下方先选各板块的加分项，再自动累加出总分。同一项目、同一作品或同类任职按最高项计、不重复累计；各板块奖励设上限，最终以学院当年审核为准。
        </p>
      </div>
      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        @click="reset"
      >
        清空重选
      </button>
    </div>

    <!-- 实时汇总：选择加分项时始终可见 -->
    <div class="sticky top-[calc(var(--header-height)+0.75rem)] z-20 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
        <span>德育 <strong class="ml-0.5 font-bold text-zinc-900 tabular-nums">{{ sections.moral.subtotal.toFixed(2) }}</strong></span>
        <span class="text-zinc-300">+</span>
        <span>智育 <strong class="ml-0.5 font-bold text-zinc-900 tabular-nums">{{ sections.intellectual.subtotal.toFixed(2) }}</strong></span>
        <span class="text-zinc-300">+</span>
        <span>体育 <strong class="ml-0.5 font-bold text-zinc-900 tabular-nums">{{ sections.sports.subtotal.toFixed(2) }}</strong></span>
        <span class="text-zinc-300">=</span>
      </div>
      <p class="text-2xl font-bold text-zinc-900 tabular-nums">
        {{ sections.total.toFixed(2) }}<span class="ml-1 text-sm font-normal text-zinc-400">/ 100 分</span>
      </p>
    </div>

    <!-- 德育板块 -->
    <section class="mt-7">
      <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2.5">
        <p class="text-base font-semibold text-zinc-900">
          德育
          <span class="ml-2 text-xs font-normal text-zinc-500">基础 {{ sections.moral.base }} + 奖励（上限 {{ zongceStructure.moral.rewardCap }}）</span>
        </p>
        <p class="text-lg font-bold text-zinc-900 tabular-nums">
          {{ sections.moral.subtotal.toFixed(2) }} <span class="text-xs font-normal text-zinc-400">/ 25 分</span>
        </p>
      </div>
      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div
          v-for="category in zongceBonusCategories.filter(c => ['moral-honor','moral-work','moral-competition','moral-others'].includes(c.id))"
          :key="category.id"
          class="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
        >
          <p class="text-sm font-semibold text-zinc-800">
            {{ category.label.replace(/^德育奖励·/, '') }}
            <span v-if="category.cap" class="ml-1 text-xs font-normal text-zinc-400">上限 {{ category.cap }} 分</span>
          </p>
          <div v-for="item in category.items" :key="item.id" class="mt-3 border-t border-zinc-100 pt-3">
            <p class="text-sm font-medium text-zinc-800">{{ item.name }}</p>
            <p v-if="item.note" class="mt-0.5 text-xs leading-5 text-zinc-500">{{ item.note }}</p>
            <div v-if="item.levels && item.levels.length" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="lv in item.levels"
                :key="lv.level"
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="selectedLevel[item.id] === lv.level
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900'"
                @click="selectedLevel[item.id] = selectedLevel[item.id] === lv.level ? '' : lv.level"
              >{{ lv.level }} +{{ lv.points }}
              </button>
            </div>
            <div v-else-if="item.points !== undefined && item.cap != null" class="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                class="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none"
                v-model.number="qty[item.id]"
                :aria-label="item.name + '数量'"
              />
              <span class="text-xs text-zinc-500">次 / 项 × {{ item.points }} 分{{ item.cap ? '（最多 ' + item.cap + ' 分）' : '' }}</span>
            </div>
            <div v-else class="mt-2 flex items-center gap-2">
              <span class="text-sm font-medium text-zinc-700">+{{ item.points }} 分</span>
              <button
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="qty[item.id] === undefined || qty[item.id] === 0
                  ? 'border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900'
                  : 'border-zinc-900 bg-zinc-900 text-white'"
                @click="qty[item.id] = qty[item.id] ? 0 : 1"
              >{{ qty[item.id] ? '已计入' : '计入' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 智育板块 -->
    <section class="mt-8">
      <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2.5">
        <p class="text-base font-semibold text-zinc-900">
          智育
          <span class="ml-2 text-xs font-normal text-zinc-500">基础 {{ sections.intellectual.base }} + 奖励（上限 {{ zongceStructure.intellectual.rewardCap }}）</span>
        </p>
        <p class="text-lg font-bold text-zinc-900 tabular-nums">
          {{ sections.intellectual.subtotal.toFixed(2) }} <span class="text-xs font-normal text-zinc-400">/ 70 分</span>
        </p>
      </div>
      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div
          v-for="category in zongceBonusCategories.filter(c => ['intellectual-research','intellectual-cert'].includes(c.id))"
          :key="category.id"
          class="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
        >
          <p class="text-sm font-semibold text-zinc-800">
            {{ category.label.replace(/^智育奖励·/, '') }}
            <span v-if="category.cap" class="ml-1 text-xs font-normal text-zinc-400">上限 {{ category.cap }} 分</span>
          </p>
          <div v-for="item in category.items" :key="item.id" class="mt-3 border-t border-zinc-100 pt-3">
            <p class="text-sm font-medium text-zinc-800">{{ item.name }}</p>
            <p v-if="item.note" class="mt-0.5 text-xs leading-5 text-zinc-500">{{ item.note }}</p>
            <div v-if="item.levels && item.levels.length" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="lv in item.levels"
                :key="lv.level"
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="selectedLevel[item.id] === lv.level
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900'"
                @click="selectedLevel[item.id] = selectedLevel[item.id] === lv.level ? '' : lv.level"
              >{{ lv.level }} +{{ lv.points }}
              </button>
            </div>
            <div v-else-if="item.points !== undefined && item.cap != null" class="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                class="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none"
                v-model.number="qty[item.id]"
                :aria-label="item.name + '数量'"
              />
              <span class="text-xs text-zinc-500">次 / 项 × {{ item.points }} 分{{ item.cap ? '（最多 ' + item.cap + ' 分）' : '' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 体育板块 -->
    <section class="mt-8">
      <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2.5">
        <p class="text-base font-semibold text-zinc-900">
          体育
          <span class="ml-2 text-xs font-normal text-zinc-500">基础 {{ sections.sports.base }} + 奖励（上限 {{ zongceStructure.sports.rewardCap }}）</span>
        </p>
        <p class="text-lg font-bold text-zinc-900 tabular-nums">
          {{ sections.sports.subtotal.toFixed(2) }} <span class="text-xs font-normal text-zinc-400">/ 5 分</span>
        </p>
      </div>
      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div
          v-for="category in zongceBonusCategories.filter(c => c.id === 'sports')"
          :key="category.id"
          class="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
        >
          <p class="text-sm font-semibold text-zinc-800">
            {{ category.label.replace(/^体育奖励（.+）/, '体育比赛') }}
            <span v-if="category.cap" class="ml-1 text-xs font-normal text-zinc-400">上限 {{ category.cap }} 分</span>
          </p>
          <div v-for="item in category.items" :key="item.id" class="mt-3 border-t border-zinc-100 pt-3">
            <p class="text-sm font-medium text-zinc-800">{{ item.name }}</p>
            <p v-if="item.note" class="mt-0.5 text-xs leading-5 text-zinc-500">{{ item.note }}</p>
            <div v-if="item.levels && item.levels.length" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="lv in item.levels"
                :key="lv.level"
                type="button"
                class="rounded-md border px-2.5 py-1 text-xs transition-colors"
                :class="selectedLevel[item.id] === lv.level
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900'"
                @click="selectedLevel[item.id] = selectedLevel[item.id] === lv.level ? '' : lv.level"
              >{{ lv.level }} +{{ lv.points }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 总成绩 -->
    <div class="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5 md:p-6">
      <p class="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        总成绩估算
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg bg-white p-3 ring-1 ring-zinc-100">
          <p class="text-xs text-zinc-500">德育小计</p>
          <p class="mt-1 text-xl font-bold text-zinc-900 tabular-nums">{{ sections.moral.subtotal.toFixed(2) }}</p>
        </div>
        <div class="rounded-lg bg-white p-3 ring-1 ring-zinc-100">
          <p class="text-xs text-zinc-500">智育小计</p>
          <p class="mt-1 text-xl font-bold text-zinc-900 tabular-nums">{{ sections.intellectual.subtotal.toFixed(2) }}</p>
        </div>
        <div class="rounded-lg bg-white p-3 ring-1 ring-zinc-100">
          <p class="text-xs text-zinc-500">体育小计</p>
          <p class="mt-1 text-xl font-bold text-zinc-900 tabular-nums">{{ sections.sports.subtotal.toFixed(2) }}</p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
        <p class="text-sm text-zinc-600">
          德育 {{ sections.moral.subtotal.toFixed(2) }} + 智育 {{ sections.intellectual.subtotal.toFixed(2) }} + 体育 {{ sections.sports.subtotal.toFixed(2) }}
          <span class="text-zinc-400">=</span>
        </p>
        <p class="text-4xl font-bold text-zinc-900 tabular-nums">
          {{ sections.total.toFixed(2) }}
          <span class="text-base font-normal text-zinc-400">/ 100 分</span>
        </p>
      </div>
    </div>

    <!-- 常见扣分项 -->
    <div class="mt-7">
      <p class="text-sm font-semibold text-zinc-900">常见扣分项（参考）</p>
      <ul class="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-zinc-600 sm:grid-cols-2">
        <li v-for="d in deductionRows" :key="d.name" class="flex justify-between gap-2 border-b border-zinc-100 py-1.5">
          <span>{{ d.name }}</span><span class="shrink-0 text-zinc-400">-{{ d.points }} 分{{ d.unit }}</span>
        </li>
      </ul>
    </div>

    <p class="mt-4 text-xs leading-5 text-zinc-400">
      本工具按 2025 版《仰恩大学学生综合测评实施办法》估算，覆盖德育 / 智育 / 体育三大板块（各含基础分与可选奖励项）。加分项目、级别归属和名额发放以学院当年审核与申报材料为准；同一称号 / 作品 / 任职按最高级别计一次，团体获奖分数减半。
    </p>
  </div>
</template>
