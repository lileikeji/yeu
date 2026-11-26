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

export type CompetitionRoundKey = 'prelim' | 'semi' | 'final' | 'final2'
/** 结果邮件只覆盖前三轮；决赛第二轮沿用决赛第一轮的结果，不单独发通知。 */
export type CompetitionEmailRoundKey = 'prelim' | 'semi' | 'final'
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
  /** 隐藏赛制复活开关：开启后决赛第一轮 1v1 的败者可复活进第二轮。 */
  revivalEnabled: boolean
  /** 复活名额（1–6），revivalEnabled 为 false 时不生效。 */
  revivalSlots: number
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

/** 决赛晋级方式：rank = 整轮前六；duel = 抽签 1v1，每组胜者进第二轮。 */
export type CompetitionAdvanceMode = 'rank' | 'duel'

export interface CompetitionRound {
  id: string
  key: CompetitionRoundKey
  title: string
  position: number
  status: CompetitionRoundStatus
  judgeCount: number
  /** 本轮晋级下一轮的人数；决赛第一轮固定 6，决赛第二轮为 null。复赛为 null 表示名额待定。 */
  advanceCount: number | null
  /** 决赛晋级方式；其他轮次固定 rank。 */
  advanceMode: CompetitionAdvanceMode
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
  roundKey: CompetitionEmailRoundKey
  subject: string
  body: string
}

export interface CompetitionEmailRoundStats {
  sent: number
  failed: number
  lastSentAt: number | null
}

export interface CompetitionEmailSendRecord {
  roundKey: CompetitionEmailRoundKey
  singerId: string | null
  email: string
  status: CompetitionEmailSendStatus
  error: string | null
  createdAt: number
}

export interface CompetitionEmailState {
  templates: Record<CompetitionEmailRoundKey, CompetitionEmailTemplate>
  stats: Record<CompetitionEmailRoundKey, CompetitionEmailRoundStats>
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
  /** 决赛总榜合并后：final2 = 前六（按第二轮排），final1 = 后六（按第一轮排）。 */
  stage?: 'final1' | 'final2' | null
  /** 决赛两首歌与两轮成绩；非决赛榜为 undefined。 */
  firstSong?: string
  secondSong?: string | null
  averageFirst?: number | null
  averageSecond?: number | null
}

