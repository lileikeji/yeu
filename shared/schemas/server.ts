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
  PLACE_REVIEW_STATUSES,
  REVIEW_SCORE_MAX,
  REVIEW_SCORE_MIN,
  PLACE_REVIEW_CONTENT_MAX,
  PUBLIC_SEARCH_RESULT_TYPES,
  PROCEDURE_AUDIENCES,
  PROCEDURE_INFORMATION_STATES,
  PROCEDURE_METHODS,
  SOURCE_LEVELS,
  SOURCE_STATUSES
} from '../constants/server'
import { evaluateCoordinateCapture } from '../utils/coordinate-sampling'
import { isSafePublicHttpUrl } from '../utils/public-http-url'
import { isSafeLocalPagePath } from '../utils/notice-actions'

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

  for (const key of ['groupQrUrl', 'contactQrUrl', 'iconUrl'] as const) {
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
  for (const key of ['overviewTitle', 'direction', 'suitableFor', 'findingIt'] as const) {
    const candidate = value[key]
    if (candidate !== undefined
      && (typeof candidate !== 'string' || candidate.length > 2000)) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} must be a string of at most 2000 characters`
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
  for (const key of ['groupQrTitles', 'contactQrTitles'] as const) {
    const titles = value[key]
    if (titles !== undefined
      && (!Array.isArray(titles)
        || titles.length > 8
        || titles.some(title => (
          typeof title !== 'string'
          || title.length > 100
          || title !== title.trim()
        )))) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} must contain at most 8 trimmed titles of at most 100 characters`
      })
    }
  }
  const signupQuestions = value.signupQuestions
  if (signupQuestions !== undefined) {
    if (!Array.isArray(signupQuestions)
      || signupQuestions.length < 1
      || signupQuestions.length > 12
      || signupQuestions.some(item => (
        typeof item !== 'string'
        || item.trim().length < 1
        || item.trim().length > 300
        || item !== item.trim()
      ))) {
      ctx.addIssue({
        code: 'custom',
        path: ['signupQuestions'],
        message: 'signupQuestions must contain 1 to 12 trimmed questions of at most 300 characters'
      })
    } else if (new Set(signupQuestions).size !== signupQuestions.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['signupQuestions'],
        message: 'signupQuestions must not contain duplicate questions'
      })
    }
  }
  const signupQa = value.signupQa
  if (signupQa !== undefined) {
    const validQa = (item: unknown): boolean => {
      if (!isPlainObject(item)) return false
      if (Object.keys(item).some(key => !['question', 'answer'].includes(key))) return false
      if (typeof item.question !== 'string'
        || item.question.trim().length < 1
        || item.question.trim().length > 300
        || item.question !== item.question.trim()) return false
      return typeof item.answer === 'string'
        && item.answer.trim().length <= 2000
        && item.answer === item.answer.trim()
    }
    if (!Array.isArray(signupQa)
      || signupQa.length < 1
      || signupQa.length > 12
      || signupQa.some(item => !validQa(item))) {
      ctx.addIssue({
        code: 'custom',
        path: ['signupQa'],
        message: 'signupQa must contain 1 to 12 question and answer objects'
      })
    } else {
      const questions = signupQa.map(item => (item as { question: string }).question)
      if (new Set(questions).size !== questions.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['signupQa'],
          message: 'signupQa must not contain duplicate questions'
        })
      }
    }
  }
  const boxes = value.boxes
  if (boxes !== undefined) {
    const validBox = (item: unknown): boolean => {
      if (!isPlainObject(item)) return false
      const allowedKeys = new Set([
        'id', 'title', 'body', 'items', 'icon', 'tone',
        'placement', 'imageUrls', 'imageTitles'
      ])
      if (Object.keys(item).some(key => !allowedKeys.has(key))) return false
      if (typeof item.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(item.id)) return false
      if (typeof item.title !== 'string' || !item.title.trim() || item.title.trim().length > 120) return false
      if (item.body !== undefined && (typeof item.body !== 'string' || item.body.length > 4000)) return false
      if (item.icon !== undefined && (typeof item.icon !== 'string' || item.icon.length > 80)) return false
      if (item.tone !== undefined && !['plain', 'green', 'blue', 'amber'].includes(String(item.tone))) return false
      if (item.placement !== undefined && ![
        'default',
        'after-overview',
        'after-signup',
        'after-intro',
        'after-recruitment',
        'after-contact',
        'before-community'
      ].includes(String(item.placement))) return false
      const imageUrls = item.imageUrls
      const imageTitles = item.imageTitles
      if (imageUrls !== undefined && (
        !Array.isArray(imageUrls)
        || imageUrls.length > 8
        || imageUrls.some(url => (
          typeof url !== 'string'
          || !/^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i.test(url)
        ))
      )) return false
      if (imageTitles !== undefined && (
        !Array.isArray(imageTitles)
        || imageTitles.length !== (Array.isArray(imageUrls) ? imageUrls.length : 0)
        || imageTitles.some(title => typeof title !== 'string' || title.trim().length > 120)
      )) return false
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
    ['featuredSummary', 800],
    ['homeEntryContent', 5000]
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
  const noticeActions = value.noticeActions
  if (noticeActions !== undefined) {
    const validAction = (item: unknown): boolean => {
      if (!isPlainObject(item)) return false
      if (Object.keys(item).some(key => !['label', 'href', 'icon'].includes(key))) return false
      if (typeof item.label !== 'string' || item.label.trim().length < 1 || item.label.trim().length > 60) return false
      if (typeof item.href !== 'string' || (!isSafeLocalPagePath(item.href.trim()) && !isSafePublicHttpUrl(item.href.trim()))) return false
      return item.icon === undefined || (typeof item.icon === 'string' && item.icon.trim().length <= 80)
    }
    if (!Array.isArray(noticeActions) || noticeActions.length > 12 || noticeActions.some(item => !validAction(item))) {
      ctx.addIssue({
        code: 'custom',
        path: ['noticeActions'],
        message: 'noticeActions must contain at most 12 safe links with labels'
      })
    }
  }
  const homeEntrySourceUrl = value.homeEntrySourceUrl
  if (homeEntrySourceUrl !== undefined
    && homeEntrySourceUrl !== ''
    && (typeof homeEntrySourceUrl !== 'string'
      || (!isSafeLocalPagePath(homeEntrySourceUrl.trim())
        && !isSafePublicHttpUrl(homeEntrySourceUrl.trim())))) {
    ctx.addIssue({
      code: 'custom',
      path: ['homeEntrySourceUrl'],
      message: 'homeEntrySourceUrl must be a safe local path or public http(s) URL'
    })
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

// Feedback targets are opaque ids: places/contents/procedures use UUIDs while
// compiled knowledge claims use `docclaim:<documentId>:<digest>` (see
// server/modules/knowledge/document-compiler.ts), so the pattern stays bounded
// but does not require a UUID shape.
const feedbackTargetIdSchema = z.string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/, 'Invalid target id')

export const createFeedbackSchema = z.object({
  targetType: z.enum(FEEDBACK_TARGET_TYPES),
  targetId: z.union([feedbackTargetIdSchema, z.null()]).optional(),
  reasonType: z.string().trim().min(1).max(80),
  message: z.string().trim().min(5).max(4000),
  expected: nullableTextSchema(1000),
  evidenceUrl: nullableUrlSchema,
  pageUrl: nullableLocalPagePathSchema,
  contact: nullableTextSchema(300),
  website: z.string().max(0).optional()
}).strict().superRefine((value, context) => {
  if (value.targetType !== 'general' && !value.targetId) {
    context.addIssue({
      code: 'custom',
      path: ['targetId'],
      message: 'targetId is required for place, content, procedure, or claim feedback'
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
  username: z.string().trim().min(2).max(80)
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fff.-]+$/, 'Invalid username')
    .optional()
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

export const NEARBY_GUIDE_SCOPES = ['nearby', 'city'] as const

/** 周边攻略是静态整理内容，只需要 scope / category 两个筛选条件。 */
export const nearbyGuideQuerySchema = z.object({
  scope: z.enum(NEARBY_GUIDE_SCOPES).optional(),
  category: z.string().trim().max(40).optional()
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
  q: z.string().trim().min(2).max(160),
  previousQ: z.string().trim().min(2).max(160).optional(),
  sessionId: z.string().trim().min(8).max(128)
    .regex(/^[A-Za-z0-9._~-]+$/, 'Invalid session id')
    .optional()
}).strict()

// 开放注册（邮箱验证码 + 图形验证码反扒）
export const userRegistrationCodeSchema = z.object({
  username: z.string().trim().min(2).max(20),
  nickname: z.string().trim().max(12).optional(),
  email: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(72),
  captchaId: z.string().trim().min(8).max(80),
  captchaCode: z.string().trim().min(4).max(8)
}).strict()

export const userRegisterSchema = z.object({
  username: z.string().trim().min(2).max(20),
  nickname: z.string().trim().max(12).optional(),
  email: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(72),
  code: z.string().trim().min(6).max(6)
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

export const MINIAPP_TELEMETRY_ACTIONS = [
  'page_view',
  'module_view',
  'search_submit',
  'result_click',
  'map_marker_select',
  'open_location',
  'route_plan',
  'api_request',
  'api_error',
  'feedback_open'
] as const

const MINIAPP_TELEMETRY_META_MAX_KEYS = 32
const MINIAPP_TELEMETRY_META_MAX_JSON_CHARS = 8_192
const MINIAPP_TELEMETRY_META_MAX_DEPTH = 4

function metadataDepthForTelemetry(value: unknown, depth = 0): number {
  if (depth > MINIAPP_TELEMETRY_META_MAX_DEPTH || value === null || typeof value !== 'object') {
    return depth
  }
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)
  return children.reduce(
    (max, child) => Math.max(max, metadataDepthForTelemetry(child, depth + 1)),
    depth
  )
}

const MINIAPP_TELEMETRY_ACTION_ALIASES: Record<string, typeof MINIAPP_TELEMETRY_ACTIONS[number]> = {
  result_open: 'result_click',
  map_marker: 'map_marker_select',
  navigation: 'open_location',
  search: 'search_submit'
}

export const miniappTelemetrySchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const value = raw as Record<string, unknown>
  const action = typeof value.action === 'string'
    ? MINIAPP_TELEMETRY_ACTION_ALIASES[value.action] ?? value.action
    : value.action
  return { ...value, action }
}, z.object({
  action: z.enum(MINIAPP_TELEMETRY_ACTIONS),
  pathname: z.string().trim().max(2048).optional(),
  path: z.string().trim().max(2048).optional(),
  meta: z.record(z.string().max(80), z.unknown()).optional()
}).strict().superRefine((value, context) => {
  if (value.pathname === undefined && value.path === undefined) return
  const candidate = value.pathname ?? value.path
  if (candidate && (!candidate.startsWith('/') || candidate.includes('://'))) {
    context.addIssue({
      code: 'custom',
      path: ['pathname'],
      message: 'pathname must be an application-local path'
    })
  }
  if (!value.meta) return
  if (Object.keys(value.meta).length > MINIAPP_TELEMETRY_META_MAX_KEYS) {
    context.addIssue({
      code: 'custom',
      path: ['meta'],
      message: `meta may contain at most ${MINIAPP_TELEMETRY_META_MAX_KEYS} keys`
    })
  }
  if (metadataDepthForTelemetry(value.meta) > MINIAPP_TELEMETRY_META_MAX_DEPTH) {
    context.addIssue({
      code: 'custom',
      path: ['meta'],
      message: `meta nesting exceeds ${MINIAPP_TELEMETRY_META_MAX_DEPTH} levels`
    })
  }
  try {
    if (JSON.stringify(value.meta).length > MINIAPP_TELEMETRY_META_MAX_JSON_CHARS) {
      context.addIssue({
        code: 'custom',
        path: ['meta'],
        message: `meta JSON exceeds ${MINIAPP_TELEMETRY_META_MAX_JSON_CHARS} characters`
      })
    }
  } catch {
    context.addIssue({
      code: 'custom',
      path: ['meta'],
      message: 'meta must be JSON-serializable'
    })
  }
}))

export const adminMiniappAnalyticsQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24)
}).strict()

export const publicPageViewStatsQuerySchema = z.object({
  path: z.string().trim().min(1).max(2048).default('/')
}).strict()

export const adminVisitorsQuerySchema = paginationQuerySchema.extend({
  ip: z.string().trim().max(80).optional(),
  banned: z.enum(['true', 'false']).optional(),
  sort: z.enum(['last-seen', 'first-seen', 'event-count']).optional().default('last-seen'),
  analytics: z.enum(['true', 'false']).optional().default('true')
})

export const adminVisitorBansQuerySchema = paginationQuerySchema.extend({
  active: z.enum(['true', 'false', 'all']).optional().default('all'),
  scope: z.enum(['ip', 'visitor', 'user']).optional(),
  q: z.string().trim().max(200).optional(),
  id: z.uuid().optional()
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
  success: z.enum(['true', 'false']).optional(),
  channel: z.enum(['web', 'miniapp', 'qq', 'wechat']).optional()
})

const knowledgePublicUrlSchema = z.union([
  httpUrlSchema,
  localPagePathSchema,
  z.literal(''),
  z.null()
]).optional()

const knowledgeClaimSourceSchema = z.object({
  sourceId: z.string().uuid(),
  documentId: z.union([z.string().uuid(), z.null()]).optional(),
  evidenceQuote: z.string().trim().max(4000).default(''),
  locator: z.string().trim().max(500).default(''),
  isPrimary: z.boolean().default(false)
}).strict()

const knowledgeClaimFields = {
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(200),
  statement: z.string().trim().min(4).max(20_000),
  keywords: z.array(z.string().trim().min(1).max(80)).max(100),
  confidenceLabel: z.enum(['extracted', 'inferred', 'ambiguous', 'unverified']),
  confidenceScore: z.number().int().min(0).max(100),
  reviewStatus: z.enum(['draft', 'review', 'published', 'rejected', 'archived']),
  publicUrl: knowledgePublicUrlSchema,
  sourceNote: z.string().trim().max(4000),
  validFrom: nullableDateSchema,
  validUntil: nullableDateSchema,
  supersedesClaimId: nullableUuidSchema,
  sources: z.array(knowledgeClaimSourceSchema).max(20)
}

export const createKnowledgeClaimSchema = z.object({
  ...knowledgeClaimFields,
  keywords: knowledgeClaimFields.keywords.default([]),
  confidenceLabel: knowledgeClaimFields.confidenceLabel.default('unverified'),
  confidenceScore: knowledgeClaimFields.confidenceScore.default(50),
  reviewStatus: knowledgeClaimFields.reviewStatus.default('draft'),
  sourceNote: knowledgeClaimFields.sourceNote.default(''),
  sources: knowledgeClaimFields.sources.default([])
}).strict()

export const updateKnowledgeClaimSchema = z.object(knowledgeClaimFields)
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'At least one field is required')

