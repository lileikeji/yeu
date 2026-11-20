<script setup lang="ts">
import { computed, ref } from 'vue';
import { portalState } from './stores/portalStore';
import { renderSimpleMarkdown } from './utils/markdown';
import HomeView, { type PublicTab } from './components/HomeView.vue';
import DepartmentsPage from './components/DepartmentsPage.vue';
import ActivitiesPage from './components/ActivitiesPage.vue';
import ProjectsPage from './components/ProjectsPage.vue';
import NewsPage from './components/NewsPage.vue';
import JoinPage from './components/JoinPage.vue';
import AdminWorkspace, { type AdminSection } from './components/AdminWorkspace.vue';
import ApiTraceDrawer from './components/ApiTraceDrawer.vue';
import type { ActivityItem, NewsPost, ResourceItem } from './types/portal';

const mode = ref<'public' | 'admin'>('public');
const publicTab = ref<PublicTab>('home');
const adminSection = ref<AdminSection>('overview');
const preselectedDept = ref<string | undefined>(undefined);
const mobileMenuOpen = ref(false);
const traceOpen = ref(false);

const activeNewsModal = ref<NewsPost | null>(null);
const activeActivityModal = ref<ActivityItem | null>(null);
const activeResourceModal = ref<ResourceItem | null>(null);

const newsModalHtml = computed(() =>
  activeNewsModal.value ? renderSimpleMarkdown(activeNewsModal.value.body) : '',
);
const activityModalHtml = computed(() =>
  activeActivityModal.value ? renderSimpleMarkdown(activeActivityModal.value.body) : '',
);
const resourceModalHtml = computed(() =>
  activeResourceModal.value ? renderSimpleMarkdown(activeResourceModal.value.body) : '',
);

const navItems: Array<{ key: PublicTab; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'departments', label: '部门与 AI 部' },
  { key: 'activities', label: '活动' },
  { key: 'projects', label: '项目与资料' },
  { key: 'news', label: '动态' },
];

