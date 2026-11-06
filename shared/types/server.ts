import type {
  ContentKind,
  CoordinateObservationMethod,
  CoordinateObservationStatus,
  CoordinatePointRole,
  CoordinateVerificationState,
  FeedbackStatus,
  FeedbackTargetType,
  PublicSearchResultType,
  ProcedureAudience,
  ProcedureInformationState,
  ProcedureMethod,
  SourceLevel,
  SourceStatus
} from '../constants/server'
import type { FrontendFeatureKey } from '../config/frontend-features'
import type { CoordinateReferenceSystem, PublicationStatus } from '../types'

export interface ApiListResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasManagedRecords?: boolean
  managedKinds?: ContentKind[]
}

export interface ApiFrontendFeature {
  key: FrontendFeatureKey
  group: string
  title: string
  description: string
  icon: string
  enabled: boolean
  placement: 'default' | 'quick' | 'timeline' | 'services'
  sortOrder: number
  updatedAt: string | null
}

export interface ApiPublicFrontendFeatures {
  disabledKeys: FrontendFeatureKey[]
  placements: Partial<Record<FrontendFeatureKey, 'default' | 'quick' | 'timeline' | 'services'>>
  sortOrders: Partial<Record<FrontendFeatureKey, number>>
  updatedAt: string | null
}

export interface ApiPublicHomeEntry {
  id: string
  title: string
  description: string
  detailContent: string
  to: string
  sourceUrl: string | null
  icon: string
  placement: 'quick' | 'services' | 'more'
  sortOrder: number
  featureKey?: FrontendFeatureKey
}

export interface ApiPublicHomeEntries {
  items: ApiPublicHomeEntry[]
}

/**
 * 首页"校园周边商家"卡：后台开启了推广（place_merchants.enabled）的已发布地点。
 * 仅暴露展示所需字段；地图定位由 slug 拼 /map?place=slug。
 */
export interface ApiPublicPromotedMerchant {
  slug: string
  name: string
  type: string | null
  score: number | null
  cost: number | null
  area: '新区' | '旧区' | null
  /** 从简介提炼的一句话口碑（"…是学校周边的快餐小吃店"），无则空串 */
  tagline: string
}

export interface ApiPublicPromotedMerchants {
  items: ApiPublicPromotedMerchant[]
}

export interface ApiTransitSegment {
  name: string
  departureStop: string
  arrivalStop: string
  startTime: string | null
  endTime: string | null
  viaStops: number | null
}

export interface ApiTransitPlan {
  durationMinutes: number
  fareYuan: number | null
  walkingMeters: number
  segments: ApiTransitSegment[]
}

export interface ApiTransitPlanResponse {
  provider: 'amap'
  queriedAt: string
  origin: { id: string, label: string }
  destination: { id: string, label: string }
  plans: ApiTransitPlan[]
  vehiclePositionsAvailable: false
}

export interface ApiWalkingStep {
  instruction: string
  distanceMeters: number
  durationSeconds: number | null
}

/** 周边攻略：来源是高德整理的地点，坐标即 GCJ-02，可直接用于微信 map / openLocation。 */
export interface ApiNearbyDestination {
  id: string
  label: string
  longitude: number
  latitude: number
  note: string | null
}

export interface ApiNearbyGuide {
  id: string
  scope: 'nearby' | 'city'
  category: string
  categoryLabel: string
  eyebrow: string
  title: string
  summary: string
  highlights: string[]
  suitableFor: string
  travelNote: string
  costNote: string
  freshnessNote: string
  coordinateSystem: 'GCJ-02'
  destinations: ApiNearbyDestination[]
}

export interface ApiNearbyGuideResponse {
  items: ApiNearbyGuide[]
  total: number
  /** 当前 scope 下出现过的分类，供小程序做筛选胶囊。 */
  categories: Array<{ id: string, label: string, count: number }>
}

export interface ApiWalkingRoute {
  provider: 'amap'
  queriedAt: string
  /** 高德 Web 服务返回的坐标是 GCJ-02，可直接交给微信 map 的 polyline。 */
  coordinateSystem: 'GCJ-02'
  origin: { label: string, longitude: number, latitude: number }
  destination: { label: string, slug: string, longitude: number, latitude: number }
  distanceMeters: number
  durationSeconds: number
  /** 折线点位，按行进顺序排列。 */
  polyline: Array<{ longitude: number, latitude: number }>
  steps: ApiWalkingStep[]
}

