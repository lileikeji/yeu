import { computed, reactive } from 'vue';
import {
  SEED_ACTIVITIES,
  SEED_DEPARTMENTS,
  SEED_NEWS,
  SEED_PROFILE,
  SEED_PROJECTS,
  SEED_RECRUIT_CONFIG,
  SEED_RESOURCES,
  SEED_SUBMISSIONS,
} from '../data/seed';
import type {
  ActivityItem,
  ApiTraceLog,
  ClubProfile,
  DepartmentItem,
  NewsPost,
  ProjectItem,
  PublishStatus,
  RecruitFormConfig,
  RecruitSubmission,
  ResourceItem,
} from '../types/portal';

const STORAGE_KEY = 'yeuca-portal-demo-v2';

interface PersistedState {
  profile: ClubProfile;
  departments: DepartmentItem[];
  news: NewsPost[];
  activities: ActivityItem[];
  projects: ProjectItem[];
  resources: ResourceItem[];
  recruitConfig: RecruitFormConfig;
  submissions: RecruitSubmission[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultState(): PersistedState {
  return {
    profile: clone(SEED_PROFILE),
    departments: clone(SEED_DEPARTMENTS),
    news: clone(SEED_NEWS),
    activities: clone(SEED_ACTIVITIES),
    projects: clone(SEED_PROJECTS),
    resources: clone(SEED_RESOURCES),
    recruitConfig: clone(SEED_RECRUIT_CONFIG),
    submissions: clone(SEED_SUBMISSIONS),
  };
}

function loadInitial(): PersistedState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      profile: parsed.profile ?? clone(SEED_PROFILE),
      departments: parsed.departments ?? clone(SEED_DEPARTMENTS),
      news: parsed.news ?? clone(SEED_NEWS),
      activities: parsed.activities ?? clone(SEED_ACTIVITIES),
      projects: parsed.projects ?? clone(SEED_PROJECTS),
      resources: parsed.resources ?? clone(SEED_RESOURCES),
      recruitConfig: parsed.recruitConfig ?? clone(SEED_RECRUIT_CONFIG),
      submissions: parsed.submissions ?? clone(SEED_SUBMISSIONS),
    };
  } catch {
    return defaultState();
  }
}

const initial = loadInitial();

export const portalState = reactive<PersistedState & { apiLogs: ApiTraceLog[] }>({
  ...initial,
  apiLogs: [
    {
      id: 'log-init',
      timestamp: new Date().toTimeString().slice(0, 8),
      method: 'GET',
      endpoint: '/api/public/clubs/computer-association',
      yeuTarget: 'contents + activities + recruit_forms',
      status: 200,
      summary: '初始化计协门户数据（沙盒模式，字段与 yeu 后端对齐）',
      payload: {
        slug: 'computer-association',
        departments: initial.departments.map((d) => d.name),
      },
    },
  ],
});

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    const data: PersistedState = {
      profile: portalState.profile,
      departments: portalState.departments,
      news: portalState.news,
      activities: portalState.activities,
      projects: portalState.projects,
      resources: portalState.resources,
      recruitConfig: portalState.recruitConfig,
      submissions: portalState.submissions,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 忽略存储配额限制
  }
}

function recordTrace(
  method: ApiTraceLog['method'],
  endpoint: string,
  yeuTarget: string,
  status: number,
  summary: string,
  payload: unknown,
): void {
  portalState.apiLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toTimeString().slice(0, 8),
    method,
    endpoint,
    yeuTarget,
    status,
    summary,
    payload,
  });
  if (portalState.apiLogs.length > 40) {
    portalState.apiLogs.length = 40;
  }
}

export const publishedNews = computed(() =>
  portalState.news
    .filter((item) => item.status === 'published')
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.publishedAt.localeCompare(a.publishedAt);
    }),
);

export const publishedActivities = computed(() =>
  portalState.activities
    .filter((item) => item.status === 'published')
    .sort((a, b) => b.date.localeCompare(a.date)),
);

export const acceptingDepartments = computed(() =>
  portalState.departments.filter((d) => d.acceptingRecruit),
);

export function updateProfile(next: Partial<ClubProfile>): void {
  Object.assign(portalState.profile, next);
  persist();
  recordTrace(
    'PUT',
    '/api/admin/organization/visual',
    'contents.metadataJson',
    200,
    '更新协会基础资料与联立配置',
    next,
  );
}

