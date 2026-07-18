import type { ApiContent, ApiFeedback, ApiPlace, ApiSource } from '../../shared/types/server'
import type { contents, feedback, places, sources } from '../database/schema'
import { isSafePublicHttpUrl } from '../../shared/utils/public-http-url'

type SourceRow = typeof sources.$inferSelect
type PlaceRow = typeof places.$inferSelect
type ContentRow = typeof contents.$inferSelect
type FeedbackRow = typeof feedback.$inferSelect

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

/** Keys that must never reappear in API-facing metadata (write schema + read sanitize). */
const FORBIDDEN_METADATA_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const SAFE_METADATA_MAX_DEPTH = 6
const SAFE_METADATA_MAX_KEYS_PER_OBJECT = 64

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (depth > SAFE_METADATA_MAX_DEPTH) {
    return null
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeMetadataValue(item, depth + 1))
  }

  const out: Record<string, unknown> = {}
  let count = 0
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) continue
    if (count >= SAFE_METADATA_MAX_KEYS_PER_OBJECT) break
    out[key] = sanitizeMetadataValue(child, depth + 1)
    count += 1
  }
  return out
}

/**
 * Parse stored content/procedure metadata for API responses.
 * Defense-in-depth: strip prototype-pollution keys and bound depth/key fan-out
 * even if legacy or out-of-band JSON still contains them.
 */
export function safeMetadata(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return sanitizeMetadataValue(parsed, 0) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Same sanitize path for already-parsed JSON objects (e.g. audit details). */
export function safeMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return sanitizeMetadataValue(value, 0) as Record<string, unknown>
}

/** Public API: only expose http(s) URLs that pass the shared public-URL policy. */
function safeStoredHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return isSafePublicHttpUrl(trimmed) ? trimmed : null
}

export function serializeSource(row: SourceRow, sanitizeUrls = true): ApiSource {
  const url = sanitizeUrls
    ? (safeStoredHttpUrl(row.url) || '')
    : row.url
  return {
    id: row.id,
    title: row.title,
    url,
    platform: row.platform,
    publisherName: row.publisherName,
    sourceLevel: row.sourceLevel,
    isOfficial: row.isOfficial,
    publishedAt: toIso(row.publishedAt),
    accessedAt: new Date(row.accessedAt).toISOString(),
    status: row.status
  }
}

export function serializeAdminSource(row: SourceRow) {
  return {
    // Keep raw URLs in admin so editors can repair legacy/invalid values.
    ...serializeSource(row, false),
    notes: row.notes,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

export function serializePlace(
  row: PlaceRow,
  sourceRows: SourceRow[] = [],
  includeInternalCoordinates = false
): ApiPlace {
  const navigationAvailable = row.status === 'published'
    && row.coordinateVerification === 'verified'
    && row.longitude !== null
    && row.latitude !== null
    && row.coordinateSystem !== null
  const exposeCoordinates = includeInternalCoordinates || navigationAvailable
  // Admin keeps raw URL columns for repair; public strips unsafe values.
  const website = includeInternalCoordinates
    ? row.website
    : safeStoredHttpUrl(row.website)
  const externalMapUrl = includeInternalCoordinates
    ? row.externalMapUrl
    : safeStoredHttpUrl(row.externalMapUrl)

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    body: row.body,
    scope: row.scope,
    type: row.type,
    category: row.category,
    address: row.address,
    campusArea: row.campusArea,
    floor: row.floor,
    room: row.room,
    longitude: exposeCoordinates ? row.longitude : null,
    latitude: exposeCoordinates ? row.latitude : null,
    coordinateSystem: exposeCoordinates ? row.coordinateSystem : null,
    coordinateVerification: row.coordinateVerification,
    coordinateVerifiedAt: toIso(row.coordinateVerifiedAt),
    coordinatePointRole: row.coordinatePointRole,
    navigationAvailable,
    ...(includeInternalCoordinates ? { sourceRawRef: row.sourceRawRef } : {}),
    openingHours: row.openingHours,
    phone: row.phone,
    website,
    externalMapUrl,
    isOfficial: row.isOfficial,
    isFeatured: row.isFeatured,
    status: row.status,
    lastVerifiedAt: toIso(row.lastVerifiedAt),
    publishedAt: toIso(row.publishedAt),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    sources: sourceRows.map(source => serializeSource(source, !includeInternalCoordinates))
  }
}

export function serializeContent(row: ContentRow, sourceRows: SourceRow[] = []): ApiContent {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    audience: row.audience,
    metadata: safeMetadata(row.metadataJson),
    isFeatured: row.isFeatured,
    status: row.status,
    lastVerifiedAt: toIso(row.lastVerifiedAt),
    publishedAt: toIso(row.publishedAt),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    sources: sourceRows.map(source => serializeSource(source))
  }
}

export function serializeFeedback(row: FeedbackRow): ApiFeedback {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    reasonType: row.reasonType,
    message: row.message,
    // Null unsafe legacy evidence links; pageUrl is a local path (validated on write).
    evidenceUrl: safeStoredHttpUrl(row.evidenceUrl),
    pageUrl: row.pageUrl,
    contact: row.contact,
    status: row.status,
    resolutionNote: row.resolutionNote,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    resolvedAt: toIso(row.resolvedAt)
  }
}

export function fromIso(value: string | null | undefined): number | null | undefined {
  if (value === undefined) {
    return undefined
  }

  return value === null ? null : Date.parse(value)
}
