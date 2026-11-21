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

// -- 新声歌手大赛 -------------------------------------------------------------

export interface CompetitionDimension {
  key: string
  label: string
  /** 相对权重；总分为各维度加权平均分 × 维度数（默认等权时即为各项累加）。 */
  weight: number
  /** 该维度自己的满分（复赛评分表：节奏/音准/技巧 20，情感/音色 15，舞台 10）；空 = 用本轮的每维满分。 */
  max?: number
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
  /** 第几届，例如「2026 年 · 第 1 届」。 */
  edition: string
  /** 算平均分时去掉一个最高分和一个最低分（至少 3 位评委才生效）。 */
  trimExtremes: boolean
  /** 1 = 当前届；换届后旧届数据仍留在库里，但界面上只操作当前届。 */
  isCurrent: boolean
  /** 预报名未到场的一键提醒模板。 */
  reminderSubject: string
  /** 邮件模板「加群按钮」跳转的 QQ 群链接，空 = 不显示按钮 */
  qqGroupUrl: string
  reminderBody: string
  /** 赛程：每轮的日期/时间/地点。 */
  schedule: CompetitionScheduleItem[]
  /** 报名表单字段（可改名、可设必填、可整项隐藏）。 */
  formFields: CompetitionFormField[]
  dimensions: CompetitionDimension[]
  maxTotal: number
  createdAt: number
  updatedAt: number
}

export interface CompetitionScheduleItem {
  key: CompetitionRoundKey
  dateLabel: string
  timeLabel: string
  venue: string
  note: string
}

export type CompetitionFormFieldKey
  = | 'name' | 'className' | 'studentNo' | 'phone' | 'email' | 'qq' | 'song' | 'preferredDay'

export interface CompetitionFormField {
  key: CompetitionFormFieldKey
  label: string
  required: boolean
  enabled: boolean
}

export type CompetitionScorePrecision = 'integer' | 'decimal'

export interface CompetitionRound {
  id: string
  key: CompetitionRoundKey
  title: string
  position: number
  status: CompetitionRoundStatus
  judgeCount: number
  /** 本轮晋级下一轮的人数；决赛为 null。复赛为 null 表示名额待定。 */
  advanceCount: number | null
  /** 晋级名单确认时间；空 = 还没确认，不能发结果邮件。 */
  rosterConfirmedAt: number | null
  /** 本轮结果查询通道是否已开（发出结果邮件后自动打开）。 */
  resultQueryOpen: boolean
  /** 打分精度：integer 只能整数；decimal 只能拖滑块，可带一位小数。 */
  scorePrecision: CompetitionScorePrecision
  /** 本轮使用的评分维度；未单独设置时回落到赛事级维度。 */
  dimensions: CompetitionDimension[]
  /** 每维满分：初赛 10（满分 50），复赛/决赛 20（满分 100）。 */
  dimensionMax: number
  /** 本轮满分（各维满分之和，或维度数 × 每维满分）。 */
  maxTotal: number
  /** 本轮算平均分是否去掉一个最高一个最低；空=false 时沿用赛事级设置。 */
  trimExtremes: boolean
  /** 分场天：1 / 2；null = 不分天（复赛、决赛）。 */
  activeDay: number | null
  createdAt: number
  updatedAt: number
}

