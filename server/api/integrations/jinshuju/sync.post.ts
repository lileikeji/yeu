/**
 * 主动从金数据拉取表单条目并入库。
 *
 * 触发方式：后台手动点一次，或外部 cron 带 Bearer 调。
 * 增量策略：首次不带 created_at 全量翻页；之后用「水位 - 1 天」做重叠窗口，
 * 重叠部分的重复条目靠 recordId 幂等丢弃。
 */

import { getHeader, getQuery } from 'h3'
import { verifyBearerToken } from '../../../modules/bots/security'
import { resolveIngestContext } from '../../../modules/vote-sync/ingest'
import { runJinshujuSync } from '../../../modules/vote-sync/sync-runner'
import { readJinshujuConfig, JinshujuApiError } from '../../../utils/jinshuju'

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event) as Record<string, unknown>
  const syncSecret = typeof runtimeConfig.jinshujuSyncSecret === 'string'
    ? runtimeConfig.jinshujuSyncSecret.trim()
    : ''
  if (syncSecret.length < 16) {
    return { ok: false, reason: 'sync_secret_not_configured' }
  }
  const syncQueryToken = getQuery(event).token
  const syncAuthorization = getHeader(event, 'authorization')
    ?? (typeof syncQueryToken === 'string' && syncQueryToken ? `Bearer ${syncQueryToken}` : undefined)
  if (!verifyBearerToken(syncAuthorization, syncSecret)) {
    setResponseStatus(event, 401)
    return { ok: false, reason: 'unauthorized' }
  }

  const config = readJinshujuConfig(event)
  if (!config) {
    setResponseStatus(event, 503)
    return { ok: false, reason: 'jinshuju_not_configured' }
  }

  const query = getQuery(event)

  try {
    const result = await runJinshujuSync(config, resolveIngestContext(event), {
      full: String(query.full ?? '') === '1',
      maxPages: Number(query.maxPages ?? undefined) || undefined
    })
    return {
      ok: true,
      provider: 'jinshuju',
      formToken: config.formToken,
      ...result
    }
  } catch (error) {
    const message = error instanceof JinshujuApiError ? error.message : String(error)
    setResponseStatus(event, 502)
    return { ok: false, reason: 'jinshuju_request_failed', message }
  }
})
