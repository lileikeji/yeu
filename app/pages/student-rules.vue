<script setup lang="ts">
import {
  comprehensiveEvaluationRules,
  gpaRules,
  scholarshipGeneralRule,
  scholarships,
  studentRuleCatalog,
  studentRuleCategories,
  type StudentRuleCategory
} from '~~/data/student-rules'
import {
  calculateGpa,
  fiveLevelGradePoints,
  type FiveLevelGrade,
  type GpaCourseMode
} from '~/utils/gpa-calculator'
import ZongceBonusCalculator from '~/components/student-rules/ZongceBonusCalculator.vue'

useSeoMeta({
  title: '学生规则与奖学金',
  description: '公开学生制度、奖学金申请条件、综合测评与平均学分绩点计算工具。'
})

interface EditableCourse {
  id: number
  name: string
  credits: number
  mode: GpaCourseMode
  score: number
  grade: FiveLevelGrade
  isRetake: boolean
}

let nextCourseId = 4
const courses = ref<EditableCourse[]>([
  { id: 1, name: '课程一', credits: 3, mode: 'percentage', score: 86, grade: '良好', isRetake: false },
  { id: 2, name: '课程二', credits: 2, mode: 'percentage', score: 78, grade: '中等', isRetake: false },
  { id: 3, name: '课程三', credits: 1, mode: 'five-level', score: 80, grade: '良好', isRetake: false }
])

const calculation = computed(() => calculateGpa(courses.value.map(course => ({
  credits: Number(course.credits),
  mode: course.mode,
  score: Number(course.score),
  grade: course.grade,
  isRetake: course.isRetake
}))))

const selectedScholarship = ref(scholarships[0]?.slug ?? '')
const activeScholarship = computed(() => scholarships.find(item => item.slug === selectedScholarship.value) ?? scholarships[0]!)
const route = useRoute()
const ruleQuery = ref('')
const selectedCategory = ref<StudentRuleCategory | '全部'>('全部')

const filteredRules = computed(() => {
  const query = ruleQuery.value.trim().toLocaleLowerCase('zh-CN')
  return studentRuleCatalog.filter((rule) => {
    if (selectedCategory.value !== '全部' && rule.category !== selectedCategory.value) return false
    if (!query) return true
    return [rule.title, rule.summary, rule.category, ...rule.keywords]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(query)
  })
})

function addCourse(): void {
  courses.value.push({
    id: nextCourseId++,
    name: `课程${courses.value.length + 1}`,
    credits: 2,
    mode: 'percentage',
    score: 80,
    grade: '良好',
    isRetake: false
  })
}

function removeCourse(id: number): void {
  if (courses.value.length <= 1) return
  courses.value = courses.value.filter(course => course.id !== id)
}

function gradePointAt(index: number): number {
  return calculation.value.courses[index]?.gradePoint ?? 0
}

