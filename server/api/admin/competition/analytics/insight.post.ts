import { computeCompetitionAnalytics } from '../../../../../shared/utils/competition-analytics'
import {
  insightConfigFromValues,
  insightDigest,
  insightFingerprint,
  requestInsight,
  type CompetitionInsight
} from '../../../../modules/competition/insight'
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
 * 同一份数据 10 分钟内复用同一份分析，避免每点一次按钮烧一次网关额度。
 */

interface CachedInsight {
  insight: CompetitionInsight
  model: string
  generatedAt: number
}

const INSIGHT_CACHE_TTL_MS = 10 * 60 * 1000
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
        stale: false
      }
    }
  }

  const insight = await requestInsight(config, digest)
  if (!insight) {
    throw createError({
      statusCode: 502,
      statusMessage: 'AI 分析生成失败',
      message: '平台 AI 没有返回可解析的分析结果，请稍后重试。'
    })
  }

  writeCached(fingerprint, { insight, model: config.model, generatedAt: now })
  writeStoredInsight(databasePath, {
    eventId,
    eventTitle,
    insight,
    model: config.model,
    fingerprint,
    generatedAt: now,
    savedAt: now,
    savedByAdminId: session.admin.id
  })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.insight',
    entityType: 'competition_analytics',
    entityId: eventId,
    details: { model: config.model, fingerprint, cached: false }
  })

  return {
    insight,
    meta: {
      model: config.model,
      cached: false,
      generatedAt: now,
      fingerprint,
      savedAt: now,
      stale: false
    }
  }
})
