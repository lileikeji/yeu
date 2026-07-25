import { eq } from 'drizzle-orm'
import {
  FRONTEND_FEATURE_DEFINITIONS,
  type FrontendFeatureKey
} from '../../../shared/config/frontend-features'
import type { DatabaseClient } from '../../database/client'
import { frontendFeatureSettings } from '../../database/schema'

export interface FrontendFeatureStatus {
  key: FrontendFeatureKey
  group: string
  title: string
  description: string
  icon: string
  enabled: boolean
  updatedAt: string | null
}

export interface PublicFrontendFeatureSettings {
  disabledKeys: FrontendFeatureKey[]
  updatedAt: string | null
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
    updatedAt: latestUpdate === null ? null : new Date(latestUpdate).toISOString()
  }
}

export function updateFrontendFeature(
  client: DatabaseClient,
  input: {
    key: FrontendFeatureKey
    enabled: boolean
    adminId: string
  }
): FrontendFeatureStatus {
  const now = Date.now()
  client.db.insert(frontendFeatureSettings).values({
    key: input.key,
    isEnabled: input.enabled,
    updatedByAdminId: input.adminId,
    updatedAt: now
  }).onConflictDoUpdate({
    target: frontendFeatureSettings.key,
    set: {
      isEnabled: input.enabled,
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
