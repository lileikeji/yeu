import { computeCompetitionAnalytics } from '../../../../../shared/utils/competition-analytics'
import {
  insightConfigFromValues,
  insightDigest,
  insightFingerprint,
  requestInsight,
  type CompetitionInsight
} from '../../../../modules/competition/insight'
import { ensureInsightJob, markInsightJobDone, readInsightJob } from '../../../../modules/competition/insight-jobs'
import { writeStoredInsight } from '../../../../modules/competition/insight-store'
import { getAdminCompetitionPayload } from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'

/**
 * 后台「大赛可视化」里的人工智能解读。
 *
 * 数据由服务端自己算（同一个 computeCompetitionAnalytics），不接受前端回传的统计结果：
 * 否则模型总结的是前端传来的数字，一旦前端算错或被人改，结论就跟着错。
 * 结论生成后会落盘（见 insight-store），刷新页面读的是落盘那份；
 * 只有用户再点一次按钮才会重新生成。
 *
 * 网关一次要跑几秒到几十秒，直接挂在请求上等，客户端超时或切页就会把结果丢掉；
 * 因此这里只负责起任务，立刻返回 pending，由前端轮询 GET 取结果（见 insight-jobs）。
 */

interface CachedInsight {
  insight: CompetitionInsight
  model: string
  generatedAt: number
}

const INSIGHT_CACHE_TTL_MS = 60 * 1000
const INSIGHT_CACHE_MAX_ENTRIES = 20
const insightCache = new Map<string, CachedInsight>()

function readCached(fingerprint: string, now: number): CachedInsight | null {
  const hit = insightCache.get(fingerprint)
  if (!hit) return null
  if (now - hit.generatedAt > INSIGHT_CACHE_TTL_MS) {
    insightCache.delete(fingerprint)
    return null
  }
  return hit
}

function writeCached(fingerprint: string, value: CachedInsight): void {
  insightCache.set(fingerprint, value)
  while (insightCache.size > INSIGHT_CACHE_MAX_ENTRIES) {
    const oldest = insightCache.keys().next().value
    if (oldest === undefined) break
    insightCache.delete(oldest)
  }
}

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const config = insightConfigFromValues(useRuntimeConfig(event) as Record<string, unknown>)

  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AI 网关未配置',
      message: '平台 AI 网关未配置（aiGatewayBaseUrl / aiGatewayApiKey），AI 分析暂不可用。'
    })
  }

  const payload = getAdminCompetitionPayload(client, contentId)
  const report = computeCompetitionAnalytics(payload)
  const eventId = payload.event.id
  const eventTitle = payload.event.title || '仰恩大学歌手大赛'
  const databasePath = String(useRuntimeConfig(event).databasePath || process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite')
  const digest = insightDigest(report, eventTitle)
  const fingerprint = insightFingerprint(digest)
  const now = Date.now()

  const cached = readCached(fingerprint, now)
  if (cached) {
    return {
      insight: cached.insight,
      meta: {
        model: cached.model,
        cached: true,
        generatedAt: cached.generatedAt,
        fingerprint,
        savedAt: cached.generatedAt,
        stale: false,
        pending: false
      }
    }
  }

  const running = readInsightJob(fingerprint)
  if (!running || running.state !== 'running') {
    const task = ensureInsightJob(fingerprint, config.model, async () => {
      const insight = await requestInsight(config, digest)
      if (!insight) return null
      writeCached(fingerprint, { insight, model: config.model, generatedAt: Date.now() })
      markInsightJobDone(fingerprint, insight)
      writeStoredInsight(databasePath, {
        eventId,
        eventTitle,
        insight,
        model: config.model,
        fingerprint,
        generatedAt: Date.now(),
        savedAt: Date.now(),
        savedByAdminId: session.admin.id
      })
      return insight
    })
    // 响应返回后任务继续跑：客户端断开也不会把已经算出来的结论丢掉。
    event.waitUntil(task)
    writeAudit(client, event, {
      actorAdminId: session.admin.id,
      action: 'competition.insight',
      entityType: 'competition_analytics',
      entityId: eventId,
      details: { model: config.model, fingerprint, stage: 'requested' }
    })
  }

  setResponseStatus(event, 202)
  return {
    insight: null,
    meta: {
      model: config.model,
      cached: false,
      generatedAt: null,
      fingerprint,
      savedAt: null,
      stale: false,
      pending: true
    }
  }
})
