import { z } from 'zod'
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

const contentFields = {
  kind: z.enum(CONTENT_KINDS),
  slug: slugSchema,
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(800),
  body: z.string().trim().max(100000),
  category: nullableTextSchema(80),
  audience: nullableTextSchema(120),
  metadata: z.record(z.string(), z.unknown()),
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
  password: z.string().min(12).max(1024)
}).strict()

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
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
