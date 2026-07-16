import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'
import { auditLogs } from '../database/schema'
import { resolveRequestId } from './request-context'

export interface AuditEntry {
  actorAdminId: string | null
  action: string
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown>
}

export function writeAudit(client: DatabaseClient, event: H3Event, entry: AuditEntry): void {
  const contextualRequestId = typeof event.context.requestId === 'string'
    ? event.context.requestId
    : null
  const requestId = resolveRequestId(contextualRequestId ?? getHeader(event, 'x-request-id'))

  event.context.requestId = requestId
  setHeader(event, 'X-Request-Id', requestId)
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