export const adminKnowledgeClaimsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'review', 'published', 'rejected', 'archived']).optional(),
  confidenceLabel: z.enum(['extracted', 'inferred', 'ambiguous', 'unverified']).optional(),
  category: z.string().trim().max(80).optional(),
  issue: z.enum(['missing-source', 'expired', 'unverified', 'conflict']).optional()
})

export const adminKnowledgeLibraryQuerySchema = paginationQuerySchema.extend({
  collection: z.enum(['entries', 'web', 'documents', 'claims', 'structured']).default('entries'),
  category: z.string().trim().max(80).optional(),
  status: z.string().trim().max(40).optional()
})

export const createVisitorBanSchema = z.object({
  scope: z.enum(['ip', 'visitor', 'user']),
  value: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(500),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional()
}).strict()

// 进入楼栋群：placeId 为已发布楼栋类点位 id
export const enterPlaceChatRoomSchema = z.object({
  placeId: z.string().trim().min(1).max(120)
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
  enabled: z.boolean(),
  placement: z.enum(['default', 'quick', 'timeline', 'services']).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
}).strict()

/**
 * Public map place ids come from merged catalogs: AMap owner-map imports
 * (`amap-import-row-030`), native AMap POI ids (`B0FFGK62L3`), DB place
 * uuids, or preview fixture ids. Allow only stable identifier shapes so
 * arbitrary strings cannot be used as review keys.
 */
