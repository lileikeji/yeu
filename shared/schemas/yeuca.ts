import { z } from 'zod'

const SAFE_LINK_REGEX = /^(?:https?:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)$/i

const safeOptionalLinkSchema = z.string().trim().max(400).refine(
  value => !value || SAFE_LINK_REGEX.test(value),
  '仅支持 http(s):// 或本站 / 开头路径'
)

export const yeucaDepartmentSchema = z.object({
  id: z.string().trim().min(1).max(64),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(40),
  lead: z.string().trim().max(40).default(''),
  isFeatured: z.boolean().default(false),
  acceptingRecruit: z.boolean().default(true),
  summary: z.string().trim().min(1).max(400),
  focusList: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  tools: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  recentTopic: z.string().trim().max(120).default(''),
  recruitDesc: z.string().trim().max(260).default('')
})

export const yeucaGalleryItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  caption: z.string().trim().max(240).default(''),
  imageUrl: z.string().trim().min(1).max(300)
})

export const yeucaCompetitionItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  track: z.string().trim().min(1).max(40),
  dept: z.string().trim().min(1).max(80),
  site: z.string().trim().max(80).default(''),
  href: safeOptionalLinkSchema.default('')
})

export const yeucaFaqItemSchema = z.object({
  q: z.string().trim().min(1).max(200),
  a: z.string().trim().min(1).max(1200)
})

export const yeucaAnnouncementSchema = z.object({
  enabled: z.boolean().default(false),
  tag: z.string().trim().max(30).default('公告'),
  text: z.string().trim().max(280).default(''),
  href: safeOptionalLinkSchema.default('')
})

export const yeucaHomeHeroSchema = z.object({
  badge: z.string().trim().max(60).default(''),
  headline: z.string().trim().max(160).default(''),
  joinBtnText: z.string().trim().max(40).default(''),
  qrBtnText: z.string().trim().max(40).default(''),
  guideCardNote: z.string().trim().max(300).default('')
})

export const yeucaHomeEntryCardSchema = z.object({
  id: z.string().trim().min(1).max(40),
  badge: z.string().trim().max(40).default(''),
  title: z.string().trim().min(1).max(80),
  desc: z.string().trim().max(240).default(''),
  href: safeOptionalLinkSchema.default('/'),
  cta: z.string().trim().max(40).default('查看 →'),
  enabled: z.boolean().default(true)
})

export const yeucaFeatureFlagsSchema = z.object({
  showGitNav: z.boolean().default(true),
  showMirrorsNav: z.boolean().default(true),
  showToolsNav: z.boolean().default(true),
  showMemberEntry: z.boolean().default(true),
  gitGateHint: z.string().trim().max(300).default(''),
  mirrorNotice: z.string().trim().max(400).default('')
})

export const yeucaAiWorkflowStepSchema = z.object({
  id: z.string().trim().min(1).max(40),
  step: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(80),
  role: z.string().trim().max(240).default(''),
  logic: z.string().trim().max(360).default(''),
  pitfall: z.string().trim().max(320).default(''),
  sample: z.string().trim().max(400).default('')
})

export const yeucaSeasonalRhythmSchema = z.object({
  phase: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().min(1).max(400),
  tags: z.array(z.string().trim().min(1).max(30)).max(6).default([])
})

export const yeucaTimelineNodeSchema = z.object({
  period: z.string().trim().min(1).max(40),
  tag: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(100),
  detail: z.string().trim().min(1).max(400)
})

export const yeucaChecklistRowSchema = z.object({
  item: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(300)
})

export const yeucaPracticeTopicSchema = z.object({
  dept: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  stack: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  desc: z.string().trim().min(1).max(360)
})

export const yeucaStarterLinkSchema = z.object({
  dept: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(120),
  host: z.string().trim().max(120).default(''),
  url: safeOptionalLinkSchema.refine(Boolean, '链接地址不能为空'),
  note: z.string().trim().max(320).default('')
})

export const yeucaMirrorEntrySchema = z.object({
  id: z.string().trim().min(1).max(60),
  category: z.enum(['语言与包', 'AI 与模型', '系统与容器']).default('语言与包'),
  name: z.string().trim().min(1).max(80),
  upstream: z.string().trim().min(1).max(160),
  note: z.string().trim().max(240).default(''),
  cmd: z.string().trim().min(1).max(500),
  snippetTitle: z.string().trim().max(100).optional(),
  snippet: z.string().trim().max(2000).optional(),
  helpUrl: safeOptionalLinkSchema.default(''),
  helpHost: z.string().trim().max(120).default('')
})

