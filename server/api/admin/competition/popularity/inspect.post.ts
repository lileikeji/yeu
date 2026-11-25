import { setResponseStatus } from 'h3'
import { competitionPopularityInspectSchema } from '../../../../../shared/schemas/server'
import { ensurePopularityInspectionJob } from '../../../../modules/competition/popularity-inspection-jobs'
import {
  inspectorConfigFromValues,
  preparePopularityInspection,
  requestPopularityInspection,
  savePopularityInspectionResult
} from '../../../../modules/competition/popularity-inspector'
import { ensureCompetitionEvent } from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const input = await parseBody(event, competitionPopularityInspectSchema)

  const config = inspectorConfigFromValues(useRuntimeConfig(event) as Record<string, unknown>)
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AI 网关未配置',
      message: '平台 AI 网关未配置（aiGatewayBaseUrl / aiGatewayApiKey），巡检暂不可用。'
    })
  }

  const runInput = {
    mode: input.mode,
    triggerSource: 'manual' as const,
    adminId: session.admin.id,
    fromSeq: input.fromSeq,
    toSeq: input.toSeq,
    logId: input.logId,
    singerId: input.singerId
  }
  const prepared = preparePopularityInspection(client, eventRow.id, runInput)
  if (!prepared) {
    throw createError({
      statusCode: 400,
      statusMessage: '暂无可巡检的投票日志',
      message: '当前筛选范围没有可巡检的投票日志。'
    })
  }

  const jobKey = `manual:${eventRow.id}:${input.mode}:${prepared.fromSeq}-${prepared.toSeq}:${input.logId ?? input.singerId ?? 'all'}`
  const { promise, job } = ensurePopularityInspectionJob(
    eventRow.id,
    jobKey,
    input.mode,
    config.model,
    async () => {
      const parsed = await requestPopularityInspection(config, prepared.digest)
      if (!parsed) return false
      savePopularityInspectionResult(client, eventRow.id, runInput, prepared, parsed, config.model)
      return true
    }
  )

  event.waitUntil(promise)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_inspect',
    entityType: 'competition_popularity_inspections',
    entityId: eventRow.id,
    details: {
      mode: input.mode,
      fromSeq: prepared.fromSeq,
      toSeq: prepared.toSeq,
      logCount: prepared.logCount,
      model: config.model
    }
  })

  setResponseStatus(event, 202)
  return {
    pending: true,
    job: {
      key: job.key,
      state: job.state,
      mode: job.mode,
      model: job.model,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error
    }
  }
})
