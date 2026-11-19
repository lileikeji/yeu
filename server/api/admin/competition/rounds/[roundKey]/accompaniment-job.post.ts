import { ensureCompetitionEvent, getRoundByKey } from '../../../../../modules/competition/service'
import { startAccompanimentExportJob } from '../../../../../modules/competition/accompaniment-export-jobs'
import { requireCompetitionRoundKey, resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { cosConfig } from '../../../../../utils/cos-storage'
import { useAdminRequest } from '../../../../../utils/http'

/** 启动「下载全部伴奏 / 原件」的后台打包任务，前端轮询进度。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const config = cosConfig()
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Storage not configured',
      data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没有配置对象存储' }
    })
  }

  const body = await readBody<{ original?: unknown }>(event).catch(() => ({} as { original?: unknown }))
  const job = startAccompanimentExportJob(client, round, body?.original === true, config)

  setHeader(event, 'Cache-Control', 'no-store')
  return { jobId: job.id, total: job.total }
})