const publicPlaceIdSchema = z.string().trim().min(1).max(120).regex(
  /^(?:amap-import-row-\d{3}|amap-native-[A-Z0-9]{6,20}|amap-hotspot:[0-9.]+,[0-9.]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Z0-9]{8,20}|[a-z0-9][a-z0-9-]{0,99})$/,
  'Invalid place identifier'
)

export const createPlaceReviewSchema = z.object({
  placeId: publicPlaceIdSchema,
  score: z.number().int().min(REVIEW_SCORE_MIN).max(REVIEW_SCORE_MAX),
  content: z.string().trim().min(1).max(PLACE_REVIEW_CONTENT_MAX)
}).strict()

export const publicPlaceReviewsQuerySchema = z.object({
  placeId: publicPlaceIdSchema,
  sort: z.enum(['newest', 'hot']).optional()
}).strict()

// 服务端 generateReviewTrackCode 的字母表（去 I/O/0/1），8 位；大小写不敏感，
// 学生手抄的小写码也能查（服务端统一大写化后按原样存的大写匹配）。
export const REVIEW_TRACK_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/i

export const publicPlaceReviewTrackQuerySchema = z.object({
  code: z.string().regex(REVIEW_TRACK_CODE_PATTERN)
}).strict()

export const publicPlaceMomentsQuerySchema = z.object({
  placeId: publicPlaceIdSchema
}).strict()

