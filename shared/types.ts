export type PublicationStatus = 'draft' | 'published' | 'archived'
export type CoordinateReferenceSystem = 'WGS84' | 'GCJ-02' | 'BD-09'

export interface Category {
  id: string
  slug: string
  name: string
  icon: string
  scope: string
}

export interface SourceRef {
  id: string
  title: string
  url: string
  platform: string
  isOfficial: boolean
  accessedAt: string
}

export interface Place {
  id: string
  slug: string
  name: string
  summary: string
  body?: string
  scope: 'campus' | 'nearby'
  type: string
  category?: Category | null
  address?: string | null
  campusArea?: string | null
  floor?: string | null
  room?: string | null
  longitude: number
  latitude: number
  coordinateSystem: CoordinateReferenceSystem
  openingHours?: string | null
  phone?: string | null
  website?: string | null
  externalMapUrl?: string | null
  imageUrl?: string | null
  isOfficial: boolean
  isFeatured: boolean
  status: PublicationStatus
  lastVerifiedAt?: string | null
  sources?: SourceRef[]
}

export interface Guide {
  id: string
  slug: string
  title: string
  summary: string
  body?: string
  category?: Category | null
  audience?: string | null
  readMinutes?: number
  isFeatured: boolean
  status: PublicationStatus
  lastVerifiedAt?: string | null
  sources?: SourceRef[]
}

export interface ProcedureStep {
  id: string
  order: number
  title: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  timeText?: string | null
  place?: Place | null
  department?: Department | null
  actionUrl?: string | null
}

export interface ProcedureMaterial {
  id: string
  order: number
  name: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  isRequired: boolean | null
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  place?: Place | null
  department?: Department | null
}

export interface ProcedureItem {
  id: string
  slug: string
  title: string
  summary: string
  body?: string
  category?: Category | null
  audience: Array<'undergraduate' | 'transfer'>
  method: 'online' | 'offline' | 'mixed'
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  statusText: string
  processingTime?: string | null
  deadlineText?: string | null
  startsAt?: string | null
  endsAt?: string | null
  validFrom?: string | null
  validUntil?: string | null
  department?: Department | null
  places?: Place[]
  steps?: ProcedureStep[]
  materials?: ProcedureMaterial[]
  status: PublicationStatus
  lastVerifiedAt?: string | null
  sources?: SourceRef[]
}

export interface Department {
  id: string
  slug: string
  name: string
  shortName?: string | null
  summary: string
  body?: string
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  officeHours?: string | null
  places?: Place[]
  status: PublicationStatus
  lastVerifiedAt?: string | null
}

export interface Club {
  id: string
  slug: string
  name: string
  summary: string
  body?: string
  category?: Category | null
  recruitmentPeriod?: string | null
  activitySchedule?: string | null
  contactMethod?: string | null
  logoUrl?: string | null
  status: PublicationStatus
  lastVerifiedAt?: string | null
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page?: number
  pageSize?: number
}

export interface HomePayload {
  featuredPlaces: Place[]
  featuredGuides: Guide[]
  featuredProcedures: ProcedureItem[]
  stats: {
    places: number
    guides: number
    organizations: number
    verifiedAt: string | null
  }
}

export type RecruitFieldType = 'text' | 'textarea' | 'select' | 'multiselect'

/** Keys persisted as dedicated submission columns for search and export. */
export type RecruitFieldKey
  = | 'name'
    | 'gender'
    | 'studentNo'
    | 'major'
    | 'className'
    | 'phone'
    | 'qq'
    | 'departments'
    | 'isLeagueMember'

export interface RecruitFormField {
  /** Stable key, reused as the submission data key and export column key. */
  key: string
  label: string
  type: RecruitFieldType
  required: boolean
  /** Options for select / multiselect fields. */
  options?: string[]
  /** Per-option long description (部门介绍), keyed by option value. */
  optionDetails?: Record<string, string>
  placeholder?: string
}

export interface RecruitPaymentConfig {
  enabled: boolean
  wechatImage: string | null
  alipayImage: string | null
  note: string
}

export interface RecruitDocMapping {
  /** Exact cell text inside the uploaded docx template. */
  label: string
  /** Form field key whose value fills the empty cell to the right of the label. */
  fieldKey: string
}

export interface RecruitDocConfig {
  mappings: RecruitDocMapping[]
  /** Multi-select field rendered as marks (e.g. √) next to matching option cells. */
  multiSelect?: { fieldKey: string, mark: string } | null
}

export interface RecruitExportColumn {
  key: string
  label: string
}

export type RecruitFormStatus = 'open' | 'closed'

export interface RecruitFormConfig {
  contentId: string
  clubName: string
  clubSlug: string
  title: string
  slogan: string
  intro: string
  status: RecruitFormStatus
  fields: RecruitFormField[]
  doc: RecruitDocConfig
  exportColumns: RecruitExportColumn[]
  templateName: string | null
  templateLabels: string[]
  views: number
  payment: RecruitPaymentConfig
  updatedAt: number | null
}

export type RecruitSubmissionValue = string | string[]

export interface RecruitReferrer {
  id: string
  name: string
  code: string
  isActive: boolean
  views: number
  createdAt: number
}

export interface RecruitSubmission {
  id: string
  formId: string
  referrerName: string | null
  paymentConfirmed: boolean | null
  createdAt: number
  data: Record<string, RecruitSubmissionValue>
  name: string
  gender: string | null
  studentNo: string | null
  major: string | null
  className: string | null
  phone: string | null
  qq: string | null
  departments: string | null
  isLeagueMember: string | null
}

export interface RecruitSubmissionPage {
  items: RecruitSubmission[]
  total: number
  page: number
  pageSize: number
}

export interface RecruitStatBucket {
  label: string
  count: number
}

