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
export const PLACE_SCOPES = ['campus', 'nearby'] as const
export const CONTENT_KINDS = ['guide', 'department', 'club', 'notice'] as const
export const SOURCE_LEVELS = ['A', 'B', 'C', 'D', 'E'] as const
export const SOURCE_STATUSES = ['active', 'unavailable', 'disputed'] as const
export const FEEDBACK_STATUSES = ['new', 'reviewing', 'resolved', 'rejected', 'spam'] as const
export const FEEDBACK_TARGET_TYPES = ['general', 'place', 'content'] as const
export const PROCEDURE_METHODS = ['online', 'offline', 'mixed'] as const
export const PROCEDURE_INFORMATION_STATES = ['confirmed', 'partial', 'awaiting-notice'] as const
export const PROCEDURE_AUDIENCES = ['undergraduate', 'transfer'] as const

export type ContentKind = typeof CONTENT_KINDS[number]
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