export const yeucaScriptOptionSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  ps1: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  sh: z.array(z.string().trim().min(1).max(500)).min(1).max(8)
})

export const yeucaFriendLinkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  href: safeOptionalLinkSchema.refine(Boolean, '友链地址不能为空')
})

export const yeucaSiteExtrasSchema = z.object({
  heroImageUrl: z.string().trim().max(300).optional(),
  gallery: z.array(yeucaGalleryItemSchema).max(24).optional(),
  competitions: z.array(yeucaCompetitionItemSchema).max(24).optional(),
  faqs: z.array(yeucaFaqItemSchema).max(24).optional(),
  flagshipNote: z.string().trim().max(400).optional(),
  homeAnnouncement: yeucaAnnouncementSchema.optional(),
  homeHero: yeucaHomeHeroSchema.optional(),
  homeEntries: z.array(yeucaHomeEntryCardSchema).max(8).optional(),
  featureFlags: yeucaFeatureFlagsSchema.optional(),
  aiWorkflowSteps: z.array(yeucaAiWorkflowStepSchema).max(12).optional(),
  seasonalRhythm: z.array(yeucaSeasonalRhythmSchema).max(12).optional(),
  archiveTimeline: z.array(yeucaTimelineNodeSchema).max(20).optional(),
  volatileChecklist: z.array(yeucaChecklistRowSchema).max(20).optional(),
  practiceTopics: z.array(yeucaPracticeTopicSchema).max(20).optional(),
  starterLinks: z.array(yeucaStarterLinkSchema).max(30).optional(),
  mirrors: z.array(yeucaMirrorEntrySchema).max(40).optional(),
  scriptOptions: z.array(yeucaScriptOptionSchema).max(30).optional(),
  footerNote: z.string().trim().max(400).optional(),
  friendLinks: z.array(yeucaFriendLinkSchema).max(20).optional()
})

export const updateYeucaSettingsSchema = z.object({
  campus: z.string().trim().min(1).max(80),
  tagline: z.string().trim().min(1).max(160),
  intro: z.string().trim().min(1).max(800),
  recruitNote: z.string().trim().max(400).default(''),
  contactNote: z.string().trim().max(400).default(''),
  groupQrUrl: z.string().trim().max(300).default(''),
  departments: z.array(yeucaDepartmentSchema).min(1).max(24),
  extras: yeucaSiteExtrasSchema.optional()
})

export const createYeucaPostSchema = z.object({
  kind: z.enum(['news', 'resource']).default('news'),
  deptName: z.string().trim().min(1).max(40),
  category: z.string().trim().max(40).default(''),
  title: z.string().trim().min(1).max(140),
  summary: z.string().trim().min(1).max(400),
  body: z.string().trim().min(1).max(20000),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  pinned: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'archived']).default('draft')
})

export const updateYeucaPostSchema = createYeucaPostSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: '至少需要提供一个更新字段' }
)

export const createYeucaProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  deptName: z.string().trim().min(1).max(40),
  track: z.string().trim().min(1).max(40),
  status: z.enum(['active', 'maintaining', 'planning']).default('active'),
  summary: z.string().trim().min(1).max(400),
  highlights: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
  stack: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  previewImage: z.string().trim().max(300).default(''),
  repoUrl: safeOptionalLinkSchema.default(''),
  demoUrl: safeOptionalLinkSchema.default(''),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isPublished: z.boolean().default(true)
})

export const updateYeucaProjectSchema = createYeucaProjectSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: '至少需要提供一个更新字段' }
)

/* ---------------- 协会成员管理、导入与注册登录校验 ---------------- */

export const RESERVED_GIT_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'git',
  'api',
  'www',
  'yeuca',
  'yeuca-admin',
  'ghost',
  'support',
  'security',
  'user',
  'explore',
  'assets',
  'avatars',
  'repo',
  'milestones',
  'notifications'
])

export const studentNoSchema = z.string()
  .trim()
  .min(4, '学号至少 4 位')
  .max(32, '学号不超过 32 位')
  .regex(/^[a-zA-Z0-9_-]{4,32}$/, '学号仅支持字母、数字、下划线或短横线')

export const gitUsernameSchema = z.string()
  .trim()
  .min(3, 'Git 用户名至少 3 个字符')
  .max(32, 'Git 用户名不超过 32 个字符')
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,30}[a-zA-Z0-9])$/, 'Git 用户名需以字母或数字开头结尾，仅可包含字母数字和 . _ -')
  .refine(value => !value.includes('..') && !RESERVED_GIT_USERNAMES.has(value.toLowerCase()), '该 Git 用户名不可用或为系统保留词')