export interface CompetitionJudge {
  id: string
  roundId: string
  username: string
  displayName: string
  isActive: boolean
  /** 到岗天：1 / 2；null = 两天都在。 */
  day: number | null
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
  /** 选手照片的临时地址（对象存储现签，6 小时）；空 = 还没传。 */
  photoUrl?: string | null
  photoUpdatedAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface CompetitionSinger extends CompetitionSingerPublic {
  studentNo: string | null
  phone: string | null
  email: string | null
  /** QQ 号：结果查询的三要素之一。 */
  qq: string | null
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
  qq: string | null
  song: string | null
  /** 自选参赛日：1 / 2，空 = 没定；实际以现场签到为准。 */
  preferredDay: number | null
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
  /** 结果邮件可插入的图片（存库，随邮件内嵌发送）。 */
  images: CompetitionEmailImage[]
}

/** 邮件图片：后台按活动维护，正文用 [[图片:id]] 占位。 */
export interface CompetitionEmailImage {
  id: string
  filename: string
  mime: string
  byteSize: number
  /** 可直接放进 img src 的地址（预览用）。 */
  url: string
  createdAt: number
}

export interface CompetitionRegistrationStatus {
  open: boolean
  title: string
  edition: string
  schedule: CompetitionScheduleItem[]
  formFields: CompetitionFormField[]
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

export type CompetitionQueueState = 'finished' | 'singing' | 'waiting' | 'skipped' | 'idle' | 'unknown'

/** 选手自己在现场看到的排队情况。 */
export interface CompetitionQueuePosition {
  state: CompetitionQueueState
  /** 前面还有几位（不含正在唱的那位）；演唱中为 0，已结束为 null。 */
  ahead: number | null
  /** 当天的序号（1 起）。 */
  position: number | null
  /** 当天总人数。 */
  total: number
}

/** 叫号台的一行：出场序、姓名、歌曲、班级、当前状态。 */
/** 公开排行页：一行一位选手（含照片与平均分）。 */
export interface CompetitionRankRow {
  entryId: string
  rank: number | null
  position: number
  name: string
  song: string
  className: string
  average: number | null
  scoreCount: number
  photoUrl: string | null
}

export interface CompetitionRankBoard {
  round: { key: string, title: string, status: string }
  maxTotal: number
  rows: CompetitionRankRow[]
  updatedAt: number
}

export interface CompetitionCallBoardRow {
  position: number
  name: string
  song: string
  className: string
  state: CompetitionQueueState
  /** 前面还有几位（不含正在唱的那位）。 */
  ahead: number | null
}

/** 免登录叫号台：只露出叫号要用的信息，不含电话、邮箱、评分。 */
export interface CompetitionCallBoard {
  round: {
    key: string
    title: string
    status: CompetitionRoundStatus
    activeDay: 1 | 2 | null
  }
  total: number
  current: CompetitionCallBoardRow | null
  next: CompetitionCallBoardRow | null
  rows: CompetitionCallBoardRow[]
  updatedAt: number
}

export interface CompetitionEntryAccompaniment {
  name: string
  url: string
  size: number | null
  /** 选手上传的原始文件（m4a/wav 等）；导出伴奏包时用它 */
  original?: { name: string, url: string, size: number | null } | null
}

export interface CompetitionRoundEntry {
  id: string
  singer: CompetitionSingerPublic
  /** 本轮出场顺序（复赛/决赛为随机抽签结果）。 */
  sortOrder: number
  /** 分场天：1 / 2；null = 未分配。 */
  contestDay: number | null
  /** 现场签到时间；null = 还没到场（评委看不到、不占排队位置）。 */
  checkedInAt: number | null
  /** 这一轮实际演唱的曲目；空 = 用选手库里登记的 song */
  song: string | null
  /** 这一轮上传的伴奏；复赛起使用，空 = 还没传。 */
  accompaniment: CompetitionEntryAccompaniment | null
  /** 最近一次上传/更换伴奏的时间（毫秒），没传过为 null */
  accompanimentUpdatedAt: number | null
  /** 1 = 已确认晋级下一轮，0 = 未晋级，null = 还没确认。 */
  advanced: number | null
  advancedFromRank: number | null
  average: number | null
  scoreCount: number
  rank: number | null
  /** 已结束且进入本轮前 N 名。 */
  qualified: boolean
  /** 本轮已结束但没有任何评委打分，按弃权处理。 */
  forfeited: boolean
  /** 顺序评分下的现场状态：已唱完 / 正在唱 / 排队 / 未开始。 */
  queueState?: CompetitionQueueState
  /** 排队时前面还有几位（不含正在唱的那位）；其余状态为 null。 */
  ahead?: number | null
  /** 本人在当天的序号（1 起）；未分天或不在当天为 null。 */
  queuePosition?: number | null
}

/**
 * 晋级名单的一行：谁在候选里、当前是否勾选、排第几。
 * 名单微调时后台只改 `advanced`，确认后才落库并生成下一轮名单。
 */
export interface CompetitionAdvanceRow {
  entryId: string
  singer: CompetitionSingerPublic
  average: number | null
  scoreCount: number
  rank: number | null
  advanced: boolean
}

/** 结果查询回执状态。 */
export interface CompetitionReceiptState {
  singerName: string
  roundKey: CompetitionRoundKey
  roundTitle: string
  confirmedAt: number | null
}

/** 三要素查到的一条结果：正文是发出去的那封邮件。 */
export interface CompetitionResultLookup {
  singerName: string
  singerSong: string
  roundKey: CompetitionRoundKey
  roundTitle: string
  subject: string
  body: string
  receiptToken: string
  receipt: CompetitionReceiptState
}

export interface CompetitionRoundView extends CompetitionRound {
  entries: CompetitionRoundEntry[]
  judges: CompetitionJudge[]
  scores: CompetitionScore[]
  maxTotal: number
  hasScores: boolean
  /** 后台显式开启了顺序评分（评委只能评当前这位）。 */
  sequential: boolean
  /** 顺序评分：当前这位选手与全场提交情况；未开启顺序评分时为 null。 */
  current: CompetitionCurrentSinger | null
}

/**
 * 顺序评分（一位选手评完、全员提交才切下一位）的当前状态。
 *
 * `pending` 是本场启用中、还没给这位选手提交分数的评委名；后台据此拦住
 * 「下一位」，评委端据此显示等待条。
 */
export interface CompetitionCurrentSinger {
  entryId: string
  singer: CompetitionSingerPublic
  /** 本轮出场序号，从 1 开始。 */
  index: number
  /** 本轮总人数。 */
  total: number
  /** 本场到岗、要收票的评委人数（分天时只算当天的）。 */
  judgeTotal: number
  /** 当前所处赛程天：1 / 2；null = 不分天。 */
  day: number | null
  /** 逐个评委的提交状态，按评委顺序排列（评委进度表用）。 */
  judges: CompetitionJudgeProgress[]
  submitted: string[]
  pending: string[]
  allSubmitted: boolean
}

/** 顺序评分进度表的一行：某位启用中的评委有没有给当前这位选手交分。 */
export interface CompetitionJudgeProgress {
  id: string
  name: string
  submitted: boolean
}

export interface CompetitionAdminPayload {
  event: CompetitionEvent
  singers: CompetitionSinger[]
  rounds: CompetitionRoundView[]
  email: CompetitionEmailState
  preRegistrations: CompetitionPreRegistration[]
  /** 每轮的晋级名单（只有结束时才有内容）。 */
  advance: Record<string, CompetitionAdvanceRow[]>
  /** 每轮结果邮件的「收到」回执。 */
  receipts: Record<string, CompetitionReceiptRow[]>
  /** 历届（含当前届）：换届后可切回查看。 */
  editions: CompetitionEdition[]
}

export interface CompetitionReceiptRow {
  singerId: string
  name: string
  email: string | null
  confirmedAt: number | null
}

export interface CompetitionEdition {
  id: string
  label: string
  isCurrent: boolean
  singerCount: number
  createdAt: number
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
    /** 后台显式开启了顺序评分；false 时评委可自由选人打分。 */
    sequential: boolean
    /** 打分精度：integer 整数；decimal 小数（只能拖滑块）。 */
    scorePrecision: CompetitionScorePrecision
    /** 本轮评分维度（各轮可以不同）。 */
    dimensions: CompetitionDimension[]
    /** 每维满分：初赛 10、复赛/决赛 20。 */
    dimensionMax: number
    /** 本轮满分 = 维度数 × 每维满分。 */
    maxTotal: number
  }
  singers: Array<CompetitionSingerPublic & {
    sortOrder: number
    advancedFromRank: number | null
    score: CompetitionScore | null
  }>
  /** 本轮结果：本轮结束后才返回。 */
  roundResults: CompetitionRoundEntry[] | null
  /** 顺序评分：当前这位选手与全场提交情况；未开启顺序评分时为 null。 */
  current: CompetitionCurrentSinger | null
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
