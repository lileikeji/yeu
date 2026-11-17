<script setup lang="ts">
import {
  createEditableExtrasState,
  DEFAULT_YEUCA_AI_WORKFLOW_STEPS,
  DEFAULT_YEUCA_ARCHIVE_TIMELINE,
  DEFAULT_YEUCA_CHECKLIST,
  DEFAULT_YEUCA_COMPETITIONS,
  DEFAULT_YEUCA_FAQS,
  DEFAULT_YEUCA_FRIEND_LINKS,
  DEFAULT_YEUCA_HOME_ENTRIES,
  DEFAULT_YEUCA_MIRRORS,
  DEFAULT_YEUCA_PRACTICE_TOPICS,
  DEFAULT_YEUCA_SCRIPT_OPTIONS,
  DEFAULT_YEUCA_SEASONAL_RHYTHM,
  DEFAULT_YEUCA_STARTER_LINKS,
  type EditableYeucaExtrasState
} from '~~/shared/utils/yeuca-defaults'
import type { YeucaSiteExtras } from '~~/shared/types/yeuca'

const props = defineProps<{
  initialExtras: YeucaSiteExtras | undefined
  saving: boolean
}>()

const emit = defineEmits<{
  save: [nextState: EditableYeucaExtrasState]
}>()

type SubSection = 'home' | 'ai_rhythm' | 'mirrors_links' | 'about_archive'
const subSection = ref<SubSection>('home')

const local = reactive<EditableYeucaExtrasState>(createEditableExtrasState(props.initialExtras))

watch(() => props.initialExtras, (val) => {
  Object.assign(local, createEditableExtrasState(val))
}, { deep: true })

function handleSave(): void {
  emit('save', JSON.parse(JSON.stringify(local)) as EditableYeucaExtrasState)
}

function seedAllDefaults(): void {
  if (!local.homeEntries.length) local.homeEntries = DEFAULT_YEUCA_HOME_ENTRIES.map(x => ({ ...x }))
  if (!local.aiWorkflowSteps.length) local.aiWorkflowSteps = DEFAULT_YEUCA_AI_WORKFLOW_STEPS.map(x => ({ ...x }))
  if (!local.seasonalRhythm.length) local.seasonalRhythm = DEFAULT_YEUCA_SEASONAL_RHYTHM.map(x => ({ ...x, tags: [...x.tags] }))
  if (!local.archiveTimeline.length) local.archiveTimeline = DEFAULT_YEUCA_ARCHIVE_TIMELINE.map(x => ({ ...x }))
  if (!local.volatileChecklist.length) local.volatileChecklist = DEFAULT_YEUCA_CHECKLIST.map(x => ({ ...x }))
  if (!local.practiceTopics.length) local.practiceTopics = DEFAULT_YEUCA_PRACTICE_TOPICS.map(x => ({ ...x, stack: [...x.stack] }))
  if (!local.starterLinks.length) local.starterLinks = DEFAULT_YEUCA_STARTER_LINKS.map(x => ({ ...x }))
  if (!local.mirrors.length) local.mirrors = DEFAULT_YEUCA_MIRRORS.map(x => ({ ...x }))
  if (!local.scriptOptions.length) local.scriptOptions = DEFAULT_YEUCA_SCRIPT_OPTIONS.map(x => ({ ...x, ps1: [...x.ps1], sh: [...x.sh] }))
  if (!local.friendLinks.length) local.friendLinks = DEFAULT_YEUCA_FRIEND_LINKS.map(x => ({ ...x }))
  if (!local.competitions.length) local.competitions = DEFAULT_YEUCA_COMPETITIONS.map(x => ({ ...x }))
  if (!local.faqs.length) local.faqs = DEFAULT_YEUCA_FAQS.map(x => ({ ...x }))
}

function addEntryCard(): void {
  local.homeEntries.push({
    id: `entry-${Date.now().toString(36)}`,
    badge: '04 / 板块',
    title: '',
    desc: '',
    href: '/departments/',
    cta: '进入查看 →',
    enabled: true
  })
}

function addFriendLink(): void {
  local.friendLinks.push({ label: '', href: 'https://' })
}

function addWorkflowStep(): void {
  const idx = local.aiWorkflowSteps.length + 1
  local.aiWorkflowSteps.push({
    id: `step-${Date.now().toString(36)}`,
    step: `STEP 0${idx}`,
    title: '',
    role: '',
    logic: '',
    pitfall: '',
    sample: ''
  })
}

