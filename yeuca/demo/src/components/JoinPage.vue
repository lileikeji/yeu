<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import {
  acceptingDepartments,
  portalState,
  submitRecruitApplication,
} from '../stores/portalStore';

const props = defineProps<{
  preselectedDept?: string;
}>();

const emit = defineEmits<{
  goAdminSubmissions: [];
}>();

const form = reactive({
  name: '',
  gender: '保密' as '男' | '女' | '保密',
  studentNo: '',
  className: '',
  phone: '',
  qq: '',
  departments: [] as string[],
  isLeagueMember: '是' as '是' | '否',
  intro: '',
  paymentConfirmed: false,
});

watch(
  () => props.preselectedDept,
  (val) => {
    if (val && !form.departments.includes(val)) {
      form.departments.push(val);
    }
  },
  { immediate: true },
);

const expandedHelpIds = ref<Record<string, boolean>>({});
const errorText = ref('');
const receipt = ref<{ name: string; departments: string[]; filename: string } | null>(null);

function toggleDept(name: string): void {
  const idx = form.departments.indexOf(name);
  if (idx >= 0) {
    form.departments.splice(idx, 1);
  } else {
    form.departments.push(name);
  }
}

function toggleHelp(id: string): void {
  expandedHelpIds.value[id] = !expandedHelpIds.value[id];
}

function handleSubmit(): void {
  errorText.value = '';
  const name = form.name.trim();
  const className = form.className.trim();
  const phone = form.phone.trim();
  const qq = form.qq.trim();
  const studentNo = form.studentNo.trim();

  if (!name) {
    errorText.value = '请填写姓名。';
    return;
  }
  if (!className) {
    errorText.value = '请填写专业班级（例如：26计科1班 或 25电子专升本1班）。';
    return;
  }
  if (portalState.recruitConfig.requireStudentNo && !studentNo) {
    errorText.value = '当前纳新要求填写学号。';
    return;
  }
  if (phone && !/^1\d{10}$/.test(phone)) {
    errorText.value = '手机号格式应为 11 位数字。';
    return;
  }
  if (qq && !/^\d{5,12}$/.test(qq)) {
    errorText.value = 'QQ 号格式应为 5–12 位数字。';
    return;
  }
  if (!phone && !qq) {
    errorText.value = '手机号和 QQ 请至少填写一项，方便部门负责人联系你。';
    return;
  }
  if (form.departments.length === 0) {
    errorText.value = '请至少选择一个意向部门（例如 AI 部、技术研发部等）。';
    return;
  }
  if (portalState.recruitConfig.paymentEnabled && !form.paymentConfirmed) {
    errorText.value = '请先确认会费说明并勾选「已确认会费说明」。';
    return;
  }

  const res = submitRecruitApplication({
    name,
    gender: form.gender,
    studentNo,
    className,
    phone,
    qq,
    departments: [...form.departments],
    isLeagueMember: form.isLeagueMember,
    intro: form.intro.trim(),
    paymentConfirmed: form.paymentConfirmed,
  });

  receipt.value = {
    name,
    departments: [...form.departments],
    filename: res.filename,
  };
}

function editAgain(): void {
  receipt.value = null;
}

function resetFresh(): void {
  receipt.value = null;
  form.name = '';
  form.studentNo = '';
  form.className = '';
  form.phone = '';
  form.qq = '';
  form.departments = [];
  form.intro = '';
  form.paymentConfirmed = false;
}
</script>

