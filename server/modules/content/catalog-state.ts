import { CONTENT_KINDS, type ContentKind } from '../../../shared/constants/server'
import type { DatabaseClient } from '../../database/client'
import { contents } from '../../database/schema'

export function getManagedContentKinds(client: DatabaseClient): ContentKind[] {
  const managed = new Set(client.db.select({ kind: contents.kind })
    .from(contents)
    .groupBy(contents.kind)
    .all()
    .map(row => row.kind))
  return CONTENT_KINDS.filter(kind => managed.has(kind))
}