export function saveNewsPost(
  input: Omit<NewsPost, 'id' | 'slug' | 'deptName'> & { id?: string },
): NewsPost {
  const dept = portalState.departments.find((d) => d.id === input.deptId);
  const deptName = dept?.name ?? 'AI 部';
  const nowId = input.id || `news-${Date.now()}`;
  const slug = `post-${nowId}`;
  const item: NewsPost = {
    ...input,
    id: nowId,
    slug,
    deptName,
  };
  const idx = portalState.news.findIndex((p) => p.id === nowId);
  if (idx >= 0) {
    portalState.news[idx] = item;
    recordTrace(
      'PUT',
      `/api/admin/content/${nowId}`,
      'contents (kind=notice / club-post)',
      200,
      `更新动态「${item.title}」（状态：${item.status}）`,
      item,
    );
  } else {
    portalState.news.unshift(item);
    recordTrace(
      'POST',
      '/api/admin/content',
      'contents (kind=notice / club-post)',
      201,
      `新建并${item.status === 'published' ? '发布' : '暂存'}动态「${item.title}」`,
      item,
    );
  }
  persist();
  return item;
}

export function setNewsStatus(id: string, status: PublishStatus): void {
  const found = portalState.news.find((p) => p.id === id);
  if (!found) return;
  found.status = status;
  persist();
  recordTrace(
    'PUT',
    `/api/admin/content/${id}`,
    'contents.status',
    200,
    `切换动态「${found.title}」状态为 ${status}`,
    { id, status },
  );
}

export function deleteNewsPost(id: string): void {
  const idx = portalState.news.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const removed = portalState.news.splice(idx, 1)[0];
  persist();
  recordTrace(
    'DELETE',
    `/api/admin/content/${id}`,
    'contents',
    200,
    `删除动态「${removed.title}」`,
    { id },
  );
}

export function saveActivityItem(
  input: Omit<ActivityItem, 'id' | 'slug' | 'deptName'> & { id?: string },
): ActivityItem {
  const dept = portalState.departments.find((d) => d.id === input.deptId);
  const deptName = dept?.name ?? 'AI 部';
  const id = input.id || `act-${Date.now()}`;
  const item: ActivityItem = {
    ...input,
    id,
    slug: `act-${id}`,
    deptName,
  };
  const idx = portalState.activities.findIndex((a) => a.id === id);
  if (idx >= 0) {
    portalState.activities[idx] = item;
    recordTrace(
      'PUT',
      `/api/admin/activities/${id}`,
      'activities',
      200,
      `更新活动「${item.title}」`,
      item,
    );
  } else {
    portalState.activities.unshift(item);
    recordTrace(
      'POST',
      '/api/admin/activities',
      'activities',
      201,
      `创建活动「${item.title}」（主办：${deptName}）`,
      item,
    );
  }
  persist();
  return item;
}

export function setActivityStatus(id: string, status: PublishStatus): void {
  const found = portalState.activities.find((a) => a.id === id);
  if (!found) return;
  found.status = status;
  persist();
  recordTrace(
    'PUT',
    `/api/admin/activities/${id}`,
    'activities.status',
    200,
    `活动「${found.title}」状态更新为 ${status}`,
    { id, status },
  );
}

export function deleteActivityItem(id: string): void {
  const idx = portalState.activities.findIndex((a) => a.id === id);
  if (idx < 0) return;
  const removed = portalState.activities.splice(idx, 1)[0];
  persist();
  recordTrace('DELETE', `/api/admin/activities/${id}`, 'activities', 200, `删除活动「${removed.title}」`, { id });
}

export function saveDepartmentItem(
  input: Omit<DepartmentItem, 'id'> & { id?: string },
): DepartmentItem {
  const id = input.id || `dept-${Date.now()}`;
  const item: DepartmentItem = { ...input, id };
  const idx = portalState.departments.findIndex((d) => d.id === id);
  if (idx >= 0) {
    portalState.departments[idx] = item;
  } else {
    portalState.departments.push(item);
  }
  persist();
  recordTrace(
    'PUT',
    '/api/admin/organization/departments',
    'contents.metadataJson.boxes + recruit_forms.fieldsJson',
    200,
    `${idx >= 0 ? '更新' : '新增'}部门「${item.name}」（同步更新纳新可选部门）`,
    item,
  );
  return item;
}

export function deleteDepartmentItem(id: string): void {
  if (portalState.departments.length <= 1) return;
  const idx = portalState.departments.findIndex((d) => d.id === id);
  if (idx < 0) return;
  const removed = portalState.departments.splice(idx, 1)[0];
  persist();
  recordTrace(
    'DELETE',
    `/api/admin/organization/departments/${id}`,
    'contents.metadataJson',
    200,
    `移除部门「${removed.name}」`,
    { id },
  );
}