<template>
  <div>
    <section class="subpage-head">
      <div class="wrap">
        <h1>{{ portalState.recruitConfig.title }}</h1>
        <p>{{ portalState.recruitConfig.slogan }}</p>
      </div>
    </section>

    <section class="page-section" style="padding-top: 0.6rem;">
      <div class="wrap join-layout">
        <!-- 左侧：报名表主体 -->
        <div class="form-panel">
          <div
            v-if="portalState.recruitConfig.status === 'closed'"
            class="alert alert-err"
            role="alert"
          >
            当前纳新通道已暂停接收新提交。你可以在右上角「组织后台 → 纳新设置」重新开放。
          </div>

          <div v-else-if="receipt" style="display: grid; gap: 1rem;">
            <div class="alert alert-ok">
              <strong>报名表已提交</strong>
              <p style="margin: 0.4rem 0 0;">
                {{ receipt.name }}，已登记意向部门：<strong>{{ receipt.departments.join('、') }}</strong>。
              </p>
            </div>

            <div class="card" style="background: var(--bg);">
              <div class="muted" style="font-size: 0.82rem;">已对接 yeu 纳新归档格式</div>
              <div style="font-size: 0.9rem;">
                导出 Word 申请表命名预览：<code>{{ receipt.filename }}</code>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.4rem;">
                <button class="btn btn-primary btn-sm" type="button" @click="emit('goAdminSubmissions')">
                  去后台查看这条记录 →
                </button>
                <button class="btn btn-ghost btn-sm" type="button" @click="editAgain">
                  修改刚填的信息
                </button>
                <button class="btn btn-ghost btn-sm" type="button" @click="resetFresh">
                  重新填写一份
                </button>
              </div>
            </div>
          </div>

          <form v-else @submit.prevent="handleSubmit" novalidate>
            <div class="field-grid-2">
              <div class="field">
                <label for="f-name">姓名 *</label>
                <input id="f-name" v-model="form.name" class="input" type="text" placeholder="真实姓名或常用名" />
              </div>

              <div class="field">
                <label for="f-gender">性别</label>
                <select id="f-gender" v-model="form.gender" class="select">
                  <option value="男">男</option>
                  <option value="女">女</option>
                  <option value="保密">保密</option>
                </select>
              </div>
            </div>

            <div class="field-grid-2">
              <div class="field">
                <label for="f-class">专业班级 *</label>
                <input
                  id="f-class"
                  v-model="form.className"
                  class="input"
                  type="text"
                  placeholder="如：26计科1班 / 25电子专升本1班"
                />
              </div>

              <div class="field">
                <label for="f-sno">
                  学号 {{ portalState.recruitConfig.requireStudentNo ? '*' : '（选填）' }}
                </label>
                <input
                  id="f-sno"
                  v-model="form.studentNo"
                  class="input"
                  type="text"
                  placeholder="用于校内活动学分或档案核对"
                />
              </div>
            </div>

            <div class="field-grid-2">
              <div class="field">
                <label for="f-phone">手机号</label>
                <input id="f-phone" v-model="form.phone" class="input" type="tel" placeholder="11 位手机号" />
              </div>

              <div class="field">
                <label for="f-qq">QQ 号</label>
                <input id="f-qq" v-model="form.qq" class="input" type="text" placeholder="方便拉进招新沟通群" />
              </div>
            </div>

            <div class="field">
              <label for="f-league">是否为共青团员</label>
              <select id="f-league" v-model="form.isLeagueMember" class="select">
                <option value="是">是</option>
                <option value="否">否</option>
              </select>
            </div>

            <div class="field">
              <label>
                意向部门 *
                <span class="field-hint">可多选；点击右侧「?」查看部门职责与基础要求</span>
              </label>
              <div class="dept-check-grid">
                <div
                  v-for="dept in acceptingDepartments"
                  :key="dept.id"
                  class="dept-check-card"
                  :class="{ checked: form.departments.includes(dept.name) }"
                >
                  <div class="dept-check-row">
                    <label class="dept-check-label">
                      <input
                        type="checkbox"
                        :checked="form.departments.includes(dept.name)"
                        @change="toggleDept(dept.name)"
                      />
                      <span>{{ dept.name }}</span>
                      <span v-if="dept.isFeatured" class="pill pill-ai">AI / Agent</span>
                    </label>
                    <button
                      type="button"
                      class="help-toggle"
                      :aria-label="`查看${dept.name}介绍`"
                      @click="toggleHelp(dept.id)"
                    >
                      ?
                    </button>
                  </div>
                  <p v-if="expandedHelpIds[dept.id]" class="dept-check-desc">
                    {{ dept.recruitDesc }}
                  </p>
                </div>
              </div>
            </div>

            <div class="field">
              <label for="f-intro">
                简单介绍自己 / 想一起做什么
                <span class="field-hint">选填，写你用过的小工具、想学的方向，或者只是想先来听一次分享</span>
              </label>
              <textarea
                id="f-intro"
                v-model="form.intro"
                class="textarea"
                rows="3"
                placeholder="例如：对 AI 部的 Agent 工作流搭建很感兴趣，平时写一点 Python"
              />
            </div>

            <div
              v-if="portalState.recruitConfig.paymentEnabled"
              class="field"
              style="background: var(--warn-soft); border: 1px solid #ecd1b3; padding: 0.8rem; border-radius: 8px;"
            >
              <div style="font-size: 0.85rem; margin-bottom: 0.45rem;">
                {{ portalState.recruitConfig.paymentNote }}
              </div>
              <label style="display: inline-flex; align-items: center; gap: 0.45rem; cursor: pointer;">
                <input v-model="form.paymentConfirmed" type="checkbox" />
                <span>已了解会费说明 / 已按指引缴费</span>
              </label>
            </div>

            <div v-if="errorText" class="alert alert-err" style="margin-bottom: 0.9rem;" role="alert">
              {{ errorText }}
            </div>

            <button class="btn btn-primary" type="submit">提交报名表</button>
          </form>
        </div>

        <!-- 右侧：纳新须知与联络 -->
        <aside style="display: grid; gap: 1rem;">
          <div class="card">
            <h3>关于这份报名表</h3>
            <p>{{ portalState.recruitConfig.intro }}</p>
            <ul style="margin: 0.2rem 0 0; padding-left: 1.15rem; font-size: 0.86rem; color: var(--muted); display: grid; gap: 0.4rem;">
              <li>联系方式仅用于负责人联系通知，不会出现在任何公开页面上。</li>
              <li>零基础可直接报任意感兴趣部门，入部前几周有基础环境带练。</li>
              <li>需要修改或撤回报名，随时在群里联系对应部门负责人即可。</li>
            </ul>
          </div>

          <div class="card">
            <h3>联络渠道</h3>
            <div style="font-size: 0.86rem; display: grid; gap: 0.45rem; color: var(--muted);">
              <div><strong>公众号：</strong>{{ portalState.profile.contactWechat }}</div>
              <div><strong>咨询群：</strong>{{ portalState.profile.contactQqGroup }}</div>
              <div><strong>校内迎新入口：</strong><code>{{ portalState.profile.yeuApiBase }}/clubs/{{ portalState.profile.slug }}</code></div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