// 校车留言：busName 是云一卡通 car_name（车号），routeName 只作上下文不参与分区。
export const createBusMomentSchema = z.object({
  busName: z.string().trim().min(1).max(50),
  routeName: z.string().trim().max(50).default(''),
  body: z.string().trim().min(1).max(300)
}).strict()

export const publicBusMomentsQuerySchema = z.object({
  busName: z.string().trim().min(1).max(50)
}).strict()

// 留言治理（后台）：kind 区分校车/地点留言。
export const momentKindSchema = z.enum(['bus', 'place'])

export const adminMomentsQuerySchema = z.object({
  kind: momentKindSchema,
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
}).strict()

export const moderateMomentActionSchema = z.object({
  kind: momentKindSchema,
  action: z.enum(['withdraw', 'restore']),
  reason: z.string().trim().max(200).optional()
}).strict()

// 地图点位反查关联事件：slug 可空（多数点位有，AMap 原生点位没有），name 必传兜底。
export const publicPlaceEventsQuerySchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120)
}).strict()

export const createPlaceMomentSchema = z.object({
  placeId: publicPlaceIdSchema,
  kind: z.enum(['comment', 'checkin']).default('comment'),
  body: z.string().max(300).default(''),
  images: z.array(z.string().max(200)).max(3).default([])
}).strict()

