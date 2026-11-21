import type { DeptItem } from '../data/club';

export interface PublicPost {
  id: string;
  slug: string;
  kind: 'news' | 'resource';
  deptName: string;
  category: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  pinned: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

export interface PublicProject {
  id: string;
  title: string;
  deptName: string;
  track: string;
  status: 'active' | 'maintaining' | 'planning';
  summary: string;
  highlights: string[];
  stack: string[];
  previewImage: string;
  repoUrl: string;
  demoUrl: string;
  updatedAt: string;
}

export interface PublicActivity {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  startsAt: string;
  endsAt: string | null;
  placeName: string;
  room: string | null;
  photos: string[];
  source?: 'yeuca' | 'campus';
  deptName?: string;
  category?: string;
  allowRegistration?: boolean;
  maxParticipants?: number;
  registrationCount?: number;
}

export interface PublicRecruitField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  optionDetails?: Record<string, string>;
  placeholder?: string;
}

export interface YeucaGalleryItem {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
}

export interface YeucaCompetitionItem {
  name: string;
  track: string;
  dept: string;
  site?: string;
  href?: string;
}

export interface YeucaFaqItem {
  q: string;
  a: string;
}

export interface YeucaAnnouncementConfig {
  enabled: boolean;
  tag: string;
  text: string;
  href?: string;
}

export interface YeucaHomeHeroConfig {
  badge?: string;
  headline?: string;
  joinBtnText?: string;
  qrBtnText?: string;
  guideCardNote?: string;
}

export interface YeucaHomeEntryCard {
  id: string;
  badge: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  enabled: boolean;
}

export interface YeucaFeatureFlags {
  showGitNav?: boolean;
  showMirrorsNav?: boolean;
  showToolsNav?: boolean;
  showMemberEntry?: boolean;
  gitGateHint?: string;
  mirrorNotice?: string;
}

export interface YeucaAiWorkflowStep {
  id: string;
  step: string;
  title: string;
  role: string;
  logic: string;
  pitfall: string;
  sample: string;
}

export interface YeucaSeasonalRhythmItem {
  phase: string;
  title: string;
  detail: string;
  tags: string[];
}

export interface YeucaTimelineNode {
  period: string;
  tag: string;
  title: string;
  detail: string;
}

export interface YeucaChecklistRow {
  item: string;
  source: string;
  note: string;
}

export interface YeucaPracticeTopic {
  dept: string;
  title: string;
  stack: string[];
  desc: string;
}

export interface YeucaStarterLink {
  dept: string;
  title: string;
  host: string;
  url: string;
  note: string;
}

export interface YeucaMirrorEntry {
  id: string;
  category: '语言与包' | 'AI 与模型' | '系统与容器';
  name: string;
  upstream: string;
  note: string;
  cmd: string;
  snippetTitle?: string;
  snippet?: string;
  helpUrl: string;
  helpHost: string;
}

export interface YeucaScriptOption {
  id: string;
  label: string;
  ps1: string[];
  sh: string[];
}

export interface YeucaFriendLink {
  label: string;
  href: string;
}

export interface YeucaSiteExtras {
  heroImageUrl?: string;
  gallery?: YeucaGalleryItem[];
  competitions?: YeucaCompetitionItem[];
  faqs?: YeucaFaqItem[];
  flagshipNote?: string;
  homeAnnouncement?: YeucaAnnouncementConfig;
  homeHero?: YeucaHomeHeroConfig;
  homeEntries?: YeucaHomeEntryCard[];
  featureFlags?: YeucaFeatureFlags;
  aiWorkflowSteps?: YeucaAiWorkflowStep[];
  seasonalRhythm?: YeucaSeasonalRhythmItem[];
  archiveTimeline?: YeucaTimelineNode[];
  volatileChecklist?: YeucaChecklistRow[];
  practiceTopics?: YeucaPracticeTopic[];
  starterLinks?: YeucaStarterLink[];
  mirrors?: YeucaMirrorEntry[];
  scriptOptions?: YeucaScriptOption[];
  footerNote?: string;
  friendLinks?: YeucaFriendLink[];
}

