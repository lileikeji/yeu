export type PublishStatus = 'draft' | 'pending' | 'published' | 'archived';

export interface ClubProfile {
  slug: string;
  name: string;
  shortName: string;
  campus: string;
  tagline: string;
  intro: string;
  contactWechat: string;
  contactQqGroup: string;
  yeuApiBase: string;
  syncMode: 'sandbox' | 'yeu-api';
}

export interface DepartmentItem {
  id: string;
  code: string;
  name: string;
  isFeatured?: boolean;
  lead: string;
  summary: string;
  focusList: string[];
  tools: string[];
  recentTopic: string;
  recruitDesc: string;
  acceptingRecruit: boolean;
}

export interface NewsPost {
  id: string;
  slug: string;
  title: string;
  deptId: string;
  deptName: string;
  tags: string[];
  summary: string;
  body: string;
  status: PublishStatus;
  pinned: boolean;
  publishedAt: string;
}

export interface ActivityItem {
  id: string;
  slug: string;
  title: string;
  deptId: string;
  deptName: string;
  category: 'AI工作坊' | '技术分享' | '算法训练' | '社团招新';
  date: string;
  timeRange: string;
  place: string;
  recruitState: 'open' | 'planned' | 'done';
  status: PublishStatus;
  capacity?: string;
  summary: string;
  body: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  deptId: string;
  deptName: string;
  track: 'AI / Agent' | 'Web / 校内工具' | '算法竞赛';
  status: 'active' | 'maintaining' | 'planning';
  stack: string[];
  summary: string;
  highlights?: string[];
  previewImage?: string;
  imageCaption?: string;
  repoUrl: string;
  demoUrl: string;
  updatedAt: string;
}

export interface ResourceItem {
  id: string;
  title: string;
  kind: '入门手册' | '实践笔记' | '题单' | '环境清单';
  deptName: string;
  summary: string;
  body: string;
  externalUrl: string;
  updatedAt: string;
}

export interface RecruitFormConfig {
  status: 'open' | 'closed';
  title: string;
  slogan: string;
  intro: string;
  requireStudentNo: boolean;
  paymentEnabled: boolean;
  paymentNote: string;
}

export interface RecruitSubmission {
  id: string;
  name: string;
  gender: '男' | '女' | '保密';
  studentNo: string;
  className: string;
  phone: string;
  qq: string;
  departments: string[];
  isLeagueMember: '是' | '否';
  intro: string;
  paymentConfirmed: boolean;
  createdAt: string;
}

export interface ApiTraceLog {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  yeuTarget: string;
  status: number;
  summary: string;
  payload: unknown;
}
