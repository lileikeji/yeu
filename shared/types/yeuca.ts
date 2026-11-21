export type YeucaPostKind = 'news' | 'resource'
export type YeucaPostStatus = 'draft' | 'published' | 'archived'
export type YeucaProjectStatus = 'active' | 'maintaining' | 'planning'
export type YeucaMemberStatus = 'pending' | 'active' | 'disabled'
export type YeucaActivityStatus = 'draft' | 'published' | 'archived'
export type YeucaActivityRegStatus = 'registered' | 'checked_in' | 'cancelled'

export interface YeucaDepartment {
  id: string
  code: string
  name: string
  lead: string
  isFeatured: boolean
  acceptingRecruit: boolean
  summary: string
  focusList: string[]
  tools: string[]
  recentTopic: string
  recruitDesc: string
}

export interface YeucaGalleryItem {
  id: string
  title: string
  caption: string
  imageUrl: string
}

export interface YeucaCompetitionItem {
  name: string
  track: string
  dept: string
  site?: string
  href?: string
}

export interface YeucaFaqItem {
  q: string
  a: string
}

export interface YeucaAnnouncementConfig {
  enabled: boolean
  tag: string
  text: string
  href?: string
}

export interface YeucaHomeHeroConfig {
  badge?: string
  headline?: string
  joinBtnText?: string
  qrBtnText?: string
  guideCardNote?: string
}

export interface YeucaHomeEntryCard {
  id: string
  badge: string
  title: string
  desc: string
  href: string
  cta: string
  enabled: boolean
}

export interface YeucaFeatureFlags {
  showGitNav?: boolean
  showMirrorsNav?: boolean
  showToolsNav?: boolean
  showMemberEntry?: boolean
  gitGateHint?: string
  mirrorNotice?: string
}

export interface YeucaAiWorkflowStep {
  id: string
  step: string
  title: string
  role: string
  logic: string
  pitfall: string
  sample: string
}

export interface YeucaSeasonalRhythmItem {
  phase: string
  title: string
  detail: string
  tags: string[]
}

export interface YeucaTimelineNode {
  period: string
  tag: string
  title: string
  detail: string
}

export interface YeucaChecklistRow {
  item: string
  source: string
  note: string
}

export interface YeucaPracticeTopic {
  dept: string
  title: string
  stack: string[]
  desc: string
}

export interface YeucaStarterLink {
  dept: string
  title: string
  host: string
  url: string
  note: string
}

export interface YeucaMirrorEntry {
  id: string
  category: '语言与包' | 'AI 与模型' | '系统与容器'
  name: string
  upstream: string
  note: string
  cmd: string
  snippetTitle?: string
  snippet?: string
  helpUrl: string
  helpHost: string
}

export interface YeucaScriptOption {
  id: string
  label: string
  ps1: string[]
  sh: string[]
}

export interface YeucaFriendLink {
  label: string
  href: string
}

export interface YeucaSiteExtras {
  heroImageUrl?: string
  gallery?: YeucaGalleryItem[]
  competitions?: YeucaCompetitionItem[]
  faqs?: YeucaFaqItem[]
  flagshipNote?: string
  homeAnnouncement?: YeucaAnnouncementConfig
  homeHero?: YeucaHomeHeroConfig
  homeEntries?: YeucaHomeEntryCard[]
  featureFlags?: YeucaFeatureFlags
  aiWorkflowSteps?: YeucaAiWorkflowStep[]
  seasonalRhythm?: YeucaSeasonalRhythmItem[]
  archiveTimeline?: YeucaTimelineNode[]
  volatileChecklist?: YeucaChecklistRow[]
  practiceTopics?: YeucaPracticeTopic[]
  starterLinks?: YeucaStarterLink[]
  mirrors?: YeucaMirrorEntry[]
  scriptOptions?: YeucaScriptOption[]
  footerNote?: string
  friendLinks?: YeucaFriendLink[]
}

export interface YeucaSiteSettings {
  id: string
  contentId: string | null
  campus: string
  tagline: string
  intro: string
  recruitNote: string
  contactNote: string
  groupQrUrl: string
  departments: YeucaDepartment[]
  extras: YeucaSiteExtras
  updatedAt: number
}

export interface YeucaPostItem {
  id: string
  slug: string
  kind: YeucaPostKind
  deptName: string
  category: string
  title: string
  summary: string
  body: string
  tags: string[]
  pinned: boolean
  status: YeucaPostStatus
  publishedAt: string | null
  updatedAt: string
}

export interface YeucaProjectItem {
  id: string
  title: string
  deptName: string
  track: string
  status: YeucaProjectStatus
  summary: string
  highlights: string[]
  stack: string[]
  previewImage: string
  repoUrl: string
  demoUrl: string
  sortOrder: number
  isPublished: boolean
  updatedAt: string
}

