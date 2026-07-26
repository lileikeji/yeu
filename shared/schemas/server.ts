import { z } from 'zod'
import { FRONTEND_FEATURE_KEYS } from '../config/frontend-features'
import {
  CONTENT_KINDS,
  COORDINATE_OBSERVATION_METHODS,
  COORDINATE_OBSERVATION_STATUSES,
  COORDINATE_POINT_ROLES,
  COORDINATE_REFERENCE_SYSTEMS,
  COORDINATE_VERIFICATION_STATES,
  BROWSER_GEOLOCATION_MAX_SAMPLES,
  BROWSER_GEOLOCATION_MIN_SAMPLES,
  FEEDBACK_STATUSES,
  FEEDBACK_TARGET_TYPES,
  PLACE_SCOPES,
  PUBLIC_SEARCH_RESULT_TYPES,
  PROCEDURE_AUDIENCES,
  PROCEDURE_INFORMATION_STATES,
  PROCEDURE_METHODS,
  SOURCE_LEVELS,
  SOURCE_STATUSES
} from '../constants/server'
import { evaluateCoordinateCapture } from '../utils/coordinate-sampling'
import { isSafePublicHttpUrl } from '../utils/public-http-url'

const slugSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens')

const httpUrlSchema = z.string().trim().max(2048).refine(
  value => isSafePublicHttpUrl(value),
  'Only public http(s) URLs without credentials are allowed'
)
const nullableUrlSchema = z.union([httpUrlSchema, z.literal(''), z.null()]).optional()
const nullableTextSchema = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional()
const nullableDateSchema = z.union([z.iso.datetime({ offset: true }), z.null()]).optional()
const LOCAL_PAGE_ORIGIN = 'https://local.invalid'

function isApplicationLocalPath(value: string): boolean {
  const hasControlCharacter = Array.from(value)
    .some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  if (!/^\/(?!\/)/.test(value) || value.includes('\\') || hasControlCharacter) {
    return false
  }

  try {
    return new URL(value, LOCAL_PAGE_ORIGIN).origin === LOCAL_PAGE_ORIGIN
  } catch {
    return false
  }
}

const localPagePathSchema = z.string()
  .trim()
  .max(2048)
  .refine(isApplicationLocalPath, 'Use an application-local path')
const nullableLocalPagePathSchema = z.union([localPagePathSchema, z.literal(''), z.null()]).optional()
const sourceIdsSchema = z.array(z.string().uuid()).max(50)
const nullableUuidSchema = z.union([z.string().uuid(), z.null()]).optional()
const procedureAudienceSchema = z.array(z.enum(PROCEDURE_AUDIENCES))
  .min(1)
  .max(PROCEDURE_AUDIENCES.length)
  .refine(value => new Set(value).size === value.length, 'Audience values must be unique')

interface CoordinateInput {
  longitude?: number | null
  latitude?: number | null
  coordinateSystem?: 'WGS84' | 'GCJ-02' | 'BD-09' | null
  coordinateVerification?: 'missing' | 'unverified' | 'verified' | 'rejected'
  coordinateVerifiedAt?: string | null
}

function validateCoordinates(value: CoordinateInput, context: z.RefinementCtx): void {
  const values = [value.longitude, value.latitude, value.coordinateSystem]
  const presentCount = values.filter(item => item !== null && item !== undefined).length

  if (presentCount !== 0 && presentCount !== values.length) {
    context.addIssue({
      code: 'custom',
      path: ['longitude'],
      message: 'longitude, latitude, and coordinateSystem must be provided together'
    })
  }

  if (value.coordinateVerification === 'verified'
    && (presentCount !== values.length || !value.coordinateVerifiedAt)) {
    context.addIssue({
      code: 'custom',
      path: ['coordinateVerification'],
      message: 'Verified coordinates require values, coordinateSystem, and coordinateVerifiedAt'
    })
  }

  if (value.coordinateVerification === 'missing' && presentCount !== 0) {
    context.addIssue({
      code: 'custom',
      path: ['coordinateVerification'],
      message: 'Use unverified or verified when coordinates are present'
    })
  }
}