export const memberPasswordSchema = z.string()
  .min(8, '密码至少需要 8 位')
  .max(64, '密码不能超过 64 位')

export const createYeucaMemberSchema = z.object({
  studentNo: studentNoSchema,
  name: z.string().trim().min(1, '请填写姓名').max(40),
  gradeMajorClass: z.string().trim().max(80).default(''),
  department: z.string().trim().max(40).default(''),
  roleTitle: z.string().trim().min(1).max(32).default('会员'),
  term: z.string().trim().max(32).default(''),
  phone: z.string().trim().max(32).default(''),
  qq: z.string().trim().max(32).default(''),
  email: z.string().trim().max(120).refine(v => !v || z.email().safeParse(v).success, '邮箱格式不正确').default(''),
  gitUsername: z.union([gitUsernameSchema, z.literal('')]).default(''),
  memberStatus: z.enum(['pending', 'active', 'disabled']).default('pending'),
  initialPassword: z.union([memberPasswordSchema, z.literal('')]).optional(),
  bio: z.string().trim().max(300).default(''),
  skills: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  notes: z.string().trim().max(400).default('')
})

export const updateYeucaMemberSchema = createYeucaMemberSchema
  .omit({ initialPassword: true })
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: '至少需要提供一个更新字段' })

export const importYeucaMemberItemSchema = z.object({
  studentNo: studentNoSchema,
  name: z.string().trim().min(1).max(40),
  gradeMajorClass: z.string().trim().max(80).default(''),
  department: z.string().trim().max(40).default(''),
  roleTitle: z.string().trim().max(32).default('会员'),
  term: z.string().trim().max(32).default(''),
  phone: z.string().trim().max(32).default(''),
  qq: z.string().trim().max(32).default(''),
  email: z.string().trim().max(120).default(''),
  gitUsername: z.string().trim().max(32).default(''),
  memberStatus: z.enum(['pending', 'active', 'disabled']).optional(),
  notes: z.string().trim().max(400).default('')
})

export const importYeucaMembersSchema = z.object({
  mode: z.enum(['skip_existing', 'update_existing']).default('update_existing'),
  items: z.array(importYeucaMemberItemSchema).min(1, '请至少提供一条成员记录').max(1000)
})

export const resetYeucaMemberPasswordSchema = z.object({
  newPassword: memberPasswordSchema,
  activateIfPending: z.boolean().default(true)
})

export const memberVerifyEligibilitySchema = z.object({
  studentNo: studentNoSchema,
  name: z.string().trim().min(1, '请填写姓名').max(40)
})

export const memberRegisterSchema = z.object({
  studentNo: studentNoSchema,
  name: z.string().trim().min(1, '请填写姓名').max(40),
  gitUsername: gitUsernameSchema,
  email: z.string().trim().max(120).refine(v => !v || z.email().safeParse(v).success, '请输入有效邮箱').default(''),
  password: memberPasswordSchema,
  gradeMajorClass: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  qq: z.string().trim().max(32).optional(),
  bio: z.string().trim().max(300).optional()
})

export const memberLoginSchema = z.object({
  account: z.string().trim().min(1, '请输入学号或 Git 用户名').max(64),
  password: z.string().min(1, '请输入密码').max(128)
})

export const memberUpdateProfileSchema = z.object({
  gradeMajorClass: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  qq: z.string().trim().max(32).optional(),
  email: z.string().trim().max(120).refine(v => !v || z.email().safeParse(v).success, '邮箱格式不正确').optional(),
  bio: z.string().trim().max(300).optional(),
  skills: z.array(z.string().trim().min(1).max(32)).max(12).optional()
})

export const memberChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码').max(128),
  newPassword: memberPasswordSchema
})

/* ---------------- 协会直管活动 & 招新审批校验 ---------------- */

export const createYeucaActivitySchema = z.object({
  title: z.string().trim().min(1, '请填写活动标题').max(140),
  deptName: z.string().trim().min(1).max(40).default('协会全体'),
  category: z.string().trim().min(1).max(40).default('技术培训'),
  summary: z.string().trim().min(1, '请填写活动简介').max(400),
  body: z.string().trim().max(20000).default(''),
  placeName: z.string().trim().min(1).max(120).default('校内场地 / 群内通知'),
  room: z.string().trim().max(80).default(''),
  startsAt: z.string().trim().min(1, '请选择开始时间'),
  endsAt: z.union([z.string().trim(), z.null()]).optional(),
  allowRegistration: z.boolean().default(true),
  maxParticipants: z.number().int().min(0).max(5000).default(0),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  photos: z.array(z.string().trim().min(1).max(300)).max(9).default([])
})