export interface ApiSource {
  id: string
  title: string
  url: string
  platform: string
  publisherName: string
  sourceLevel: SourceLevel
  isOfficial: boolean
  publishedAt: string | null
  accessedAt: string
  status: SourceStatus
}

export interface ApiPlace {
  id: string
  slug: string
  name: string
  summary: string
  body: string
  scope: 'campus' | 'nearby'
  type: string
  category: string | null
  address: string | null
  campusArea: string | null
  floor: string | null
  room: string | null
  longitude: number | null
  latitude: number | null
  coordinateSystem: CoordinateReferenceSystem | null
  /** 公共出口的坐标混淆串（v1:<hex>，见 shared/utils/geo-obfuscation.ts）；admin 出口同样附带。 */
  encodedPoint: string | null
  coordinateVerification: CoordinateVerificationState
  coordinateVerifiedAt: string | null
  coordinatePointRole: CoordinatePointRole | null
  navigationAvailable: boolean
  sourceRawRef?: string | null
  openingHours: string | null
  phone: string | null
  website: string | null
  externalMapUrl: string | null
  isOfficial: boolean
  isFeatured: boolean
  status: PublicationStatus
  lastVerifiedAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  sources: ApiSource[]
}

export interface ApiAmapOwnerDraftPlace {
  id: string
  sourceRow: number
  name: string
  summary: string
  scope: 'campus' | 'nearby'
  type: string
  category: string | null
  address: string | null
  encodedPoint: string
  coordinateSystem: 'GCJ-02'
  coordinateVerification: 'unverified'
}

export interface ApiCoordinateSample {
  longitude: number
  latitude: number
  accuracyMeters: number
  capturedAt: string
}

export interface CreateCoordinateObservationPayload {
  clientObservationId: string
  placeId: string
  coordinateSystem: 'WGS84'
  captureMethod: CoordinateObservationMethod
  pointRole: CoordinatePointRole
  evidenceNote: string
  samples: ApiCoordinateSample[]
}

