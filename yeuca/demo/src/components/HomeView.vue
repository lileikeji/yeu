<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  acceptingDepartments,
  portalState,
  publishedActivities,
  publishedNews,
} from '../stores/portalStore';
import { formatMonthDay } from '../utils/markdown';
import type { ActivityItem, NewsPost } from '../types/portal';

export type PublicTab = 'home' | 'departments' | 'activities' | 'projects' | 'news' | 'join';

const emit = defineEmits<{
  navigate: [tab: PublicTab, preselectDept?: string];
  openNews: [post: NewsPost];
  openActivity: [activity: ActivityItem];
}>();

/* ---------- AI 部焦点与其余部门 ---------- */
const aiDept = computed(
  () =>
    portalState.departments.find((d) => d.id === 'dept-ai' || d.name.includes('AI')) ??
    portalState.departments[0],
);

const otherDepartments = computed(() =>
  portalState.departments.filter((d) => d.id !== aiDept.value?.id),
);

/* ---------- AI 部 4 步可交互 Agent 工作流解剖 ---------- */
interface WorkflowStep {
  id: string;
  step: string;
  title: string;
  role: string;
  logic: string;
  pitfall: string;
  sample: string;
}

const workflowSteps: WorkflowStep[] = [
  {
    id: 'route',
    step: 'STEP 01',
    title: '意图识别与路由',
    role: '判断用户问题属于「校内资料检索」「查活动排期」还是「纳新状态咨询」',
    logic: '先过规则关键词，再走轻量分类提示词，把模糊提问转成确定意图标签，避免直接长上下文硬塞。',
    pitfall: '不让大模型凭空猜校内规章或教室地点，缺必要条件时先标注待核对。',
    sample: '{ "intent": "query_activity", "dept": "AI 部", "keyword": "Agent 工作流" }',
  },
  {
    id: 'rag',
    step: 'STEP 02',
    title: '文档切块与双路召回',
    role: '从校内手册、历届活动文档（Markdown / PDF）中定位可核对原文片段',
    logic: '采用「标题层级切分 + 关键词 BM25 + 向量检索」混合召回，保留原文件名与段落编号作为证据出处。',
    pitfall: '单靠向量容易漏掉学号格式、建筑简称等专有名词，必须保留关键词兜底。',
    sample: '[chunk#14] docs/ai-workshop-02.md · "机房电脑需预先安装 Python 3.10+ 或 Node 22"',
  },
  {
    id: 'tool',
    step: 'STEP 03',
    title: '工具调用（YEU 接口）',
    role: '读取实时活动列表与当前纳新开放部门，替代静态写死文案',
    logic: '以显式参数签名调用 `/api/public/clubs/computer-association` 与活动接口，只把必要字段注入上下文。',
    pitfall: '接口超时或返回空数据时明确提示暂未拉取到最新排期，不做编造兜底。',
    sample: 'GET /api/public/activities?org=computer-association&status=published -> 200 OK',
  },
  {
    id: 'guard',
    step: 'STEP 04',
    title: 'Schema 校验与容错输出',
    role: '保证页面组件拿到的 JSON 结构稳定，并附带可点击来源',
    logic: '先正则剥离模型偶尔外包的 Markdown 代码围栏，再用 Schema 校验字段类型，字段缺失时最多触发 1 次重试。',
    pitfall: '绝不直接在未剥离围栏的原始字符串上裸调 JSON.parse。',
    sample: '{ "answer": "本周 AI 部实操夜在教学区机房举行", "source": "act-1", "verified": true }',
  },
];

const activeStepId = ref<string>(workflowSteps[0].id);
const activeStep = computed(
  () => workflowSteps.find((s) => s.id === activeStepId.value) ?? workflowSteps[0],
);

/* ---------- 作品实验室（左切右显真图） ---------- */
const selectedProjId = ref<string>(portalState.projects[0]?.id ?? '');
const activeProject = computed(
  () =>
    portalState.projects.find((p) => p.id === selectedProjId.value) ??
    portalState.projects[0] ??
    null,
);

/* ---------- 首屏及活动动态列表 ---------- */
const nextOpenActivity = computed(
  () =>
    publishedActivities.value.find((a) => a.recruitState === 'open') ??
    publishedActivities.value[0] ??
    null,
);

const topActivities = computed(() => publishedActivities.value.slice(0, 3));
const topNews = computed(() => publishedNews.value.slice(0, 4));
const topResources = computed(() => portalState.resources.slice(0, 2));

const actStateMap = {
  open: { text: '报名中', cls: 'pill-ok' },
  planned: { text: '筹备中', cls: 'pill-warn' },
  done: { text: '已结束', cls: '' },
} as const;

