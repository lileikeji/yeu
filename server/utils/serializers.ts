import type { ApiContent, ApiFeedback, ApiPlace, ApiSource } from '../../shared/types/server'
import type { contents, feedback, places, sources } from '../database/schema'

type SourceRow = typeof sources.$inferSelect
type PlaceRow = typeof places.$inferSelect
type ContentRow = typeof contents.$inferSelect
type FeedbackRow = typeof feedback.$inferSelect

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

function safeMetadata(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function serializeSource(row: SourceRow): ApiSource {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
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
    ...serializeSource(row),
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
    navigationAvailable,
    ...(includeInternalCoordinates ? { sourceRawRef: row.sourceRawRef } : {}),
    openingHours: row.openingHours,
    phone: row.phone,
    website: row.website,
    externalMapUrl: row.externalMapUrl,
    isOfficial: row.isOfficial,
    isFeatured: row.isFeatured,
    status: row.status,
    lastVerifiedAt: toIso(row.lastVerifiedAt),
    publishedAt: toIso(row.publishedAt),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    sources: sourceRows.map(serializeSource)
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
    sources: sourceRows.map(serializeSource)
  }
}

export function serializeFeedback(row: FeedbackRow): ApiFeedback {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    reasonType: row.reasonType,
    message: row.message,
    evidenceUrl: row.evidenceUrl,
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
