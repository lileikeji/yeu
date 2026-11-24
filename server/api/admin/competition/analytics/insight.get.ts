import { computeCompetitionAnalytics } from '../../../../../shared/utils/competition-analytics'
import { insightDigest, insightFingerprint } from '../../../../modules/competition/insight'
import { readStoredInsight } from '../../../../modules/competition/insight-store'
import { getAdminCompetitionPayload } from '../../../../modules/competition/service'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'

/**
 * 读取「上一次生成并已落盘」的 AI 分析结论。
 *
 * 面板打开时先调这个接口，把上次的结论直接铺出来；用户不点按钮就不重新生成，
 * 这样刷新页面不会白烧一次网关额度，也不会因为数据没变而看到一份新写的结论。
 * stale = 落盘结论所依据的数据指纹与当前数据不一致，前端提示「数据有更新，可重新分析」。
 * 只读历史结论，因此不校验网关配置。
 */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const payload = getAdminCompetitionPayload(client, contentId)
  const eventId = payload.event.id
  const eventTitle = payload.event.title || '仰恩大学歌手大赛'
  const databasePath = String(useRuntimeConfig(event).databasePath || process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite')

  const report = computeCompetitionAnalytics(payload)
  const currentFingerprint = insightFingerprint(insightDigest(report, eventTitle))
  const stored = readStoredInsight(databasePath, eventId)

  if (!stored) {
    return { insight: null, meta: null }
  }

  return {
    insight: stored.insight,
    meta: {
      model: stored.model,
      cached: true,
      generatedAt: stored.generatedAt,
      fingerprint: stored.fingerprint,
      savedAt: stored.savedAt,
      stale: stored.fingerprint !== currentFingerprint,
      currentFingerprint
    }
  }
})