function addPracticeTopic(): void {
  local.practiceTopics.push({
    dept: 'AI 部 · 练手题目',
    title: '',
    stack: ['Python'],
    desc: ''
  })
}

function addSeasonalRhythm(): void {
  local.seasonalRhythm.push({
    phase: '新阶段',
    title: '',
    detail: '',
    tags: []
  })
}

function addMirrorEntry(): void {
  local.mirrors.push({
    id: `mirror-${Date.now().toString(36)}`,
    category: '语言与包',
    name: '',
    upstream: '',
    note: '',
    cmd: '',
    snippetTitle: '',
    snippet: '',
    helpUrl: '',
    helpHost: ''
  })
}

function addScriptOption(): void {
  local.scriptOptions.push({
    id: `opt-${Date.now().toString(36)}`,
    label: '',
    ps1: [''],
    sh: ['']
  })
}

function addStarterLink(): void {
  local.starterLinks.push({
    dept: 'AI 部',
    title: '',
    host: '',
    url: 'https://',
    note: ''
  })
}

function addTimelineNode(): void {
  local.archiveTimeline.push({
    period: '2026 年',
    tag: '节点',
    title: '',
    detail: ''
  })
}

function addChecklistRow(): void {
  local.volatileChecklist.push({
    item: '',
    source: '',
    note: ''
  })
}

function addCompetition(): void {
  local.competitions.push({
    name: '',
    track: '学科竞赛',
    dept: '编程部',
    site: '',
    href: ''
  })
}

function addFaq(): void {
  local.faqs.push({ q: '', a: '' })
}
</script>