const placeFields = {
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(600),
  body: z.string().trim().max(60000),
  scope: z.enum(PLACE_SCOPES),
  type: z.string().trim().min(1).max(60),
  category: nullableTextSchema(60),
  address: nullableTextSchema(300),
  campusArea: nullableTextSchema(120),
  floor: nullableTextSchema(40),
  room: nullableTextSchema(80),
  longitude: z.number().min(-180).max(180).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  coordinateSystem: z.enum(COORDINATE_REFERENCE_SYSTEMS).nullable(),
  coordinateVerification: z.enum(COORDINATE_VERIFICATION_STATES),
  coordinateVerifiedAt: nullableDateSchema,
  sourceRawRef: nullableTextSchema(500),
  openingHours: nullableTextSchema(500),
  phone: nullableTextSchema(80),
  website: nullableUrlSchema,
  externalMapUrl: nullableUrlSchema,
  isOfficial: z.boolean(),
  isFeatured: z.boolean(),
  lastVerifiedAt: nullableDateSchema,
  sourceIds: sourceIdsSchema
}

export const createPlaceSchema = z.object({
  ...placeFields,
  sourceIds: sourceIdsSchema.default([])
}).strict().superRefine(validateCoordinates)
export const updatePlaceSchema = z.object(placeFields).partial().strict()

/** Admin content metadata: bound size and reject prototype-pollution keys. */
const CONTENT_METADATA_MAX_KEYS = 64
const CONTENT_METADATA_MAX_JSON_CHARS = 32_000
const CONTENT_METADATA_MAX_DEPTH = 6
const FORBIDDEN_METADATA_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const UPLOADED_IMAGE_URL_PATTERN = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function metadataDepth(value: unknown, depth = 0): number {
  if (depth > CONTENT_METADATA_MAX_DEPTH) return depth
  if (!value || typeof value !== 'object') return depth
  let max = depth
  for (const child of Object.values(value as Record<string, unknown>)) {
    max = Math.max(max, metadataDepth(child, depth + 1))
  }
  return max
}

/** True when any object key (nested) is a prototype-pollution name. */
function metadataHasForbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > CONTENT_METADATA_MAX_DEPTH || value === null || typeof value !== 'object') {
    return false
  }
  if (Array.isArray(value)) {
    return value.some(item => metadataHasForbiddenKey(item, depth + 1))
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) return true
    if (metadataHasForbiddenKey(child, depth + 1)) return true
  }
  return false
}

