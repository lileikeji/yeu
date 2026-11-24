import { computeCompetitionAnalytics } from '../../../../../shared/utils/competition-analytics'
import { insightDigest, insightFingerprint } from '../../../../modules/competition/insight'
import { readInsightJob } from '../../../../modules/competition/insight-jobs'
import { readStoredInsight } from '../../../../modules/competition/insight-store'
import { getAdminCompetitionPayload } from '../../../../modules/competition/service'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'

/**
 * 读取 AI 分析结论：优先给正在跑的任务结果，其次给上一次落盘的那份。
 *
 * 面板打开时先调这个接口，把上次的结论直接铺出来；用户不点按钮就不重新生成，
 * 这样刷新页面不会白烧一次网关额度，也不会因为数据没变而看到一份新写的结论。
 * 点过按钮后前端按 1.5 秒轮询这里，靠 jobState 判断生成完了没有。
 * stale = 结论所依据的数据指纹与当前数据不一致，前端提示「数据有更新，可重新分析」。
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
  const job = readInsightJob(currentFingerprint)
  const stored = readStoredInsight(databasePath, eventId)

  if (job?.state === 'done' && job.insight) {
    return {
      insight: job.insight,
      meta: {
        model: job.model,
        cached: true,
        generatedAt: job.finishedAt ?? job.startedAt,
        fingerprint: job.fingerprint,
        savedAt: job.finishedAt ?? job.startedAt,
        stale: false,
        currentFingerprint,
        pending: false,
        jobState: 'done' as const,
        jobError: null
      }
    }
  }

  return {
    insight: stored?.insight ?? null,
    meta: {
      model: stored?.model ?? job?.model ?? '',
      cached: true,
      generatedAt: stored?.generatedAt ?? null,
      fingerprint: stored?.fingerprint ?? null,
      savedAt: stored?.savedAt ?? null,
      stale: stored ? stored.fingerprint !== currentFingerprint : false,
      currentFingerprint,
      pending: job?.state === 'running',
      jobState: job?.state ?? null,
      jobError: job?.error ?? null
    }
  }
})