<template>
  <div class="space-y-4">
    <!-- 子板块导航条 -->
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-3">
      <div class="flex flex-wrap gap-1.5">
        <UButton
          size="xs"
          label="1. 首页结构 / 公告 / 导航开关 / 友链"
          :variant="subSection === 'home' ? 'solid' : 'ghost'"
          :color="subSection === 'home' ? 'primary' : 'neutral'"
          @click="subSection = 'home'"
        />
        <UButton
          size="xs"
          label="2. AI 演示步骤 / 练手题 / 活动节奏"
          :variant="subSection === 'ai_rhythm' ? 'solid' : 'ghost'"
          :color="subSection === 'ai_rhythm' ? 'primary' : 'neutral'"
          @click="subSection = 'ai_rhythm'"
        />
        <UButton
          size="xs"
          label="3. 镜像源站 / 一键脚本 / 外链推荐"
          :variant="subSection === 'mirrors_links' ? 'solid' : 'ghost'"
          :color="subSection === 'mirrors_links' ? 'primary' : 'neutral'"
          @click="subSection = 'mirrors_links'"
        />
        <UButton
          size="xs"
          label="4. 发展沿革 / 核对清单 / 竞赛 / Q&A"
          :variant="subSection === 'about_archive' ? 'solid' : 'ghost'"
          :color="subSection === 'about_archive' ? 'primary' : 'neutral'"
          @click="subSection = 'about_archive'"
        />
      </div>

      <div class="flex gap-2">
        <UButton
          size="xs"
          variant="outline"
          color="neutral"
          label="补全官方预设"
          @click="seedAllDefaults"
        />
        <UButton
          size="sm"
          icon="i-lucide-save"
          label="保存全站模块"
          class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
          :loading="saving"
          @click="handleSave"
        />
      </div>
    </div>

    <!-- 1. 首页结构 / 公告 / 开关 / 页脚 -->
    <div
      v-if="subSection === 'home'"
      class="space-y-4"
    >
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              官网顶部公告条 & 首屏引导文案
            </h3>
            <p class="text-xs text-zinc-500">
              无需改前端代码，直接调整首页顶部公告提示与首屏按钮文案。
            </p>
          </div>
          <label class="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input
              v-model="local.homeAnnouncement.enabled"
              type="checkbox"
              class="rounded border-zinc-300"
            >
            <span>启用官网置顶公告条</span>
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-4">
          <UFormField label="公告标签">
            <UInput
              v-model="local.homeAnnouncement.tag"
              placeholder="招新 / 通知"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="公告内容"
            class="sm:col-span-2"
          >
            <UInput
              v-model="local.homeAnnouncement.text"
              class="w-full"
            />
          </UFormField>
          <UFormField label="跳转链接（选填）">
            <UInput
              v-model="local.homeAnnouncement.href"
              placeholder="/join/ 或 https://..."
              class="w-full font-mono text-xs"
            />
          </UFormField>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <UFormField label="首屏小徽标文案">
            <UInput
              v-model="local.homeHero.badge"
              class="w-full"
            />
          </UFormField>
          <UFormField label="主按钮文案">
            <UInput
              v-model="local.homeHero.joinBtnText"
              class="w-full"
            />
          </UFormField>
          <UFormField label="二维码按钮文案">
            <UInput
              v-model="local.homeHero.qrBtnText"
              class="w-full"
            />
          </UFormField>
          <UFormField label="首屏引导附注">
            <UInput
              v-model="local.homeHero.guideCardNote"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>

      <!-- 首页三大核心入口卡片 -->
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold">
              首页核心入口卡片（默认 3 个核心板块）
            </h3>
            <p class="text-xs text-zinc-500">
              可随时调整卡片角标、标题、简介、跳转路线或临时关闭显示。
            </p>
          </div>
          <UButton
            size="xs"
            icon="i-lucide-plus"
            label="新增卡片"
            variant="outline"
            color="neutral"
            @click="addEntryCard"
          />
        </div>

        <div class="grid gap-3 md:grid-cols-3">
          <div
            v-for="(entry, idx) in local.homeEntries"
            :key="entry.id"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex items-center justify-between">
              <label class="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  v-model="entry.enabled"
                  type="checkbox"
                >
                <span>显示该卡片</span>
              </label>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.homeEntries.splice(idx, 1)"
              />
            </div>
            <UInput
              v-model="entry.badge"
              size="xs"
              placeholder="01 / 组织分工"
              class="w-full font-mono"
            />
            <UInput
              v-model="entry.title"
              size="sm"
              placeholder="卡片标题"
              class="w-full"
            />
            <UTextarea
              v-model="entry.desc"
              :rows="2"
              size="xs"
              placeholder="简短说明"
              class="w-full"
            />
            <div class="grid grid-cols-2 gap-1.5">
              <UInput
                v-model="entry.href"
                size="xs"
                placeholder="/departments/"
                class="font-mono"
              />
              <UInput
                v-model="entry.cta"
                size="xs"
                placeholder="按钮文字"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 导航开关 & Git 提示 & 友情链接 -->
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <h3 class="text-sm font-semibold">
            导航模块显隐与 Git / 镜像提示文案
          </h3>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="local.featureFlags.showMemberEntry"
                type="checkbox"
              >
              <span>显示「会员入口」</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="local.featureFlags.showGitNav"
                type="checkbox"
              >
              <span>显示顶部「Git ↗」</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="local.featureFlags.showMirrorsNav"
                type="checkbox"
              >
              <span>显示顶部「镜像」</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="local.featureFlags.showToolsNav"
                type="checkbox"
              >
              <span>显示「小工具」入口</span>
            </label>
          </div>
          <UFormField label="Git 站门禁提示文案（会员未登录或查看项目时显示）">
            <UTextarea
              v-model="local.featureFlags.gitGateHint"
              :rows="2"
              class="w-full"
            />
          </UFormField>
          <UFormField label="镜像站底部资源提示">
            <UTextarea
              v-model="local.featureFlags.mirrorNotice"
              :rows="2"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              页脚说明与友情链接
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="添加友链"
              variant="outline"
              color="neutral"
              @click="addFriendLink"
            />
          </div>
          <UFormField label="页脚附加说明（工信部备案号始终锁定保留）">
            <UTextarea
              v-model="local.footerNote"
              :rows="2"
              placeholder="例如：网站源代码及社团内部仓库托管于自建 Git 代码站"
              class="w-full"
            />
          </UFormField>
          <div class="space-y-2">
            <div
              v-for="(fl, idx) in local.friendLinks"
              :key="idx"
              class="flex gap-2"
            >
              <UInput
                v-model="fl.label"
                size="xs"
                placeholder="站点名称"
                class="w-36"
              />
              <UInput
                v-model="fl.href"
                size="xs"
                placeholder="https://..."
                class="flex-1 font-mono"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-x"
                @click="local.friendLinks.splice(idx, 1)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. AI 演示步骤 / 新手练手题 / 活动节奏 -->
    <div
      v-if="subSection === 'ai_rhythm'"
      class="space-y-4"
    >
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold">
              AI 部工作流四步交互演示卡片
            </h3>
            <p class="text-xs text-zinc-500">
              对应官网 `/departments/` 中 AI 部的分步切换卡片，可编辑每一步职责、逻辑、防错原则和样例代码。
            </p>
          </div>
          <UButton
            size="xs"
            icon="i-lucide-plus"
            label="新增步骤"
            variant="outline"
            color="neutral"
            @click="addWorkflowStep"
          />
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="(step, idx) in local.aiWorkflowSteps"
            :key="step.id"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex items-center gap-2">
              <UInput
                v-model="step.step"
                size="xs"
                class="w-24 font-mono"
              />
              <UInput
                v-model="step.title"
                size="sm"
                placeholder="步骤标题"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.aiWorkflowSteps.splice(idx, 1)"
              />
            </div>
            <UInput
              v-model="step.role"
              size="xs"
              placeholder="职责作用"
              class="w-full"
            />
            <UTextarea
              v-model="step.logic"
              :rows="2"
              size="xs"
              placeholder="实现逻辑"
              class="w-full"
            />
            <UInput
              v-model="step.pitfall"
              size="xs"
              placeholder="常见防坑"
              class="w-full"
            />
            <UInput
              v-model="step.sample"
              size="xs"
              placeholder="输入输出样例"
              class="w-full font-mono"
            />
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              新手练手题目清单 (`/projects/`)
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="新增题目"
              variant="outline"
              color="neutral"
              @click="addPracticeTopic"
            />
          </div>
          <div
            v-for="(t, idx) in local.practiceTopics"
            :key="idx"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="t.dept"
                size="xs"
                placeholder="所属部门"
                class="w-36"
              />
              <UInput
                v-model="t.title"
                size="xs"
                placeholder="题目标题"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.practiceTopics.splice(idx, 1)"
              />
            </div>
            <UInput
              :model-value="t.stack.join(', ')"
              size="xs"
              placeholder="技术栈（逗号分隔）"
              class="w-full"
              @update:model-value="(val: string) => { t.stack = val.split(/[,，]/).map(s => s.trim()).filter(Boolean) }"
            />
            <UTextarea
              v-model="t.desc"
              :rows="2"
              size="xs"
              placeholder="题目说明"
              class="w-full"
            />
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              学年四季活动节奏 (`/activities/`)
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="新增阶段"
              variant="outline"
              color="neutral"
              @click="addSeasonalRhythm"
            />
          </div>
          <div
            v-for="(sr, idx) in local.seasonalRhythm"
            :key="idx"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="sr.phase"
                size="xs"
                placeholder="开学初 / 学期中"
                class="w-28"
              />
              <UInput
                v-model="sr.title"
                size="xs"
                placeholder="阶段主题"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.seasonalRhythm.splice(idx, 1)"
              />
            </div>
            <UTextarea
              v-model="sr.detail"
              :rows="2"
              size="xs"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 镜像源站 / 脚本生成器选项 / 学习外链 -->
    <div
      v-if="subSection === 'mirrors_links'"
      class="space-y-4"
    >
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold">
              开源镜像加速源站目录 (`/mirrors/`)
            </h3>
            <p class="text-xs text-zinc-500">
              支持维护协会自建 PyPI/npm 代理与清华 TUNA、HuggingFace 等校内常用命令源。
            </p>
          </div>
          <UButton
            size="xs"
            icon="i-lucide-plus"
            label="新增镜像源"
            variant="outline"
            color="neutral"
            @click="addMirrorEntry"
          />
        </div>

        <div class="space-y-2.5">
          <div
            v-for="(m, idx) in local.mirrors"
            :key="m.id"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="grid gap-2 sm:grid-cols-4">
              <select
                v-model="m.category"
                class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2 text-xs"
              >
                <option value="语言与包">
                  语言与包
                </option>
                <option value="AI 与模型">
                  AI 与模型
                </option>
                <option value="系统与容器">
                  系统与容器
                </option>
              </select>
              <UInput
                v-model="m.name"
                size="xs"
                placeholder="源名称"
                class="w-full"
              />
              <UInput
                v-model="m.upstream"
                size="xs"
                placeholder="上游主机"
                class="w-full font-mono"
              />
              <div class="flex gap-1">
                <UInput
                  v-model="m.note"
                  size="xs"
                  placeholder="说明"
                  class="flex-1"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  @click="local.mirrors.splice(idx, 1)"
                />
              </div>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <UInput
                v-model="m.cmd"
                size="xs"
                placeholder="一键复制配置命令"
                class="w-full font-mono"
              />
              <div class="flex gap-2">
                <UInput
                  v-model="m.helpUrl"
                  size="xs"
                  placeholder="帮助文档 URL"
                  class="flex-1 font-mono"
                />
                <UInput
                  v-model="m.helpHost"
                  size="xs"
                  placeholder="显示主机"
                  class="w-36 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              一键换源脚本勾选项目
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="新增脚本项"
              variant="outline"
              color="neutral"
              @click="addScriptOption"
            />
          </div>
          <div
            v-for="(opt, idx) in local.scriptOptions"
            :key="opt.id"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="opt.label"
                size="xs"
                placeholder="选项展示名称"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.scriptOptions.splice(idx, 1)"
              />
            </div>
            <UTextarea
              :model-value="opt.ps1.join('\n')"
              :rows="2"
              size="xs"
              placeholder="PowerShell 命令（每行一条）"
              class="w-full font-mono"
              @update:model-value="(v: string) => { opt.ps1 = v.split('\n').map(s => s.trim()).filter(Boolean) }"
            />
            <UTextarea
              :model-value="opt.sh.join('\n')"
              :rows="2"
              size="xs"
              placeholder="Bash/Shell 命令（每行一条）"
              class="w-full font-mono"
              @update:model-value="(v: string) => { opt.sh = v.split('\n').map(s => s.trim()).filter(Boolean) }"
            />
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              各部门常用学习外链与工具文档
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="新增外链"
              variant="outline"
              color="neutral"
              @click="addStarterLink"
            />
          </div>
          <div
            v-for="(sl, idx) in local.starterLinks"
            :key="idx"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="sl.dept"
                size="xs"
                placeholder="部门"
                class="w-28"
              />
              <UInput
                v-model="sl.title"
                size="xs"
                placeholder="资源名称"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.starterLinks.splice(idx, 1)"
              />
            </div>
            <div class="flex gap-2">
              <UInput
                v-model="sl.url"
                size="xs"
                placeholder="https://..."
                class="flex-1 font-mono"
              />
              <UInput
                v-model="sl.host"
                size="xs"
                placeholder="域名提示"
                class="w-36 font-mono"
              />
            </div>
            <UInput
              v-model="sl.note"
              size="xs"
              placeholder="适用说明"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 4. 发展沿革 / 核对表 / 竞赛 / FAQ -->
    <div
      v-if="subSection === 'about_archive'"
      class="space-y-4"
    >
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              协会发展沿革时间线 (`/about/#archive`)
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="新增节点"
              variant="outline"
              color="neutral"
              @click="addTimelineNode"
            />
          </div>
          <div
            v-for="(node, idx) in local.archiveTimeline"
            :key="idx"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="node.period"
                size="xs"
                placeholder="年份"
                class="w-24"
              />
              <UInput
                v-model="node.tag"
                size="xs"
                placeholder="标签"
                class="w-20"
              />
              <UInput
                v-model="node.title"
                size="xs"
                placeholder="标题"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.archiveTimeline.splice(idx, 1)"
              />
            </div>
            <UTextarea
              v-model="node.detail"
              :rows="2"
              size="xs"
              class="w-full"
            />
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              变动信息核对表 (`/about/#checklist`)
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="新增项"
              variant="outline"
              color="neutral"
              @click="addChecklistRow"
            />
          </div>
          <div
            v-for="(row, idx) in local.volatileChecklist"
            :key="idx"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="row.item"
                size="xs"
                placeholder="变动项"
                class="flex-1"
              />
              <UInput
                v-model="row.source"
                size="xs"
                placeholder="以哪里为准"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.volatileChecklist.splice(idx, 1)"
              />
            </div>
            <UInput
              v-model="row.note"
              size="xs"
              placeholder="补充说明"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              常规参加学科竞赛清单
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="添加竞赛"
              variant="outline"
              color="neutral"
              @click="addCompetition"
            />
          </div>
          <div
            v-for="(comp, idx) in local.competitions"
            :key="idx"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="comp.name"
                size="xs"
                placeholder="赛事名称"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.competitions.splice(idx, 1)"
              />
            </div>
            <div class="grid grid-cols-3 gap-2">
              <UInput
                v-model="comp.track"
                size="xs"
                placeholder="赛道"
              />
              <UInput
                v-model="comp.dept"
                size="xs"
                placeholder="备赛部门"
              />
              <UInput
                v-model="comp.href"
                size="xs"
                placeholder="官网 URL"
                class="font-mono"
              />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              常见问题 Q&A (`/about/#qa`)
            </h3>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="添加问答"
              variant="outline"
              color="neutral"
              @click="addFaq"
            />
          </div>
          <div
            v-for="(faq, idx) in local.faqs"
            :key="idx"
            class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="faq.q"
                size="xs"
                placeholder="问题"
                class="flex-1"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="local.faqs.splice(idx, 1)"
              />
            </div>
            <UTextarea
              v-model="faq.a"
              :rows="2"
              size="xs"
              placeholder="回答内容"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
