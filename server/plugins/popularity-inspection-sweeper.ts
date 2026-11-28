import { insightConfigFromValues } from '../modules/competition/insight'
import {
  POPULARITY_TAIL_IDLE_MS,
  sweepPopularityInspectionBacklog
} from '../modules/competition/popularity-inspector'
import { useAppDatabase } from '../utils/database'

/**
 * 人气奖巡检补扫：把「自动微批」够不着的尾巴清掉。
 *
 * 自动巡检原本只挂在投票请求里（每满 20 条一批）。脚本刷票时 1 秒能进 3 条，模型一批要 3-6 秒，
 * 积压只会越滚越大；脚本一停，最后不足 20 条的尾巴就再没有任何人触发巡检 —— 2026-11-28 线上
 * 327 票里就有 80 票（seq 248-327）从未进入任何批次，风控页上自然一票也没扣。
 *
 * 这里在进程内每 15 秒看一次：哪个赛事还有水位之后的日志、且最后一条已经静止 10 秒以上，
 * 就串行补扫，单次最多 2 批，AI 返回失败立刻停手等下一轮。默认开启，
 * NUXT_POPULARITY_INSPECTION_SWEEP=0 可关（本地无 AI 配置时 insightConfigFromValues 返回 null，自动跳过）。
 */
const STARTUP_DELAY_MS = 30 * 1000
const INTERVAL_MS = 15 * 1000
const MAX_EVENTS_PER_TICK = 2
const MAX_BATCHES_PER_TICK = 2

const BACKLOG_SQL = `SELECT l.event_id AS eventId
  FROM competition_popularity_vote_logs l
  LEFT JOIN (
    SELECT event_id, MAX(to_seq) AS lastToSeq
    FROM competition_popularity_inspections
    WHERE mode = 'auto-batch'
    GROUP BY event_id
  ) i ON i.event_id = l.event_id
  GROUP BY l.event_id
  HAVING MAX(l.seq) > COALESCE(i.lastToSeq, 0)
     AND MAX(l.created_at) <= ?
  ORDER BY MAX(l.created_at) DESC
  LIMIT ${MAX_EVENTS_PER_TICK}`

function sweepEnabled(): boolean {
  const value = (process.env.NUXT_POPULARITY_INSPECTION_SWEEP ?? '').trim().toLowerCase()
  return value !== '0' && value !== 'false' && value !== 'off'
}

export default defineNitroPlugin((nitroApp) => {
  if (!sweepEnabled()) return

  let running = false
  const tick = () => {
    if (running) return
    running = true
    void (async () => {
      try {
        const config = insightConfigFromValues(useRuntimeConfig() as Record<string, unknown>)
        if (!config) return
        const client = useAppDatabase()
        const idleBefore = Date.now() - POPULARITY_TAIL_IDLE_MS
        const rows = client.sqlite.prepare(BACKLOG_SQL).all(idleBefore) as Array<{ eventId: string }>
        for (const row of rows) {
          const result = await sweepPopularityInspectionBacklog(client, row.eventId, config, {
            maxBatches: MAX_BATCHES_PER_TICK
          })
          if (result.batches > 0) {
            console.log(`[popularity-inspection-sweeper] event=${row.eventId} batches=${result.batches} inspected=${result.inspected} voided=${result.voided}`)
          }
        }
      } catch (error) {
        // 补扫失败不影响线上请求：下一轮重试。
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[popularity-inspection-sweeper] failed: ${message}`)
      } finally {
        running = false
      }
    })()
  }

  const bootTimer = setTimeout(tick, STARTUP_DELAY_MS)
  const intervalTimer = setInterval(tick, INTERVAL_MS)
  // 定时器不能拖住进程退出。
  bootTimer.unref?.()
  intervalTimer.unref?.()
  nitroApp.hooks.hook('close', () => {
    clearTimeout(bootTimer)
    clearInterval(intervalTimer)
  })
})