export interface PublicMemberProfile {
  id: string;
  studentNo: string;
  name: string;
  gradeMajorClass: string;
  department: string;
  roleTitle: string;
  term: string;
  phone: string;
  qq: string;
  email: string;
  gitUsername: string;
  gitSynced: boolean;
  memberStatus: 'pending' | 'active' | 'disabled';
  bio: string;
  skills: string[];
  registeredAt: string | null;
  lastLoginAt: string | null;
}

export interface MemberGitRepoItem {
  id: number;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  isPrivate: boolean;
  starsCount: number;
  forksCount: number;
  updatedAt: string;
}

export interface MemberSessionPayload {
  authenticated: boolean;
  member: PublicMemberProfile | null;
  gitPublicUrl: string;
  repos: MemberGitRepoItem[];
  registrations: Array<{
    activityId: string;
    status: 'registered' | 'checked_in' | 'cancelled';
    note: string;
  }>;
}

export interface MemberEligibilityResult {
  eligible: boolean;
  reason?: string;
  message?: string;
  profile?: {
    studentNo: string;
    name: string;
    gradeMajorClass: string;
    department: string;
    roleTitle: string;
    email: string;
    suggestedGitUsername: string;
  };
}

export interface PublicSitePayload {
  settings: {
    campus: string;
    tagline: string;
    intro: string;
    recruitNote: string;
    contactNote: string;
    groupQrUrl: string;
    departments: DeptItem[];
    extras?: YeucaSiteExtras;
  };
  news: PublicPost[];
  resources: PublicPost[];
  projects: PublicProject[];
  activities: PublicActivity[];
  recruit: {
    open: boolean;
    title: string;
    slogan: string;
    intro: string;
    fields: PublicRecruitField[];
  };
}

export function resolveApiBase(): string {
  const configured = (import.meta.env.PUBLIC_YEUCA_API_BASE as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'http://127.0.0.1:3000';
  }
  return '';
}

export function resolveAssetUrl(path: string, apiBase = resolveApiBase()): string {
  const value = path.trim();
  if (!value) return '';
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  if (value.startsWith('/uploads/') && apiBase) return `${apiBase}${value}`;
  if (value.startsWith('/')) return value;
  return '';
}

let cachedSitePromise: Promise<PublicSitePayload | null> | null = null;

export async function fetchPublicSiteData(forceFresh = false): Promise<PublicSitePayload | null> {
  if (!forceFresh && cachedSitePromise) return cachedSitePromise;
  const base = resolveApiBase();
  const endpoint = base ? `${base}/api/public/yeuca/site` : '/api/public/yeuca/site';
  const req = fetch(endpoint, { headers: { Accept: 'application/json' } })
    .then(async (res) => (res.ok ? ((await res.json()) as PublicSitePayload) : null))
    .catch(() => null);
  cachedSitePromise = req;
  return req;
}

const DEV_TOKEN_KEY = 'yeuca_dev_member_token';