const projStateMap = {
  active: { text: '进行中', cls: 'pill-ok' },
  maintaining: { text: '维护中', cls: 'pill-ai' },
  planning: { text: '构想中', cls: '' },
} as const;

function jumpToJoin(deptName?: string): void {
  emit('navigate', 'join', deptName);
}
</script>

<template>
  <div>
    <!-- 首屏 Hero：左侧直白陈述，右侧洛江校区实景图与最近活动挂条，底边 4 格真实规格参数 -->
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <div class="hero-eyebrow">
            <span class="hero-eyebrow-bar" aria-hidden="true"></span>
            <span>YEUCA · {{ portalState.profile.campus }}</span>
          </div>
          <h1>{{ portalState.profile.tagline }}</h1>
          <p class="hero-lead">{{ portalState.profile.intro }}</p>

          <div class="hero-actions">
            <button class="btn btn-primary" type="button" @click="jumpToJoin()">
              报名加入协会
            </button>
            <button class="btn btn-ghost" type="button" @click="emit('navigate', 'departments')">
              看 AI 部与其他部门 →
            </button>
          </div>
        </div>

        <div class="campus-frame">
          <img
            src="/images/campus-hero.webp"
            alt="仰恩大学洛江校区实景航拍"
            loading="eager"
          />
          <span class="campus-tag">YEU 迎新体系协同社团 · {{ portalState.profile.slug }}</span>

          <div
            v-if="nextOpenActivity"
            class="campus-live-bar"
            role="button"
            tabindex="0"
            @click="emit('openActivity', nextOpenActivity)"
            @keydown.enter="emit('openActivity', nextOpenActivity)"
          >
            <div style="min-width: 0;">
              <div class="campus-live-kicker">
                <span>近期活动</span>
                <span>·</span>
                <span>{{ nextOpenActivity.deptName }}</span>
                <span>·</span>
                <span>{{ nextOpenActivity.date }}</span>
              </div>
              <div class="campus-live-title">{{ nextOpenActivity.title }}</div>
              <div class="campus-live-sub">{{ nextOpenActivity.timeRange }} · {{ nextOpenActivity.place }}</div>
            </div>
            <span class="btn btn-dark btn-sm">详情</span>
          </div>
        </div>
      </div>

      <div class="wrap spec-strip">
        <div class="spec-cell">
          <span class="spec-k">组织架构</span>
          <span class="spec-v">{{ portalState.departments.length }} 个部门（含 AI 部）</span>
        </div>
        <div class="spec-cell">
          <span class="spec-k">纳新通道</span>
          <span class="spec-v">
            {{ portalState.recruitConfig.status === 'open' ? '秋季线上开放中' : '当前暂未开启' }}（{{ acceptingDepartments.length }} 部门）
          </span>
        </div>
        <div class="spec-cell">
          <span class="spec-k">校内系统协同</span>
          <span class="spec-v">已对接迎新指南（yeu）后台</span>
        </div>
        <div class="spec-cell">
          <span class="spec-k">近期排期与动态</span>
          <span class="spec-v">
            {{ publishedActivities.length }} 场活动 / {{ publishedNews.length }} 篇已发布动态
          </span>
        </div>
      </div>
    </section>

    <!-- AI 部焦点展台 + 其他部门 4 格瑞士细线网格 -->
    <section class="band band-alt">
      <div class="wrap">
        <div class="band-head">
          <div>
            <div class="band-kicker">AI LAB & DEPARTMENTS</div>
            <h2>以 AI 部工作流实践为牵引，五部门协作推进</h2>
            <p class="band-desc">
              不把 AI 当黑箱概念课，拆解为可动手调通的检索、工具调用与接口校验环节；其余部门协同负责工程研发、算法训练、视觉走查与招新运营。
            </p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" @click="emit('navigate', 'departments')">
            查看全部分工详表 →
          </button>
        </div>

        <div v-if="aiDept" class="ai-spotlight">
          <div class="ai-spot-left">
            <div>
              <div class="tag-row">
                <span class="pill pill-ai">{{ aiDept.code }} · 核心实践部门</span>
                <span v-if="aiDept.acceptingRecruit" class="pill pill-ok">招新开放</span>
              </div>
              <h3>{{ aiDept.name }}：{{ aiDept.recentTopic }}</h3>
            </div>

            <p style="margin: 0; color: var(--muted); font-size: 0.93rem;">
              {{ aiDept.summary }}
            </p>

            <ul style="margin: 0; padding-left: 1.15rem; font-size: 0.87rem; color: var(--ink); display: grid; gap: 0.35rem;">
              <li v-for="focus in aiDept.focusList" :key="focus">{{ focus }}</li>
            </ul>

            <div class="tag-row">
              <span v-for="tool in aiDept.tools" :key="tool" class="pill">{{ tool }}</span>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; padding-top: 0.25rem;">
              <button class="btn btn-primary btn-sm" type="button" @click="jumpToJoin(aiDept.name)">
                选「{{ aiDept.name }}」报名 →
              </button>
              <button class="btn btn-ghost btn-sm" type="button" @click="emit('navigate', 'activities')">
                查看实操夜时间表
              </button>
            </div>
          </div>

          <div class="ai-spot-right">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
              <span class="mono" style="font-size: 0.75rem; color: var(--ai); font-weight: 700;">
                Agent 工作流拆解示例 · 点击节点看工程细节
              </span>
              <span class="pill">4 步实验结构</span>
            </div>

            <div class="wf-nodes">
              <button
                v-for="step in workflowSteps"
                :key="step.id"
                type="button"
                class="wf-node"
                :class="{ active: activeStep.id === step.id }"
                @click="activeStepId = step.id"
              >
                <div class="wf-node-step">{{ step.step }}</div>
                <div class="wf-node-title">{{ step.title }}</div>
              </button>
            </div>

            <div class="wf-inspector">
              <div style="font-weight: 700; margin-bottom: 0.35rem; color: var(--ink);">
                {{ activeStep.step }} · {{ activeStep.title }}
              </div>
              <div style="color: var(--muted); margin-bottom: 0.35rem;">
                <strong>职责：</strong>{{ activeStep.role }}
              </div>
              <div style="color: var(--muted); margin-bottom: 0.35rem;">
                <strong>做法：</strong>{{ activeStep.logic }}
              </div>
              <div style="color: var(--red-deep); font-size: 0.81rem; margin-bottom: 0.55rem;">
                <strong>常见坑点：</strong>{{ activeStep.pitfall }}
              </div>
              <pre style="font-size: 0.74rem; padding: 0.55rem 0.75rem;">{{ activeStep.sample }}</pre>
            </div>
          </div>
        </div>

        <div class="swiss-grid-4">
          <div v-for="dept in otherDepartments" :key="dept.id" class="swiss-cell">
            <div>
              <div class="tag-row">
                <span class="pill">{{ dept.code }}</span>
                <span v-if="dept.acceptingRecruit" class="pill pill-ok">可报名</span>
              </div>
              <h4>{{ dept.name }}</h4>
              <p>{{ dept.summary }}</p>
              <div class="tag-row" style="margin-top: 0.65rem;">
                <span v-for="t in dept.tools.slice(0, 3)" :key="t" class="pill">{{ t }}</span>
              </div>
            </div>

            <div class="swiss-cell-foot">
              <span
                class="muted"
                style="font-size: 0.76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;"
                :title="dept.recentTopic"
              >
                近期：{{ dept.recentTopic }}
              </span>
              <button class="link-btn" type="button" @click="jumpToJoin(dept.name)">
                加入 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 深炭黑作品实验室区：左边点选项目，右边切换真实界面图与技术清单 -->
    <section class="lab-band">
      <div class="wrap">
        <div class="band-head">
          <div>
            <div class="band-kicker">PROJECT LAB</div>
            <h2>正在跑的作品、工具与研习案例</h2>
            <p class="band-desc">
              区分校内线上协作工具与个人研习参照项目，每个项目均可在后台新增、改写或挂接截图。
            </p>
          </div>
          <button
            type="button"
            class="btn btn-sm"
            style="background: #262522; color: #f5f5f4; border-color: #3f3d38;"
            @click="emit('navigate', 'projects')"
          >
            全部项目与资料库 →
          </button>
        </div>

        <div v-if="activeProject" class="lab-grid">
          <div class="lab-list">
            <button
              v-for="proj in portalState.projects"
              :key="proj.id"
              type="button"
              class="lab-item"
              :class="{ active: activeProject.id === proj.id }"
              @click="selectedProjId = proj.id"
            >
              <div class="lab-item-meta">
                <span>{{ projStateMap[proj.status].text }}</span>
                <span>·</span>
                <span>{{ proj.deptName }}</span>
                <span>·</span>
                <span>{{ proj.track }}</span>
              </div>
              <h3>{{ proj.title }}</h3>
              <p>{{ proj.summary }}</p>
            </button>
          </div>

          <div class="lab-stage">
            <div v-if="activeProject.previewImage" class="lab-shot-wrap">
              <img :src="activeProject.previewImage" :alt="activeProject.title" />
              <div class="lab-shot-cap">
                {{ activeProject.imageCaption || activeProject.title }}
              </div>
            </div>
            <div
              v-else
              style="border: 1px dashed #3a3833; border-radius: 7px; padding: 1.25rem; background: #161614;"
            >
              <div class="mono" style="font-size: 0.72rem; color: #a8a29e;">
                {{ activeProject.track }} · {{ activeProject.deptName }}
              </div>
              <div style="font-size: 1.12rem; font-weight: 700; margin-top: 0.35rem; color: #ffffff;">
                {{ activeProject.title }}
              </div>
              <p style="margin: 0.45rem 0 0; font-size: 0.86rem; color: #d6d3d1;">
                {{ activeProject.summary }}
              </p>
            </div>

            <ul v-if="activeProject.highlights?.length" class="lab-bullets">
              <li v-for="hl in activeProject.highlights" :key="hl">{{ hl }}</li>
            </ul>

            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap;">
              <div class="tag-row">
                <span v-for="tech in activeProject.stack" :key="tech" class="dark-pill">{{ tech }}</span>
              </div>

              <div style="display: flex; gap: 0.55rem;">
                <a
                  v-if="activeProject.repoUrl"
                  :href="activeProject.repoUrl"
                  target="_blank"
                  rel="noreferrer"
                  class="btn btn-sm"
                  style="background: #27272a; color: #ffffff; border-color: #3f3f46;"
                >
                  仓库源码 ↗
                </a>
                <button
                  v-if="activeProject.demoUrl === '#join'"
                  type="button"
                  class="btn btn-primary btn-sm"
                  @click="jumpToJoin(activeProject.deptName)"
                >
                  体验联立报名 →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 活动排期与协会动态双栏 -->
    <section class="band">
      <div class="wrap journal-grid">
        <!-- 左栏：近期活动 -->
        <div>
          <div class="band-head" style="margin-bottom: 1.1rem;">
            <div>
              <div class="band-kicker">EVENTS</div>
              <h2 style="font-size: 1.38rem;">近期活动排期</h2>
            </div>
            <button class="link-btn" type="button" @click="emit('navigate', 'activities')">
              全部活动 →
            </button>
          </div>

          <div class="event-rows">
            <article
              v-for="act in topActivities"
              :key="act.id"
              class="event-row"
              @click="emit('openActivity', act)"
            >
              <div class="cal-date">
                <span class="cal-m">{{ formatMonthDay(act.date).month }}</span>
                <span class="cal-d">{{ formatMonthDay(act.date).day }}</span>
              </div>
              <div style="min-width: 0;">
                <div class="tag-row" style="margin-bottom: 0.25rem;">
                  <span class="pill" :class="actStateMap[act.recruitState].cls">
                    {{ actStateMap[act.recruitState].text }}
                  </span>
                  <span class="pill" :class="act.deptName === 'AI 部' ? 'pill-ai' : ''">
                    {{ act.deptName }}
                  </span>
                  <span class="muted" style="font-size: 0.78rem;">{{ act.timeRange }} · {{ act.place }}</span>
                </div>
                <h3>{{ act.title }}</h3>
                <p>{{ act.summary }}</p>
              </div>
              <button class="btn btn-ghost btn-sm" type="button">大纲</button>
            </article>
          </div>
        </div>

        <!-- 右栏：最新动态 + 常用笔记 -->
        <div>
          <div class="band-head" style="margin-bottom: 1.1rem;">
            <div>
              <div class="band-kicker">DISPATCH</div>
              <h2 style="font-size: 1.38rem;">协会动态</h2>
            </div>
            <button class="link-btn" type="button" @click="emit('navigate', 'news')">
              全部动态 →
            </button>
          </div>

          <div class="news-compact-list">
            <article
              v-for="post in topNews"
              :key="post.id"
              class="news-compact-item"
              @click="emit('openNews', post)"
            >
              <div class="tag-row">
                <span class="mono" style="font-size: 0.74rem; color: var(--subtle);">{{ post.publishedAt }}</span>
                <span class="pill" :class="post.deptName === 'AI 部' ? 'pill-ai' : ''">
                  {{ post.deptName }}
                </span>
                <span v-if="post.pinned" class="pill pill-red">置顶</span>
              </div>
              <h4>{{ post.title }}</h4>
              <div class="muted" style="font-size: 0.82rem;">{{ post.summary }}</div>
            </article>
          </div>

          <div class="resource-mini-box">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.55rem;">
              <strong style="font-size: 0.88rem;">校内实践笔记与装机参考</strong>
              <button class="link-btn" type="button" @click="emit('navigate', 'projects')">
                更多资料 →
              </button>
            </div>
            <div style="display: grid; gap: 0.45rem;">
              <div
                v-for="res in topResources"
                :key="res.id"
                style="font-size: 0.83rem; display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem;"
              >
                <span>
                  <span class="pill pill-red" style="margin-right: 0.35rem;">{{ res.kind }}</span>
                  <strong>{{ res.title }}</strong>
                </span>
                <span class="mono muted" style="font-size: 0.72rem; flex-shrink: 0;">{{ res.deptName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