export interface ApiCoordinateObservation {
  id: string
  clientObservationId: string | null
  placeId: string
  placeName: string
  placeScope: 'campus' | 'nearby'
  longitude: number
  latitude: number
  coordinateSystem: CoordinateReferenceSystem
  accuracyMeters: number
  sampleCount: number
  samples: ApiCoordinateSample[]
  captureMethod: CoordinateObservationMethod
  pointRole: CoordinatePointRole
  capturedAt: string
  evidenceNote: string
  outsideCampusReviewBounds: boolean
  reviewStatus: CoordinateObservationStatus
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  supersededByObservationId: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiContent {
  id: string
  kind: ContentKind
  slug: string
  title: string
  summary: string
  body: string
  category: string | null
  audience: string | null
  metadata: Record<string, unknown>
  isFeatured: boolean
  status: PublicationStatus
  lastVerifiedAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  sources: ApiSource[]
}

export interface ApiNoticeAction {
  label: string
  href: string
  icon?: string
}

export interface ApiProcedureDepartment {
  id: string
  slug: string
  name: string
  summary: string
  website: string | null
}

export interface ApiProcedureGuide {
  id: string
  slug: string
  title: string
  summary: string
}

export interface ApiProcedurePlace {
  id: string
  slug: string
  name: string
  summary: string
  address: string | null
  navigationAvailable: boolean
}

export interface ApiProcedureSource extends ApiSource {
  claimScope: string
  isPrimary: boolean
  order: number
}

export interface ApiProcedureStep {
  id: string
  order: number
  title: string
  description: string
  audience: ProcedureAudience[]
  informationState: ProcedureInformationState
  timeText: string | null
  place: ApiProcedurePlace | null
  department: ApiProcedureDepartment | null
  actionUrl: string | null
}

export interface ApiProcedureMaterial {
  id: string
  order: number
  name: string
  description: string
  audience: ProcedureAudience[]
  isRequired: boolean | null
  informationState: ProcedureInformationState
  place: ApiProcedurePlace | null
  department: ApiProcedureDepartment | null
}

export interface ApiProcedure {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  category: string | null
  audience: ProcedureAudience[]
  method: ProcedureMethod
  informationState: ProcedureInformationState
  statusText: string
  processingTime: string | null
  deadlineText: string | null
  startsAt: string | null
  endsAt: string | null
  validFrom: string | null
  validUntil: string | null
  department: ApiProcedureDepartment | null
  relatedGuide: ApiProcedureGuide | null
  places: ApiProcedurePlace[]
  steps: ApiProcedureStep[]
  materials: ApiProcedureMaterial[]
  sources: ApiProcedureSource[]
  status: PublicationStatus
  lastVerifiedAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiSearchItem {
  entityType: 'place' | 'content' | 'procedure'
  resultType: PublicSearchResultType
  id: string
  slug: string
  title: string
  summary: string
  category: string | null
  kind: ContentKind | null
  updatedAt: string
  /** 指定落地页；缺省时按 kind 推导。校园信号事件用 /hot#slug。 */
  to?: string
}

export interface ApiFeatureSearchItem {
  id: string
  title: string
  summary: string
  to: string
  icon: string
}

export interface ApiSearchResponse {
  query: string
  type: PublicSearchResultType | null
  items: ApiSearchItem[]
  total: number
  hasManagedContent: boolean
  managedKinds: ContentKind[]
  features?: ApiFeatureSearchItem[]
}

export interface ApiAssistantCitation {
  title: string
  url: string
  snippet: string
  source: 'site' | 'web'
}

export type ApiAssistantStage
  = | 'query_analysis'
    | 'retrieval_rewrite'
    | 'retrieval_vector'
    | 'retrieval_graph'
    | 'retrieval_rerank'
    | 'feature_api'
    | 'local_database'
    | 'answer_cache'
    | 'web_cache'
    | 'web_search'
    | 'answer_generation'

export type ApiAssistantRetrievalPath
  = | 'feature_api'
    | 'local_database'
    | 'answer_cache'
    | 'web_cache'
    | 'web_search'

export interface ApiAssistantTraceStep {
  stage: ApiAssistantStage
  label: string
  durationMs: number
  status: 'completed' | 'failed'
  detail?: string
}

export interface ApiAssistantResponse {
  query: string
  mode: 'local' | 'ai'
  answer: string
  citations: ApiAssistantCitation[]
  usedWebSearch: boolean
  confidence: number
  retrievalPath?: ApiAssistantRetrievalPath
  trace?: ApiAssistantTraceStep[]
  totalDurationMs?: number
  /** Milliseconds from request start to the first content token of the model answer. */
  firstTokenMs?: number
  cacheHit?: boolean
  /**
   * 检索证据不足以给出确认答案（回答是「没找到 / 无法确认」模板）。
   * 这类回答仍是合法的 200 响应，但后台统计不应把它算成「成功回答」——
   * 否则答非所问会被成功率掩盖。
   */
  evidenceGap?: boolean
}

export type AdminCapability
  = | 'analytics.view'
    | 'visitor.list'
    | 'visitor.detail'
    | 'visitor.raw_ua'
    | 'visitor.raw_ip'
    | 'visitor.source'
    | 'api_metrics.view'
    | 'audit.view'
    | 'ban.manage'

export interface ApiMiniappAnalyticsBucket {
  key: string
  events: number
  visitors: number
}

export interface ApiMiniappAnalyticsPage extends ApiMiniappAnalyticsBucket {
  pathname: string
}

export interface ApiMiniappAnalyticsApiMetric {
  route: string
  status: number | null
  requestCount: number
  errorCount: number
  latencyMs: { count: number, average: number, p50: number | null, p95: number | null, max: number | null }
}

export interface ApiMiniappAnalytics {
  window: { hours: number, since: string, until: string }
  totals: { events: number, visitors: number }
  pages: ApiMiniappAnalyticsPage[]
  events: ApiMiniappAnalyticsBucket[]
  sources: ApiMiniappAnalyticsBucket[]
  versions: ApiMiniappAnalyticsBucket[]
  devices: ApiMiniappAnalyticsBucket[]
  userAgents: ApiMiniappAnalyticsBucket[]
  api: ApiMiniappAnalyticsApiMetric[]
  raw?: { userAgents: string[], ips: string[] }
}

export interface ApiFeedback {
  id: string
  targetType: FeedbackTargetType
  targetId: string | null
  reasonType: string
  message: string
  evidenceUrl: string | null
  pageUrl: string | null
  contact: string | null
  status: FeedbackStatus
  resolutionNote: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

/** K2/K6 校外公交线路（高德 v3/bus/linename，extensions=all 的静态快照）。 */
export interface ApiBusLineStop {
  seq: number
  name: string
  lng: number
  lat: number
}

export interface ApiBusLineDirection {
  /** 线路号，如 `K2`。 */
  line: string
  /** 高德线路 ID，方向唯一。 */
  id: string
  direction: string
  from: string
  to: string
  /** 起点站首班发车时间，`HH:mm`。 */
  startTime: string
  /** 起点站末班发车时间，`HH:mm`。 */
  endTime: string
  distanceKm: number
  basicPrice: number | null
  totalPrice: number | null
  stops: ApiBusLineStop[]
  /** 沿真实道路的折线，`[lng, lat]`。 */
  polyline: [number, number][]
}

export interface ApiBusVehicle {
  /** 车牌，如 `闽C00961D`。 */
  plate: string
  /** 下一站站名。 */
  nextStation: string
  /** 下一站在线路上的序（从 1 开始）。 */
  stationOrder: number
  /** 车辆当前 GPS，`[lng, lat]`，GCJ-02。 */
  point: [number, number]
  /** 车头朝向角度，0 为正北。 */
  angle?: number
  /** 距离下一站的拟合距离（米）。 */
  distanceToNext?: number
  /** 上游判定的运行状态：0 正常行驶，2 即将进站。 */
  statusType?: string
}

export interface ApiBusLiveDirection {
  line: string
  direction: number
  from: string
  to: string
  /** 起点站下一班计划发车时间，`HH:mm`；上游没给就为空。 */
  planTime: string | null
  /** 上游是否真的有 GPS 数据（`hasReal`）。 */
  hasReal: boolean
  vehicles: ApiBusVehicle[]
}

export interface ApiBusLiveResponse {
  provider: 'mygolbs'
  city: string
  /** 服务器抓取时间，ISO 8601。 */
  fetchedAt: string
  directions: ApiBusLiveDirection[]
}

export interface ApiBusDeparturesDirection {
  line: string
  direction: number
  from: string
  to: string
  beginTime: string
  endTime: string
  /** 按时间段分组的发车时刻，`isNow` 标记当前那班。 */
  groups: { group: string, times: string[], isNow: boolean }[]
  /** 当前时刻之后最近的三班。 */
  next: string[]
}

export interface ApiBusDeparturesResponse {
  provider: 'mygolbs'
  city: string
  fetchedAt: string
  directions: ApiBusDeparturesDirection[]
  /** 上游原话：时刻表由历史数据推算，仅供参考。 */
  note: string
}

export interface ApiBusLinesResponse {
  provider: 'amap'
  city: string
  /** 数据快照日期（`YYYY-MM-DD`）。 */
  fetchedAt: string
  lines: ApiBusLineDirection[]
  /** 高德不提供实时车辆位置，前端不要等这个字段。 */
  vehiclePositionsAvailable: false
}

export type ApiSignalTrend = 'new' | 'up' | 'down' | 'flat'

export type ApiSignalTier = 'A' | 'B' | 'C'

/** `/api/public/signal` 的事件摘要，字段与 `SignalEventSummary` 一致。 */
export interface ApiSignalPlaceTag {
  name: string
  slug: string
}

export interface ApiSignalEventSummary {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  heat: number
  trend: ApiSignalTrend
  sourceCount: number
  itemCount: number
  score: number
  tier: ApiSignalTier
  tierLabel: string
  /** notice = 通知公告（要办事的），news = 校园动态（看看的）。 */
  channel: 'notice' | 'news'
  /** 正文里点到的校园地点（已发布点位），点标签可直接跳到地图。 */
  places?: ApiSignalPlaceTag[]
  firstSeenAt: string
  lastSeenAt: string
}

export interface ApiSignalEventItem {
  id: string
  title: string
  url: string
  excerpt: string
  sourceTitle: string
  isOfficial: boolean
  publishedAt: string | null
  isPrimary: boolean
}

export interface ApiSignalEventDetail extends ApiSignalEventSummary {
  items: ApiSignalEventItem[]
}

export interface ApiSignalListResponse {
  events: ApiSignalEventSummary[]
  generatedAt: string
}

export interface ApiSignalReportItem {
  eventId: string
  slug: string
  title: string
  summary: string
  category: string
  heat: number
  sourceCount: number
  itemCount: number
  tier: string
  isNew: boolean
}

export interface ApiSignalReportSection {
  key: string
  title: string
  items: ApiSignalReportItem[]
}

export interface ApiSignalReportStats {
  events: number
  newEvents: number
  sources: number
}

export interface ApiSignalReport {
  kind: 'daily' | 'weekly' | 'monthly'
  periodKey: string
  label: string
  title: string
  generatedAt: number
  lead: ApiSignalReportItem[]
  sections: ApiSignalReportSection[]
  stats: ApiSignalReportStats
}

export interface ApiSignalReportListResponse {
  kind: string
  reports: ApiSignalReport[]
}
