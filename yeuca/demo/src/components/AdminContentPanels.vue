<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  deleteActivityItem,
  deleteNewsPost,
  deleteProjectItem,
  deleteResourceItem,
  portalState,
  saveActivityItem,
  saveNewsPost,
  saveProjectItem,
  saveResourceItem,
  setActivityStatus,
  setNewsStatus,
} from '../stores/portalStore';
import type {
  ActivityItem,
  NewsPost,
  ProjectItem,
  PublishStatus,
  ResourceItem,
} from '../types/portal';

defineProps<{
  tab: 'news' | 'activities' | 'projects';
}>();

const emit = defineEmits<{
  previewFront: [frontTab: 'home' | 'news' | 'activities' | 'projects'];
}>();

const toastMsg = ref('');
function showToast(msg: string): void {
  toastMsg.value = msg;
  setTimeout(() => {
    if (toastMsg.value === msg) toastMsg.value = '';
  }, 3200);
}

/* ---------- 动态表单 ---------- */
const newsForm = reactive({
  id: '',
  title: '',
  deptId: 'dept-ai',
  tagsText: 'AI部, 技术分享',
  summary: '',
  body: '',
  status: 'published' as PublishStatus,
  pinned: false,
  publishedAt: new Date().toISOString().slice(0, 10),
});

function editNews(item: NewsPost): void {
  newsForm.id = item.id;
  newsForm.title = item.title;
  newsForm.deptId = item.deptId;
  newsForm.tagsText = item.tags.join(', ');
  newsForm.summary = item.summary;
  newsForm.body = item.body;
  newsForm.status = item.status;
  newsForm.pinned = item.pinned;
  newsForm.publishedAt = item.publishedAt;
}

function resetNewsForm(): void {
  newsForm.id = '';
  newsForm.title = '';
  newsForm.deptId = portalState.departments[0]?.id ?? 'dept-ai';
  newsForm.tagsText = '公告';
  newsForm.summary = '';
  newsForm.body = '';
  newsForm.status = 'published';
  newsForm.pinned = false;
  newsForm.publishedAt = new Date().toISOString().slice(0, 10);
}

function submitNews(): void {
  if (!newsForm.title.trim() || !newsForm.summary.trim()) {
    showToast('请先填写动态标题和摘要。');
    return;
  }
  const tags = newsForm.tagsText
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const saved = saveNewsPost({
    id: newsForm.id || undefined,
    title: newsForm.title.trim(),
    deptId: newsForm.deptId,
    tags,
    summary: newsForm.summary.trim(),
    body: newsForm.body.trim() || newsForm.summary.trim(),
    status: newsForm.status,
    pinned: newsForm.pinned,
    publishedAt: newsForm.publishedAt,
  });
  showToast(`已保存动态「${saved.title}」，官网前台已同步。`);
  resetNewsForm();
}

/* ---------- 活动表单 ---------- */
const actForm = reactive({
  id: '',
  title: '',
  deptId: 'dept-ai',
  category: 'AI工作坊' as ActivityItem['category'],
  date: '2026-11-29',
  timeRange: '19:00 - 21:00',
  place: '教学区机房（待定）',
  recruitState: 'open' as ActivityItem['recruitState'],
  status: 'published' as PublishStatus,
  capacity: '40 人',
  summary: '',
  body: '',
});

function editAct(item: ActivityItem): void {
  actForm.id = item.id;
  actForm.title = item.title;
  actForm.deptId = item.deptId;
  actForm.category = item.category;
  actForm.date = item.date;
  actForm.timeRange = item.timeRange;
  actForm.place = item.place;
  actForm.recruitState = item.recruitState;
  actForm.status = item.status;
  actForm.capacity = item.capacity ?? '';
  actForm.summary = item.summary;
  actForm.body = item.body;
}

function resetActForm(): void {
  actForm.id = '';
  actForm.title = '';
  actForm.deptId = portalState.departments[0]?.id ?? 'dept-ai';
  actForm.category = 'AI工作坊';
  actForm.date = '2026-11-29';
  actForm.timeRange = '19:00 - 21:00';
  actForm.place = '';
  actForm.recruitState = 'open';
  actForm.status = 'published';
  actForm.capacity = '';
  actForm.summary = '';
  actForm.body = '';
}

