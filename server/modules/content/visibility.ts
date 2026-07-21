import { sql, type SQL } from 'drizzle-orm'
import type { ContentKind } from '../../../shared/constants/server'
import { contents } from '../../database/schema'
import { safeMetadataRecord } from '../../utils/serializers'

interface MetadataBoundary {
  state: 'missing' | 'valid' | 'invalid'
  timestamp: number | null
}

function metadataBoundary(metadata: Record<string, unknown>, key: string): MetadataBoundary {
  const value = metadata[key]
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return { state: 'missing', timestamp: null }
  }
  if (typeof value !== 'string') return { state: 'invalid', timestamp: null }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp)
    ? { state: 'invalid', timestamp: null }
    : { state: 'valid', timestamp }
}

export function isPublicContentCurrentlyVisible(
  kind: ContentKind,
  metadataJson: string,
  now = Date.now()
): boolean {
  if (kind !== 'notice') return true

  let parsed: unknown
  try {
    parsed = JSON.parse(metadataJson)
  } catch {
    return false
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false

  // Strip prototype-pollution keys before reading schedule boundaries.
  const metadata = safeMetadataRecord(parsed)

  const validFrom = metadataBoundary(metadata, 'validFrom')
  const validUntil = metadataBoundary(metadata, 'validUntil')
  if (validFrom.state === 'invalid' || validUntil.state === 'invalid') return false
  return (validFrom.timestamp === null || validFrom.timestamp <= now)
    && (validUntil.timestamp === null || validUntil.timestamp >= now)
}

export function activePublicContentCondition(now = Date.now()): SQL {
  const nowIso = new Date(now).toISOString()

  return sql`(
    ${contents.kind} <> 'notice'
    OR (
      json_valid(${contents.metadataJson}) = 1
      AND
      (
        json_type(${contents.metadataJson}, '$.validFrom') IS NULL
        OR json_type(${contents.metadataJson}, '$.validFrom') = 'null'
        OR trim(CAST(json_extract(${contents.metadataJson}, '$.validFrom') AS TEXT)) = ''
        OR (
          json_type(${contents.metadataJson}, '$.validFrom') = 'text'
          AND julianday(json_extract(${contents.metadataJson}, '$.validFrom')) IS NOT NULL
          AND julianday(json_extract(${contents.metadataJson}, '$.validFrom')) <= julianday(${nowIso})
        )
      )
      AND (
        json_type(${contents.metadataJson}, '$.validUntil') IS NULL
        OR json_type(${contents.metadataJson}, '$.validUntil') = 'null'
        OR trim(CAST(json_extract(${contents.metadataJson}, '$.validUntil') AS TEXT)) = ''
        OR (
          json_type(${contents.metadataJson}, '$.validUntil') = 'text'
          AND julianday(json_extract(${contents.metadataJson}, '$.validUntil')) IS NOT NULL
          AND julianday(json_extract(${contents.metadataJson}, '$.validUntil')) >= julianday(${nowIso})
        )
      )
    )
  )`
}