export const adminPlaceReviewsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PLACE_REVIEW_STATUSES).optional(),
  placeId: z.string().trim().max(120).optional(),
  userId: z.string().uuid().optional()
})

export const reviewPlaceReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(500).optional()
}).strict()

/** 后台编辑整理卡（source='seed'）：改文案和/或星级。 */
export const updateSeedReviewSchema = z.object({
  content: z.string().trim().min(1).max(2000).optional(),
  score: z.number().min(1).max(5).optional()
}).strict().refine(data => data.content !== undefined || data.score !== undefined, {
  message: '至少提供 content 或 score 之一'
})

/** 后台创建整理卡（source='seed'）。 */
export const createSeedReviewSchema = z.object({
  placeId: z.string().trim().min(1).max(100),
  score: z.number().min(1).max(5),
  content: z.string().trim().min(1).max(2000),
  sourcePlatform: z.enum(['dianping', 'meituan']).optional()
}).strict()

const RECRUIT_FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,31}$/

const recruitFormFieldSchema = z.object({
  key: z.string().regex(RECRUIT_FIELD_KEY_PATTERN),
  label: z.string().trim().min(1).max(40),
  type: z.enum(['text', 'textarea', 'select', 'multiselect']),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  optionDetails: z.record(z.string().max(40), z.string().trim().max(500)).optional(),
  placeholder: z.string().trim().max(80).optional()
}).strict().superRefine((field, context) => {
  if ((field.type === 'select' || field.type === 'multiselect')
    && (!field.options || field.options.length === 0)) {
    context.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'select fields require at least one option'
    })
  }
})

const recruitDocMappingSchema = z.object({
  label: z.string().trim().min(1).max(80),
  fieldKey: z.string().regex(RECRUIT_FIELD_KEY_PATTERN)
}).strict()

export const recruitPaymentSchema = z.object({
  enabled: z.boolean(),
  wechatImage: z.string().trim().max(300).nullable(),
  alipayImage: z.string().trim().max(300).nullable(),
  note: z.string().trim().max(200)
}).strict()