function submitAct(): void {
  if (!actForm.title.trim() || !actForm.summary.trim()) {
    showToast('请先填写活动名称和简介。');
    return;
  }
  const saved = saveActivityItem({
    id: actForm.id || undefined,
    title: actForm.title.trim(),
    deptId: actForm.deptId,
    category: actForm.category,
    date: actForm.date,
    timeRange: actForm.timeRange.trim() || '待通知',
    place: actForm.place.trim() || '校内场地待定',
    recruitState: actForm.recruitState,
    status: actForm.status,
    capacity: actForm.capacity.trim(),
    summary: actForm.summary.trim(),
    body: actForm.body.trim() || actForm.summary.trim(),
  });
  showToast(`已保存活动「${saved.title}」，官网排期看板已更新。`);
  resetActForm();
}

/* ---------- 项目与资料 ---------- */
const projForm = reactive({
  id: '',
  title: '',
  deptId: 'dept-ai',
  track: 'AI / Agent' as ProjectItem['track'],
  status: 'active' as ProjectItem['status'],
  stackText: 'Python, TypeScript',
  summary: '',
  highlightsText: '',
  previewImage: '/images/proj-omni.jpg',
  imageCaption: '',
  repoUrl: '',
  demoUrl: '',
});

function editProj(item: ProjectItem): void {
  projForm.id = item.id;
  projForm.title = item.title;
  projForm.deptId = item.deptId;
  projForm.track = item.track;
  projForm.status = item.status;
  projForm.stackText = item.stack.join(', ');
  projForm.summary = item.summary;
  projForm.highlightsText = (item.highlights ?? []).join('\n');
  projForm.previewImage = item.previewImage ?? '';
  projForm.imageCaption = item.imageCaption ?? '';
  projForm.repoUrl = item.repoUrl;
  projForm.demoUrl = item.demoUrl;
}

function submitProj(): void {
  if (!projForm.title.trim() || !projForm.summary.trim()) {
    showToast('请先填写项目名称和简介。');
    return;
  }
  const stack = projForm.stackText
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const highlights = projForm.highlightsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const saved = saveProjectItem({
    id: projForm.id || undefined,
    title: projForm.title.trim(),
    deptId: projForm.deptId,
    track: projForm.track,
    status: projForm.status,
    stack,
    summary: projForm.summary.trim(),
    highlights,
    previewImage: projForm.previewImage || undefined,
    imageCaption: projForm.imageCaption.trim() || undefined,
    repoUrl: projForm.repoUrl.trim(),
    demoUrl: projForm.demoUrl.trim(),
    updatedAt: new Date().toISOString().slice(0, 10),
  });
  showToast(`已保存项目「${saved.title}」，首页作品实验室与项目页已更新。`);
  projForm.id = '';
  projForm.title = '';
  projForm.summary = '';
  projForm.highlightsText = '';
  projForm.imageCaption = '';
  projForm.repoUrl = '';
  projForm.demoUrl = '';
}

const resForm = reactive({
  id: '',
  title: '',
  kind: '实践笔记' as ResourceItem['kind'],
  deptName: 'AI 部',
  summary: '',
  body: '',
});

function submitRes(): void {
  if (!resForm.title.trim() || !resForm.summary.trim()) {
    showToast('请填写资料标题和摘要。');
    return;
  }
  const saved = saveResourceItem({
    id: resForm.id || undefined,
    title: resForm.title.trim(),
    kind: resForm.kind,
    deptName: resForm.deptName,
    summary: resForm.summary.trim(),
    body: resForm.body.trim() || resForm.summary.trim(),
    externalUrl: '',
    updatedAt: new Date().toISOString().slice(0, 10),
  });
  showToast(`已新增学习资料「${saved.title}」。`);
  resForm.id = '';
  resForm.title = '';
  resForm.summary = '';
  resForm.body = '';
}

const statusLabel: Record<PublishStatus, string> = {
  published: '已发布',
  pending: '待审核',
  draft: '草稿',
  archived: '已归档',
};
</script>

