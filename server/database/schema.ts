import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  blob,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

const timestamp = (name: string) => integer(name)
  .notNull()
  .default(sql`(unixepoch() * 1000)`)

export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['super', 'organization'] }).notNull().default('super'),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: integer('last_login_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('admin_users_username_unique').on(table.username),
  index('admin_users_role_active_idx').on(table.role, table.isActive),
  check('admin_users_role_check', sql`${table.role} in ('super', 'organization')`)
])

export const adminSessions = sqliteTable('admin_sessions', {
  id: text('id').primaryKey(),
  adminUserId: text('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  csrfTokenHash: text('csrf_token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  createdAt: timestamp('created_at')
}, table => [
  uniqueIndex('admin_sessions_token_hash_unique').on(table.tokenHash),
  index('admin_sessions_user_idx').on(table.adminUserId),
  index('admin_sessions_expires_idx').on(table.expiresAt)
])

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  platform: text('platform').notNull(),
  publisherName: text('publisher_name').notNull(),
  sourceLevel: text('source_level', { enum: ['A', 'B', 'C', 'D', 'E'] }).notNull(),
  isOfficial: integer('is_official', { mode: 'boolean' }).notNull().default(false),
  publishedAt: integer('published_at'),
  accessedAt: integer('accessed_at').notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['active', 'unavailable', 'disputed'] }).notNull().default('active'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('sources_url_unique').on(table.url),
  index('sources_level_status_idx').on(table.sourceLevel, table.status),
  check('sources_level_check', sql`${table.sourceLevel} in ('A', 'B', 'C', 'D', 'E')`),
  check('sources_status_check', sql`${table.status} in ('active', 'unavailable', 'disputed')`)
])

export const places = sqliteTable('places', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  body: text('body').notNull().default(''),
  scope: text('scope', { enum: ['campus', 'nearby'] }).notNull(),
  type: text('type').notNull(),
  category: text('category'),
  address: text('address'),
  campusArea: text('campus_area'),
  floor: text('floor'),
  room: text('room'),
  longitude: real('longitude'),
  latitude: real('latitude'),
  coordinateSystem: text('coordinate_system', { enum: ['WGS84', 'GCJ-02', 'BD-09'] }),
  coordinateVerification: text('coordinate_verification', {
    enum: ['missing', 'unverified', 'verified', 'rejected']
  }).notNull().default('missing'),
  coordinateVerifiedAt: integer('coordinate_verified_at'),
  coordinatePointRole: text('coordinate_point_role', {
    enum: ['site-point', 'main-entrance']
  }),
  sourceRawRef: text('source_raw_ref'),
  openingHours: text('opening_hours'),
  phone: text('phone'),
  website: text('website'),
  externalMapUrl: text('external_map_url'),
  isOfficial: integer('is_official', { mode: 'boolean' }).notNull().default(false),
  isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  lastVerifiedAt: integer('last_verified_at'),
  publishedAt: integer('published_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('places_slug_unique').on(table.slug),
  index('places_public_list_idx').on(table.status, table.scope, table.type),
  index('places_category_idx').on(table.category),
  check('places_scope_check', sql`${table.scope} in ('campus', 'nearby')`),
  check('places_status_check', sql`${table.status} in ('draft', 'published', 'archived')`),
  check('places_crs_check', sql`${table.coordinateSystem} in ('WGS84', 'GCJ-02', 'BD-09')`),
  check('places_coordinate_verification_check', sql`${table.coordinateVerification} in ('missing', 'unverified', 'verified', 'rejected')`),
  check('places_longitude_check', sql`${table.longitude} is null or ${table.longitude} between -180 and 180`),
  check('places_latitude_check', sql`${table.latitude} is null or ${table.latitude} between -90 and 90`),
  check('places_coordinate_group_check', sql`(${table.longitude} is null and ${table.latitude} is null and ${table.coordinateSystem} is null) or (${table.longitude} is not null and ${table.latitude} is not null and ${table.coordinateSystem} is not null)`),
  check('places_verified_coordinate_check', sql`${table.coordinateVerification} != 'verified' or (${table.longitude} is not null and ${table.latitude} is not null and ${table.coordinateSystem} is not null)`),
  check('places_missing_coordinate_check', sql`${table.coordinateVerification} != 'missing' or (${table.longitude} is null and ${table.latitude} is null and ${table.coordinateSystem} is null)`)
])

export const placeCoordinateObservations = sqliteTable('place_coordinate_observations', {
  id: text('id').primaryKey(),
  clientObservationId: text('client_observation_id'),
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
  longitude: real('longitude').notNull(),
  latitude: real('latitude').notNull(),
  coordinateSystem: text('coordinate_system', { enum: ['WGS84', 'GCJ-02', 'BD-09'] }).notNull(),
  accuracyMeters: real('accuracy_meters').notNull(),
  sampleCount: integer('sample_count').notNull(),
  samplesJson: text('samples_json').notNull(),
  captureMethod: text('capture_method', {
    enum: ['browser-geolocation', 'authorized-import', 'map-review']
  }).notNull(),
  pointRole: text('point_role', { enum: ['site-point', 'main-entrance'] }).notNull(),
  capturedAt: integer('captured_at').notNull(),
  evidenceNote: text('evidence_note').notNull(),
  reviewStatus: text('review_status', {
    enum: ['pending', 'approved', 'rejected', 'superseded']
  }).notNull().default('pending'),
  reviewedBy: text('reviewed_by').references(() => adminUsers.id, { onDelete: 'set null' }),
  reviewedAt: integer('reviewed_at'),
  reviewNote: text('review_note'),
  supersededByObservationId: text('superseded_by_observation_id')
    .references((): AnySQLiteColumn => placeCoordinateObservations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('coordinate_observations_client_id_unique').on(table.clientObservationId),
  index('coordinate_observations_place_status_idx').on(table.placeId, table.reviewStatus),
  index('coordinate_observations_status_created_idx').on(table.reviewStatus, table.createdAt),
  check('coordinate_observations_crs_check', sql`${table.coordinateSystem} in ('WGS84', 'GCJ-02', 'BD-09')`),
  check('coordinate_observations_method_check', sql`${table.captureMethod} in ('browser-geolocation', 'authorized-import', 'map-review')`),
  check('coordinate_observations_role_check', sql`${table.pointRole} in ('site-point', 'main-entrance')`),
  check('coordinate_observations_status_check', sql`${table.reviewStatus} in ('pending', 'approved', 'rejected', 'superseded')`),
  check('coordinate_observations_longitude_check', sql`${table.longitude} between -180 and 180`),
  check('coordinate_observations_latitude_check', sql`${table.latitude} between -90 and 90`),
  check('coordinate_observations_accuracy_check', sql`${table.accuracyMeters} between 0 and 1000`),
  check('coordinate_observations_sample_count_check', sql`${table.sampleCount} between 1 and 10`),
  check('coordinate_observations_review_check', sql`(${table.reviewStatus} = 'pending' and ${table.reviewedAt} is null) or (${table.reviewStatus} != 'pending' and ${table.reviewedAt} is not null)`)
])

export const contents = sqliteTable('contents', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['guide', 'department', 'club', 'notice'] }).notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  body: text('body').notNull().default(''),
  category: text('category'),
  audience: text('audience'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  lastVerifiedAt: integer('last_verified_at'),
  publishedAt: integer('published_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('contents_kind_slug_unique').on(table.kind, table.slug),
  index('contents_public_list_idx').on(table.status, table.kind, table.isFeatured),
  check('contents_kind_check', sql`${table.kind} in ('guide', 'department', 'club', 'notice')`),
  check('contents_status_check', sql`${table.status} in ('draft', 'published', 'archived')`)
])