export const updateRecruitFormSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slogan: z.string().trim().max(200),
  intro: z.string().trim().max(5000),
  status: z.enum(['open', 'closed']),
  fields: z.array(recruitFormFieldSchema).max(40),
  doc: z.object({
    mappings: z.array(recruitDocMappingSchema).max(20),
    multiSelect: z.object({
      fieldKey: z.string().regex(RECRUIT_FIELD_KEY_PATTERN),
      mark: z.string().trim().min(1).max(4)
    }).strict().nullable()
  }).strict(),
  exportColumns: z.array(z.object({
    key: z.string().regex(RECRUIT_FIELD_KEY_PATTERN),
    label: z.string().trim().min(1).max(40)
  }).strict()).max(40),
  payment: recruitPaymentSchema,
  /** Optimistic-lock: reject the save when the stored row was changed after this page loaded. */
  baseUpdatedAt: z.number().int().nonnegative().optional()
}).strict()

export const uploadRecruitTemplateSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  dataBase64: z.string().min(100).max(4_200_000)
}).strict()

export const createReferrerSchema = z.object({
  name: z.string().trim().min(1).max(30),
  code: z.string().trim().max(16).optional()
}).strict()

export const publicRecruitDraftSchema = z.object({
  data: z.record(z.string().max(64), z.union([
    z.string().trim().max(200),
    z.array(z.string().trim().max(40)).max(30)
  ]))
}).strict()

export const publicRecruitSubmissionSchema = z.object({
  data: z.record(z.string().max(64), z.union([
    z.string().trim().max(200),
    z.array(z.string().trim().max(40)).max(30)
  ])),
  paymentConfirmed: z.boolean().optional()
}).strict()

// -- 新声歌手大赛（仅音乐协会） ----------------------------------------------

export const competitionDimensionSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(20),
  weight: z.number().positive().max(100)
}).strict()

export const competitionScheduleItemSchema = z.object({
  key: z.enum(['prelim', 'semi', 'final']),
  dateLabel: z.string().trim().max(40).default(''),
  timeLabel: z.string().trim().max(40).default(''),
  venue: z.string().trim().max(60).default(''),
  note: z.string().trim().max(80).default('')
}).strict()

export const competitionFormFieldSchema = z.object({
  key: z.enum(['name', 'className', 'studentNo', 'phone', 'email', 'song', 'preferredDay']),
  label: z.string().trim().min(1).max(20),
  required: z.boolean().default(false),
  enabled: z.boolean().default(true)
}).strict()

export const updateCompetitionSchema = z.object({
  title: z.string().trim().min(1).max(60),
  registrationOpen: z.boolean(),
  dimensions: z.array(competitionDimensionSchema).min(1).max(10),
  edition: z.string().trim().max(40).optional(),
  schedule: z.array(competitionScheduleItemSchema).min(1).max(12).optional(),
  formFields: z.array(competitionFormFieldSchema).min(1).max(7).optional()
}).strict()

export const updateCompetitionRoundSchema = z.object({
  status: z.enum(['draft', 'open', 'closed']).optional(),
  judgeCount: z.number().int().min(1).max(20).optional(),
  advanceCount: z.union([z.number().int().min(1).max(500), z.null()]).optional()
}).strict()

export const moveCompetitionEntrySchema = z.object({
  entryId: z.string().uuid(),
  targetId: z.string().uuid(),
  place: z.enum(['before', 'after']).optional()
}).strict()

export const reorderCompetitionRoundSchema = z.object({
  entryIds: z.array(z.string().min(1).max(64)).min(1).max(500)
}).strict()

/**
 * 顺序评分切人。`next` 要求当前这位全员已提交（缺人返回 409
 * COMPETITION_PENDING_JUDGES），`skip` 无视提交情况强制下一位。
 */
export const moveCompetitionCurrentSchema = z.object({
  action: z.enum(['start', 'next', 'prev', 'skip', 'stop', 'set']),
  entryId: z.string().min(1).max(64).optional()
}).strict()

export const createCompetitionJudgesSchema = z.object({
  count: z.number().int().min(1).max(20).optional(),
  /** 自定义登录账号（3-32 位字母数字下划线短横线），留空自动生成。 */
  username: z.string().trim().min(3).max(32).optional(),
  /** 自定义密码，至少 6 位；留空自动生成。 */
  password: z.string().min(6).max(128).optional(),
  displayName: z.string().trim().min(1).max(20).optional()
}).strict()

