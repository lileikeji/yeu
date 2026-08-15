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
  // 数量型（固定分值 + 可累计）：志愿/献血/讲座/演出
  if (item.points !== undefined) {
    const q = qty.value[item.id] ?? 0
    const raw = item.points * q
    return item.cap ? Math.min(item.cap, raw) : raw
  }
  // 级别型（单选）：同一项目取所选级别分值
  const level = selectedLevel.value[item.id]
  const matched = item.levels?.find(l => l.level === level)
  return matched ? matched.points : 0
}

function categoryTotal(category: ZongceCategory): number {
  const raw = category.items.reduce((sum, item) => sum + pointsOfItem(item, category), 0)
  return category.cap ? Math.min(category.cap, raw) : raw
}

const totals = computed(() => {
  const rows = zongceBonusCategories.map(category => ({
    category,
    total: categoryTotal(category)
  }))
  const grand = rows.reduce((sum, r) => sum + r.total, 0)
  return { rows, grand }
})

const deductionRows = computed(() => zongceDeductions)

const reset = (): void => {
  selectedLevel.value = {}
  qty.value = {}
}
</script>

<template>
  <div class="rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm md:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="section-kicker text-emerald-700">
          综合测评加分计算器
        </p>
        <h3 class="mt-1 text-xl font-bold text-zinc-950">
          按 2025 版办法估算加分
        </h3>
        <p class="mt-1 text-sm text-zinc-600">
          逐项勾选你的表彰、任职、竞赛、证书与志愿等，实时估算德育/智育/体育加分。同一项目、同一作品或同类任职按最高项计、不重复累计；德育上限 13、智育上限 10、体育上限 2 分，最终以学院当年审核为准。
        </p>
      </div>
      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        @click="reset"
      >清空重选
      </button>
    </div>

    <div class="mt-6 grid gap-4 lg:grid-cols-2">
      <div v-for="row in totals.rows" :key="row.category.id" class="rounded-lg border border-[var(--line)] p-4">
        <div class="flex items-baseline justify-between gap-2">
          <p class="text-sm font-semibold text-zinc-900">
            {{ row.category.label }}
            <span v-if="row.category.cap" class="ml-1 text-xs font-normal text-zinc-500">上限 {{ row.category.cap }} 分</span>
          </p>
          <p class="text-2xl font-bold text-emerald-700">
            {{ row.total.toFixed(2) }}
          </p>
        </div>
        <div v-if="row.category.items.length === 0" class="mt-3 text-sm text-zinc-500">（暂无选项）</div>
        <div v-for="item in row.category.items" :key="item.id" class="mt-3 border-t border-zinc-100 pt-3">
          <p class="text-sm font-medium text-zinc-800">
            {{ item.name }}
          </p>
          <p v-if="item.note" class="mt-0.5 text-xs text-zinc-500">
            {{ item.note }}
          </p>
          <!-- 级别单选 -->
          <div v-if="item.levels && item.levels.length" class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="lv in item.levels"
              :key="lv.level"
              type="button"
              class="rounded-md border px-2.5 py-1 text-xs transition-colors"
              :class="selectedLevel[item.id] === lv.level
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-zinc-200 text-zinc-600 hover:border-emerald-500 hover:text-emerald-700'"
              @click="selectedLevel[item.id] = selectedLevel[item.id] === lv.level ? '' : lv.level"
            >{{ lv.level }} +{{ lv.points }}
            </button>
          </div>
          <!-- 数量型 -->
          <div v-else-if="item.points !== undefined && item.cap != null" class="mt-2 flex items-center gap-2">
            <input
              type="number"
              min="0"
              class="w-24 rounded-md border border-zinc-200 px-2 py-1 text-sm"
              v-model.number="qty[item.id]"
              :aria-label="item.name + '数量'"
            />
            <span class="text-xs text-zinc-500">次 / 项 × {{ item.points }} 分{{ item.cap ? '（最多 ' + item.cap + ' 分）' : '' }}</span>
          </div>
          <!-- 单项固定 -->
          <div v-else class="mt-2">
            <span class="text-sm text-emerald-700 font-medium">+{{ item.points }} 分</span>
            <button
              type="button"
              class="ml-2 rounded-md border px-2.5 py-1 text-xs transition-colors"
              :class="qty[item.id] === undefined || qty[item.id] === 0
                ? 'border-zinc-200 text-zinc-600 hover:border-emerald-500 hover:text-emerald-700'
                : 'border-emerald-600 bg-emerald-600 text-white'"
              @click="qty[item.id] = qty[item.id] ? 0 : 1"
            >{{ qty[item.id] ? '已计入' : '计入' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-4">
      <div>
        <p class="text-sm text-emerald-800">
          德育奖励 {{ totals.rows.find(r => r.category.id === 'moral-honor')?.total.toFixed(2) ?? '0.00' }} +
          智育奖励 {{ totals.rows.find(r => r.category.id === 'intellectual-research')?.total.toFixed(2) ?? '0.00' }} +
          体育奖励 {{ totals.rows.find(r => r.category.id === 'sports')?.total.toFixed(2) ?? '0.00' }}
          （以上按德育{{ zongceStructure.moral.rewardCap }} / 智育{{ zongceStructure.intellectual.rewardCap }} / 体育{{ zongceStructure.sports.rewardCap }}封顶估算）
        </p>
      </div>
      <p class="text-3xl font-bold text-emerald-700">
        约 {{ totals.grand.toFixed(2) }}
      </p>
    </div>

    <div class="mt-5">
      <p class="text-sm font-semibold text-zinc-900">
        常见扣分项（参考）
      </p>
      <ul class="mt-2 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
        <li v-for="d in deductionRows" :key="d.name" class="flex justify-between gap-2 border-b border-zinc-100 py-1">
          <span>{{ d.name }}</span><span class="shrink-0 text-red-500">-{{ d.points }} 分{{ d.unit }}</span>
        </li>
      </ul>
    </div>

    <p class="mt-4 text-xs text-zinc-400">
      本工具为按 2025 版《仰恩大学学生综合测评实施办法》的**估算**，不含智育基础分与体育基础分；加分项目、级别归属和名额发放以学院当年审核与申报材料为准，同一称号/作品/任职按最高级别计一次。
    </p>
  </div>
</template>
