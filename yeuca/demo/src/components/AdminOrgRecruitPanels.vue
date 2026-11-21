<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  deleteDepartmentItem,
  portalState,
  saveDepartmentItem,
  updateRecruitConfig,
} from '../stores/portalStore';
import type { DepartmentItem } from '../types/portal';

defineProps<{
  tab: 'departments' | 'recruit';
}>();

const emit = defineEmits<{
  previewFront: [frontTab: 'home' | 'departments' | 'join'];
}>();

const toast = ref('');
function notify(msg: string): void {
  toast.value = msg;
  setTimeout(() => {
    if (toast.value === msg) toast.value = '';
  }, 3200);
}

/* ---------- 部门与 AI 部管理 ---------- */
const deptForm = reactive({
  id: '',
  code: '06 / LAB',
  name: '',
  isFeatured: false,
  lead: '',
  summary: '',
  focusText: '',
  toolsText: '',
  recentTopic: '',
  recruitDesc: '',
  acceptingRecruit: true,
});

function loadDept(d: DepartmentItem): void {
  deptForm.id = d.id;
  deptForm.code = d.code;
  deptForm.name = d.name;
  deptForm.isFeatured = Boolean(d.isFeatured);
  deptForm.lead = d.lead;
  deptForm.summary = d.summary;
  deptForm.focusText = d.focusList.join('\n');
  deptForm.toolsText = d.tools.join(', ');
  deptForm.recentTopic = d.recentTopic;
  deptForm.recruitDesc = d.recruitDesc;
  deptForm.acceptingRecruit = d.acceptingRecruit;
}

function clearDept(): void {
  deptForm.id = '';
  deptForm.code = `0${portalState.departments.length + 1} / DEPT`;
  deptForm.name = '';
  deptForm.isFeatured = false;
  deptForm.lead = '';
  deptForm.summary = '';
  deptForm.focusText = '';
  deptForm.toolsText = '';
  deptForm.recentTopic = '';
  deptForm.recruitDesc = '';
  deptForm.acceptingRecruit = true;
}

function submitDept(): void {
  if (!deptForm.name.trim() || !deptForm.summary.trim()) {
    notify('请填写部门名称和简介。');
    return;
  }
  const focusList = deptForm.focusText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const tools = deptForm.toolsText
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const saved = saveDepartmentItem({
    id: deptForm.id || undefined,
    code: deptForm.code.trim() || 'DEPT',
    name: deptForm.name.trim(),
    isFeatured: deptForm.isFeatured,
    lead: deptForm.lead.trim() || '待填写',
    summary: deptForm.summary.trim(),
    focusList: focusList.length ? focusList : [deptForm.summary.trim()],
    tools,
    recentTopic: deptForm.recentTopic.trim() || '待排期',
    recruitDesc: deptForm.recruitDesc.trim() || deptForm.summary.trim(),
    acceptingRecruit: deptForm.acceptingRecruit,
  });
  notify(`已保存部门「${saved.name}」，首页选项卡和报名表选项已同步。`);
  clearDept();
}

/* ---------- 纳新表单管理 & 收件箱 ---------- */
const recruitDraft = reactive({
  status: portalState.recruitConfig.status,
  title: portalState.recruitConfig.title,
  slogan: portalState.recruitConfig.slogan,
  requireStudentNo: portalState.recruitConfig.requireStudentNo,
  paymentEnabled: portalState.recruitConfig.paymentEnabled,
  paymentNote: portalState.recruitConfig.paymentNote,
});

function saveRecruitSettings(): void {
  updateRecruitConfig({ ...recruitDraft });
  notify('纳新配置已更新，前往「加入我们」页即可见效果。');
}

const subSearch = ref('');
const filteredSubs = computed(() => {
  const q = subSearch.value.trim().toLowerCase();
  if (!q) return portalState.submissions;
  return portalState.submissions.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.className.toLowerCase().includes(q) ||
      s.departments.some((d) => d.toLowerCase().includes(q)),
  );
});

