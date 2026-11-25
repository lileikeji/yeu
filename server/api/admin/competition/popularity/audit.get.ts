import { competitionPopularityAuditQuerySchema } from '../../../../../shared/schemas/server'
import { computePopularityGuardReport } from '../../../../modules/competition/popularity-guard'
import { readLatestPopularityInspectionJob } from '../../../../modules/competition/popularity-inspection-jobs'
import { inspectorConfigFromValues } from '../../../../modules/competition/popularity-inspector'
import { ensureCompetitionEvent } from '../../../../modules/competition/service'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseQuery } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const query = parseQuery(event, competitionPopularityAuditQuerySchema)
  const aiConfigured = Boolean(inspectorConfigFromValues(useRuntimeConfig(event) as Record<string, unknown>))
  const inspectionJob = readLatestPopularityInspectionJob(eventRow.id)

  const report = computePopularityGuardReport(client, eventRow.id, {
    singerId: query.singerId || undefined,
    filter: query.filter,
    q: query.q || undefined,
    limit: query.limit,
    aiConfigured,
    inspectionJob
  })

  return { report }
})
