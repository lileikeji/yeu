import { count, desc } from 'drizzle-orm'
import { paginationQuerySchema } from '../../../shared/schemas/server'
import { auditLogs } from '../../database/schema'
import { useAdminRequest } from '../../utils/http'
import { parseQuery } from '../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, paginationQuerySchema)
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select().from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(auditLogs).get()?.value ?? 0

  return {
    items: rows.map(row => ({
      id: row.id,
      actorAdminId: row.actorAdminId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      requestId: row.requestId,
      details: JSON.parse(row.detailsJson) as Record<string, unknown>,
      createdAt: new Date(row.createdAt).toISOString()
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
})