/** 决赛两首歌的提交页状态：revision 是乐观锁版本，提交时必须原样回传。 */
export interface CompetitionFinalSongsState {
  singerName: string
  stageTitle: string
  firstSong: string
  secondSong: string
  /** 第一首歌的伴奏（音频，跟初赛/复赛同一套格式）；都走对象存储，播放链接是临时签名地址。 */
  firstAccompaniment: CompetitionEntryAccompaniment | null
  /** 第二首歌的背景视频；没进前六不会用到，但提前一起准备。 */
  secondVideo: CompetitionEntryAccompaniment | null
  revision: number
  editable: boolean
  reason: string
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

export interface CompetitionFinalSongsPair {
  firstSong: string
  secondSong: string
  revision: number
}

/** 人气奖投票状态：关闭 / 未到开始时间 / 进行中 / 已截止。 */
export type CompetitionPopularityStatus = 'disabled' | 'scheduled' | 'open' | 'closed'

/** 人气奖核验模式：公众号口令领专属票券（一人一微信一票） / 免关注设备严格风控降级。 */
export type CompetitionPopularityAuthMode = 'wechat_mp' | 'device_strict'

export interface CompetitionPopularitySettings {
  enabled: boolean
  title: string
  subtitle: string
  /** 空 = 开启后立即生效；单位毫秒。 */
  opensAt: number | null
  closesAt: number | null
  allowChange: boolean
  /** 允许改票的次数；0 = 不能改。 */
  maxChanges: number
  /** 每人最多可投票数；1 = 一人一票（可改票），大于 1 = 可投多票且改票不生效。 */
  votesPerVoter: number
  /** 多票模式下是否允许重复投同一选手；false = 同一选手最多 1 票。 */
  allowRepeatVote: boolean
  qrRotateSeconds: number
  /** 公开页是否展示票数。 */
  showResults: boolean
  /** 大屏取码密钥；只在后台返回。 */
  displayKey: string
  authMode: CompetitionPopularityAuthMode
  wechatAccountName: string
  wechatQrUrl: string
  autoQuarantine: boolean
  aiAutoModerate: boolean
  updatedAt: number
}

export interface CompetitionPopularityCandidate {
  singerId: string
  /** 决赛第一轮出场号，投票页显示「几号选手」。 */
  number: number
  name: string
  className: string | null
  photoUrl: string | null
  /** 决赛第一轮曲目，方便投票人认人。 */
  song: string
  sortOrder: number
}

export interface CompetitionPopularityBallot {
  singerId: string
  /** 同一设备/微信号的第几票（从 0 开始）。 */
  voteIndex: number
  changeCount: number
  version: number
  updatedAt: number
}

export interface CompetitionPopularityResultRow {
  singerId: string
  name: string
  count: number
  percent: number
}

export interface CompetitionPopularityPublicState {
  title: string
  subtitle: string
  status: CompetitionPopularityStatus
  opensAt: number | null
  closesAt: number | null
  allowChange: boolean
  maxChanges: number
  qrRotateSeconds: number
  showResults: boolean
  candidates: CompetitionPopularityCandidate[]
  totalVotes: number
  myBallot: CompetitionPopularityBallot | null
  /** 当前设备/微信号已投的有效选票（多票模式下列表长度即已投数）。 */
  myBallots: CompetitionPopularityBallot[]
  /** 每人最多可投票数。 */
  votesPerVoter: number
  /** 多票模式下是否允许重复投同一选手；false = 同一选手最多 1 票。 */
  allowRepeatVote: boolean
  /** 当前设备/微信号已投的有效票数（含冻结票，不含作废票）。 */
  votesUsed: number
  votesRemaining: number
  /** 页面票据与乐观锁版本：多票模式 = votesUsed，一人一票 = myBallot.version。 */
  revision: number
  canChange: boolean
  /** 本机签名设备令牌；存 localStorage，清 cookie 后仍能识别同一浏览器。 */
  deviceToken?: string
  /** 服务端签发的页面加载凭证，用于校验页面真实渲染与最短停留时长。 */
  pageTicket?: string
  authMode?: CompetitionPopularityAuthMode
  wechatVerified?: boolean
  requiresWechatTicket?: boolean
  wechatAccountName?: string
  wechatQrUrl?: string
  /** 只有 showResults 为真时才有内容；否则一律 null。 */
  results: CompetitionPopularityResultRow[] | null
  now: number
}

export interface CompetitionPopularityAdminState {
  settings: CompetitionPopularitySettings
  candidates: CompetitionPopularityCandidate[]
  totalVotes: number
  results: CompetitionPopularityResultRow[]
  /** 同 IP 多设备风险标记票数；仅提示，不拦截。 */
  riskVotes: number
  /** 已被管理员或 AI 风控作废的票数（不计入 totalVotes）。 */
  voidedVotes?: number
  /** 实时高危冻结隔离中的票数（不计入 totalVotes）。 */
  quarantinedVotes?: number
  status: CompetitionPopularityStatus
  updatedAt: number
}

export type CompetitionPopularityRiskLevel = 'normal' | 'watch' | 'suspect'

export interface CompetitionPopularitySingerEstimate {
  singerId: string
  number: number
  name: string
  /** 当前有效票（未作废且未冻结）。 */
  validVotes: number
  /** 冻结待审票数。 */
  quarantinedVotes: number
  /** 已作废票数。 */
  voidedVotes: number
  /** 高危可疑票数（score >= 60，未作废）。 */
  suspectVotes: number
  /** 观察级票数（30 <= score < 60，未作废）。 */
  watchVotes: number
  /** 模型按各票可疑度期望估算的刷票数量（含已作废，四舍五入）。 */
  estimatedBrushVotes: number
  /** 预估净票数 = max(0, validVotes - 未作废期望刷票)。 */
  estimatedRealVotes: number
  /** 预估净票占比（%）。 */
  estimatedRealPercent: number
  /** 当前选手刷票率（%）。 */
  brushRatePercent: number
  rawRank: number
  estimatedRealRank: number
  topReasons: string[]
}

export interface CompetitionPopularityTimelineBucket {
  startAt: number
  label: string
  normalCount: number
  suspectCount: number
  blockedCount: number
  totalCount: number
}

export interface CompetitionPopularityDistributionItem {
  label: string
  count: number
  suspectCount: number
}

export interface CompetitionPopularityClusterItem {
  kind: 'ip' | 'env' | 'qr'
  keyLabel: string
  ballotCount: number
  validCount: number
  quarantinedCount: number
  voidedCount: number
  maxSuspicionScore: number
  topSingerName: string
  topSingerVotes: number
  ballotIds: string[]
  latestAt: number
}

export interface CompetitionPopularityVoteLogItem {
  id: string
  seq: number
  ballotId: string | null
  singerId: string | null
  singerName: string
  prevSingerId: string | null
  prevSingerName: string | null
  action: 'cast' | 'change' | 'blocked'
  blockCode: string | null
  deviceTag: string
  ipTag: string | null
  envTag: string | null
  qrNonceTag: string | null
  uaSummary: string
  cookiePresent: boolean
  dwellMs: number | null
  suspicionScore: number
  effectiveScore: number
  riskLevel: CompetitionPopularityRiskLevel
  suspicionReasons: string[]
  ballotQuarantined: boolean
  ballotQuarantinedReason: string | null
  ballotVoided: boolean
  ballotVoidedReason: string | null
  wechatVerified: boolean
  createdAt: number
}

export interface CompetitionPopularityMemoryEntry {
  id: string
  mode: 'auto-batch' | 'manual-batch' | 'single-log' | 'singer-focus'
  fromSeq: number
  toSeq: number
  verdict: 'clean' | 'watch' | 'suspect'
  confidence: number
  estimatedBrushInBatch: number
  memoryNote: string
  createdAt: number
}

export interface CompetitionPopularityInspectionItem {
  id: string
  mode: 'auto-batch' | 'manual-batch' | 'single-log' | 'singer-focus'
  fromSeq: number
  toSeq: number
  targetLogId: string | null
  targetSingerId: string | null
  targetSingerName: string | null
  logCount: number
  verdict: 'clean' | 'watch' | 'suspect'
  confidence: number
  estimatedBrushInBatch: number
  headline: string
  findings: string[]
  flaggedSeqs: number[]
  flaggedBallotIds: string[]
  memoryNote: string
  model: string
  triggerSource: 'auto' | 'manual'
  autoVoidedCount: number
  autoReleasedCount: number
  createdAt: number
}

export interface CompetitionPopularityInspectionJobView {
  key: string
  state: 'running' | 'done' | 'failed'
  mode: 'auto-batch' | 'manual-batch' | 'single-log' | 'singer-focus'
  model: string
  startedAt: number
  finishedAt: number | null
  error: string | null
}

export interface CompetitionPopularityAuditReport {
  overview: {
    validVotes: number
    quarantinedVotes: number
    voidedVotes: number
    blockedAttempts: number
    totalLogCount: number
    suspectValidVotes: number
    watchValidVotes: number
    estimatedBrushVotes: number
    estimatedRealVotes: number
    estimatedBrushRatePercent: number
    latestSeq: number
    lastAutoInspectedSeq: number
    pendingAutoCount: number
    autoBatchSize: number
  }
  singerEstimates: CompetitionPopularitySingerEstimate[]
  timeline: CompetitionPopularityTimelineBucket[]
  dwellDistribution: CompetitionPopularityDistributionItem[]
  uaDistribution: CompetitionPopularityDistributionItem[]
  clusters: CompetitionPopularityClusterItem[]
  logs: CompetitionPopularityVoteLogItem[]
  inspections: CompetitionPopularityInspectionItem[]
  rollingMemory: CompetitionPopularityMemoryEntry[]
  aiConfigured: boolean
  inspectionJob: CompetitionPopularityInspectionJobView | null
  generatedAt: number
}

export interface CompetitionRoundEntry {
  id: string
  singer: CompetitionSingerPublic
  /** 后台决赛第一轮条目：选手提交的两首歌；其他轮次为空。 */
  finalSongs?: CompetitionFinalSongsPair | null
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
  /** 由隐藏赛制复活进来（决赛第一轮败者按均分补位）。 */
  revived: boolean
  /** 抽签 1v1 的组号；null = 还没分组。 */
  pairNo: number | null
  /** 组内位置 1 / 2；null = 还没分组。 */
  pairSlot: number | null
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
  /** 勾选来源：true = 隐藏赛制复活补位（对手已确定），false = 正常排名/胜者晋级。 */
  revived: boolean
}

/** 决赛抽签 1v1 的一组：两位选手、胜者与平分说明。 */
export interface CompetitionDuelPair {
  pairNo: number
  entries: CompetitionRoundEntry[]
  winnerEntryId: string | null
  winnerName: string | null
  ready: boolean
  note: string
}

/** 复活候选：决赛第一轮 1v1 输掉的那个人，按本轮均分排队。 */
export interface CompetitionRevivalCandidate {
  entryId: string
  singerId: string
  name: string
  className: string
  /** 本轮平均分；null = 没有评分，不参与复活排序。 */
  average: number | null
  scoreCount: number
  /** 败者内部的名次（1 = 分数最高的败者）。 */
  loserRank: number
  /** 是否落在复活名额内。 */
  revived: boolean
}

/**
 * 隐藏赛制复活：决赛第一轮 1v1 的败者按本轮均分排序，前 N 名跟着胜者一起进第二轮。
 * 只有「决赛 + 抽签 1v1」才可能有这个状态，其他轮次为 null。
 */
export interface CompetitionRevivalState {
  /** 后台开关是否打开（打开才有候选名单）。 */
  enabled: boolean
  /** 复活名额。 */
  slots: number
  /** 已分出胜负的败者，按均分从高到低；revived = 落在名额内。 */
  candidates: CompetitionRevivalCandidate[]
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
  /** 决赛抽签 1v1 的分组；非 duel 或不是决赛时为空数组。 */
  duelPairs: CompetitionDuelPair[]
  /** 隐藏赛制复活状态；只有决赛 + 抽签 1v1 才有，其他轮次为 null。 */
  revival: CompetitionRevivalState | null
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
  /** 人气奖投票设置、候选与当前票数。 */
  popularity: CompetitionPopularityAdminState
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

/** 第三方（金数据）投票的单项榜单条目。 */
export interface ThirdPartyRankingEntry {
  /** 金数据选项名，当前就是选手姓名。 */
  optionId: string
  /** 按姓名回连本站选手；历史名单或改名后可能为 null。 */
  singerId: string | null
  /** 决赛第一轮出场号；未匹配时为 null。 */
  number: number | null
  name: string
  className: string | null
  photoUrl: string | null
  song: string
  /** 计入排名的有效票。 */
  valid: number
  /** 待人工复核的票，不计入排名但单独展示。 */
  watch: number
  /** 被判定无效的票，只在总数里体现。 */
  voided: number
  /** 名次，同票并列；0 表示没有有效票。 */
  rank: number
  /** 占全部有效票的比例，0–1。 */
  share: number
}

/** 公开榜单接口的返回结构。 */
export interface ThirdPartyRankingPayload {
  /** 未配置表单时为空字符串。 */
  formToken: string
  generatedAt: number
  totals: {
    received: number
    valid: number
    watch: number
    voided: number
  }
  entries: ThirdPartyRankingEntry[]
}
