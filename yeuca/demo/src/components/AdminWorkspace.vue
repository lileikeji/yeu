<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  portalState,
  publishedActivities,
  publishedNews,
  resetDemoData,
  updateProfile,
} from '../stores/portalStore';
import AdminContentPanels from './AdminContentPanels.vue';
import AdminOrgRecruitPanels from './AdminOrgRecruitPanels.vue';

export type AdminSection = 'overview' | 'news' | 'activities' | 'departments' | 'projects' | 'recruit';

const props = defineProps<{
  initialSection?: AdminSection;
}>();

const emit = defineEmits<{
  switchToFront: [frontTab: 'home' | 'departments' | 'activities' | 'projects' | 'news' | 'join'];
  openTrace: [];
}>();

const section = ref<AdminSection>(props.initialSection ?? 'overview');

const sectionTitleMap: Record<AdminSection, string> = {
  overview: '组织工作台与联立映射',
  news: '动态与公告发布',
  activities: '活动排期管理',
  departments: '部门与 AI 部管理',
  projects: '项目实验室与资料',
  recruit: '纳新配置与报名表',
};

const profileDraft = reactive({
  name: portalState.profile.name,
  campus: portalState.profile.campus,
  tagline: portalState.profile.tagline,
  intro: portalState.profile.intro,
  yeuApiBase: portalState.profile.yeuApiBase,
  contactWechat: portalState.profile.contactWechat,
  contactQqGroup: portalState.profile.contactQqGroup,
});

const savedTip = ref('');
function saveBasicProfile(): void {
  updateProfile({ ...profileDraft });
  savedTip.value = '协会主站基础信息已保存并同步到前台。';
  setTimeout(() => {
    savedTip.value = '';
  }, 2800);
}

