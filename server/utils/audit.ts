import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'
import { auditLogs } from '../database/schema'

export interface AuditEntry {
  actorAdminId: string | null
  action: string
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown>
}

export function writeAudit(client: DatabaseClient, event: H3Event, entry: AuditEntry): void {
  const incomingRequestId = getHeader(event, 'x-request-id')
  const requestId = incomingRequestId && incomingRequestId.length <= 100
    ? incomingRequestId
    : randomUUID()

  setHeader(event, 'x-request-id', requestId)
  client.db.insert(auditLogs).values({
    id: randomUUID(),
    actorAdminId: entry.actorAdminId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    requestId,
    detailsJson: JSON.stringify(entry.details ?? {}),
    createdAt: Date.now()
  }).run()
}