async function syncScholarshipHash(hash: string): Promise<void> {
  const slug = hash.match(/^#scholarship-(.+)$/)?.[1]
  if (!slug || !scholarships.some(item => item.slug === slug)) return
  selectedScholarship.value = slug
  await nextTick()
  document.getElementById(`scholarship-${slug}`)?.scrollIntoView({ block: 'start' })
}

onMounted(() => void syncScholarshipHash(route.hash))
watch(() => route.hash, hash => void syncScholarshipHash(hash))
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-12">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <UBadge
            color="neutral"
            variant="soft"
          >
            官网公开制度整理
          </UBadge>
          <span class="text-zinc-500 dark:text-zinc-400">核对日期：2026年7月24日</span>
        </div>
        <h1 class="mt-3 text-3xl font-bold text-zinc-950 dark:text-zinc-100 md:text-4xl">
          学生规则与奖学金
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 md:text-base">
          查绩点公式、试算 GPA、比较奖学金条件，也可以按主题打开学校公开的学生制度原文。
        </p>
        <div class="mt-6 flex flex-wrap gap-2">
          <UButton
            to="#gpa-calculator"
            label="计算 GPA"
            icon="i-lucide-calculator"
          />
          <UButton
            to="#scholarships"
            label="比较奖学金"
            icon="i-lucide-award"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="#zongce-calculator"
            label="算综合测评"
            icon="i-lucide-scale"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="#rule-library"
            label="查学生规则"
            icon="i-lucide-book-open-check"
            color="neutral"
            variant="outline"
          />
        </div>
      </div>
    </section>

    <section class="border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950">
      <div class="page-shell py-4 text-sm leading-6 text-amber-950">
        <p class="flex items-start gap-2">
          <UIcon
            name="i-lucide-info"
            class="mt-1 size-4 shrink-0"
          />
          <span><strong>公开范围说明：</strong>官网目前没有公开可下载的整本《学生手册》。这里把学生事务部规章制度目录及教务部公开文件整理成可检索规则库，不把分散文件误称为完整原册；校内如有更新版，以辅导员、教务系统和学校最新通知为准。</span>
        </p>
      </div>
    </section>

    <section
      id="gpa-calculator"
      class="scroll-mt-20 border-b border-[var(--line)] bg-zinc-50 dark:bg-zinc-800/60"
    >
      <div class="page-shell py-9 md:py-14">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              平均学分绩点
            </p>
            <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 class="text-2xl font-bold text-zinc-950 dark:text-zinc-100">
                  GPA 计算器
                </h2>
                <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  录入参与绩点计算的课程；0学分课程会自动排除。
                </p>
              </div>
              <UButton
                label="添加课程"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                @click="addCourse"
              />
            </div>

            <div class="mt-5 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div class="hidden grid-cols-[minmax(8rem,1fr)_5.5rem_8rem_7rem_4.5rem_2.75rem] gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 md:grid">
                <span>课程</span><span>学分</span><span>成绩制</span><span>成绩</span><span>绩点</span><span />
              </div>
              <div
                v-for="(course, index) in courses"
                :key="course.id"
                class="grid gap-3 border-b border-zinc-100 dark:border-zinc-800 p-3 last:border-b-0 md:grid-cols-[minmax(8rem,1fr)_5.5rem_8rem_7rem_4.5rem_2.75rem] md:items-center md:gap-2"
              >
                <UInput
                  v-model="course.name"
                  aria-label="课程名称"
                />
                <UInput
                  v-model.number="course.credits"
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  aria-label="课程学分"
                />
                <div class="grid grid-cols-2 rounded-md bg-zinc-100 dark:bg-zinc-800 p-0.5 text-xs">
                  <button
                    type="button"
                    class="min-h-9 rounded px-2"
                    :class="course.mode === 'percentage' ? 'bg-white dark:bg-zinc-900 font-semibold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'"
                    @click="course.mode = 'percentage'"
                  >
                    百分
                  </button>
                  <button
                    type="button"
                    class="min-h-9 rounded px-2"
                    :class="course.mode === 'five-level' ? 'bg-white dark:bg-zinc-900 font-semibold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'"
                    @click="course.mode = 'five-level'"
                  >
                    五级
                  </button>
                </div>
                <UInput
                  v-if="course.mode === 'percentage'"
                  v-model.number="course.score"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  aria-label="百分制成绩"
                />
                <select
                  v-else
                  v-model="course.grade"
                  class="min-h-10 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm"
                  aria-label="五级制成绩"
                >
                  <option
                    v-for="(_, grade) in fiveLevelGradePoints"
                    :key="grade"
                    :value="grade"
                  >
                    {{ grade }}
                  </option>
                </select>
                <div class="flex items-center justify-between gap-3 md:block">
                  <label class="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 md:mb-1">
                    <input
                      v-model="course.isRetake"
                      type="checkbox"
                      class="size-4 accent-zinc-700"
                    >
                    补考
                  </label>
                  <strong class="text-sm text-zinc-800 dark:text-zinc-100">{{ gradePointAt(index).toFixed(2) }}</strong>
                </div>
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  :disabled="courses.length <= 1"
                  :aria-label="`删除${course.name}`"
                  @click="removeCourse(course.id)"
                />
              </div>
            </div>
          </div>

          <aside class="lg:sticky lg:top-24 lg:self-start">
            <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                当前试算
              </p>
              <p class="mt-2 text-5xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {{ calculation.gpa === null ? '—' : calculation.gpa.toFixed(2) }}
              </p>
              <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                平均学分绩点
              </p>
              <dl class="mt-5 grid grid-cols-2 gap-2">
                <div class="rounded-md bg-zinc-50 dark:bg-zinc-800/60 p-3 ring-1 ring-zinc-100 dark:ring-zinc-800">
                  <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                    计入学分
                  </dt><dd class="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {{ calculation.totalCredits }}
                  </dd>
                </div>
                <div class="rounded-md bg-zinc-50 dark:bg-zinc-800/60 p-3 ring-1 ring-zinc-100 dark:ring-zinc-800">
                  <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                    计入课程
                  </dt><dd class="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {{ calculation.includedCourses }}
                  </dd>
                </div>
              </dl>
            </div>
            <div class="mt-4 border-l-2 border-zinc-300 dark:border-zinc-700 pl-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              <p
                v-for="formula in gpaRules.formulas"
                :key="formula"
                class="mb-2 last:mb-0"
              >
                {{ formula }}
              </p>
            </div>
            <a
              :href="gpaRules.sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:text-zinc-950 dark:hover:text-zinc-100"
            >
              查看学校公开原文件 <UIcon
                name="i-lucide-external-link"
                class="size-4"
              />
            </a>
          </aside>
        </div>
        <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <p
            v-for="note in gpaRules.notes"
            :key="note"
            class="border-t border-zinc-300 dark:border-zinc-700 pt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300"
          >
            {{ note }}
          </p>
        </div>
      </div>
    </section>

    <section
      id="scholarships"
      class="scroll-mt-20 border-b border-[var(--line)] bg-white dark:bg-zinc-900"
    >
      <div class="page-shell py-9 md:py-14">
        <p class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          当前公开奖项
        </p>
        <h2 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
          奖学金条件对比
        </h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          2025年总规定列出的7类奖学金均已纳入。先选奖项，再逐项核对资格；达到条件不代表必然获奖。
        </p>

        <div
          class="mt-5 flex gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label="选择奖学金"
        >
          <button
            v-for="item in scholarships"
            :key="item.slug"
            type="button"
            role="tab"
            :aria-selected="selectedScholarship === item.slug"
            class="min-h-11 shrink-0 rounded-md border px-3 text-sm font-semibold"
            :class="selectedScholarship === item.slug ? 'border-zinc-900 bg-zinc-900 dark:bg-zinc-700 dark:bg-zinc-700 text-white' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600'"
            @click="selectedScholarship = item.slug"
          >
            {{ item.name }}
          </button>
        </div>

        <article
          :id="`scholarship-${activeScholarship.slug}`"
          class="mt-5 scroll-mt-24 border-t-2 border-zinc-200 dark:border-zinc-800 pt-5"
        >
          <div class="grid gap-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-xl font-bold text-zinc-950 dark:text-zinc-100">
                  {{ activeScholarship.name }}
                </h3>
                <UBadge
                  color="neutral"
                  variant="soft"
                >
                  {{ activeScholarship.version }}
                </UBadge>
              </div>
              <dl class="mt-5 space-y-4 text-sm">
                <div>
                  <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                    金额与名额
                  </dt><dd class="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                    {{ activeScholarship.amount }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                    参评范围
                  </dt><dd class="mt-1 text-zinc-800 dark:text-zinc-100">
                    {{ activeScholarship.scope }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                    排名/成果门槛
                  </dt><dd class="mt-1 text-zinc-800 dark:text-zinc-100">
                    {{ activeScholarship.ranking }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                    评审时间
                  </dt><dd class="mt-1 text-zinc-800 dark:text-zinc-100">
                    {{ activeScholarship.reviewTime }}
                  </dd>
                </div>
              </dl>
            </div>
            <div>
              <h4 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                主要申请条件
              </h4>
              <ul class="mt-3 grid gap-2">
                <li
                  v-for="requirement in activeScholarship.requirements"
                  :key="requirement"
                  class="flex items-start gap-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200"
                >
                  <UIcon
                    name="i-lucide-check"
                    class="mt-1 size-4 shrink-0 text-zinc-700 dark:text-zinc-200"
                  />{{ requirement }}
                </li>
              </ul>
              <p class="mt-5 border-l-2 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-3 py-2.5 text-sm leading-6 text-amber-950">
                <strong>兼得与互斥：</strong>{{ activeScholarship.coexistence }}
              </p>
              <a
                :href="activeScholarship.sourceUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:text-zinc-950 dark:hover:text-zinc-100"
              >
                查看 {{ activeScholarship.documentNumber }} 原文 <UIcon
                  name="i-lucide-external-link"
                  class="size-4"
                />
              </a>
            </div>
          </div>
        </article>

        <p class="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          <strong class="text-zinc-900 dark:text-zinc-100">统一参评规则：</strong>{{ scholarshipGeneralRule.summary }}
          <a
            :href="scholarshipGeneralRule.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="ml-1 font-semibold text-zinc-800 dark:text-zinc-100 hover:text-zinc-950 dark:hover:text-zinc-100"
          >查看原文</a>
        </p>
      </div>
    </section>

    <section
      id="zongce-calculator"
      class="scroll-mt-20 bg-white dark:bg-zinc-900"
    >
      <div class="page-shell py-9 md:py-14">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="max-w-3xl">
            <p class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              综合测评
            </p>
            <h2 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
              综测加分计算器
            </h2>
            <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              综合测评 ≠ GPA，满分 100 分，2025 版办法自 2025 年 1 月起施行，用于多项评奖排名。下方点选各板块加分项，总分实时更新。
            </p>
          </div>
          <a
            :href="comprehensiveEvaluationRules.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:text-zinc-950 dark:hover:text-zinc-100"
          >查看完整加扣分办法 <UIcon
            name="i-lucide-external-link"
            class="size-4"
          /></a>
        </div>

        <div class="mt-5 grid max-w-md grid-cols-3 gap-2">
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3 text-center">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              德育
            </p><p class="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              25
            </p>
          </div>
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3 text-center">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              智育
            </p><p class="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              70
            </p>
          </div>
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3 text-center">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              体育
            </p><p class="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              5
            </p>
          </div>
        </div>

        <div class="mt-5">
          <ZongceBonusCalculator />
        </div>

        <div class="mt-4 grid gap-x-8 gap-y-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400 sm:grid-cols-2">
          <p
            v-for="formula in comprehensiveEvaluationRules.formulas.slice(2)"
            :key="formula"
          >
            {{ formula }}
          </p>
        </div>
      </div>
    </section>

    <section
      id="rule-library"
      class="scroll-mt-20 bg-zinc-50 dark:bg-zinc-800/60"
    >
      <div class="page-shell py-9 md:py-14">
        <p class="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          公开学生制度
        </p>
        <div class="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="text-2xl font-bold text-zinc-950 dark:text-zinc-100">
              学生规则库
            </h2>
            <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              当前整理 {{ studentRuleCatalog.length }} 项公开制度，点击可打开学校原文。
            </p>
          </div>
          <UInput
            v-model="ruleQuery"
            icon="i-lucide-search"
            size="lg"
            class="w-full md:max-w-sm"
            placeholder="搜请假、处分、困难认定……"
            aria-label="搜索学生规则"
          />
        </div>
        <div
          class="mt-5 flex gap-2 overflow-x-auto pb-2"
          aria-label="规则分类"
        >
          <button
            v-for="category in ['全部', ...studentRuleCategories]"
            :key="category"
            type="button"
            class="min-h-10 shrink-0 rounded-md px-3 text-sm"
            :class="selectedCategory === category ? 'bg-zinc-900 dark:bg-zinc-700 font-semibold text-white' : 'border border-zinc-200 dark:border-zinc-800 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200'"
            @click="selectedCategory = category as StudentRuleCategory | '全部'"
          >
            {{ category }}
          </button>
        </div>
        <div class="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
          <article
            v-for="rule in filteredRules"
            :id="`rule-${rule.slug}`"
            :key="rule.slug"
            class="scroll-mt-24 py-5"
          >
            <div class="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:items-start md:gap-5">
              <p class="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {{ rule.category }}
              </p>
              <div>
                <h3 class="font-bold text-zinc-950 dark:text-zinc-100">
                  {{ rule.title }}
                </h3>
                <p class="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {{ rule.summary }}
                </p>
                <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {{ rule.version }}
                </p>
              </div>
              <UButton
                :to="rule.url"
                external
                target="_blank"
                rel="noopener noreferrer"
                label="官方原文"
                trailing-icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                class="justify-self-start md:justify-self-end"
              />
            </div>
          </article>
          <p
            v-if="filteredRules.length === 0"
            class="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
          >
            没有匹配的公开制度，换个关键词试试。
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