export const updateCompetitionJudgeSchema = z.object({
  displayName: z.string().trim().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
  /** 到岗天：1 / 2，null = 两天都在。 */
  day: z.number().int().min(1).max(2).nullable().optional(),
  username: z.string().trim().min(3).max(32).optional(),
  password: z.string().min(6).max(128).optional()
}).strict()

/** 切换初赛赛程天；split = 按当前出场顺序把名单平分成两天。 */
export const setCompetitionDaySchema = z.object({
  day: z.number().int().min(1).max(2).nullable(),
  split: z.boolean().optional()
}).strict()

/** 单条出场名单改到某一天。 */
export const setCompetitionEntryDaySchema = z.object({
  entryId: z.string().min(1).max(64),
  day: z.number().int().min(1).max(2).nullable()
}).strict()

// 现场扫码登记：班级/姓名/学号/电话/邮箱必填，歌曲可待定；
// 带 preRegistrationId = 从预报名确认生成。
const COMPETITION_STUDENT_NO_PATTERN = /^[0-9A-Za-z-]{4,20}$/
const COMPETITION_PHONE_PATTERN = /^1\d{10}$/
const COMPETITION_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const competitionRegistrationSchema = z.object({
  className: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(40),
  studentNo: z.string().trim().regex(COMPETITION_STUDENT_NO_PATTERN, '学号格式不正确'),
  phone: z.string().trim().regex(COMPETITION_PHONE_PATTERN, '手机号格式不正确'),
  email: z.string().trim().max(120).regex(COMPETITION_EMAIL_PATTERN, '邮箱格式不正确'),
  song: z.string().trim().max(80).optional(),
  preRegistrationId: z.string().trim().min(1).max(64).optional()
}).strict()

// 赛前预报名：只填姓名即可提交，其余到场确认时补全。
export const competitionPreRegisterSchema = z.object({
  name: z.string().trim().min(1).max(40),
  className: z.string().trim().max(60).optional(),
  studentNo: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(120).optional(),
  song: z.string().trim().max(80).optional(),
  preferredDay: z.number().int().min(1).max(2).optional()
}).strict()

export const competitionLookupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /** 学号后四位：与姓名一起构成最小双因子，避免凭姓名查到别人的联系方式。 */
  studentNoTail: z.string().trim().regex(/^\d{4}$/, '请填写学号后四位')
}).strict()

export const competitionSingerSchema = z.object({
  name: z.string().trim().min(1).max(40),
  song: z.string().trim().max(80),
  className: z.string().trim().max(60).nullable().optional(),
  remark: z.string().trim().max(500).nullable().optional(),
  studentNo: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
}).strict()

export const judgeLoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128)
}).strict()

export const submitCompetitionScoreSchema = z.object({
  scores: z.record(z.string().max(64), z.number().min(0).max(20)),
  comment: z.string().trim().max(500).optional()
}).strict()

export const competitionEmailTemplateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000)
}).strict()

export const competitionEmailSendSchema = z.object({
  /** all = 本轮全部有邮箱的选手；qualified / unqualified = 按本轮结果筛选。 */
  scope: z.enum(['all', 'qualified', 'unqualified']).default('all'),
  /** 显式指定 resend 名单（忽略已发送去重）。 */
  singerIds: z.array(z.string().min(1).max(64)).max(500).optional()
}).strict()

export const competitionEmailTestSchema = z.object({
  email: z.string().trim().min(3).max(120)
}).strict()

// 结果邮件插图：前端把 File 读成 base64 再提交，服务端按解码字节数卡 4MB。
export const competitionEmailImageUploadSchema = z.object({
  filename: z.string().trim().max(200).optional(),
  mime: z.string().trim().min(3).max(100),
  data: z.string().min(1)
}).strict()

// 报名二维码：仅允许赛事自己的两个公开页面，防被当开放代理。
export const competitionQrQuerySchema = z.object({
  path: z.enum(['/singer/pre-register', '/singer/register']),
  size: z.coerce.number().int().min(128).max(1024).catch(512),
  download: z.string().max(80).optional()
}).strict()