function isLocalDevHost(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function readDevToken(): string {
  if (!isLocalDevHost()) return '';
  try {
    return window.sessionStorage.getItem(DEV_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveDevToken(token: string | undefined): void {
  if (!isLocalDevHost()) return;
  try {
    if (token) window.sessionStorage.setItem(DEV_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(DEV_TOKEN_KEY);
  } catch {
    // ignore storage quota errors
  }
}

export async function memberApiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const base = resolveApiBase();
  const url = base ? `${base}${path}` : path;
  const devToken = readDevToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (devToken) headers['X-YEUCA-Member-Token'] = devToken;

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const errMsg =
      (data && typeof data === 'object' && 'data' in data && (data.data as { message?: string })?.message)
      || (data && typeof data.message === 'string' && data.message)
      || (data && typeof data.statusMessage === 'string' && data.statusMessage)
      || `请求失败 (${res.status})`;
    throw new Error(String(errMsg));
  }
  return data as T;
}

let cachedMemberPromise: Promise<MemberSessionPayload | null> | null = null;

export async function fetchMemberSession(forceFresh = false): Promise<MemberSessionPayload | null> {
  if (!forceFresh && cachedMemberPromise) return cachedMemberPromise;
  const req = memberApiFetch<MemberSessionPayload>('/api/public/yeuca/member/me').catch(() => null);
  cachedMemberPromise = req;
  return req;
}

export function clearMemberSessionCache(): void {
  cachedMemberPromise = null;
}

export async function verifyMemberEligibility(studentNo: string, name: string): Promise<MemberEligibilityResult> {
  return memberApiFetch<MemberEligibilityResult>('/api/public/yeuca/member/verify', {
    method: 'POST',
    body: { studentNo, name },
  });
}

export async function registerMemberAccount(payload: {
  studentNo: string;
  name: string;
  gitUsername: string;
  email: string;
  password: string;
  gradeMajorClass?: string;
  phone?: string;
  qq?: string;
  bio?: string;
}): Promise<{ authenticated: boolean; member: PublicMemberProfile; sessionToken?: string }> {
  const res = await memberApiFetch<{ authenticated: boolean; member: PublicMemberProfile; sessionToken?: string }>(
    '/api/public/yeuca/member/register',
    { method: 'POST', body: payload },
  );
  if (res.sessionToken) saveDevToken(res.sessionToken);
  clearMemberSessionCache();
  return res;
}

export async function loginMemberAccount(
  account: string,
  password: string,
): Promise<{ authenticated: boolean; member: PublicMemberProfile; sessionToken?: string }> {
  const res = await memberApiFetch<{ authenticated: boolean; member: PublicMemberProfile; sessionToken?: string }>(
    '/api/public/yeuca/member/login',
    { method: 'POST', body: { account, password } },
  );
  if (res.sessionToken) saveDevToken(res.sessionToken);
  clearMemberSessionCache();
  return res;
}

export async function logoutMemberAccount(): Promise<void> {
  await memberApiFetch('/api/public/yeuca/member/logout', { method: 'POST' }).catch(() => undefined);
  saveDevToken('');
  clearMemberSessionCache();
}

export async function updateMemberProfileApi(payload: {
  gradeMajorClass?: string;
  phone?: string;
  qq?: string;
  email?: string;
  bio?: string;
  skills?: string[];
}): Promise<{ member: PublicMemberProfile }> {
  const res = await memberApiFetch<{ member: PublicMemberProfile }>('/api/public/yeuca/member/profile', {
    method: 'PUT',
    body: payload,
  });
  clearMemberSessionCache();
  return res;
}

export async function changeMemberPasswordApi(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; gitSynced: boolean; gitSyncError: string }> {
  return memberApiFetch('/api/public/yeuca/member/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export async function toggleMemberActivityRegApi(
  activityId: string,
  action: 'register' | 'cancel',
  note = '',
): Promise<{ status: string; registrationCount: number }> {
  const res = await memberApiFetch<{ status: string; registrationCount: number }>(
    `/api/public/yeuca/member/activities/${encodeURIComponent(activityId)}/register`,
    { method: 'POST', body: { action, note } },
  );
  clearMemberSessionCache();
  return res;
}

export function isSafePublicHref(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return v;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(v)) return v;
  return '';
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMd(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function renderSafeMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }
    if (line.startsWith('### ')) {
      closeLists();
      html.push(`<h3>${inlineMd(escapeHtml(line.slice(4)))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      closeLists();
      html.push(`<h2>${inlineMd(escapeHtml(line.slice(3)))}</h2>`);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${inlineMd(escapeHtml(line.slice(2)))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${inlineMd(escapeHtml(line.replace(/^\d+\.\s+/, '')))}</li>`);
      continue;
    }
    closeLists();
    html.push(`<p>${inlineMd(escapeHtml(line))}</p>`);
  }
  closeLists();
  return html.join('\n');
}

export function formatIsoDateParts(iso: string): { month: string; day: string; timeText: string; dateText: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { month: '--', day: '--', timeText: '待通知', dateText: iso.slice(0, 10) };
  }
  const month = `${date.getMonth() + 1}月`;
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${day}`;
  return { month, day, timeText: `${hours}:${mins}`, dateText };
}

export function extractHostname(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function getMonthArchiveLabel(dateStr: string | null | undefined): string {
  const raw = (dateStr || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]} 年 ${Number(match[2])} 月`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()} 年 ${parsed.getMonth() + 1} 月`;
  }
  return '近期发布';
}

export type ActivityCategory = '全部' | '技术培训' | '竞赛备赛' | '分享交流' | '招新迎新';

export function inferActivityCategory(title: string, summary = ''): Exclude<ActivityCategory, '全部'> {
  const text = `${title} ${summary}`;
  if (/招新|迎新|破冰|百团|宣讲/.test(text)) return '招新迎新';
  if (/赛|选拔|集训|蓝桥|ICT|CTF|ACM|数据安全|智能制造/.test(text)) return '竞赛备赛';
  if (/分享|沙龙|讲座|交流|复盘|茶话/.test(text)) return '分享交流';
  return '技术培训';
}

export interface GitRepoItem {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  clone_url: string;
  language: string;
  stars_count: number;
  forks_count: number;
  updated_at: string;
  empty: boolean;
}

export function resolveGitBase(): string {
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'https://yeuca.huiliyill.cn/git';
  }
  return '/git';
}

export async function fetchPublicGitRepos(_limit = 8): Promise<GitRepoItem[]> {
  // Git 代码站已启用成员登录门禁（REQUIRE_SIGNIN_VIEW = true），不再从前端对未登录访客发起匿名 API 请求以防产生 401 报错；
  // 已登录会员的 Git 仓库由 /api/public/yeuca/member/me 统一获取并在 /member/ 和 /projects/ 展示。
  return [];
}

export interface PublicTreasureState {
  enabled: boolean;
  title: string;
  subtitle: string;
  goalCount: number;
  requireMember: boolean;
  actor: {
    authenticated: boolean;
    type: 'yeuca_member' | 'user' | null;
    label: string;
    studentNo?: string;
    department?: string;
  };
  points: Array<{
    id: string;
    name: string;
    kind: string;
    deptName: string;
    landmark: string;
    region: 'new' | 'old';
  }>;
  collectedMap: Record<string, number>;
}

export async function fetchPublicTreasureState(): Promise<PublicTreasureState | null> {
  const base = resolveApiBase();
  const url = base ? `${base}/api/public/treasure/state` : '/api/public/treasure/state';
  const devToken = readDevToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (devToken) headers['X-YEUCA-Member-Token'] = devToken;
  try {
    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicTreasureState;
  } catch {
    return null;
  }
}

/**
 * 页面浏览埋点。官网是静态页，nginx 直出，后端只看得到接口请求，
 * 真实 PV 与来源 IP 只能从浏览器这一发拿。一页一次，失败静默。
 */
export function trackYeucaPageView(): void {
  if (typeof window === 'undefined') return;
  const base = resolveApiBase();
  const endpoint = base ? `${base}/api/public/yeuca/track` : '/api/public/yeuca/track';
  const payload = JSON.stringify({
    path: window.location.pathname,
    referer: document.referrer || '',
  });

  try {
    // text/plain 是 CORS 简单请求，sendBeacon 不会触发预检；
    // 后端按 JSON 解析字符串，字段类型再校验一遍。
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'include',
    }).catch(() => {});
  } catch {
    /* 埋点失败不影响页面 */
  }
}