function goPublic(tab: PublicTab, deptName?: string): void {
  mode.value = 'public';
  publicTab.value = tab;
  preselectedDept.value = deptName;
  mobileMenuOpen.value = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goAdmin(sec: AdminSection = 'overview'): void {
  adminSection.value = sec;
  mode.value = 'admin';
  mobileMenuOpen.value = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function joinFromActivity(deptName: string): void {
  activeActivityModal.value = null;
  goPublic('join', deptName);
}
</script>

<template>
  <div>
    <!-- 官网前台模式：主导航自然容纳「组织后台」与「接口日志」，不再压黑色外框条 -->
    <template v-if="mode === 'public'">
      <header class="site-header" :class="{ 'nav-open': mobileMenuOpen }">
        <div class="wrap header-inner">
          <a
            href="#home"
            class="brand"
            @click.prevent="goPublic('home')"
          >
            <span class="brand-mark" aria-hidden="true">CA</span>
            <span>
              <span class="brand-title">{{ portalState.profile.name }}</span>
              <span class="brand-sub">YEUCA · {{ portalState.profile.campus }}</span>
            </span>
          </a>

          <nav class="main-nav" aria-label="主导航">
            <button
              v-for="item in navItems"
              :key="item.key"
              type="button"
              class="nav-link"
              :class="{ active: publicTab === item.key }"
              @click="goPublic(item.key)"
            >
              {{ item.label }}
            </button>

            <div class="mobile-only-nav-actions">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="goAdmin('overview')"
              >
                管理后台
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="traceOpen = true; mobileMenuOpen = false"
              >
                接口日志 ({{ portalState.apiLogs.length }})
              </button>
            </div>
          </nav>

          <div class="header-tools">
            <button
              type="button"
              class="tool-pill"
              title="打开组织后台创建与编辑前台内容"
              @click="goAdmin('overview')"
            >
              <span class="tool-dot" aria-hidden="true"></span>
              <span>管理后台</span>
            </button>
            <button
              type="button"
              class="tool-pill"
              title="查看 YEU 接口映射日志"
              @click="traceOpen = true"
            >
              <span class="mono">API</span>
              <span>{{ portalState.apiLogs.length }}</span>
            </button>
            <button
              type="button"
              class="nav-cta"
              @click="goPublic('join')"
            >
              加入我们
            </button>
            <button
              type="button"
              class="mobile-menu-btn"
              :aria-expanded="mobileMenuOpen"
              @click="mobileMenuOpen = !mobileMenuOpen"
            >
              菜单
            </button>
          </div>
        </div>
      </header>

      <main>
        <HomeView
          v-if="publicTab === 'home'"
          @navigate="goPublic"
          @open-news="(p) => (activeNewsModal = p)"
          @open-activity="(a) => (activeActivityModal = a)"
        />
        <DepartmentsPage
          v-else-if="publicTab === 'departments'"
          @join-dept="(d) => goPublic('join', d)"
        />
        <ActivitiesPage
          v-else-if="publicTab === 'activities'"
          @open-activity="(a) => (activeActivityModal = a)"
        />
        <ProjectsPage
          v-else-if="publicTab === 'projects'"
          @open-resource="(r) => (activeResourceModal = r)"
          @jump-join="goPublic('join')"
        />
        <NewsPage
          v-else-if="publicTab === 'news'"
          @open-news="(p) => (activeNewsModal = p)"
        />
        <JoinPage
          v-else-if="publicTab === 'join'"
          :preselected-dept="preselectedDept"
          @go-admin-submissions="goAdmin('recruit')"
        />
      </main>

      <footer class="site-footer">
        <div class="wrap footer-grid">
          <div>
            <strong style="color: var(--ink); display: block; margin-bottom: 0.2rem;">
              {{ portalState.profile.name }}
            </strong>
            <span>{{ portalState.profile.campus }} · 校内学生技术实践社团</span>
          </div>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <a href="#departments" @click.prevent="goPublic('departments')">部门与 AI 部</a>
            <a href="#activities" @click.prevent="goPublic('activities')">近期活动</a>
            <a href="#projects" @click.prevent="goPublic('projects')">项目与资料</a>
            <a href="#join" @click.prevent="goPublic('join')">报名加入</a>
            <a href="#admin" @click.prevent="goAdmin('overview')">组织后台</a>
          </div>
          <div>
            <span>与仰恩迎新指南（yeu）组织后台数据联动</span>
          </div>
        </div>
      </footer>
    </template>

    <!-- 组织后台模式 -->
    <AdminWorkspace
      v-else
      :key="adminSection"
      :initial-section="adminSection"
      @switch-to-front="(tab) => goPublic(tab)"
      @open-trace="traceOpen = true"
    />

    <!-- 动态详情弹窗 -->
    <div v-if="activeNewsModal" class="modal-backdrop" @click.self="activeNewsModal = null">
      <article class="modal-box" role="dialog" :aria-label="activeNewsModal.title">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.65rem;">
          <div class="tag-row">
            <span class="pill" :class="activeNewsModal.deptName === 'AI 部' ? 'pill-ai' : ''">
              {{ activeNewsModal.deptName }}
            </span>
            <span class="pill mono">{{ activeNewsModal.publishedAt }}</span>
            <span v-for="t in activeNewsModal.tags" :key="t" class="pill">{{ t }}</span>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" @click="activeNewsModal = null">关闭</button>
        </div>
        <h2 style="margin: 0 0 0.55rem;">{{ activeNewsModal.title }}</h2>
        <p class="muted" style="font-size: 0.92rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--line-strong);">
          {{ activeNewsModal.summary }}
        </p>
        <div class="prose-view" v-html="newsModalHtml"></div>
      </article>
    </div>

    <!-- 活动详情弹窗 -->
    <div v-if="activeActivityModal" class="modal-backdrop" @click.self="activeActivityModal = null">
      <article class="modal-box" role="dialog" :aria-label="activeActivityModal.title">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.65rem;">
          <div class="tag-row">
            <span class="pill" :class="activeActivityModal.deptName === 'AI 部' ? 'pill-ai' : ''">
              {{ activeActivityModal.deptName }}
            </span>
            <span class="pill">{{ activeActivityModal.category }}</span>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" @click="activeActivityModal = null">关闭</button>
        </div>
        <h2 style="margin: 0 0 0.5rem;">{{ activeActivityModal.title }}</h2>
        <div class="muted" style="font-size: 0.86rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--line-strong);">
          时间：{{ activeActivityModal.date }} {{ activeActivityModal.timeRange }} ｜ 地点：{{ activeActivityModal.place }}
          <span v-if="activeActivityModal.capacity"> ｜ 容量：{{ activeActivityModal.capacity }}</span>
        </div>
        <div class="prose-view" v-html="activityModalHtml"></div>
        <div style="margin-top: 1.2rem; display: flex; gap: 0.65rem;">
          <button
            class="btn btn-primary btn-sm"
            type="button"
            @click="joinFromActivity(activeActivityModal.deptName)"
          >
            选「{{ activeActivityModal.deptName }}」报名 / 咨询 →
          </button>
        </div>
      </article>
    </div>

    <!-- 资料全文弹窗 -->
    <div v-if="activeResourceModal" class="modal-backdrop" @click.self="activeResourceModal = null">
      <article class="modal-box" role="dialog" :aria-label="activeResourceModal.title">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.65rem;">
          <div class="tag-row">
            <span class="pill pill-red">{{ activeResourceModal.kind }}</span>
            <span class="pill">{{ activeResourceModal.deptName }}</span>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" @click="activeResourceModal = null">关闭</button>
        </div>
        <h2 style="margin: 0 0 0.5rem;">{{ activeResourceModal.title }}</h2>
        <div class="prose-view" v-html="resourceModalHtml"></div>
      </article>
    </div>

    <!-- 右侧联立接口追踪抽屉 -->
    <ApiTraceDrawer :open="traceOpen" @close="traceOpen = false" />
  </div>
</template>