export function saveProjectItem(
  input: Omit<ProjectItem, 'id' | 'deptName'> & { id?: string },
): ProjectItem {
  const dept = portalState.departments.find((d) => d.id === input.deptId);
  const id = input.id || `proj-${Date.now()}`;
  const item: ProjectItem = {
    ...input,
    id,
    deptName: dept?.name ?? '技术研发部',
  };
  const idx = portalState.projects.findIndex((p) => p.id === id);
  if (idx >= 0) {
    portalState.projects[idx] = item;
  } else {
    portalState.projects.unshift(item);
  }
  persist();
  recordTrace(
    idx >= 0 ? 'PUT' : 'POST',
    '/api/admin/organization/projects',
    'contents.metadataJson.projects',
    idx >= 0 ? 200 : 201,
    `${idx >= 0 ? '更新' : '创建'}项目「${item.title}」`,
    item,
  );
  return item;
}

export function deleteProjectItem(id: string): void {
  const idx = portalState.projects.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const removed = portalState.projects.splice(idx, 1)[0];
  persist();
  recordTrace('DELETE', `/api/admin/organization/projects/${id}`, 'contents.metadataJson', 200, `删除项目「${removed.title}」`, { id });
}

export function saveResourceItem(input: Omit<ResourceItem, 'id'> & { id?: string }): ResourceItem {
  const id = input.id || `res-${Date.now()}`;
  const item: ResourceItem = { ...input, id };
  const idx = portalState.resources.findIndex((r) => r.id === id);
  if (idx >= 0) {
    portalState.resources[idx] = item;
  } else {
    portalState.resources.unshift(item);
  }
  persist();
  recordTrace(
    idx >= 0 ? 'PUT' : 'POST',
    '/api/admin/organization/resources',
    'contents.metadataJson.resources',
    idx >= 0 ? 200 : 201,
    `${idx >= 0 ? '更新' : '新增'}学习资料「${item.title}」`,
    item,
  );
  return item;
}

export function deleteResourceItem(id: string): void {
  const idx = portalState.resources.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const removed = portalState.resources.splice(idx, 1)[0];
  persist();
  recordTrace('DELETE', `/api/admin/organization/resources/${id}`, 'contents.metadataJson', 200, `删除资料「${removed.title}」`, { id });
}

export function updateRecruitConfig(next: Partial<RecruitFormConfig>): void {
  Object.assign(portalState.recruitConfig, next);
  persist();
  recordTrace(
    'PUT',
    '/api/admin/recruit/forms/computer-association',
    'recruit_forms',
    200,
    `更新纳新表单设置（当前状态：${portalState.recruitConfig.status}）`,
    next,
  );
}

export function submitRecruitApplication(
  input: Omit<RecruitSubmission, 'id' | 'createdAt'>,
): { submission: RecruitSubmission; filename: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const submission: RecruitSubmission = {
    ...input,
    id: `sub-${Date.now()}`,
    createdAt,
  };
  portalState.submissions.unshift(submission);
  persist();

  const cleanClass = submission.className.replace(/[\\/:*?"<>|]/g, '').trim() || '未填班级';
  const cleanName = submission.name.replace(/[\\/:*?"<>|]/g, '').trim() || '同学';
  const filename = `${cleanClass}${cleanName}.docx`;

  recordTrace(
    'POST',
    '/api/public/recruit/computer-association',
    'recruit_submissions + recruit_drafts',
    201,
    `收到「${submission.name}」的入会报名（意向：${submission.departments.join('、')}）`,
    {
      data: submission,
      paymentConfirmed: submission.paymentConfirmed,
      generatedDocxName: filename,
    },
  );
  return { submission, filename };
}

export function resetDemoData(): void {
  const fresh = defaultState();
  portalState.profile = fresh.profile;
  portalState.departments = fresh.departments;
  portalState.news = fresh.news;
  portalState.activities = fresh.activities;
  portalState.projects = fresh.projects;
  portalState.resources = fresh.resources;
  portalState.recruitConfig = fresh.recruitConfig;
  portalState.submissions = fresh.submissions;
  persist();
  recordTrace(
    'POST',
    '/api/demo/reset',
    'localStorage',
    200,
    '已重置沙盒数据为默认种子数据',
    {},
  );
}