export const placeSources = sqliteTable('place_sources', {
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull().references(() => sources.id, { onDelete: 'restrict' }),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  createdAt: timestamp('created_at')
}, table => [
  primaryKey({ columns: [table.placeId, table.sourceId] }),
  index('place_sources_source_idx').on(table.sourceId)
])

export const contentSources = sqliteTable('content_sources', {
  contentId: text('content_id').notNull().references(() => contents.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull().references(() => sources.id, { onDelete: 'restrict' }),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  createdAt: timestamp('created_at')
}, table => [
  primaryKey({ columns: [table.contentId, table.sourceId] }),
  index('content_sources_source_idx').on(table.sourceId)
])

export const organizationAdminScopes = sqliteTable('organization_admin_scopes', {
  adminUserId: text('admin_user_id').primaryKey().references(() => adminUsers.id, { onDelete: 'cascade' }),
  contentId: text('content_id').notNull().references(() => contents.id, { onDelete: 'cascade' }),
  createdByAdminId: text('created_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('organization_admin_scopes_content_unique').on(table.contentId),
  index('organization_admin_scopes_creator_idx').on(table.createdByAdminId)
])

export const procedures = sqliteTable('procedures', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  body: text('body').notNull().default(''),
  category: text('category'),
  audienceJson: text('audience_json').notNull().default('[]'),
  method: text('method', { enum: ['online', 'offline', 'mixed'] }).notNull(),
  informationState: text('information_state', {
    enum: ['confirmed', 'partial', 'awaiting-notice']
  }).notNull().default('awaiting-notice'),
  statusText: text('status_text').notNull(),
  processingTime: text('processing_time'),
  deadlineText: text('deadline_text'),
  startsAt: integer('starts_at'),
  endsAt: integer('ends_at'),
  validFrom: integer('valid_from'),
  validUntil: integer('valid_until'),
  departmentId: text('department_id').references(() => contents.id, { onDelete: 'set null' }),
  guideId: text('guide_id').references(() => contents.id, { onDelete: 'set null' }),
  seedOwner: text('seed_owner'),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  lastVerifiedAt: integer('last_verified_at'),
  publishedAt: integer('published_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('procedures_slug_unique').on(table.slug),
  index('procedures_public_list_idx').on(table.status, table.category, table.startsAt),
  index('procedures_department_idx').on(table.departmentId),
  index('procedures_guide_idx').on(table.guideId),
  check('procedures_method_check', sql`${table.method} in ('online', 'offline', 'mixed')`),
  check('procedures_information_state_check', sql`${table.informationState} in ('confirmed', 'partial', 'awaiting-notice')`),
  check('procedures_status_check', sql`${table.status} in ('draft', 'published', 'archived')`),
  check('procedures_audience_json_check', sql`json_valid(${table.audienceJson}) and json_array_length(${table.audienceJson}) >= 1`),
  check('procedures_schedule_check', sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.endsAt} >= ${table.startsAt}`),
  check('procedures_validity_check', sql`${table.validFrom} is null or ${table.validUntil} is null or ${table.validUntil} >= ${table.validFrom}`)
])

export const procedureSteps = sqliteTable('procedure_steps', {
  id: text('id').primaryKey(),
  procedureId: text('procedure_id').notNull().references(() => procedures.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  audienceJson: text('audience_json').notNull().default('[]'),
  informationState: text('information_state', {
    enum: ['confirmed', 'partial', 'awaiting-notice']
  }).notNull().default('awaiting-notice'),
  timeText: text('time_text'),
  placeId: text('place_id').references(() => places.id, { onDelete: 'set null' }),
  departmentId: text('department_id').references(() => contents.id, { onDelete: 'set null' }),
  actionUrl: text('action_url'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('procedure_steps_order_unique').on(table.procedureId, table.stepOrder),
  index('procedure_steps_place_idx').on(table.placeId),
  index('procedure_steps_department_idx').on(table.departmentId),
  check('procedure_steps_order_check', sql`${table.stepOrder} >= 1`),
  check('procedure_steps_audience_json_check', sql`json_valid(${table.audienceJson}) and json_array_length(${table.audienceJson}) >= 1`),
  check('procedure_steps_information_state_check', sql`${table.informationState} in ('confirmed', 'partial', 'awaiting-notice')`)
])

export const procedureMaterials = sqliteTable('procedure_materials', {
  id: text('id').primaryKey(),
  procedureId: text('procedure_id').notNull().references(() => procedures.id, { onDelete: 'cascade' }),
  itemOrder: integer('item_order').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  audienceJson: text('audience_json').notNull().default('[]'),
  isRequired: integer('is_required', { mode: 'boolean' }),
  informationState: text('information_state', {
    enum: ['confirmed', 'partial', 'awaiting-notice']
  }).notNull().default('awaiting-notice'),
  placeId: text('place_id').references(() => places.id, { onDelete: 'set null' }),
  departmentId: text('department_id').references(() => contents.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('procedure_materials_order_unique').on(table.procedureId, table.itemOrder),
  index('procedure_materials_place_idx').on(table.placeId),
  index('procedure_materials_department_idx').on(table.departmentId),
  check('procedure_materials_order_check', sql`${table.itemOrder} >= 1`),
  check('procedure_materials_audience_json_check', sql`json_valid(${table.audienceJson}) and json_array_length(${table.audienceJson}) >= 1`),
  check('procedure_materials_information_state_check', sql`${table.informationState} in ('confirmed', 'partial', 'awaiting-notice')`)
])

export const procedurePlaces = sqliteTable('procedure_places', {
  procedureId: text('procedure_id').notNull().references(() => procedures.id, { onDelete: 'cascade' }),
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'restrict' }),
  role: text('role').notNull().default('related'),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at')
}, table => [
  primaryKey({ columns: [table.procedureId, table.placeId] }),
  uniqueIndex('procedure_places_order_unique').on(table.procedureId, table.sortOrder),
  index('procedure_places_place_idx').on(table.placeId),
  check('procedure_places_order_check', sql`${table.sortOrder} >= 1`)
])

export const procedureSources = sqliteTable('procedure_sources', {
  procedureId: text('procedure_id').notNull().references(() => procedures.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull().references(() => sources.id, { onDelete: 'restrict' }),
  claimScope: text('claim_scope').notNull().default(''),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at')
}, table => [
  primaryKey({ columns: [table.procedureId, table.sourceId] }),
  uniqueIndex('procedure_sources_order_unique').on(table.procedureId, table.sortOrder),
  index('procedure_sources_source_idx').on(table.sourceId),
  check('procedure_sources_order_check', sql`${table.sortOrder} >= 1`)
])

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  targetType: text('target_type', { enum: ['general', 'place', 'content', 'procedure'] }).notNull(),
  targetId: text('target_id'),
  reasonType: text('reason_type').notNull(),
  message: text('message').notNull(),
  evidenceUrl: text('evidence_url'),
  pageUrl: text('page_url'),
  contact: text('contact'),
  status: text('status', { enum: ['new', 'reviewing', 'resolved', 'rejected', 'spam'] }).notNull().default('new'),
  resolutionNote: text('resolution_note'),
  submitterIpHash: text('submitter_ip_hash'),
  resolvedBy: text('resolved_by').references(() => adminUsers.id, { onDelete: 'set null' }),
  resolvedAt: integer('resolved_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('feedback_status_created_idx').on(table.status, table.createdAt),
  index('feedback_target_idx').on(table.targetType, table.targetId),
  check('feedback_status_check', sql`${table.status} in ('new', 'reviewing', 'resolved', 'rejected', 'spam')`),
  check('feedback_target_type_check', sql`${table.targetType} in ('general', 'place', 'content', 'procedure')`),
  check('feedback_target_id_check', sql`(${table.targetType} = 'general' and ${table.targetId} is null) or (${table.targetType} != 'general' and ${table.targetId} is not null)`)
])

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorAdminId: text('actor_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  requestId: text('request_id'),
  detailsJson: text('details_json').notNull().default('{}'),
  createdAt: timestamp('created_at')
}, table => [
  index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  index('audit_logs_created_idx').on(table.createdAt)
])

export const frontendFeatureSettings = sqliteTable('frontend_feature_settings', {
  key: text('key').primaryKey(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  placement: text('placement', { enum: ['default', 'quick', 'timeline', 'services'] })
    .notNull()
    .default('default'),
  sortOrder: integer('sort_order').notNull().default(100),
  updatedByAdminId: text('updated_by_admin_id')
    .references(() => adminUsers.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at')
}, table => [
  index('frontend_feature_settings_enabled_idx').on(table.isEnabled)
])

export const rateLimitBuckets = sqliteTable('rate_limit_buckets', {
  bucketKey: text('bucket_key').primaryKey(),
  hitCount: integer('hit_count').notNull(),
  resetAt: integer('reset_at').notNull()
}, table => [
  index('rate_limit_buckets_reset_idx').on(table.resetAt)
])

export const visitors = sqliteTable('visitors', {
  id: text('id').primaryKey(),
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  lastIp: text('last_ip'),
  lastCountry: text('last_country'),
  lastRegion: text('last_region'),
  lastCity: text('last_city'),
  lastUserAgent: text('last_user_agent'),
  lastPath: text('last_path'),
  eventCount: integer('event_count').notNull().default(0),
  userId: text('user_id'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('visitors_last_seen_idx').on(table.lastSeenAt),
  index('visitors_last_ip_idx').on(table.lastIp),
  index('visitors_user_idx').on(table.userId)
])

export const visitorEvents = sqliteTable('visitor_events', {
  id: text('id').primaryKey(),
  visitorId: text('visitor_id').notNull().references(() => visitors.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  ip: text('ip'),
  country: text('country'),
  region: text('region'),
  city: text('city'),
  userAgent: text('user_agent'),
  path: text('path'),
  method: text('method'),
  action: text('action').notNull(),
  metaJson: text('meta_json').notNull().default('{}'),
  createdAt: timestamp('created_at')
}, table => [
  index('visitor_events_visitor_created_idx').on(table.visitorId, table.createdAt),
  index('visitor_events_action_created_idx').on(table.action, table.createdAt),
  index('visitor_events_ip_created_idx').on(table.ip, table.createdAt),
  index('visitor_events_created_idx').on(table.createdAt)
])

export const visitorBans = sqliteTable('visitor_bans', {
  id: text('id').primaryKey(),
  scope: text('scope', { enum: ['ip', 'visitor', 'user'] }).notNull(),
  value: text('value').notNull(),
  reason: text('reason').notNull().default(''),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  bannedByAdminId: text('banned_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  expiresAt: integer('expires_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('visitor_bans_scope_value_idx').on(table.scope, table.value),
  index('visitor_bans_active_idx').on(table.isActive),
  check('visitor_bans_scope_check', sql`${table.scope} in ('ip', 'visitor', 'user')`)
])

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  major: text('major'),
  dormBuilding: text('dorm_building'),
  chatDormBuilding: text('chat_dorm_building'),
  // 开放注册（邮箱验证码）：email 注册时验证后写入；管理员建号的历史账号可为 NULL。
  email: text('email'),
  emailVerifiedAt: integer('email_verified_at'),
  status: text('status', { enum: ['active', 'disabled', 'banned'] }).notNull().default('active'),
  createdByAdminId: text('created_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  lastLoginAt: integer('last_login_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('users_username_unique').on(table.username),
  uniqueIndex('users_email_unique').on(table.email),
  index('users_status_idx').on(table.status),
  index('users_dorm_idx').on(table.dormBuilding),
  index('users_chat_dorm_idx').on(table.chatDormBuilding),
  index('users_major_idx').on(table.major),
  check('users_status_check', sql`${table.status} in ('active', 'disabled', 'banned')`)
])

export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  csrfTokenHash: text('csrf_token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  createdAt: timestamp('created_at')
}, table => [
  uniqueIndex('user_sessions_token_hash_unique').on(table.tokenHash),
  index('user_sessions_user_idx').on(table.userId),
  index('user_sessions_expires_idx').on(table.expiresAt)
])

export const chatRooms = sqliteTable('chat_rooms', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['public', 'dorm', 'place'] }).notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  dormBuilding: text('dorm_building'),
  // kind='place' 的楼栋群：对应地图点位（places.category IN ('campus-building','dorm')）
  placeId: text('place_id'),
  isMutedAll: integer('is_muted_all', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('chat_rooms_slug_unique').on(table.slug),
  index('chat_rooms_kind_idx').on(table.kind),
  index('chat_rooms_dorm_idx').on(table.dormBuilding),
  // 一个点位一个群；非 place 房为 NULL 不受约束
  uniqueIndex('chat_rooms_place_unique').on(table.placeId).where(sql`${table.kind} = 'place'`),
  check('chat_rooms_kind_check', sql`${table.kind} in ('public', 'dorm', 'place')`)
])

/**
 * 注册邮箱验证码（hash 存储，10 分钟有效、5 次尝试后作废）。
 * 单实例部署 + 低频写入，主键直接用 email（一邮箱同时只有一个有效码）。
 */
export const emailVerifications = sqliteTable('email_verifications', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
  createdAt: timestamp('created_at')
})

export const chatMembers = sqliteTable('chat_members', {
  roomId: text('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: integer('joined_at').notNull(),
  lastReadAt: integer('last_read_at')
}, table => [
  primaryKey({ columns: [table.roomId, table.userId] }),
  index('chat_members_user_idx').on(table.userId)
])

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  body: text('body').notNull(),
  deletedAt: integer('deleted_at'),
  createdAt: timestamp('created_at')
}, table => [
  index('chat_messages_room_created_idx').on(table.roomId, table.createdAt),
  index('chat_messages_user_created_idx').on(table.userId, table.createdAt)
])

export const chatMutes = sqliteTable('chat_mutes', {
  id: text('id').primaryKey(),
  roomId: text('room_id').references(() => chatRooms.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull().default(''),
  mutedByAdminId: text('muted_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  expiresAt: integer('expires_at'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('chat_mutes_user_active_idx').on(table.userId, table.isActive),
  index('chat_mutes_room_user_idx').on(table.roomId, table.userId)
])

export const assistantWebKnowledge = sqliteTable('assistant_web_knowledge', {
  id: text('id').primaryKey(),
  queryHash: text('query_hash').notNull(),
  query: text('query').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  snippet: text('snippet').notNull(),
  sourceHost: text('source_host').notNull(),
  status: text('status', { enum: ['active', 'expired', 'rejected'] }).notNull().default('active'),
  fetchedAt: integer('fetched_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastUsedAt: integer('last_used_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('assistant_web_knowledge_query_url_unique').on(table.queryHash, table.url),
  index('assistant_web_knowledge_query_expiry_idx').on(table.queryHash, table.status, table.expiresAt),
  index('assistant_web_knowledge_host_idx').on(table.sourceHost),
  check('assistant_web_knowledge_status_check', sql`${table.status} in ('active', 'expired', 'rejected')`)
])

export const assistantAnswerCache = sqliteTable('assistant_answer_cache', {
  id: text('id').primaryKey(),
  cacheKey: text('cache_key').notNull(),
  query: text('query').notNull(),
  responseJson: text('response_json').notNull(),
  knowledgeRevision: integer('knowledge_revision').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
  lastUsedAt: integer('last_used_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('assistant_answer_cache_key_unique').on(table.cacheKey),
  index('assistant_answer_cache_expiry_idx').on(table.expiresAt),
  index('assistant_answer_cache_query_idx').on(table.query)
])

export const assistantKnowledgeEntries = sqliteTable('assistant_knowledge_entries', {
  id: text('id').primaryKey(),
  kind: text('kind', {
    enum: ['official_reference', 'campus_template', 'student_experience']
  }).notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  keywordsJson: text('keywords_json').notNull().default('[]'),
  publicUrl: text('public_url'),
  confidence: integer('confidence').notNull().default(50),
  sourceNote: text('source_note').notNull().default(''),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  importedAt: integer('imported_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('assistant_knowledge_kind_active_idx').on(table.kind, table.isActive),
  index('assistant_knowledge_category_active_idx').on(table.category, table.isActive),
  check('assistant_knowledge_kind_check', sql`${table.kind} in ('official_reference', 'campus_template', 'student_experience')`),
  check('assistant_knowledge_confidence_check', sql`${table.confidence} between 0 and 100`)
])

export const knowledgeDocuments = sqliteTable('knowledge_documents', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').references(() => sources.id, { onDelete: 'set null' }),
  kind: text('kind', {
    enum: ['webpage', 'pdf', 'document', 'spreadsheet', 'chat_export', 'manual', 'api']
  }).notNull(),
  title: text('title').notNull(),
  originalUrl: text('original_url'),
  storagePath: text('storage_path'),
  mimeType: text('mime_type'),
  contentHash: text('content_hash').notNull(),
  extractedText: text('extracted_text').notNull().default(''),
  metadataJson: text('metadata_json').notNull().default('{}'),
  status: text('status', {
    enum: ['imported', 'processing', 'ready', 'failed', 'archived']
  }).notNull().default('imported'),
  capturedAt: integer('captured_at').notNull(),
  processedAt: integer('processed_at'),
  createdByAdminId: text('created_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('knowledge_documents_origin_hash_unique').on(table.originalUrl, table.contentHash),
  index('knowledge_documents_hash_idx').on(table.contentHash),
  index('knowledge_documents_status_captured_idx').on(table.status, table.capturedAt),
  index('knowledge_documents_source_idx').on(table.sourceId),
  check('knowledge_documents_kind_check', sql`${table.kind} in ('webpage', 'pdf', 'document', 'spreadsheet', 'chat_export', 'manual', 'api')`),
  check('knowledge_documents_status_check', sql`${table.status} in ('imported', 'processing', 'ready', 'failed', 'archived')`)
])

export const knowledgeCrawlQueue = sqliteTable('knowledge_crawl_queue', {
  url: text('url').primaryKey(),
  hostname: text('hostname').notNull(),
  label: text('label').notNull().default(''),
  depth: integer('depth').notNull().default(0),
  discoveredFrom: text('discovered_from'),
  priority: integer('priority').notNull().default(0),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptAt: integer('last_attempt_at'),
  nextAttemptAt: integer('next_attempt_at'),
  lastError: text('last_error').notNull().default(''),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('knowledge_crawl_queue_status_priority_idx').on(table.status, table.priority, table.createdAt),
  index('knowledge_crawl_queue_retry_idx').on(table.status, table.nextAttemptAt),
  index('knowledge_crawl_queue_host_idx').on(table.hostname, table.status),
  check('knowledge_crawl_queue_status_check', sql`${table.status} in ('pending', 'processing', 'completed', 'failed')`),
  check('knowledge_crawl_queue_depth_check', sql`${table.depth} >= 0`),
  check('knowledge_crawl_queue_attempts_check', sql`${table.attempts} >= 0`)
])

export const knowledgeEntities = sqliteTable('knowledge_entities', {
  id: text('id').primaryKey(),
  entityType: text('entity_type', {
    enum: ['person', 'major', 'college', 'place', 'policy', 'procedure', 'organization', 'term', 'other']
  }).notNull(),
  canonicalName: text('canonical_name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  aliasesJson: text('aliases_json').notNull().default('[]'),
  summary: text('summary').notNull().default(''),
  status: text('status', { enum: ['active', 'merged', 'archived'] }).notNull().default('active'),
  mergedIntoId: text('merged_into_id').references((): AnySQLiteColumn => knowledgeEntities.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('knowledge_entities_type_name_unique').on(table.entityType, table.normalizedName),
  index('knowledge_entities_status_type_idx').on(table.status, table.entityType),
  check('knowledge_entities_type_check', sql`${table.entityType} in ('person', 'major', 'college', 'place', 'policy', 'procedure', 'organization', 'term', 'other')`),
  check('knowledge_entities_status_check', sql`${table.status} in ('active', 'merged', 'archived')`)
])

export const knowledgeClaims = sqliteTable('knowledge_claims', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  statement: text('statement').notNull(),
  keywordsJson: text('keywords_json').notNull().default('[]'),
  searchText: text('search_text').notNull().default(''),
  confidenceLabel: text('confidence_label', {
    enum: ['extracted', 'inferred', 'ambiguous', 'unverified']
  }).notNull().default('unverified'),
  confidenceScore: integer('confidence_score').notNull().default(50),
  reviewStatus: text('review_status', {
    enum: ['draft', 'review', 'published', 'rejected', 'archived']
  }).notNull().default('draft'),
  publicUrl: text('public_url'),
  sourceNote: text('source_note').notNull().default(''),
  validFrom: integer('valid_from'),
  validUntil: integer('valid_until'),
  publishedAt: integer('published_at'),
  reviewedAt: integer('reviewed_at'),
  reviewedByAdminId: text('reviewed_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdByAdminId: text('created_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  supersedesClaimId: text('supersedes_claim_id').references((): AnySQLiteColumn => knowledgeClaims.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('knowledge_claims_review_category_idx').on(table.reviewStatus, table.category),
  index('knowledge_claims_validity_idx').on(table.reviewStatus, table.validFrom, table.validUntil),
  check('knowledge_claims_confidence_label_check', sql`${table.confidenceLabel} in ('extracted', 'inferred', 'ambiguous', 'unverified')`),
  check('knowledge_claims_confidence_score_check', sql`${table.confidenceScore} between 0 and 100`),
  check('knowledge_claims_review_status_check', sql`${table.reviewStatus} in ('draft', 'review', 'published', 'rejected', 'archived')`),
  check('knowledge_claims_valid_range_check', sql`${table.validUntil} is null or ${table.validFrom} is null or ${table.validUntil} >= ${table.validFrom}`),
  check('knowledge_claims_published_at_check', sql`${table.reviewStatus} <> 'published' or ${table.publishedAt} is not null`)
])

export const knowledgeClaimSources = sqliteTable('knowledge_claim_sources', {
  id: text('id').primaryKey(),
  claimId: text('claim_id').notNull().references(() => knowledgeClaims.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').references(() => sources.id, { onDelete: 'set null' }),
  documentId: text('document_id').references(() => knowledgeDocuments.id, { onDelete: 'set null' }),
  evidenceQuote: text('evidence_quote').notNull().default(''),
  locator: text('locator').notNull().default(''),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  createdAt: timestamp('created_at')
}, table => [
  index('knowledge_claim_sources_claim_idx').on(table.claimId, table.isPrimary),
  index('knowledge_claim_sources_source_idx').on(table.sourceId),
  index('knowledge_claim_sources_document_idx').on(table.documentId),
  check('knowledge_claim_sources_reference_check', sql`${table.sourceId} is not null or ${table.documentId} is not null`)
])

export const knowledgeClaimEntities = sqliteTable('knowledge_claim_entities', {
  claimId: text('claim_id').notNull().references(() => knowledgeClaims.id, { onDelete: 'cascade' }),
  entityId: text('entity_id').notNull().references(() => knowledgeEntities.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['subject', 'object', 'mentioned'] }).notNull().default('mentioned'),
  createdAt: timestamp('created_at')
}, table => [
  primaryKey({ columns: [table.claimId, table.entityId, table.role] }),
  index('knowledge_claim_entities_entity_idx').on(table.entityId, table.role),
  check('knowledge_claim_entities_role_check', sql`${table.role} in ('subject', 'object', 'mentioned')`)
])

export const knowledgeConflicts = sqliteTable('knowledge_conflicts', {
  id: text('id').primaryKey(),
  leftClaimId: text('left_claim_id').notNull().references(() => knowledgeClaims.id, { onDelete: 'cascade' }),
  rightClaimId: text('right_claim_id').notNull().references(() => knowledgeClaims.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  status: text('status', { enum: ['open', 'resolved', 'dismissed'] }).notNull().default('open'),
  resolutionNote: text('resolution_note').notNull().default(''),
  resolvedAt: integer('resolved_at'),
  resolvedByAdminId: text('resolved_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('knowledge_conflicts_pair_unique').on(table.leftClaimId, table.rightClaimId),
  index('knowledge_conflicts_status_idx').on(table.status, table.createdAt),
  check('knowledge_conflicts_status_check', sql`${table.status} in ('open', 'resolved', 'dismissed')`),
  check('knowledge_conflicts_distinct_claims_check', sql`${table.leftClaimId} <> ${table.rightClaimId}`)
])

export const assistantRuns = sqliteTable('assistant_runs', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  queryHash: text('query_hash').notNull(),
  query: text('query').notNull(),
  mode: text('mode', { enum: ['local', 'ai', 'error'] }).notNull(),
  /** 调用来源：网站 / 小程序 / QQ 机器人 / 微信机器人。 */
  channel: text('channel', { enum: ['web', 'miniapp', 'qq', 'wechat'] }).notNull().default('web'),
  retrievalPath: text('retrieval_path', {
    enum: ['feature_api', 'local_database', 'answer_cache', 'web_cache', 'web_search', 'error']
  }).notNull(),
  usedWebSearch: integer('used_web_search', { mode: 'boolean' }).notNull().default(false),
  cacheHit: integer('cache_hit', { mode: 'boolean' }).notNull().default(false),
  success: integer('success', { mode: 'boolean' }).notNull().default(true),
  errorCode: text('error_code'),
  analysisMs: integer('analysis_ms').notNull().default(0),
  featureApiMs: integer('feature_api_ms').notNull().default(0),
  databaseMs: integer('database_ms').notNull().default(0),
  webCacheMs: integer('web_cache_ms').notNull().default(0),
  webSearchMs: integer('web_search_ms').notNull().default(0),
  answerMs: integer('answer_ms').notNull().default(0),
  totalMs: integer('total_ms').notNull().default(0),
  firstTokenMs: integer('first_token_ms').notNull().default(0),
  citationCount: integer('citation_count').notNull().default(0),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at')
}, table => [
  uniqueIndex('assistant_runs_request_unique').on(table.requestId),
  index('assistant_runs_created_idx').on(table.createdAt),
  index('assistant_runs_path_created_idx').on(table.retrievalPath, table.createdAt),
  index('assistant_runs_success_created_idx').on(table.success, table.createdAt),
  index('assistant_runs_channel_created_idx').on(table.channel, table.createdAt),
  check('assistant_runs_mode_check', sql`${table.mode} in ('local', 'ai', 'error')`),
  check('assistant_runs_path_check', sql`${table.retrievalPath} in ('feature_api', 'local_database', 'answer_cache', 'web_cache', 'web_search', 'error')`)
])

export const assistantSessionMemory = sqliteTable('assistant_session_memory', {
  id: text('id').primaryKey(),
  sessionKey: text('session_key').notNull(),
  kind: text('kind', {
    enum: ['preference', 'fact', 'answered', 'open_question']
  }).notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash'),
  sourceQueryHash: text('source_query_hash').notNull(),
  sourceQuery: text('source_query').notNull(),
  answerDigest: text('answer_digest'),
  importance: integer('importance').notNull().default(50),
  hitCount: integer('hit_count').notNull().default(0),
  lastHitAt: integer('last_hit_at'),
  expiresAt: integer('expires_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('assistant_session_memory_session_kind_idx').on(table.sessionKey, table.kind),
  index('assistant_session_memory_session_hit_idx').on(table.sessionKey, table.lastHitAt),
  index('assistant_session_memory_content_dedupe_idx').on(table.sessionKey, table.kind, table.contentHash),
  index('assistant_session_memory_expiry_idx').on(table.expiresAt),
  check('assistant_session_memory_kind_check', sql`${table.kind} in ('preference', 'fact', 'answered', 'open_question')`),
  check('assistant_session_memory_importance_check', sql`${table.importance} between 0 and 100`)
])

/**
 * User-generated place reviews. Keyed by the *public map place id* (for example
 * `amap-import-row-030` or a DB place uuid), because the map catalog merges
 * preview fixtures, AMap owner-map imports and DB places — most of which are
 * not rows in the `places` table. One review per user per place.
 */
export const placeReviews = sqliteTable('place_reviews', {
  id: text('id').primaryKey(),
  placeId: text('place_id').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousKey: text('anonymous_key'),
  // 提交时返回给提交者的进度查询码（8 位易读字符）。匿名 key 只在同一进程内
  // 稳定，服务重启后"我的评价"就认不出来了；查询码是跨会话查审核进度的凭据。
  // 历史评价为 NULL，只有新提交的评价生成。
  trackCode: text('track_code'),
  score: integer('score').notNull(),
  content: text('content').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  reviewedByAdminId: text('reviewed_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  reviewedAt: integer('reviewed_at'),
  reviewNote: text('review_note'),
  // Seed reviews (rewritten third-party user reviews imported as initial
  // content) are marked source='seed' and excluded from the public aggregate
  // score so they cannot skew the student-submitted average.
  //
  // 三种取值语义不同，不是同一含义的改名：
  //   user     = 学生自己提交的评价（唯一参与公开评分聚合的一类）
  //   seed     = 后台整理的展示卡，前台列表展示但不计入聚合
  //   original = 抓取来的原文评论，仅后台可见（前台列表按 source IN ('seed','user') 过滤）
  source: text('source', { enum: ['user', 'seed', 'original'] }).notNull().default('user'),
  sourceUrl: text('source_url'),
  sourcePlatform: text('source_platform', { enum: ['dianping', 'meituan'] }),
  collectedAt: integer('collected_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('place_reviews_user_place_unique').on(table.userId, table.placeId),
  uniqueIndex('place_reviews_anon_place_unique').on(table.anonymousKey, table.placeId),
  uniqueIndex('place_reviews_track_code_unique').on(table.trackCode),
  index('place_reviews_place_status_idx').on(table.placeId, table.status),
  index('place_reviews_status_created_idx').on(table.status, table.createdAt),
  check('place_reviews_score_check', sql`${table.score} between 1 and 5`),
  check('place_reviews_status_check', sql`${table.status} in ('pending', 'approved', 'rejected')`)
])

/**
 * Cached AMap POI rating seed data per public map place id. Fetched by the
 * `db:seed:amap-ratings` script and served to the map popup with the source
 * clearly labelled (never copies third-party review text — the project policy
 * only allows referencing the platform's aggregate score).
 */
export const placeAmapRatings = sqliteTable('place_amap_ratings', {
  placeId: text('place_id').primaryKey(),
  amapPoiId: text('amap_poi_id').notNull(),
  amapPoiName: text('amap_poi_name').notNull(),
  score: real('score'),
  cost: real('cost'),
  fetchedAt: integer('fetched_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('place_amap_ratings_expiry_idx').on(table.expiresAt),
  check('place_amap_ratings_score_check', sql`${table.score} is null or ${table.score} between 0 and 5`),
  check('place_amap_ratings_cost_check', sql`${table.cost} is null or ${table.cost} >= 0`)
])

/**
 * Merchant promotion settings (backoffice): per-place Meituan jump link,
 * promo weight for ranking boosts and AI recommendation frequency. The AI
 * food recommender and the map popup read these to surface promoted shops.
 */
export const placeMerchants = sqliteTable('place_merchants', {
  placeId: text('place_id').primaryKey(),
  meituanUrl: text('meituan_url'),
  /** QR code image (mini-program/merchant QR) uploaded by the backoffice; shown on the map popup and zoomable for scanning. */
  qrCodeUrl: text('qr_code_url'),
  promoWeight: integer('promo_weight').notNull().default(0),
  aiFrequency: integer('ai_frequency').notNull().default(0),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  updatedAt: timestamp('updated_at')
}, table => [
  index('place_merchants_enabled_idx').on(table.enabled),
  check('place_merchants_promo_weight_check', sql`${table.promoWeight} between 0 and 100`),
  check('place_merchants_ai_frequency_check', sql`${table.aiFrequency} between 0 and 100`)
])

export const assistantEmbeddings = sqliteTable('assistant_embeddings', {
  id: text('id').primaryKey(),
  sourceType: text('source_type', {
    enum: ['entry', 'claim', 'document', 'place', 'content', 'procedure', 'memory']
  }).notNull(),
  sourceId: text('source_id').notNull(),
  chunkIndex: integer('chunk_index').notNull().default(0),
  content: text('content').notNull(),
  textHash: text('text_hash').notNull(),
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
  model: text('model').notNull(),
  dimension: integer('dimension').notNull(),
  title: text('title').notNull().default(''),
  url: text('url').notNull().default(''),
  snippet: text('snippet').notNull().default(''),
  source: text('source').notNull().default('site'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('assistant_embeddings_source_unique').on(table.sourceType, table.sourceId, table.chunkIndex),
  index('assistant_embeddings_source_idx').on(table.sourceType, table.sourceId),
  index('assistant_embeddings_updated_idx').on(table.updatedAt),
  check('assistant_embeddings_source_type_check', sql`${table.sourceType} in ('entry', 'claim', 'document', 'place', 'content', 'procedure', 'memory')`),
  check('assistant_embeddings_dimension_check', sql`${table.dimension} between 1 and 4096`)
])

/**
 * Likes on place reviews. One row per (review, user); the composite primary
 * key is the dedupe — a repeated like by the same user is a no-op.
 */
export const reviewLikes = sqliteTable('review_likes', {
  reviewId: text('review_id').notNull().references(() => placeReviews.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at')
}, table => [
  primaryKey({ columns: [table.reviewId, table.userId] }),
  index('review_likes_user_idx').on(table.userId),
  index('review_likes_review_idx').on(table.reviewId)
])

export const recruitForms = sqliteTable('recruit_forms', {
  id: text('id').primaryKey(),
  contentId: text('content_id').notNull().references(() => contents.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('入会申请表'),
  slogan: text('slogan').notNull().default(''),
  intro: text('intro').notNull().default(''),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('closed'),
  fieldsJson: text('fields_json').notNull().default('[]'),
  docConfigJson: text('doc_config_json').notNull().default('{}'),
  exportColumnsJson: text('export_columns_json').notNull().default('[]'),
  templateDocx: text('template_docx'),
  templateName: text('template_name'),
  views: integer('views').notNull().default(0),
  paymentEnabled: integer('payment_enabled', { mode: 'boolean' }).notNull().default(false),
  paymentWechatImage: text('payment_wechat_image'),
  paymentAlipayImage: text('payment_alipay_image'),
  paymentNote: text('payment_note'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('recruit_forms_content_unique').on(table.contentId)
])

export const recruitSubmissions = sqliteTable('recruit_submissions', {
  id: text('id').primaryKey(),
  formId: text('form_id').notNull().references(() => recruitForms.id, { onDelete: 'cascade' }),
  dataJson: text('data_json').notNull().default('{}'),
  name: text('name').notNull().default(''),
  gender: text('gender'),
  studentNo: text('student_no'),
  major: text('major'),
  className: text('class_name'),
  phone: text('phone'),
  qq: text('qq'),
  departments: text('departments'),
  isLeagueMember: text('is_league_member'),
  referrerName: text('referrer_name'),
  paymentConfirmed: integer('payment_confirmed', { mode: 'boolean' }),
  submitIpHash: text('submit_ip_hash'),
  createdAt: timestamp('created_at')
}, table => [
  index('recruit_submissions_form_created_idx').on(table.formId, table.createdAt),
  index('recruit_submissions_class_idx').on(table.className)
])

export const recruitDrafts = sqliteTable('recruit_drafts', {
  id: text('id').primaryKey(),
  formId: text('form_id').notNull().references(() => recruitForms.id, { onDelete: 'cascade' }),
  draftKey: text('draft_key').notNull(),
  dataJson: text('data_json').notNull().default('{}'),
  submitted: integer('submitted', { mode: 'boolean' }).notNull().default(false),
  submissionId: text('submission_id'),
  updatedAt: timestamp('created_at')
}, table => [
  uniqueIndex('recruit_drafts_form_key_unique').on(table.formId, table.draftKey)
])

export const recruitReferrers = sqliteTable('recruit_referrers', {
  id: text('id').primaryKey(),
  formId: text('form_id').notNull().references(() => recruitForms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  views: integer('views').notNull().default(0),
  createdAt: timestamp('created_at')
}, table => [
  uniqueIndex('recruit_referrers_code_unique').on(table.code),
  index('recruit_referrers_form_idx').on(table.formId)
])

export const competitionEvents = sqliteTable('competition_events', {
  id: text('id').primaryKey(),
  contentId: text('content_id').notNull().references(() => contents.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('新生歌手大赛'),
  /** 现场扫码登记入口开关；关闭后公开登记页只读。 */
  registrationOpen: integer('registration_open', { mode: 'boolean' }).notNull().default(true),
  dimensionsJson: text('dimensions_json').notNull().default('[]'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('competition_events_content_unique').on(table.contentId)
])

/** 固定三轮：初赛 → 复赛 → 决赛。每轮有自己的评委、名单与成绩。 */
export const competitionRounds = sqliteTable('competition_rounds', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => competitionEvents.id, { onDelete: 'cascade' }),
  key: text('key', { enum: ['prelim', 'semi', 'final'] }).notNull(),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  status: text('status', { enum: ['draft', 'open', 'closed'] }).notNull().default('draft'),
  judgeCount: integer('judge_count').notNull().default(5),
  /** 本轮晋级下一轮的人数；决赛为 null。复赛留空表示名额待定。 */
  advanceCount: integer('advance_count'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('competition_rounds_event_key_unique').on(table.eventId, table.key),
  index('competition_rounds_event_position_idx').on(table.eventId, table.position),
  check('competition_rounds_key_check', sql`${table.key} in ('prelim', 'semi', 'final')`),
  check('competition_rounds_status_check', sql`${table.status} in ('draft', 'open', 'closed')`),
  check('competition_rounds_judge_count_check', sql`${table.judgeCount} between 1 and 20`),
  check('competition_rounds_advance_count_check', sql`${table.advanceCount} is null or ${table.advanceCount} between 1 and 500`)
])

export const competitionJudges = sqliteTable('competition_judges', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => competitionEvents.id, { onDelete: 'cascade' }),
  roundId: text('round_id').notNull().references(() => competitionRounds.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: integer('last_login_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('competition_judges_username_unique').on(table.username),
  index('competition_judges_event_idx').on(table.eventId),
  index('competition_judges_round_idx').on(table.roundId)
])

export const competitionJudgeSessions = sqliteTable('competition_judge_sessions', {
  id: text('id').primaryKey(),
  judgeId: text('judge_id').notNull().references(() => competitionJudges.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  csrfTokenHash: text('csrf_token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  createdAt: timestamp('created_at')
}, table => [
  uniqueIndex('competition_judge_sessions_token_unique').on(table.tokenHash),
  index('competition_judge_sessions_judge_idx').on(table.judgeId),
  index('competition_judge_sessions_expires_idx').on(table.expiresAt)
])

/**
 * 赛前预报名：只填姓名即可提交，其余信息到场确认正式报名时补全。
 * registered_at 非空 = 已确认为正式报名（关联选手见 competition_singers.pre_registration_id）。
 */
export const competitionPreRegistrations = sqliteTable('competition_pre_registrations', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => competitionEvents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  className: text('class_name'),
  studentNo: text('student_no'),
  phone: text('phone'),
  email: text('email'),
  song: text('song'),
  registeredAt: integer('registered_at'),
  createdAt: timestamp('created_at')
}, table => [
  index('competition_pre_registrations_event_name_idx').on(table.eventId, table.name)
])

/** 赛事总名单；具体某轮谁参赛由 competition_round_entries 决定。 */
export const competitionSingers = sqliteTable('competition_singers', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => competitionEvents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  song: text('song').notNull(),
  className: text('class_name'),
  remark: text('remark'),
  studentNo: text('student_no'),
  phone: text('phone'),
  email: text('email'),
  source: text('source', { enum: ['admin', 'form', 'pre'] }).notNull().default('admin'),
  /** 由预报名确认生成时，关联的预报名记录。 */
  preRegistrationId: text('pre_registration_id').references(() => competitionPreRegistrations.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('competition_singers_event_order_idx').on(table.eventId, table.sortOrder),
  check('competition_singers_source_check', sql`${table.source} in ('admin', 'form', 'pre')`)
])

/** 每轮结果邮件模板；发送时按选手合并字段渲染。 */
export const competitionEmailTemplates = sqliteTable('competition_email_templates', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => competitionEvents.id, { onDelete: 'cascade' }),
  roundKey: text('round_key', { enum: ['prelim', 'semi', 'final'] }).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('competition_email_templates_event_round_unique').on(table.eventId, table.roundKey),
  check('competition_email_templates_round_check', sql`${table.roundKey} in ('prelim', 'semi', 'final')`)
])

/** 邮件发送流水：每次尝试一条，用于去重、失败重发与发送状态展示。 */
export const competitionEmailSends = sqliteTable('competition_email_sends', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => competitionEvents.id, { onDelete: 'cascade' }),
  roundKey: text('round_key', { enum: ['prelim', 'semi', 'final'] }).notNull(),
  singerId: text('singer_id').references(() => competitionSingers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  status: text('status', { enum: ['sent', 'failed'] }).notNull(),
  error: text('error'),
  createdAt: timestamp('created_at')
}, table => [
  index('competition_email_sends_event_round_idx').on(table.eventId, table.roundKey),
  index('competition_email_sends_singer_idx').on(table.singerId),
  check('competition_email_sends_round_check', sql`${table.roundKey} in ('prelim', 'semi', 'final')`),
  check('competition_email_sends_status_check', sql`${table.status} in ('sent', 'failed')`)
])

/** 每轮参赛名单与出场顺序（复赛/决赛生成时随机抽签）。 */
export const competitionRoundEntries = sqliteTable('competition_round_entries', {
  id: text('id').primaryKey(),
  roundId: text('round_id').notNull().references(() => competitionRounds.id, { onDelete: 'cascade' }),
  singerId: text('singer_id').notNull().references(() => competitionSingers.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  /** 从上一轮晋级时的名次，便于管理员核对。 */
  advancedFromRank: integer('advanced_from_rank'),
  createdAt: timestamp('created_at')
}, table => [
  uniqueIndex('competition_round_entries_round_singer_unique').on(table.roundId, table.singerId),
  index('competition_round_entries_round_order_idx').on(table.roundId, table.sortOrder)
])

export const competitionScores = sqliteTable('competition_scores', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => competitionEvents.id, { onDelete: 'cascade' }),
  roundId: text('round_id').notNull().references(() => competitionRounds.id, { onDelete: 'cascade' }),
  singerId: text('singer_id').notNull().references(() => competitionSingers.id, { onDelete: 'cascade' }),
  judgeId: text('judge_id').notNull().references(() => competitionJudges.id, { onDelete: 'cascade' }),
  dimensionsJson: text('dimensions_json').notNull().default('[]'),
  totalScore: real('total_score').notNull().default(0),
  comment: text('comment').notNull().default(''),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('competition_scores_round_singer_judge_unique').on(table.roundId, table.singerId, table.judgeId),
  index('competition_scores_event_idx').on(table.eventId),
  index('competition_scores_round_idx').on(table.roundId)
])

/**
 * 校园热点（signal）事件表。
 *
 * 一行 = 一件"很多份材料在说的是同一件事"。热度按事件算，不按文章算：
 * 48 小时窗口内每个独立来源只算一次，24 小时半衰（见 server/modules/signal/heat.ts）。
 */
export const signalEvents = sqliteTable('signal_events', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  category: text('category').notNull().default('campus'),
  status: text('status', { enum: ['published', 'archived'] }).notNull().default('published'),
  heat: real('heat').notNull().default(0),
  heatPrev: real('heat_prev').notNull().default(0),
  trend: text('trend', { enum: ['new', 'up', 'down', 'flat'] }).notNull().default('flat'),
  sourceCount: integer('source_count').notNull().default(0),
  itemCount: integer('item_count').notNull().default(0),
  score: real('score').notNull().default(0),
  tier: text('tier', { enum: ['A', 'B', 'C'] }).notNull().default('C'),
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  reportedAt: integer('reported_at'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('signal_events_slug_unique').on(table.slug),
  index('signal_events_status_heat_idx').on(table.status, table.heat),
  index('signal_events_last_seen_idx').on(table.lastSeenAt),
  check('signal_events_status_check', sql`${table.status} in ('published', 'archived')`),
  check('signal_events_trend_check', sql`${table.trend} in ('new', 'up', 'down', 'flat')`),
  check('signal_events_tier_check', sql`${table.tier} in ('A', 'B', 'C')`)
])

/**
 * 事件成员：一份材料（通知或已入库的官方文档）只属于一个事件。
 * 两次独立评分的原始结果都留在这里，改门槛可以只看不回跑。
 */
export const signalEventItems = sqliteTable('signal_event_items', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => signalEvents.id, { onDelete: 'cascade' }),
  itemKind: text('item_kind', { enum: ['notice', 'document'] }).notNull(),
  itemId: text('item_id').notNull(),
  sourceId: text('source_id').references(() => sources.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  publishedAt: integer('published_at'),
  score: real('score').notNull().default(0),
  scoreA: real('score_a').notNull().default(0),
  scoreB: real('score_b').notNull().default(0),
  tier: text('tier', { enum: ['A', 'B', 'C'] }).notNull().default('C'),
  similarity: real('similarity').notNull().default(0),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  createdAt: timestamp('created_at')
}, table => [
  uniqueIndex('signal_event_items_identity_unique').on(table.itemKind, table.itemId),
  index('signal_event_items_event_idx').on(table.eventId),
  index('signal_event_items_source_idx').on(table.sourceId),
  check('signal_event_items_kind_check', sql`${table.itemKind} in ('notice', 'document')`),
  check('signal_event_items_tier_check', sql`${table.tier} in ('A', 'B', 'C')`)
])

/** 日报/周报/月报：规则化编排，不调模型；同一周期只生成一次。 */
export const signalReports = sqliteTable('signal_reports', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['daily', 'weekly', 'monthly'] }).notNull(),
  periodKey: text('period_key').notNull(),
  title: text('title').notNull(),
  payloadJson: text('payload_json').notNull().default('{}'),
  itemCount: integer('item_count').notNull().default(0),
  generatedAt: integer('generated_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  uniqueIndex('signal_reports_period_unique').on(table.kind, table.periodKey),
  index('signal_reports_kind_generated_idx').on(table.kind, table.generatedAt),
  check('signal_reports_kind_check', sql`${table.kind} in ('daily', 'weekly', 'monthly')`)
])

/**
 * 地点留言与打卡。
 *
 * 和 `place_reviews` 分开：评价是「一个访客对一个地点一条、带 1-5 分」，
 * 留言是「随便说几句、可以反复」，打卡是「今天到过这里」。
 * 三者混在一张表会让「每人一条」的唯一索引直接挡掉留言和打卡。
 *
 * `images` 存 JSON 数组，元素是 `/uploads/<uuid>.<ext>`（见 utils/uploaded-images）。
 * `place_id` 不设外键：地图里的地点来自高德导入、目录种子和数据库三处，
 * 大部分不是 `places` 表的行（与 place_reviews 同一约定）。
 */
export const placeMoments = sqliteTable('place_moments', {
  id: text('id').primaryKey(),
  placeId: text('place_id').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  anonymousKey: text('anonymous_key'),
  kind: text('kind', { enum: ['comment', 'checkin'] }).notNull().default('comment'),
  body: text('body').notNull().default(''),
  images: text('images').notNull().default('[]'),
  // 本地日期（Asia/Shanghai），用于「同一个人同一天同一个地点只算一次打卡」。
  dayKey: text('day_key').notNull().default(''),
  // 审计与 AI 巡检（与 bus_moments 同构）：ip 仅 admin 可见（visitors.lastIp 口径）；
  // ai_checked_at 为 NULL 表示未巡检；ai_category 非空 = AI 判违规；撤回/恢复人写
  // moderated_by（'ai' 或 admin id）与 moderation_reason。
  ip: text('ip'),
  aiCheckedAt: integer('ai_checked_at'),
  aiCategory: text('ai_category'),
  aiReason: text('ai_reason'),
  moderatedBy: text('moderated_by'),
  moderationReason: text('moderation_reason'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('approved'),
  createdAt: timestamp('created_at')
}, table => [
  index('place_moments_place_created_idx').on(table.placeId, table.createdAt),
  index('place_moments_status_created_idx').on(table.status, table.createdAt),
  // 只对打卡建唯一：留言的 day_key 是 ''，带上留言会互相撞车（SQLite 的
  // 多列唯一索引里 NULL 互不相等，所以不用 NULL 兜底，直接用部分索引）。
  uniqueIndex('place_moments_checkin_day_unique')
    .on(table.placeId, table.dayKey, table.anonymousKey)
    .where(sql`${table.kind} = 'checkin'`),
  check('place_moments_kind_check', sql`${table.kind} in ('comment', 'checkin')`),
  check('place_moments_status_check', sql`${table.status} in ('pending', 'approved', 'rejected')`)
])

/**
 * 校车留言板，按车号（云一卡通 car_name，如「1」「2」）分区。
 *
 * 与 place_moments 分表：分区键不同（车号 vs 地点），且校车留言没有打卡与
 * 图片，纯文字。按 `bus_name` 聚合而不是 routeId:busName——同一辆车往返
 * 两个方向时 routeId 不同，按车号聚合才符合「讨论 3 号车」的直觉；
 * `route_name` 只记录发帖时的线路方向作上下文，不参与分区。
 * `user_id`/`anonymous_key` 与 place_moments 同约定。
 */
export const busMoments = sqliteTable('bus_moments', {
  id: text('id').primaryKey(),
  busName: text('bus_name').notNull(),
  routeName: text('route_name').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  anonymousKey: text('anonymous_key'),
  body: text('body').notNull(),
  // 审计与 AI 巡检（与 place_moments 同构，口径见那张表的注释）。
  ip: text('ip'),
  aiCheckedAt: integer('ai_checked_at'),
  aiCategory: text('ai_category'),
  aiReason: text('ai_reason'),
  moderatedBy: text('moderated_by'),
  moderationReason: text('moderation_reason'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('approved'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
}, table => [
  index('bus_moments_bus_created_idx').on(table.busName, table.createdAt),
  index('bus_moments_status_created_idx').on(table.status, table.createdAt),
  check('bus_moments_status_check', sql`${table.status} in ('pending', 'approved', 'rejected')`)
])