export interface YeucaPublicActivityItem {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  startsAt: string
  endsAt: string | null
  placeName: string
  room: string | null
  photos: string[]
  source?: 'yeuca' | 'campus'
  deptName?: string
  category?: string
  allowRegistration?: boolean
  maxParticipants?: number
  registrationCount?: number
}

export interface YeucaAdminActivityItem {
  id: string
  slug: string
  title: string
  deptName: string
  category: string
  summary: string
  body: string
  placeName: string
  room: string
  startsAt: string
  endsAt: string | null
  allowRegistration: boolean
  maxParticipants: number
  status: YeucaActivityStatus
  photos: string[]
  registrationCount: number
  checkedInCount: number
  updatedAt: string
}

export interface YeucaActivityRegistrationItem {
  id: string
  activityId: string
  memberId: string
  studentNo: string
  name: string
  gradeMajorClass: string
  department: string
  roleTitle: string
  status: YeucaActivityRegStatus
  note: string
  checkedInAt: string | null
  createdAt: string
}

export interface YeucaMemberItem {
  id: string
  studentNo: string
  name: string
  gradeMajorClass: string
  department: string
  roleTitle: string
  term: string
  phone: string
  qq: string
  email: string
  gitUsername: string
  gitUserId: number | null
  gitSynced: boolean
  gitSyncError: string
  memberStatus: YeucaMemberStatus
  bio: string
  skills: string[]
  notes: string
  recruitSubmissionId: string | null
  registeredAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface YeucaPublicMemberProfile {
  id: string
  studentNo: string
  name: string
  gradeMajorClass: string
  department: string
  roleTitle: string
  term: string
  phone: string
  qq: string
  email: string
  gitUsername: string
  gitSynced: boolean
  memberStatus: YeucaMemberStatus
  bio: string
  skills: string[]
  registeredAt: string | null
  lastLoginAt: string | null
}

export interface YeucaMemberGitRepo {
  id: number
  name: string
  fullName: string
  description: string
  htmlUrl: string
  cloneUrl: string
  isPrivate: boolean
  starsCount: number
  forksCount: number
  updatedAt: string
}

export interface YeucaRecruitSubmissionAdminItem {
  id: string
  name: string
  studentNo: string
  major: string
  className: string
  phone: string
  qq: string
  departments: string
  createdAt: string
  data: Record<string, unknown>
  memberImported: boolean
  memberStatus: YeucaMemberStatus | null
}

export interface YeucaRecruitAdminConfig {
  open: boolean
  title: string
  slogan: string
  intro: string
  totalSubmissions: number
  submissions: YeucaRecruitSubmissionAdminItem[]
}

export interface YeucaGiteaAdminOverview {
  configured: boolean
  reachable: boolean
  version: string
  requireSigninView: boolean
  disableRegistration: boolean
  baseUrl: string
  publicGitUrl: string
  syncedMemberCount: number
  error: string
}

export interface YeucaRecruitPublicStatus {
  open: boolean
  title: string
  slogan: string
  intro: string
  fields: Array<{
    key: string
    label: string
    type: string
    required: boolean
    options?: string[]
    optionDetails?: Record<string, string>
    placeholder?: string
  }>
}

export interface YeucaPublicSnapshot {
  settings: {
    campus: string
    tagline: string
    intro: string
    recruitNote: string
    contactNote: string
    groupQrUrl: string
    departments: YeucaDepartment[]
    extras: YeucaSiteExtras
  }
  news: YeucaPostItem[]
  resources: YeucaPostItem[]
  projects: YeucaProjectItem[]
  activities: YeucaPublicActivityItem[]
  recruit: YeucaRecruitPublicStatus
}

export interface YeucaAdminScopePayload {
  role: 'chief' | 'minister'
  departmentName: string | null
  title: string
}

export interface YeucaMinisterAdminItem {
  id: string
  username: string
  displayName: string
  departmentName: string
  title: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface YeucaAuditLogItem {
  id: string
  actorAdminId: string | null
  actorUsername: string | null
  actorDisplayName: string | null
  action: string
  entityType: string
  entityId: string | null
  requestId: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface YeucaAuditLogsPayload {
  items: YeucaAuditLogItem[]
  total: number
  page: number
  pageSize: number
}

export interface YeucaGiteaProbeResult {
  configured: boolean
  reachable: boolean
  adminTokenValid: boolean
  adminLogin: string
  version: string
  requireSigninView: boolean
  disableRegistration: boolean
  totalGiteaUsers: number | null
  checkedAt: string
  error: string
}

export interface YeucaAdminOverviewPayload {
  adminScope: YeucaAdminScopePayload
  settings: YeucaSiteSettings
  posts: YeucaPostItem[]
  projects: YeucaProjectItem[]
  activities: YeucaAdminActivityItem[]
  members: YeucaMemberItem[]
  recruit: YeucaRecruitAdminConfig
  gitea: YeucaGiteaAdminOverview
  stats: {
    publishedNews: number
    publishedResources: number
    publishedProjects: number
    publishedActivities: number
    recruitOpen: boolean
    recruitSubmissions: number
    totalMembers: number
    activeMembers: number
    pendingMembers: number
    gitSyncedMembers: number
  }
}

/* ---------------- 访问记录 ---------------- */

export type YeucaVisitRange = '24h' | '7d' | '30d'

export interface YeucaVisitListItem {
  id: string
  createdAt: number
  ip: string
  locationLabel: string
  action: string
  path: string
  method: string
  status: number | null
  durationMs: number | null
  userAgent: string
  botName: string
  isBot: boolean
  referer: string
  banned: boolean
}

export interface YeucaVisitsPayload {
  range: YeucaVisitRange
  retentionDays: number
  summary: {
    hits: number
    pageViews: number
    browsers: number
    botHits: number
    botRate: number
    ips: number
    visitors: number
    series: Array<{ label: string, hits: number }>
    topPaths: Array<{ path: string, hits: number, ips: number, lastAt: number }>
    topIps: Array<{
      ip: string
      hits: number
      paths: number
      lastAt: number
      isBot: boolean
      botName: string
      locationLabel: string
      banned: boolean
    }>
    bursts: Array<{ ip: string, hits: number, lastAt: number, banned: boolean }>
    bans: Array<{ ip: string, reason: string, hits: number, expiresAt: number | null }>
  }
  rows: YeucaVisitListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    pages: number
  }
}

/* ---------------- 校园寻宝联立管理 ---------------- */

export type YeucaTreasurePointKind = 'chest' | 'oculus' | 'finish' | 'taffy' | 'classroom'
export type YeucaTreasureVerifyMode = 'gps_answer' | 'gps_only' | 'answer_or_trial'
export type YeucaTreasureRegion = 'new' | 'old'

export interface YeucaTreasureConfigItem {
  id: string
  enabled: boolean
  title: string
  subtitle: string
  goalCount: number
  requireMember: boolean
  updatedAt: string
}

export interface YeucaTreasurePointAdminItem {
  id: string
  name: string
  alias: string
  kind: YeucaTreasurePointKind
  deptName: string
  landmark: string
  room: string
  region: YeucaTreasureRegion
  lng: number
  lat: number
  radiusMeters: number
  verifyMode: YeucaTreasureVerifyMode
  clue: string
  question: string
  answer: string
  characterKey: string
  glyph: string
  sortOrder: number
  isPublished: boolean
  canEdit: boolean
  stampCount: number
  updatedAt: string
}

export interface YeucaTreasurePointPublicItem {
  id: string
  name: string
  alias: string
  kind: YeucaTreasurePointKind
  deptName: string
  landmark: string
  room: string
  region: YeucaTreasureRegion
  point: [number, number]
  radiusMeters: number
  verifyMode: YeucaTreasureVerifyMode
  clue: string
  question: string
  character?: string
  glyph?: string
  review: {
    evidence: string
    detail: string
  }
}

export interface YeucaTreasureStampRecord {
  id: string
  pointId: string
  pointName: string
  deptName: string
  actorType: 'yeuca_member' | 'user'
  actorId: string
  actorLabel: string
  verifyMode: string
  distanceMeters: number | null
  collectedAt: string
}

export interface YeucaTreasureLeaderboardItem {
  actorType: 'yeuca_member' | 'user'
  actorId: string
  actorLabel: string
  departmentName: string
  stampCount: number
  finishCollected: boolean
  lastCollectedAt: string
}

export interface YeucaTreasureAdminOverview {
  config: YeucaTreasureConfigItem
  points: YeucaTreasurePointAdminItem[]
  recentStamps: YeucaTreasureStampRecord[]
  leaderboard: YeucaTreasureLeaderboardItem[]
  stats: {
    totalPoints: number
    publishedPoints: number
    totalStamps: number
    participantCount: number
    finishCount: number
  }
}

export interface YeucaTreasurePublicActor {
  authenticated: boolean
  type: 'yeuca_member' | 'user' | null
  label: string
  studentNo?: string
  department?: string
}

export interface YeucaTreasurePublicStatePayload {
  enabled: boolean
  title: string
  subtitle: string
  goalCount: number
  requireMember: boolean
  actor: YeucaTreasurePublicActor
  points: YeucaTreasurePointPublicItem[]
  collectedMap: Record<string, number>
}

export type YeucaTreasureClaimResult
  = { status: 'eligible' | 'outside', distanceMeters: number }
    | { status: 'stale' | 'inaccurate' | 'wrong-answer' | 'goal-unmet' | 'member-required' | 'closed' | 'not-found' }
    | { status: 'collected', collectedAt: number, pointId: string }