function exportCsv(): void {
  const headers = ['提交时间', '姓名', '性别', '学号', '专业班级', '手机号', 'QQ', '意向部门', '共青团员', '自我介绍'];
  const rows = portalState.submissions.map((s) => [
    s.createdAt,
    s.name,
    s.gender,
    s.studentNo,
    s.className,
    s.phone,
    s.qq,
    s.departments.join('/'),
    s.isLeagueMember,
    s.intro.replace(/\r?\n/g, ' '),
  ]);
  const csv = [headers, ...rows]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yeuca-recruit-submissions.csv';
  a.click();
  URL.revokeObjectURL(url);
  notify('已导出报名表 CSV。');
}
</script>

<template>
  <div>
    <div v-if="toast" class="alert alert-ok" style="margin-bottom: 1rem;">
      {{ toast }}
    </div>

    <!-- 部门与 AI 部管理 -->
    <template v-if="tab === 'departments'">
      <div class="admin-head">
        <div>
          <h1>部门与 AI 部管理</h1>
          <p class="muted" style="margin: 0; font-size: 0.86rem;">
            新增/编辑部门后，首页部门工作台、部门页与报名表「意向部门」多选框会自动同步
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="emit('previewFront', 'departments')">
          去前台部门页查看 →
        </button>
      </div>

      <div class="admin-card">
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>部门名称</th>
                <th>负责人</th>
                <th>开放纳新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in portalState.departments" :key="d.id">
                <td class="mono">{{ d.code }}</td>
                <td>
                  <strong>{{ d.name }}</strong>
                  <span v-if="d.isFeatured" class="pill pill-ai" style="margin-left: 0.35rem;">重点</span>
                </td>
                <td>{{ d.lead }}</td>
                <td>
                  <span class="pill" :class="d.acceptingRecruit ? 'pill-ok' : ''">
                    {{ d.acceptingRecruit ? '开放中' : '暂停' }}
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-ghost btn-sm" type="button" @click="loadDept(d)">编辑</button>
                    <button
                      v-if="portalState.departments.length > 1"
                      class="btn btn-ghost btn-sm"
                      type="button"
                      @click="deleteDepartmentItem(d.id)"
                    >
                      移除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-card">
        <h2 style="margin: 0 0 0.85rem; font-size: 1.02rem;">
          {{ deptForm.id ? `编辑「${deptForm.name}」` : '新增部门' }}
        </h2>
        <div class="field-grid-2">
          <div class="field">
            <label>部门名称 *</label>
            <input v-model="deptForm.name" class="input" placeholder="如：AI 部 / 安全攻防组" />
          </div>
          <div class="field">
            <label>序号编号 & 负责人</label>
            <div style="display: flex; gap: 0.5rem;">
              <input v-model="deptForm.code" class="input" placeholder="01 / AI" style="width: 130px;" />
              <input v-model="deptForm.lead" class="input" placeholder="负责人姓名" />
            </div>
          </div>
        </div>

        <div class="field">
          <label>部门简介 *</label>
          <textarea v-model="deptForm.summary" class="textarea" rows="2" />
        </div>

        <div class="field-grid-2">
          <div class="field">
            <label>核心方向（每行一条）</label>
            <textarea v-model="deptForm.focusText" class="textarea" rows="3" />
          </div>
          <div class="field">
            <label>招新 `?` 气泡说明（同步到报名表）</label>
            <textarea v-model="deptForm.recruitDesc" class="textarea" rows="3" />
          </div>
        </div>

        <div class="field-grid-2">
          <div class="field">
            <label>近期话题 / 分享</label>
            <input v-model="deptForm.recentTopic" class="input" />
          </div>
          <div class="field">
            <label>常用技术标签（逗号分隔）</label>
            <input v-model="deptForm.toolsText" class="input" />
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <label style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.86rem;">
            <input v-model="deptForm.acceptingRecruit" type="checkbox" />
            <span>出现在招新意向部门中</span>
          </label>
          <label style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.86rem;">
            <input v-model="deptForm.isFeatured" type="checkbox" />
            <span>标记为重点方向（如 AI 部）</span>
          </label>
          <button class="btn btn-primary btn-sm" type="button" @click="submitDept">保存部门</button>
          <button v-if="deptForm.id" class="btn btn-ghost btn-sm" type="button" @click="clearDept">重置</button>
        </div>
      </div>
    </template>

    <!-- 纳新设置与收件箱 -->
    <template v-else-if="tab === 'recruit'">
      <div class="admin-head">
        <div>
          <h1>纳新表单配置与报名收件箱</h1>
          <p class="muted" style="margin: 0; font-size: 0.86rem;">
            对应 yeu `/admin/recruit`：控制报名开关、查看实时提交、导出数据总表
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="emit('previewFront', 'join')">
          去前台报名页测试 →
        </button>
      </div>

      <div class="admin-card">
        <h2 style="margin: 0 0 0.8rem; font-size: 1rem;">报名表开关与字段规则</h2>
        <div class="field-grid-2">
          <div class="field">
            <label>纳新状态</label>
            <select v-model="recruitDraft.status" class="select">
              <option value="open">开放报名 (open)</option>
              <option value="closed">暂停报名 (closed)</option>
            </select>
          </div>
          <div class="field">
            <label>报名页主标题</label>
            <input v-model="recruitDraft.title" class="input" />
          </div>
        </div>
        <div class="field">
          <label>副标语</label>
          <input v-model="recruitDraft.slogan" class="input" />
        </div>
        <div style="display: flex; align-items: center; gap: 1.2rem; flex-wrap: wrap; margin-bottom: 0.85rem;">
          <label style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.86rem;">
            <input v-model="recruitDraft.requireStudentNo" type="checkbox" />
            <span>学号设为必填</span>
          </label>
          <label style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.86rem;">
            <input v-model="recruitDraft.paymentEnabled" type="checkbox" />
            <span>启用会费确认说明区</span>
          </label>
        </div>
        <button class="btn btn-primary btn-sm" type="button" @click="saveRecruitSettings">保存纳新配置</button>
      </div>

      <div class="admin-card">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 0.85rem;">
          <h2 style="margin: 0; font-size: 1rem;">
            已收到报名（{{ filteredSubs.length }} 条）
          </h2>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <input
              v-model="subSearch"
              class="input"
              placeholder="搜姓名 / 班级 / 部门…"
              style="width: 210px; padding: 0.34rem 0.65rem; font-size: 0.84rem;"
            />
            <button class="btn btn-ghost btn-sm" type="button" @click="exportCsv">导出 CSV</button>
          </div>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>提交时间</th>
                <th>姓名</th>
                <th>专业班级</th>
                <th>联系方式</th>
                <th>意向部门</th>
                <th>自我介绍</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in filteredSubs" :key="s.id">
                <td class="mono" style="font-size: 0.78rem;">{{ s.createdAt }}</td>
                <td><strong>{{ s.name }}</strong><div class="muted" style="font-size: 0.76rem;">{{ s.gender }}</div></td>
                <td>{{ s.className }}<div class="muted mono" style="font-size: 0.74rem;">{{ s.studentNo || '未填学号' }}</div></td>
                <td class="mono" style="font-size: 0.78rem;">
                  <div v-if="s.phone">P: {{ s.phone }}</div>
                  <div v-if="s.qq">QQ: {{ s.qq }}</div>
                </td>
                <td>
                  <div class="tag-row">
                    <span
                      v-for="dep in s.departments"
                      :key="dep"
                      class="pill"
                      :class="dep === 'AI 部' ? 'pill-ai' : ''"
                    >
                      {{ dep }}
                    </span>
                  </div>
                </td>
                <td style="max-width: 260px; font-size: 0.82rem;">{{ s.intro || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
