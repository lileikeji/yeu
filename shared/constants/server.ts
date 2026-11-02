export const PUBLICATION_STATUSES = ['draft', 'published', 'archived'] as const
export const COORDINATE_REFERENCE_SYSTEMS = ['WGS84', 'GCJ-02', 'BD-09'] as const
export const COORDINATE_VERIFICATION_STATES = ['missing', 'unverified', 'verified', 'rejected'] as const
export const COORDINATE_OBSERVATION_METHODS = [
  'browser-geolocation',
  'authorized-import',
  'map-review'
] as const
export const COORDINATE_OBSERVATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'superseded'
] as const
export const COORDINATE_POINT_ROLES = ['site-point', 'main-entrance'] as const
export const MAX_APPROVABLE_COORDINATE_ACCURACY_METERS = 25
export const BROWSER_GEOLOCATION_MIN_SAMPLES = 5
export const BROWSER_GEOLOCATION_MAX_SAMPLES = 7
export const BROWSER_GEOLOCATION_MIN_DURATION_MS = 12_000
export const BROWSER_GEOLOCATION_MIN_SAMPLE_INTERVAL_MS = 3_000
export const BROWSER_GEOLOCATION_MAX_SAMPLE_ACCURACY_METERS
  = MAX_APPROVABLE_COORDINATE_ACCURACY_METERS
export const MAX_DUAL_VERIFICATION_DISTANCE_METERS = 20
export const MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS = 30 * 60 * 1000
export const PLACE_SCOPES = ['campus', 'nearby'] as const
export const CONTENT_KINDS = ['guide', 'department', 'club', 'notice'] as const
export const PUBLIC_SEARCH_RESULT_TYPES = [
  'place',
  'procedure',
  ...CONTENT_KINDS
] as const
export const SOURCE_LEVELS = ['A', 'B', 'C', 'D', 'E'] as const
export const SOURCE_STATUSES = ['active', 'unavailable', 'disputed'] as const
export const FEEDBACK_STATUSES = ['new', 'reviewing', 'resolved', 'rejected', 'spam'] as const
export const FEEDBACK_TARGET_TYPES = ['general', 'place', 'content', 'procedure'] as const
export const PROCEDURE_METHODS = ['online', 'offline', 'mixed'] as const
export const PROCEDURE_INFORMATION_STATES = ['confirmed', 'partial', 'awaiting-notice'] as const
export const PROCEDURE_AUDIENCES = ['undergraduate', 'transfer'] as const
export const PLACE_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const
export const REVIEW_SCORE_MIN = 1
export const REVIEW_SCORE_MAX = 5
export const PLACE_REVIEW_CONTENT_MAX = 500
export const PUBLIC_PLACE_REVIEW_PAGE_SIZE = 5

/**
 * 校车实时接口路径（防爬混淆段）。路由文件名必须与之同步：
 * server/api/public/bus-rt-d3e2fd11.get.ts —— 改名须两处同改。
 * 接口另需页面签发的 yeu_page_context 票据 + 限流，curl 直打 403。
 */
export const BUS_POSITIONS_API_PATH = '/api/public/bus-rt-d3e2fd11'

export type ContentKind = typeof CONTENT_KINDS[number]
export type PublicSearchResultType = typeof PUBLIC_SEARCH_RESULT_TYPES[number]
export type CoordinateVerificationState = typeof COORDINATE_VERIFICATION_STATES[number]
export type CoordinateObservationMethod = typeof COORDINATE_OBSERVATION_METHODS[number]
export type CoordinateObservationStatus = typeof COORDINATE_OBSERVATION_STATUSES[number]
export type CoordinatePointRole = typeof COORDINATE_POINT_ROLES[number]
export type SourceLevel = typeof SOURCE_LEVELS[number]
export type SourceStatus = typeof SOURCE_STATUSES[number]
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number]
export type FeedbackTargetType = typeof FEEDBACK_TARGET_TYPES[number]
export type ProcedureMethod = typeof PROCEDURE_METHODS[number]
export type ProcedureInformationState = typeof PROCEDURE_INFORMATION_STATES[number]
export type ProcedureAudience = typeof PROCEDURE_AUDIENCES[number]
export type PlaceReviewStatus = typeof PLACE_REVIEW_STATUSES[number]
