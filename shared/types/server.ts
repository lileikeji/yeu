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
  to: string
  icon: string
  placement: 'quick' | 'services' | 'more'
  sortOrder: number
}

export interface ApiPublicHomeEntries {
  items: ApiPublicHomeEntry[]
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
  longitude: number
  latitude: number
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
  cacheHit?: boolean
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