const contentMetadataSchema = z.record(z.string().max(80), z.unknown()).superRefine((value, ctx) => {
  const keys = Object.keys(value)
  if (keys.length > CONTENT_METADATA_MAX_KEYS) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata may contain at most ${CONTENT_METADATA_MAX_KEYS} keys`
    })
  }
  if (metadataHasForbiddenKey(value)) {
    ctx.addIssue({
      code: 'custom',
      message: 'metadata contains a forbidden key (__proto__, prototype, or constructor)'
    })
  }
  if (metadataDepth(value) > CONTENT_METADATA_MAX_DEPTH) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata nesting exceeds ${CONTENT_METADATA_MAX_DEPTH} levels`
    })
  }
  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'metadata must be JSON-serializable' })
    return
  }
  if (encoded.length > CONTENT_METADATA_MAX_JSON_CHARS) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata JSON exceeds ${CONTENT_METADATA_MAX_JSON_CHARS} characters`
    })
  }

  for (const key of ['groupQrUrl', 'contactQrUrl'] as const) {
    const candidate = value[key]
    if (candidate !== undefined
      && candidate !== ''
      && (typeof candidate !== 'string' || !UPLOADED_IMAGE_URL_PATTERN.test(candidate))) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} must be an uploaded image URL`
      })
    }
  }
  const groupQrUrls = value.groupQrUrls
  if (groupQrUrls !== undefined) {
    if (!Array.isArray(groupQrUrls)
      || groupQrUrls.length > 8
      || groupQrUrls.some(item => typeof item !== 'string' || !UPLOADED_IMAGE_URL_PATTERN.test(item))) {
      ctx.addIssue({
        code: 'custom',
        path: ['groupQrUrls'],
        message: 'groupQrUrls must contain at most 8 uploaded image URLs'
      })
    } else if (new Set(groupQrUrls).size !== groupQrUrls.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['groupQrUrls'],
        message: 'groupQrUrls must not contain duplicate URLs'
      })
    }
  }
  const contactQrUrls = value.contactQrUrls
  if (contactQrUrls !== undefined) {
    if (!Array.isArray(contactQrUrls)
      || contactQrUrls.length > 8
      || contactQrUrls.some(item => typeof item !== 'string' || !UPLOADED_IMAGE_URL_PATTERN.test(item))) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactQrUrls'],
        message: 'contactQrUrls must contain at most 8 uploaded image URLs'
      })
    } else if (new Set(contactQrUrls).size !== contactQrUrls.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactQrUrls'],
        message: 'contactQrUrls must not contain duplicate URLs'
      })
    }
  }
  const boxes = value.boxes
  if (boxes !== undefined) {
    const validBox = (item: unknown): boolean => {
      if (!isPlainObject(item)) return false
      const allowedKeys = new Set(['id', 'title', 'body', 'items', 'icon', 'tone'])
      if (Object.keys(item).some(key => !allowedKeys.has(key))) return false
      if (typeof item.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(item.id)) return false
      if (typeof item.title !== 'string' || !item.title.trim() || item.title.trim().length > 120) return false
      if (item.body !== undefined && (typeof item.body !== 'string' || item.body.length > 4000)) return false
      if (item.icon !== undefined && (typeof item.icon !== 'string' || item.icon.length > 80)) return false
      if (item.tone !== undefined && !['plain', 'green', 'blue', 'amber'].includes(String(item.tone))) return false
      return item.items === undefined
        || (Array.isArray(item.items)
          && item.items.length <= 30
          && item.items.every(entry => typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 500))
    }
    if (!Array.isArray(boxes) || boxes.length > 24 || boxes.some(item => !validBox(item))) {
      ctx.addIssue({
        code: 'custom',
        path: ['boxes'],
        message: 'boxes must contain at most 24 valid content boxes'
      })
    } else if (new Set(boxes.map(item => (item as { id: string }).id)).size !== boxes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['boxes'],
        message: 'boxes must not contain duplicate ids'
      })
    }
  }
  for (const [key, maxLength] of [
    ['contactName', 120],
    ['contactPhone', 120],
    ['featuredSummary', 800]
  ] as const) {
    const candidate = value[key]
    if (candidate !== undefined
      && candidate !== ''
      && (typeof candidate !== 'string' || candidate.trim().length > maxLength)) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} must be a string no longer than ${maxLength} characters`
      })
    }
  }
  const contactPhones = value.contactPhones
  if (contactPhones !== undefined) {
    if (!Array.isArray(contactPhones)
      || contactPhones.length > 12
      || contactPhones.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 40)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactPhones'],
        message: 'contactPhones must contain at most 12 non-empty strings of 40 characters or fewer'
      })
    } else if (new Set(contactPhones.map(item => item.trim())).size !== contactPhones.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactPhones'],
        message: 'contactPhones must not contain duplicate numbers'
      })
    }
  }
  const sortOrder = value.sortOrder
  if (sortOrder !== undefined
    && sortOrder !== ''
    && (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999)) {
    ctx.addIssue({
      code: 'custom',
      path: ['sortOrder'],
      message: 'sortOrder must be an integer between 0 and 9999'
    })
  }
})

const contentFields = {
  kind: z.enum(CONTENT_KINDS),
  slug: slugSchema,
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(800),
  body: z.string().trim().max(100000),
  category: nullableTextSchema(80),
  audience: nullableTextSchema(120),
  metadata: contentMetadataSchema,
  isFeatured: z.boolean(),
  lastVerifiedAt: nullableDateSchema,
  sourceIds: sourceIdsSchema
}

export const createContentSchema = z.object({
  ...contentFields,
  metadata: contentFields.metadata.default({}),
  sourceIds: sourceIdsSchema.default([])
}).strict()
export const updateContentSchema = z.object(contentFields).partial().strict()

const procedureStepSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).default(''),
  audience: procedureAudienceSchema.default([...PROCEDURE_AUDIENCES]),
  informationState: z.enum(PROCEDURE_INFORMATION_STATES),
  timeText: nullableTextSchema(300),
  placeId: nullableUuidSchema,
  departmentId: nullableUuidSchema,
  actionUrl: nullableUrlSchema
}).strict()

const procedureMaterialSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).default(''),
  audience: procedureAudienceSchema.default([...PROCEDURE_AUDIENCES]),
  isRequired: z.boolean().nullable().default(null),
  informationState: z.enum(PROCEDURE_INFORMATION_STATES),
  placeId: nullableUuidSchema,
  departmentId: nullableUuidSchema
}).strict()

const procedureFields = {
  slug: slugSchema,
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(800),
  body: z.string().trim().max(100000),
  category: nullableTextSchema(80),
  audience: procedureAudienceSchema,
  method: z.enum(PROCEDURE_METHODS),
  informationState: z.enum(PROCEDURE_INFORMATION_STATES),
  statusText: z.string().trim().min(1).max(240),
  processingTime: nullableTextSchema(240),
  deadlineText: nullableTextSchema(500),
  startsAt: nullableDateSchema,
  endsAt: nullableDateSchema,
  validFrom: nullableDateSchema,
  validUntil: nullableDateSchema,
  departmentId: nullableUuidSchema,
  guideId: nullableUuidSchema,
  lastVerifiedAt: nullableDateSchema,
  sourceIds: sourceIdsSchema,
  placeIds: z.array(z.string().uuid()).max(50)
    .refine(value => new Set(value).size === value.length, 'placeIds must be unique'),
  steps: z.array(procedureStepSchema).min(1).max(100),
  materials: z.array(procedureMaterialSchema).max(100)
}

interface ProcedureDateInput {
  startsAt?: string | null
  endsAt?: string | null
  validFrom?: string | null
  validUntil?: string | null
}

function validateProcedureDates(value: ProcedureDateInput, context: z.RefinementCtx): void {
  for (const [startKey, endKey] of [
    ['startsAt', 'endsAt'],
    ['validFrom', 'validUntil']
  ] as const) {
    const start = value[startKey]
    const end = value[endKey]
    if (start && end && Date.parse(end) < Date.parse(start)) {
      context.addIssue({
        code: 'custom',
        path: [endKey],
        message: `${endKey} must not be earlier than ${startKey}`
      })
    }
  }
}

export const createProcedureSchema = z.object({
  ...procedureFields,
  body: procedureFields.body.default(''),
  audience: procedureAudienceSchema.default([...PROCEDURE_AUDIENCES]),
  sourceIds: sourceIdsSchema.default([]),
  placeIds: procedureFields.placeIds.default([]),
  materials: procedureFields.materials.default([])
}).strict().superRefine(validateProcedureDates)
export const updateProcedureSchema = z.object(procedureFields)
  .partial()
  .strict()
  .superRefine(validateProcedureDates)

const sourceFields = {
  title: z.string().trim().min(1).max(300),
  url: httpUrlSchema,
  platform: z.string().trim().min(1).max(80),
  publisherName: z.string().trim().min(1).max(160),
  sourceLevel: z.enum(SOURCE_LEVELS),
  isOfficial: z.boolean(),
  publishedAt: nullableDateSchema,
  accessedAt: z.iso.datetime({ offset: true }),
  notes: nullableTextSchema(4000),
  status: z.enum(SOURCE_STATUSES)
}

export const createSourceSchema = z.object(sourceFields).strict()
export const updateSourceSchema = z.object(sourceFields).partial().strict()

export const createFeedbackSchema = z.object({
  targetType: z.enum(FEEDBACK_TARGET_TYPES),
  targetId: z.union([z.string().uuid(), z.null()]).optional(),
  reasonType: z.string().trim().min(1).max(80),
  message: z.string().trim().min(5).max(4000),
  evidenceUrl: nullableUrlSchema,
  pageUrl: nullableLocalPagePathSchema,
  contact: nullableTextSchema(300),
  website: z.string().max(0).optional()
}).strict().superRefine((value, context) => {
  if (value.targetType !== 'general' && !value.targetId) {
    context.addIssue({
      code: 'custom',
      path: ['targetId'],
      message: 'targetId is required for place, content, or procedure feedback'
    })
  }

  if (value.targetType === 'general' && value.targetId) {
    context.addIssue({
      code: 'custom',
      path: ['targetId'],
      message: 'targetId must be empty for general feedback'
    })
  }
})

export const updateFeedbackSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  resolutionNote: nullableTextSchema(4000)
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required')

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128)
}).strict()

export const changeAdminPasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128)
}).strict().refine(
  value => value.currentPassword !== value.newPassword,
  { path: ['newPassword'], message: 'New password must be different' }
)

export const createOrganizationAdminSchema = z.object({
  contentId: z.string().uuid(),
  username: z.string().trim().min(2).max(80).regex(/^[a-z0-9._-]+$/i).optional()
}).strict()

export const updateOrganizationAdminSchema = z.object({
  isActive: z.boolean().optional(),
  resetPassword: z.boolean().optional()
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required')

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional()
})

export const publicPlacesQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(PLACE_SCOPES).optional(),
  type: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  featured: z.enum(['true', 'false']).optional()
})

export const adminPlacesQuerySchema = publicPlacesQuerySchema.extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  coordinateVerification: z.enum(COORDINATE_VERIFICATION_STATES).optional()
})

const coordinateObservationSampleSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  accuracyMeters: z.number().min(0).max(1000),
  capturedAt: z.iso.datetime({ offset: true })
}).strict()

export const createCoordinateObservationSchema = z.object({
  clientObservationId: z.string().uuid(),
  placeId: z.string().uuid(),
  coordinateSystem: z.literal('WGS84').default('WGS84'),
  captureMethod: z.enum(COORDINATE_OBSERVATION_METHODS),
  pointRole: z.enum(COORDINATE_POINT_ROLES),
  evidenceNote: z.string().trim().min(5).max(2000),
  samples: z.array(coordinateObservationSampleSchema).min(1).max(10)
}).strict().superRefine((value, context) => {
  if (value.captureMethod === 'browser-geolocation'
    && !evaluateCoordinateCapture(value.samples).canSubmit) {
    context.addIssue({
      code: 'custom',
      path: ['samples'],
      message: `Browser geolocation observations require ${BROWSER_GEOLOCATION_MIN_SAMPLES}-${BROWSER_GEOLOCATION_MAX_SAMPLES} stable samples over the field capture interval`
    })
  }
})

export const coordinateObservationsQuerySchema = paginationQuerySchema.extend({
  placeId: z.string().uuid().optional(),
  status: z.enum(COORDINATE_OBSERVATION_STATUSES).optional()
})

export const reviewCoordinateObservationSchema = z.object({
  note: z.string().trim().min(5).max(2000)
}).strict()

export const publicContentQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(CONTENT_KINDS).optional(),
  category: z.string().trim().max(80).optional(),
  featured: z.enum(['true', 'false']).optional()
})

export const adminContentQuerySchema = publicContentQuerySchema.extend({
  status: z.enum(['draft', 'published', 'archived']).optional()
})

export const publicProceduresQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().max(80).optional(),
  audience: z.enum(PROCEDURE_AUDIENCES).optional()
})

export const adminProceduresQuerySchema = publicProceduresQuerySchema.extend({
  status: z.enum(['draft', 'published', 'archived']).optional()
})

export const sourcesQuerySchema = paginationQuerySchema.extend({
  level: z.enum(SOURCE_LEVELS).optional(),
  status: z.enum(SOURCE_STATUSES).optional(),
  official: z.enum(['true', 'false']).optional()
})

export const feedbackQuerySchema = paginationQuerySchema.extend({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  targetType: z.enum(FEEDBACK_TARGET_TYPES).optional()
})

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  type: z.enum(PUBLIC_SEARCH_RESULT_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
})

export const assistantQuestionSchema = z.object({
  q: z.string().trim().min(4).max(160)
}).strict()

export const userLoginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128)
}).strict()

export const updateUserProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  major: z.union([z.string().trim().max(80), z.literal(''), z.null()]).optional(),
  dormBuilding: z.union([z.string().trim().max(80), z.literal(''), z.null()]).optional()
}).strict()

export const createAppUserSchema = z.object({
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_\u4e00-\u9fff.-]+$/, 'Invalid username'),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(40),
  major: z.union([z.string().trim().max(80), z.literal(''), z.null()]).optional(),
  dormBuilding: z.union([z.string().trim().max(80), z.literal(''), z.null()]).optional()
}).strict()

export const updateAppUserSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  major: z.union([z.string().trim().max(80), z.literal(''), z.null()]).optional(),
  dormBuilding: z.union([z.string().trim().max(80), z.literal(''), z.null()]).optional(),
  status: z.enum(['active', 'disabled', 'banned']).optional(),
  password: z.string().min(8).max(128).optional()
}).strict()

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'disabled', 'banned']).optional(),
  major: z.string().trim().max(80).optional(),
  dormBuilding: z.string().trim().max(80).optional()
})

export const visitorTrackSchema = z.object({
  action: z.string().trim().min(1).max(64).regex(/^[a-z0-9_:-]+$/i),
  path: z.string().trim().max(2048).optional(),
  meta: z.record(z.string(), z.unknown()).optional()
}).strict()

export const adminVisitorsQuerySchema = paginationQuerySchema.extend({
  ip: z.string().trim().max(80).optional(),
  banned: z.enum(['true', 'false']).optional(),
  sort: z.enum(['last-seen', 'first-seen', 'event-count']).optional().default('last-seen')
})

export const adminVisitorBansQuerySchema = paginationQuerySchema.extend({
  active: z.enum(['true', 'false', 'all']).optional().default('all'),
  scope: z.enum(['ip', 'visitor', 'user']).optional(),
  q: z.string().trim().max(200).optional()
})

export const adminAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().trim().max(80).optional()
})

export const adminAssistantRunsQuerySchema = paginationQuerySchema.extend({
  retrievalPath: z.enum([
    'feature_api',
    'local_database',
    'answer_cache',
    'web_cache',
    'web_search',
    'error'
  ]).optional(),
  success: z.enum(['true', 'false']).optional()
})

export const createVisitorBanSchema = z.object({
  scope: z.enum(['ip', 'visitor', 'user']),
  value: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(500),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional()
}).strict()

export const sendChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(1000)
}).strict()

export const chatMessagesQuerySchema = z.object({
  after: z.string().uuid().optional(),
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
})

export const adminChatMessagesQuerySchema = paginationQuerySchema.extend({
  roomId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  deleted: z.enum(['true', 'false', 'all']).optional()
})

export const muteChatUserSchema = z.object({
  userId: z.string().uuid(),
  roomId: z.union([z.string().uuid(), z.null()]).optional(),
  reason: z.string().trim().min(1).max(500),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional()
}).strict()

export const muteAllChatRoomSchema = z.object({
  muted: z.boolean(),
  reason: z.string().trim().max(500).optional()
}).strict().superRefine((value, ctx) => {
  if (value.muted && !(value.reason && value.reason.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'Reason is required when enabling mute-all'
    })
  }
})

export const updateFrontendFeatureSchema = z.object({
  key: z.enum(FRONTEND_FEATURE_KEYS),
  enabled: z.boolean()
}).strict()
