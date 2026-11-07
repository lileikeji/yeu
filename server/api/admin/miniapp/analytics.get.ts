import { adminMiniappAnalyticsQuerySchema } from '../../../../shared/schemas/server'
import { getMiniappAnalyticsCached } from '../../../modules/visitors/service'
import { hasAdminCapability, requireAdminCapability } from '../../../utils/auth'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'analytics.view')
  const query = parseQuery(event, adminMiniappAnalyticsQuerySchema)
  const includeSources = hasAdminCapability(session, 'visitor.source')
  const includeApiMetrics = hasAdminCapability(session, 'api_metrics.view')
  const includeRaw = hasAdminCapability(session, 'visitor.raw_ua')
    && hasAdminCapability(session, 'visitor.raw_ip')
  if (includeRaw) {
    writeAudit(client, event, {
      actorAdminId: session.admin.id,
      action: 'analytics.miniapp_raw_view',
      entityType: 'miniapp_analytics',
      details: { hours: query.hours, fields: ['userAgent', 'ip'] }
    })
  }
  return getMiniappAnalyticsCached(client, query.hours, { includeRaw, includeSources, includeApiMetrics })
})
