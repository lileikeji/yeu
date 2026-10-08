import { and, count, desc, eq, like } from 'drizzle-orm'
import { adminAuditLogsQuerySchema } from '../../../shared/schemas/server'
import { adminUsers, auditLogs } from '../../database/schema'
import { requireAdminCapability } from '../../utils/auth'
import { useAdminRequest } from '../../utils/http'
import { safeMetadata } from '../../utils/serializers'
import { parseQuery } from '../../utils/validation'

function parseAuditDetails(value: string): Record<string, unknown> {
  return safeMetadata(value)
}

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'audit.view')
  const query = parseQuery(event, adminAuditLogsQuerySchema)
  const offset = (query.page - 1) * query.pageSize
  const conditions = []
  if (query.action?.trim()) {
    conditions.push(like(auditLogs.action, `%${query.action.trim()}%`))
  }
  if (query.entityType?.trim()) {
    conditions.push(eq(auditLogs.entityType, query.entityType.trim()))
  }
  if (query.entityId?.trim()) {
    conditions.push(eq(auditLogs.entityId, query.entityId.trim()))
  }
  const where = conditions.length ? and(...conditions) : undefined

  const rows = client.db.select({
    id: auditLogs.id,
    actorAdminId: auditLogs.actorAdminId,
    action: auditLogs.action,
    entityType: auditLogs.entityType,
    entityId: auditLogs.entityId,
    requestId: auditLogs.requestId,
    detailsJson: auditLogs.detailsJson,
    createdAt: auditLogs.createdAt,
    actorUsername: adminUsers.username,
    actorDisplayName: adminUsers.displayName
  }).from(auditLogs)
    .leftJoin(adminUsers, eq(auditLogs.actorAdminId, adminUsers.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(auditLogs).where(where).get()?.value ?? 0

  return {
    items: rows.map(row => ({
      id: row.id,
      actorAdminId: row.actorAdminId,
      actorUsername: row.actorUsername || null,
      actorDisplayName: row.actorDisplayName || null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      requestId: row.requestId,
      details: parseAuditDetails(row.detailsJson),
      createdAt: new Date(row.createdAt).toISOString()
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
})