<template>
  <div>
    <div v-if="toastMsg" class="alert alert-ok" style="margin-bottom: 1rem;">
      {{ toastMsg }}
    </div>

    <!-- 动态管理 -->
    <template v-if="tab === 'news'">
      <div class="admin-head">
        <div>
          <h1>动态与公告管理</h1>
          <p class="muted" style="margin: 0; font-size: 0.86rem;">
            对接 yeu `contents` 表（仅已发布条目展示在前台首页和动态列表）
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="emit('previewFront', 'news')">
          去前台动态页查看 →
        </button>
      </div>

      <div class="admin-card">
        <h2 style="margin: 0 0 0.85rem; font-size: 1.02rem;">
          {{ newsForm.id ? '编辑动态' : '新建一条动态' }}
        </h2>
        <div class="field-grid-2">
          <div class="field">
            <label>标题 *</label>
            <input v-model="newsForm.title" class="input" placeholder="如：AI 部周四晚智能体工作坊报名通知" />
          </div>
          <div class="field">
            <label>发布部门</label>
            <select v-model="newsForm.deptId" class="select">
              <option v-for="d in portalState.departments" :key="d.id" :value="d.id">
                {{ d.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="field-grid-2">
          <div class="field">
            <label>标签（逗号分隔）</label>
            <input v-model="newsForm.tagsText" class="input" placeholder="AI部, 工作坊, 通知" />
          </div>
          <div class="field">
            <label>发布状态与日期</label>
            <div style="display: flex; gap: 0.5rem;">
              <select v-model="newsForm.status" class="select">
                <option value="published">立即发布（前台可见）</option>
                <option value="draft">保存草稿（仅后台可见）</option>
                <option value="pending">待审核</option>
              </select>
              <input v-model="newsForm.publishedAt" type="date" class="input" style="width: 150px;" />
            </div>
          </div>
        </div>

        <div class="field">
          <label>列表摘要 *</label>
          <input v-model="newsForm.summary" class="input" placeholder="一两句话说清这条动态讲什么" />
        </div>

        <div class="field">
          <label>正文内容（支持 ## 标题、列表、**加粗**、`代码`）</label>
          <textarea v-model="newsForm.body" class="textarea" rows="4" placeholder="填写正文内容…" />
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <label style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.86rem;">
            <input v-model="newsForm.pinned" type="checkbox" />
            <span>置顶到列表首位</span>
          </label>
          <button class="btn btn-primary btn-sm" type="button" @click="submitNews">
            {{ newsForm.id ? '保存修改' : '发布动态' }}
          </button>
          <button v-if="newsForm.id" class="btn btn-ghost btn-sm" type="button" @click="resetNewsForm">
            取消编辑
          </button>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>标题</th>
                <th>部门</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="post in portalState.news" :key="post.id">
                <td class="mono">{{ post.publishedAt }}</td>
                <td>
                  <strong>{{ post.title }}</strong>
                  <span v-if="post.pinned" class="pill pill-red" style="margin-left: 0.35rem;">置顶</span>
                </td>
                <td>{{ post.deptName }}</td>
                <td>
                  <span class="pill" :class="post.status === 'published' ? 'pill-ok' : 'pill-warn'">
                    {{ statusLabel[post.status] }}
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                    <button class="btn btn-ghost btn-sm" type="button" @click="editNews(post)">编辑</button>
                    <button
                      class="btn btn-ghost btn-sm"
                      type="button"
                      @click="setNewsStatus(post.id, post.status === 'published' ? 'draft' : 'published')"
                    >
                      {{ post.status === 'published' ? '撤为草稿' : '发布' }}
                    </button>
                    <button class="btn btn-ghost btn-sm" type="button" @click="deleteNewsPost(post.id)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 活动管理 -->
    <template v-else-if="tab === 'activities'">
      <div class="admin-head">
        <div>
          <h1>活动排期管理</h1>
          <p class="muted" style="margin: 0; font-size: 0.86rem;">
            对接 yeu `activities` 表：创建的活动会同步到首页「近期实况看板」与活动筛选页
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="emit('previewFront', 'activities')">
          去前台活动页查看 →
        </button>
      </div>

      <div class="admin-card">
        <h2 style="margin: 0 0 0.85rem; font-size: 1.02rem;">
          {{ actForm.id ? '编辑活动' : '新建校园活动' }}
        </h2>
        <div class="field-grid-2">
          <div class="field">
            <label>活动名称 *</label>
            <input v-model="actForm.title" class="input" placeholder="如：AI 部工作流搭建实战夜 第 3 期" />
          </div>
          <div class="field">
            <label>主办部门</label>
            <select v-model="actForm.deptId" class="select">
              <option v-for="d in portalState.departments" :key="d.id" :value="d.id">
                {{ d.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="field-grid-2">
          <div class="field">
            <label>活动日期与时段</label>
            <div style="display: flex; gap: 0.5rem;">
              <input v-model="actForm.date" type="date" class="input" />
              <input v-model="actForm.timeRange" class="input" placeholder="19:00 - 21:00" />
            </div>
          </div>
          <div class="field">
            <label>地点 / 教室</label>
            <input v-model="actForm.place" class="input" placeholder="如：计算机机房 203" />
          </div>
        </div>

        <div class="field-grid-2">
          <div class="field">
            <label>分类 & 报名状态</label>
            <div style="display: flex; gap: 0.5rem;">
              <select v-model="actForm.category" class="select">
                <option value="AI工作坊">AI工作坊</option>
                <option value="技术分享">技术分享</option>
                <option value="算法训练">算法训练</option>
                <option value="社团招新">社团招新</option>
              </select>
              <select v-model="actForm.recruitState" class="select">
                <option value="open">报名中</option>
                <option value="planned">筹备中</option>
                <option value="done">已结束</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>审核状态 & 人数限制</label>
            <div style="display: flex; gap: 0.5rem;">
              <select v-model="actForm.status" class="select">
                <option value="published">已发布（前台展示）</option>
                <option value="pending">待总管审核</option>
                <option value="draft">草稿</option>
              </select>
              <input v-model="actForm.capacity" class="input" placeholder="40 人" />
            </div>
          </div>
        </div>

        <div class="field">
          <label>活动摘要 *</label>
          <input v-model="actForm.summary" class="input" placeholder="说明本次活动做什么、面向哪些同学" />
        </div>

        <div class="field">
          <label>活动大纲（Markdown）</label>
          <textarea v-model="actForm.body" class="textarea" rows="3" placeholder="流程安排、携带电脑提示等" />
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary btn-sm" type="button" @click="submitAct">
            {{ actForm.id ? '更新活动' : '发布活动' }}
          </button>
          <button v-if="actForm.id" class="btn btn-ghost btn-sm" type="button" @click="resetActForm">
            取消
          </button>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>活动名称</th>
                <th>主办</th>
                <th>报名</th>
                <th>展示状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="act in portalState.activities" :key="act.id">
                <td class="mono">{{ act.date }}</td>
                <td><strong>{{ act.title }}</strong><div class="muted" style="font-size: 0.78rem;">{{ act.place }}</div></td>
                <td>{{ act.deptName }}</td>
                <td>{{ act.recruitState }}</td>
                <td>
                  <span class="pill" :class="act.status === 'published' ? 'pill-ok' : 'pill-warn'">
                    {{ statusLabel[act.status] }}
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-ghost btn-sm" type="button" @click="editAct(act)">编辑</button>
                    <button
                      class="btn btn-ghost btn-sm"
                      type="button"
                      @click="setActivityStatus(act.id, act.status === 'published' ? 'draft' : 'published')"
                    >
                      {{ act.status === 'published' ? '下架' : '发布' }}
                    </button>
                    <button class="btn btn-ghost btn-sm" type="button" @click="deleteActivityItem(act.id)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 项目与资料管理 -->
    <template v-else-if="tab === 'projects'">
      <div class="admin-head">
        <div>
          <h1>项目墙与学习资料管理</h1>
          <p class="muted" style="margin: 0; font-size: 0.86rem;">
            维护协会正在推进的项目卡片与校内开发资料（可存 `contents.metadataJson`）
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="emit('previewFront', 'projects')">
          去前台项目页查看 →
        </button>
      </div>

      <div class="cards-2" style="align-items: start;">
        <div class="admin-card">
          <h2 style="margin: 0 0 0.8rem; font-size: 1rem;">新增 / 编辑项目</h2>
          <div class="field">
            <label>项目名称 *</label>
            <input v-model="projForm.title" class="input" placeholder="如：校园 RAG 问答小工具" />
          </div>
          <div class="field-grid-2">
            <div class="field">
              <label>负责部门</label>
              <select v-model="projForm.deptId" class="select">
                <option v-for="d in portalState.departments" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>方向分类</label>
              <select v-model="projForm.track" class="select">
                <option value="AI / Agent">AI / Agent</option>
                <option value="Web / 校内工具">Web / 校内工具</option>
                <option value="算法竞赛">算法竞赛</option>
              </select>
            </div>
          </div>
          <div class="field-grid-2">
            <div class="field">
              <label>状态</label>
              <select v-model="projForm.status" class="select">
                <option value="active">开发中</option>
                <option value="maintaining">维护中</option>
                <option value="planning">构想中</option>
              </select>
            </div>
            <div class="field">
              <label>技术栈（逗号分隔）</label>
              <input v-model="projForm.stackText" class="input" />
            </div>
          </div>
          <div class="field">
            <label>一句话说明 *</label>
            <textarea v-model="projForm.summary" class="textarea" rows="2" />
          </div>
          <div class="field">
            <label>技术要点清单（每行一条，显示在首页作品实验室右侧）</label>
            <textarea v-model="projForm.highlightsText" class="textarea" rows="2" placeholder="如：支持文档切分与混合检索&#10;支持 JSON Schema 异常重试" />
          </div>
          <div class="field-grid-2">
            <div class="field">
              <label>展示截图（本地预置示例图）</label>
              <select v-model="projForm.previewImage" class="select">
                <option value="">不配图（纯文字卡片）</option>
                <option value="/images/proj-omni.jpg">智能工作台界面 (/images/proj-omni.jpg)</option>
                <option value="/images/proj-yeu-map.jpg">仰恩迎新校园地图 (/images/proj-yeu-map.jpg)</option>
                <option value="/images/proj-yeu.jpg">仰恩迎新首页 (/images/proj-yeu.jpg)</option>
              </select>
            </div>
            <div class="field">
              <label>截图底部注记（选填）</label>
              <input v-model="projForm.imageCaption" class="input" placeholder="如：AI 部工作流实验界面截图" />
            </div>
          </div>
          <div class="field">
            <label>仓库地址（选填）</label>
            <input v-model="projForm.repoUrl" class="input" placeholder="https://github.com/..." />
          </div>
          <button class="btn btn-primary btn-sm" type="button" @click="submitProj">保存项目</button>
        </div>

        <div class="admin-card">
          <h2 style="margin: 0 0 0.8rem; font-size: 1rem;">新增学习资料 / 笔记</h2>
          <div class="field">
            <label>标题 *</label>
            <input v-model="resForm.title" class="input" placeholder="如：Python uv 环境配置五分钟教程" />
          </div>
          <div class="field-grid-2">
            <div class="field">
              <label>类别</label>
              <select v-model="resForm.kind" class="select">
                <option value="实践笔记">实践笔记</option>
                <option value="入门手册">入门手册</option>
                <option value="题单">题单</option>
                <option value="环境清单">环境清单</option>
              </select>
            </div>
            <div class="field">
              <label>整理部门</label>
              <select v-model="resForm.deptName" class="select">
                <option v-for="d in portalState.departments" :key="d.id" :value="d.name">{{ d.name }}</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>摘要 *</label>
            <input v-model="resForm.summary" class="input" />
          </div>
          <div class="field">
            <label>正文（Markdown）</label>
            <textarea v-model="resForm.body" class="textarea" rows="3" />
          </div>
          <button class="btn btn-primary btn-sm" type="button" @click="submitRes">新增资料</button>
        </div>
      </div>

      <div class="admin-card">
        <h3 style="margin: 0 0 0.7rem; font-size: 0.96rem;">当前项目列表（{{ portalState.projects.length }}）</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>部门</th>
                <th>技术栈</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in portalState.projects" :key="p.id">
                <td><strong>{{ p.title }}</strong></td>
                <td>{{ p.deptName }}</td>
                <td>{{ p.stack.join(', ') }}</td>
                <td>
                  <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-ghost btn-sm" type="button" @click="editProj(p)">编辑</button>
                    <button class="btn btn-ghost btn-sm" type="button" @click="deleteProjectItem(p.id)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style="margin: 1.2rem 0 0.7rem; font-size: 0.96rem;">当前资料列表（{{ portalState.resources.length }}）</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>资料标题</th>
                <th>分类</th>
                <th>整理部门</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in portalState.resources" :key="r.id">
                <td><strong>{{ r.title }}</strong></td>
                <td>{{ r.kind }}</td>
                <td>{{ r.deptName }}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" type="button" @click="deleteResourceItem(r.id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
