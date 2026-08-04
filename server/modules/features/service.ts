import { and, eq } from 'drizzle-orm'
import {
  FRONTEND_FEATURE_DEFINITIONS,
  type FrontendFeatureKey
} from '../../../shared/config/frontend-features'
import type { DatabaseClient } from '../../database/client'
import { contents, frontendFeatureSettings } from '../../database/schema'
import { activePublicContentCondition } from '../content/visibility'
import { safeMetadata } from '../../utils/serializers'
import { safeNoticeActionHref } from '../../../shared/utils/notice-actions'

export interface FrontendFeatureStatus {
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

export interface PublicFrontendFeatureSettings {
  disabledKeys: FrontendFeatureKey[]
  placements: Partial<Record<FrontendFeatureKey, 'default' | 'quick' | 'timeline' | 'services'>>
  sortOrders: Partial<Record<FrontendFeatureKey, number>>
  updatedAt: string | null
}

export type HomeEntryPlacement = 'quick' | 'services' | 'more'

export interface PublicHomeEntry {
  id: string
  title: string
  description: string
  to: string
  sourceUrl: string | null
  icon: string
  placement: HomeEntryPlacement
  sortOrder: number
}

function toIso(value: number | null | undefined): string | null {
  return typeof value === 'number' ? new Date(value).toISOString() : null
}

export function listFrontendFeatures(client: DatabaseClient): FrontendFeatureStatus[] {
  const rows = client.db.select().from(frontendFeatureSettings).all()
  const rowsByKey = new Map(rows.map(row => [row.key, row]))

  return FRONTEND_FEATURE_DEFINITIONS.map((definition) => {
    const row = rowsByKey.get(definition.key)
    return {
      ...definition,
      enabled: row?.isEnabled ?? true,
      placement: row?.placement ?? 'default',
      sortOrder: row?.sortOrder ?? 100,
      updatedAt: toIso(row?.updatedAt)
    }
  })
}

export function getPublicFrontendFeatures(
  client: DatabaseClient
): PublicFrontendFeatureSettings {
  const items = listFrontendFeatures(client)
  const latestUpdate = items.reduce<number | null>((latest, item) => {
    if (!item.updatedAt) return latest
    const timestamp = Date.parse(item.updatedAt)
    return latest === null || timestamp > latest ? timestamp : latest
  }, null)

  return {
    disabledKeys: items.filter(item => !item.enabled).map(item => item.key),
    placements: Object.fromEntries(items
      .filter(item => item.placement !== 'default')
      .map(item => [item.key, item.placement])) as PublicFrontendFeatureSettings['placements'],
    sortOrders: Object.fromEntries(items
      .filter(item => item.sortOrder !== 100)
      .map(item => [item.key, item.sortOrder])) as PublicFrontendFeatureSettings['sortOrders'],
    updatedAt: latestUpdate === null ? null : new Date(latestUpdate).toISOString()
  }
}

function contentEntryPath(kind: string, slug: string): string {
  if (kind === 'department') return `/departments/${encodeURIComponent(slug)}`
  if (kind === 'club') return `/clubs/${encodeURIComponent(slug)}`
  return `/guides/${encodeURIComponent(slug)}`
}

export function listPublicHomeEntries(client: DatabaseClient): PublicHomeEntry[] {
  const rows = client.db.select({
    id: contents.id,
    kind: contents.kind,
    slug: contents.slug,
    title: contents.title,
    summary: contents.summary,
    metadataJson: contents.metadataJson
  }).from(contents).where(and(
    eq(contents.status, 'published'),
    activePublicContentCondition()
  )).all()

  return rows.flatMap((row): PublicHomeEntry[] => {
    if (row.kind === 'notice') return []
    const metadata = safeMetadata(row.metadataJson)
    if (metadata.homeEntryEnabled !== true) return []
    const placement = metadata.homeEntryPlacement
    if (placement !== 'quick' && placement !== 'services' && placement !== 'more') return []
    const title = typeof metadata.homeEntryTitle === 'string' && metadata.homeEntryTitle.trim()
      ? metadata.homeEntryTitle.trim().slice(0, 80)
      : row.title
    const description = typeof metadata.homeEntryDescription === 'string' && metadata.homeEntryDescription.trim()
      ? metadata.homeEntryDescription.trim().slice(0, 240)
      : row.summary
    const icon = typeof metadata.homeEntryIcon === 'string'
      && /^i-lucide-[a-z0-9-]{2,64}$/u.test(metadata.homeEntryIcon)
      ? metadata.homeEntryIcon
      : 'i-lucide-arrow-up-right'
    const rawSortOrder = metadata.homeEntrySortOrder
    const sortOrder = typeof rawSortOrder === 'number' && Number.isInteger(rawSortOrder)
      ? Math.max(0, Math.min(9999, rawSortOrder))
      : 10000
    return [{
      id: row.id,
      title,
      description,
      to: contentEntryPath(row.kind, row.slug),
      sourceUrl: safeNoticeActionHref(metadata.homeEntrySourceUrl),
      icon,
      placement,
      sortOrder
    }]
  }).sort((left, right) => (
    left.placement.localeCompare(right.placement)
    || left.sortOrder - right.sortOrder
    || left.title.localeCompare(right.title, 'zh-CN')
  ))
}

export function updateFrontendFeature(
  client: DatabaseClient,
  input: {
    key: FrontendFeatureKey
    enabled: boolean
    placement?: 'default' | 'quick' | 'timeline' | 'services'
    sortOrder?: number
    adminId: string
  }
): FrontendFeatureStatus {
  const now = Date.now()
  client.db.insert(frontendFeatureSettings).values({
    key: input.key,
    isEnabled: input.enabled,
    ...(input.placement ? { placement: input.placement } : {}),
    ...(typeof input.sortOrder === 'number' ? { sortOrder: input.sortOrder } : {}),
    updatedByAdminId: input.adminId,
    updatedAt: now
  }).onConflictDoUpdate({
    target: frontendFeatureSettings.key,
    set: {
      isEnabled: input.enabled,
      ...(input.placement ? { placement: input.placement } : {}),
      ...(typeof input.sortOrder === 'number' ? { sortOrder: input.sortOrder } : {}),
      updatedByAdminId: input.adminId,
      updatedAt: now
    }
  }).run()

  const item = listFrontendFeatures(client).find(feature => feature.key === input.key)
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: 'Frontend feature not found' })
  }
  return item
}

export function isFrontendFeatureEnabled(
  client: DatabaseClient,
  key: FrontendFeatureKey
): boolean {
  const row = client.db.select({ isEnabled: frontendFeatureSettings.isEnabled })
    .from(frontendFeatureSettings)
    .where(eq(frontendFeatureSettings.key, key))
    .get()
  return row?.isEnabled ?? true
}