function handleReset(): void {
  resetDemoData();
  Object.assign(profileDraft, {
    name: portalState.profile.name,
    campus: portalState.profile.campus,
    tagline: portalState.profile.tagline,
    intro: portalState.profile.intro,
    yeuApiBase: portalState.profile.yeuApiBase,
    contactWechat: portalState.profile.contactWechat,
    contactQqGroup: portalState.profile.contactQqGroup,
  });
  savedTip.value = '已恢复默认演示数据。';
  setTimeout(() => {
    savedTip.value = '';
  }, 2800);
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="admin-org-badge">
        <strong>{{ portalState.profile.name }}</strong>
        <span>yeu slug: {{ portalState.profile.slug }}</span>
      </div>

      <nav class="admin-nav" aria-label="组织后台导航">
        <button
          type="button"
          class="admin-nav-btn"
          :class="{ active: section === 'overview' }"
          @click="section = 'overview'"
        >
          <span>概览与 YEU 联立</span>
        </button>
        <button
          type="button"
          class="admin-nav-btn"
          :class="{ active: section === 'news' }"
          @click="section = 'news'"
        >
          <span>动态与公告</span>
          <span class="mono" style="font-size: 0.74rem;">{{ portalState.news.length }}</span>
        </button>
        <button
          type="button"
          class="admin-nav-btn"
          :class="{ active: section === 'activities' }"
          @click="section = 'activities'"
        >
          <span>活动排期</span>
          <span class="mono" style="font-size: 0.74rem;">{{ portalState.activities.length }}</span>
        </button>
        <button
          type="button"
          class="admin-nav-btn"
          :class="{ active: section === 'departments' }"
          @click="section = 'departments'"
        >
          <span>部门与 AI 部</span>
          <span class="mono" style="font-size: 0.74rem;">{{ portalState.departments.length }}</span>
        </button>
        <button
          type="button"
          class="admin-nav-btn"
          :class="{ active: section === 'projects' }"
          @click="section = 'projects'"
        >
          <span>项目与资料</span>
          <span class="mono" style="font-size: 0.74rem;">{{ portalState.projects.length }}</span>
        </button>
        <button
          type="button"
          class="admin-nav-btn"
          :class="{ active: section === 'recruit' }"
          @click="section = 'recruit'"
        >
          <span>纳新与报名表</span>
          <span class="mono" style="font-size: 0.74rem;">{{ portalState.submissions.length }}</span>
        </button>
      </nav>

      <div style="margin-top: auto; border-top: 1px solid #1f2421; padding-top: 0.9rem; display: grid; gap: 0.5rem;">
        <button class="btn btn-primary btn-sm" type="button" @click="emit('switchToFront', 'home')">
          查看官网前台 ↗
        </button>
        <button
          type="button"
          class="btn btn-sm"
          style="background: #181c1a; color: #d4d4d8; border-color: #2c312e;"
          @click="handleReset"
        >
          重置演示数据
        </button>
      </div>
    </aside>

    <div class="admin-content-wrap">
      <header class="admin-topbar">
        <div style="display: flex; align-items: center; gap: 0.55rem; font-size: 0.85rem;">
          <span class="muted">YEU 协同组织后台</span>
          <span class="muted">/</span>
          <strong>{{ sectionTitleMap[section] }}</strong>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button class="btn btn-ghost btn-sm" type="button" @click="emit('openTrace')">
            接口追踪 ({{ portalState.apiLogs.length }})
          </button>
          <button class="btn btn-dark btn-sm" type="button" @click="emit('switchToFront', 'home')">
            返回官网前台 ↗
          </button>
        </div>
      </header>

      <main class="admin-main">
        <div v-if="savedTip" class="alert alert-ok" style="margin-bottom: 1rem;">
          {{ savedTip }}
        </div>

        <template v-if="section === 'overview'">
          <div class="admin-head">
            <div>
              <h1>组织工作台（模拟 yeu <code>/admin/organization</code>）</h1>
              <p class="muted" style="margin: 0; font-size: 0.86rem;">
                在这里创建或修改动态、活动、AI 部/其他部门、项目与纳新配置，官网前台即时同步更新。
              </p>
            </div>
            <button class="btn btn-primary btn-sm" type="button" @click="emit('switchToFront', 'home')">
              预览当前前台效果 →
            </button>
          </div>

          <div class="cards-3" style="margin-bottom: 1rem;">
            <div class="admin-card" style="margin: 0;">
              <div class="muted" style="font-size: 0.8rem;">已发布动态 / 总数</div>
              <div style="font-size: 1.55rem; font-weight: 800; margin-top: 0.2rem;">
                {{ publishedNews.length }} <span class="muted" style="font-size: 0.9rem;">/ {{ portalState.news.length }}</span>
              </div>
            </div>
            <div class="admin-card" style="margin: 0;">
              <div class="muted" style="font-size: 0.8rem;">公开活动 / 总数</div>
              <div style="font-size: 1.55rem; font-weight: 800; margin-top: 0.2rem;">
                {{ publishedActivities.length }} <span class="muted" style="font-size: 0.9rem;">/ {{ portalState.activities.length }}</span>
              </div>
            </div>
            <div class="admin-card" style="margin: 0;">
              <div class="muted" style="font-size: 0.8rem;">已收招新报名表</div>
              <div style="font-size: 1.55rem; font-weight: 800; margin-top: 0.2rem;">
                {{ portalState.submissions.length }}
              </div>
            </div>
          </div>

          <div class="admin-card">
            <h2 style="margin: 0 0 0.8rem; font-size: 1rem;">与 E:\yeu 系统前后端联立映射</h2>
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>官网模块</th>
                    <th>yeu 数据库表 / 字段</th>
                    <th>后台管理路由 / 接口</th>
                    <th>公开消费接口</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>协会资料 & 部门（含 AI 部）</td>
                    <td><code>contents</code> (<code>slug='computer-association'</code>)</td>
                    <td><code>/admin/organization</code></td>
                    <td><code>GET /api/public/clubs/computer-association</code></td>
                  </tr>
                  <tr>
                    <td>活动排期与工作坊</td>
                    <td><code>activities</code> (<code>organizationContentId</code>)</td>
                    <td><code>/admin/activities</code> (<code>POST /api/admin/activities</code>)</td>
                    <td><code>GET /api/public/activities</code></td>
                  </tr>
                  <tr>
                    <td>正式纳新与报名表</td>
                    <td><code>recruit_forms</code> / <code>recruit_submissions</code></td>
                    <td><code>/admin/recruit</code></td>
                    <td><code>POST /api/public/recruit/computer-association</code></td>
                  </tr>
                  <tr>
                    <td>动态公告 / 项目 / 资料</td>
                    <td><code>contents (kind='notice')</code> + <code>metadataJson</code></td>
                    <td><code>/admin/content/new/visual</code> 或本工作台面板</td>
                    <td><code>GET /api/public/content</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="admin-card">
            <h2 style="margin: 0 0 0.8rem; font-size: 1rem;">协会首页资料与联立地址设置</h2>
            <div class="field-grid-2">
              <div class="field">
                <label>协会名称</label>
                <input v-model="profileDraft.name" class="input" />
              </div>
              <div class="field">
                <label>校区</label>
                <input v-model="profileDraft.campus" class="input" />
              </div>
            </div>
            <div class="field">
              <label>首屏主标题</label>
              <input v-model="profileDraft.tagline" class="input" />
            </div>
            <div class="field">
              <label>首屏定位简介</label>
              <textarea v-model="profileDraft.intro" class="textarea" rows="2" />
            </div>
            <div class="field-grid-2">
              <div class="field">
                <label>yeu 联立服务地址</label>
                <input v-model="profileDraft.yeuApiBase" class="input mono" />
              </div>
              <div class="field">
                <label>招新群 / 联系方式</label>
                <input v-model="profileDraft.contactQqGroup" class="input" />
              </div>
            </div>
            <button class="btn btn-primary btn-sm" type="button" @click="saveBasicProfile">
              保存并同步到前台
            </button>
          </div>
        </template>

        <AdminContentPanels
          v-else-if="section === 'news' || section === 'activities' || section === 'projects'"
          :tab="section"
          @preview-front="(t) => emit('switchToFront', t)"
        />

        <AdminOrgRecruitPanels
          v-else-if="section === 'departments' || section === 'recruit'"
          :tab="section"
          @preview-front="(t) => emit('switchToFront', t)"
        />
      </main>
    </div>
  </div>
</template>
