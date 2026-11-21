import { getAccompanimentExportJob } from '../../../../../modules/competition/accompaniment-export-jobs'
import { useAdminRequest } from '../../../../../utils/http'

/** 查询伴奏包打包进度：done/total、完成后给对象存储临时直链。 */
export default defineEventHandler((event) => {
  useAdminRequest(event)
  const jobId = String(getQuery(event).jobId ?? '').trim()
  if (!jobId) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: { code: 'VALIDATION_ERROR', field: 'jobId' }
    })
  }
  const job = getAccompanimentExportJob(jobId)
  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Job not found',
      data: { code: 'EXPORT_JOB_NOT_FOUND', message: '这次打包已经过期，重新点一次下载' }
    })
  }

  setHeader(event, 'Cache-Control', 'no-store')
  return {
    id: job.id,
    status: job.status,
    done: job.done,
    total: job.total,
    cached: job.cached,
    url: job.url,
    filename: job.filename,
    size: job.size,
    message: job.message
  }
})