export const updateYeucaActivitySchema = createYeucaActivitySchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: '至少需要提供一个更新字段' }
)

export const updateYeucaRecruitConfigSchema = z.object({
  open: z.boolean(),
  title: z.string().trim().min(1).max(120),
  slogan: z.string().trim().max(240).default(''),
  intro: z.string().trim().max(1200).default('')
})

export const approveRecruitSubmissionsSchema = z.object({
  submissionIds: z.array(z.string().uuid()).min(1).max(200),
  defaultDepartment: z.string().trim().max(40).default(''),
  defaultTerm: z.string().trim().max(32).default('')
})

/* ---------------- 访问记录与 IP 封禁 ---------------- */

export const yeucaVisitBanSchema = z.object({
  ip: z.string().trim().min(3, '请填写 IP').max(64),
  action: z.enum(['ban', 'unban']).default('ban'),
  reason: z.string().trim().max(200).default(''),
  hours: z.number().int().min(1).max(24 * 365).optional()
})

/* ---------------- 计协部长分权账号与本部门自管理 ---------------- */

export const yeucaMinisterUsernameSchema = z.string()
  .trim()
  .min(2, '登录账号至少 2 个字符')
  .max(40, '登录账号不超过 40 个字符')
  .refine(value => !/\s/.test(value), '登录账号不能包含空格')

export const createYeucaMinisterSchema = z.object({
  departmentName: z.string().trim().min(1, '请选择所属部门').max(40),
  username: yeucaMinisterUsernameSchema.optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
  title: z.enum(['部长', '副部长']).default('部长')
})

export const updateYeucaMinisterSchema = z.object({
  isActive: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
  departmentName: z.string().trim().min(1).max(40).optional(),
  title: z.enum(['部长', '副部长']).optional(),
  displayName: z.string().trim().min(1).max(40).optional()
}).refine(
  value => Object.keys(value).length > 0,
  { message: '至少需要提供一个更新字段' }
)

export const updateYeucaOwnDepartmentSchema = z.object({
  lead: z.string().trim().max(40).optional(),
  summary: z.string().trim().min(1, '请填写部门简介').max(240).optional(),
  focusList: z.array(z.string().trim().min(1).max(120)).min(1).max(6).optional(),
  tools: z.array(z.string().trim().min(1).max(40)).min(1).max(12).optional(),
  recentTopic: z.string().trim().max(120).optional(),
  acceptingRecruit: z.boolean().optional(),
  recruitDesc: z.string().trim().max(240).optional()
}).refine(
  value => Object.keys(value).length > 0,
  { message: '至少需要修改一个部门字段' }
)

/* ---------------- 校园寻宝动态配置与点位管理 ---------------- */

export const yeucaTreasureConfigSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1, '请填写寻宝活动标题').max(120),
  subtitle: z.string().trim().max(240).default(''),
  goalCount: z.number().int().min(1).max(30),
  requireMember: z.boolean()
})

export const yeucaTreasurePointSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1, '请填写点位名称').max(80),
  alias: z.string().trim().max(80).default(''),
  kind: z.enum(['chest', 'oculus', 'finish', 'taffy', 'classroom']).default('chest'),
  deptName: z.string().trim().min(1).max(40).default('协会全体'),
  landmark: z.string().trim().min(1, '请填写地标名称').max(80),
  room: z.string().trim().max(80).default(''),
  coordType: z.enum(['wgs84', 'gcj02']).default('wgs84'),
  lng: z.number().min(118.4).max(118.9),
  lat: z.number().min(24.9).max(25.3),
  radiusMeters: z.number().int().min(5).max(500).default(20),
  verifyMode: z.enum(['gps_answer', 'gps_only', 'answer_or_trial']).default('gps_answer'),
  clue: z.string().trim().min(1, '请填写寻宝线索').max(300),
  question: z.string().trim().max(200).default(''),
  answer: z.string().trim().max(64).default(''),
  characterKey: z.string().trim().max(32).default(''),
  glyph: z.string().trim().max(8).default(''),
  sortOrder: z.number().int().min(0).max(9999).default(100),
  isPublished: z.boolean().default(true)
}).superRefine((value, ctx) => {
  if (value.verifyMode !== 'gps_only' && !value.question.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['question'],
      message: '需答题/暗号模式必须填写题目'
    })
  }
})