export interface RecruitSubmissionStats {
  total: number
  paidCount: number
  missingCount: number
  daily: RecruitStatBucket[]
  departments: RecruitStatBucket[]
  classes: RecruitStatBucket[]
  colleges: RecruitStatBucket[]
}

// -- 新生歌手大赛 -------------------------------------------------------------

export interface CompetitionDimension {
  key: string
  label: string
  /** 相对权重；总分为各维度加权平均分 × 维度数（默认等权时即为各项累加）。 */
  weight: number
}

export type CompetitionRoundKey = 'prelim' | 'semi' | 'final'
export type CompetitionRoundStatus = 'draft' | 'open' | 'closed'

export interface CompetitionEvent {
  id: string
  contentId: string
  clubName: string
  clubSlug: string
  title: string
  /** 现场扫码登记入口开关；关闭后公开登记页只读。 */
  registrationOpen: boolean
  dimensions: CompetitionDimension[]
  maxTotal: number
  createdAt: number
  updatedAt: number
}

export interface CompetitionRound {
  id: string
  key: CompetitionRoundKey
  title: string
  position: number
  status: CompetitionRoundStatus
  judgeCount: number
  /** 本轮晋级下一轮的人数；决赛为 null。复赛为 null 表示名额待定。 */
  advanceCount: number | null
  createdAt: number
  updatedAt: number
}

export interface CompetitionJudge {
  id: string
  roundId: string
  username: string
  displayName: string
  isActive: boolean
  lastLoginAt: number | null
  createdAt: number
  scoreCount: number
}

export interface CompetitionJudgeCredentials {
  id: string
  username: string
  displayName: string
  password: string
}

/** 评委端可见的选手公开字段；联系方式只进后台。 */
export interface CompetitionSingerPublic {
  id: string
  name: string
  song: string
  className: string | null
  remark: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface CompetitionSinger extends CompetitionSingerPublic {
  studentNo: string | null
  phone: string | null
  email: string | null
  /** admin = 后台录入/导入；form = 现场手填；pre = 预报名确认生成。 */
  source: 'admin' | 'form' | 'pre'
  preRegistrationId: string | null
}

export interface CompetitionPreRegistration {
  id: string
  name: string
  className: string | null
  studentNo: string | null
  phone: string | null
  email: string | null
  song: string | null
  /** 非空 = 已在现大确认为正式报名。 */
  registeredAt: number | null
  createdAt: number
  /** 确认后对应的正式报名选手名（后台展示用）。 */
  registeredSingerName: string | null
}

export type CompetitionEmailSendStatus = 'sent' | 'failed'

export interface CompetitionEmailTemplate {
  roundKey: CompetitionRoundKey
  subject: string
  body: string
}

export interface CompetitionEmailRoundStats {
  sent: number
  failed: number
  lastSentAt: number | null
}

export interface CompetitionEmailSendRecord {
  roundKey: CompetitionRoundKey
  singerId: string | null
  email: string
  status: CompetitionEmailSendStatus
  error: string | null
  createdAt: number
}

export interface CompetitionEmailState {
  templates: Record<CompetitionRoundKey, CompetitionEmailTemplate>
  stats: Record<CompetitionRoundKey, CompetitionEmailRoundStats>
  /** 每个（轮次，选手）最近一次发送记录。 */
  latest: CompetitionEmailSendRecord[]
}

export interface CompetitionRegistrationStatus {
  open: boolean
  title: string
}

export interface CompetitionEmailSendResult {
  sent: number
  failed: number
  skippedNoEmail: number
  skippedAlreadySent: number
  failures: Array<{ name: string, email: string, error: string }>
}

export interface CompetitionScoreDimension {
  key: string
  label: string
  weight: number
  score: number
}

export interface CompetitionScore {
  id: string
  roundId: string
  singerId: string
  judgeId: string
  judgeName: string
  dimensions: CompetitionScoreDimension[]
  total: number
  comment: string
  updatedAt: number
}

export interface CompetitionRoundEntry {
  id: string
  singer: CompetitionSingerPublic
  /** 本轮出场顺序（复赛/决赛为随机抽签结果）。 */
  sortOrder: number
  advancedFromRank: number | null
  average: number | null
  scoreCount: number
  rank: number | null
  /** 已结束且进入本轮前 N 名。 */
  qualified: boolean
  /** 本轮已结束但没有任何评委打分，按弃权处理。 */
  forfeited: boolean
}

export interface CompetitionRoundView extends CompetitionRound {
  entries: CompetitionRoundEntry[]
  judges: CompetitionJudge[]
  scores: CompetitionScore[]
  maxTotal: number
  hasScores: boolean
}

export interface CompetitionAdminPayload {
  event: CompetitionEvent
  singers: CompetitionSinger[]
  rounds: CompetitionRoundView[]
  email: CompetitionEmailState
  preRegistrations: CompetitionPreRegistration[]
}

export interface CompetitionJudgePayload {
  event: {
    id: string
    title: string
    dimensions: CompetitionDimension[]
    maxTotal: number
  }
  judge: {
    id: string
    username: string
    displayName: string
    roundId: string
  }
  round: {
    id: string
    key: CompetitionRoundKey
    title: string
    status: CompetitionRoundStatus
    advanceCount: number | null
  }
  singers: Array<CompetitionSingerPublic & {
    sortOrder: number
    advancedFromRank: number | null
    score: CompetitionScore | null
  }>
  /** 本轮结果：本轮结束后才返回。 */
  roundResults: CompetitionRoundEntry[] | null
  /** 决赛结果：决赛结束后所有评委都能看到。 */
  finalResults: CompetitionRoundEntry[] | null
  finalRound: {
    title: string
    status: CompetitionRoundStatus
  } | null
  progress: {
    scored: number
    total: number
  }
}
