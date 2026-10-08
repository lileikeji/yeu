import { assistantEmbeddingConfig, assistantRetrievalQuery } from '../modules/assistant/service'
import { lastPrewarmUsage, prewarmVectorCacheForHotQueries } from '../modules/assistant/vector-prewarm'
import { rebuildQuantizedVectorIndex } from '../modules/assistant/vector-search'
import { assistantConfigFromValues } from '../utils/assistant-config'
import { useAppDatabase } from '../utils/database'

/**
 * 为高频提问预热语义召回缓存。
 *
 * 为什么放应用内：预热必须用**当前部署的**检索问题映射（`assistantRetrievalQuery`）
 * 与向量腿实现，缓存键才能和线上调用完全对上；放运维脚本就得再维护一份同步
 * （服务器上的 vec-build 维护工作区已经因为版本落后咬过一次）。
 *
 * 时机：启动后延迟一会儿（避开部署重启后的首批真实流量抢 CPU），之后每 6 小时一次。
 * 只在有嵌入端点时跑——本地开发/测试环境没有嵌入配置，直接跳过、不发外网请求。
 *
 * 成本与收益（线上实测）：单条预热 ≈ 一次嵌入（~150ms，长尾 3~7s）+ 一次全表扫描
 * （~120ms，冷页 6.5s）。默认最多 40 条、总预算 90s，跑在后台且完全 best-effort。
 * 收益是学生最常问的那些问法向量腿直接命中缓存（毫秒级），同时把这些向量页读热。
 */
const STARTUP_DELAY_MS = 90 * 1000
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
const USAGE_LOG_INTERVAL_MS = 30 * 60 * 1000

export default defineNitroPlugin((nitroApp) => {
  // 插件里没有 H3Event，用纯对象入参的那份映射（与请求路径同一套字段解析）。
  const config = assistantConfigFromValues(useRuntimeConfig() as Record<string, unknown>)
  // 没有嵌入端点：语义召回本来就是关的，预热没有意义。
  if (!assistantEmbeddingConfig(config).baseUrl.trim()) return

  let running = false
  const run = () => {
    if (running) return
    running = true
    void (async () => {
      try {
        const client = useAppDatabase()
        const result = await prewarmVectorCacheForHotQueries(
          client,
          assistantEmbeddingConfig(config),
          assistantRetrievalQuery
        )
        // 只在真的做了事的时候打一行，避免安静环境下每 6 小时一条噪音。
        if (result.attempted > 0) {
          console.log(`[assistant-vector-prewarm] ${JSON.stringify(result)}`)
        }
        // 量化候选索引：派生数据、整表重建（天然不与主表漂移，所以 upsert/prune 不必挂同步点）。
        // 读取路径只在行数与主表一致时才用它，所以重建期间是安全的（自动退回全表扫描）。
        const quant = rebuildQuantizedVectorIndex(client)
        if (quant.total > 0) {
          console.log(`[assistant-vector-quant] rebuilt ${quant.written}/${quant.total}`)
        }
      } catch (error) {
        // 预热失败绝不影响请求路径；下一轮会重试。
        console.warn(`[assistant-vector-prewarm] failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        running = false
      }
    })()
  }

  const bootTimer = setTimeout(run, STARTUP_DELAY_MS)
  const intervalTimer = setInterval(run, REFRESH_INTERVAL_MS)
  // 「上一轮预热的条目被用了几条」每半小时打一行：预热本身 6 小时才结算一次，
  // 出问题或者修好了都要等太久才看得见。这一行是判断预热有没有白做的日常依据。
  const usageTimer = setInterval(() => {
    const usage = lastPrewarmUsage()
    if (usage.warmed > 0) {
      console.log(`[assistant-vector-prewarm] usage ${JSON.stringify(usage)}`)
    }
  }, USAGE_LOG_INTERVAL_MS)
  // 不要因为这些定时器让进程无法退出。
  bootTimer.unref?.()
  intervalTimer.unref?.()
  usageTimer.unref?.()
  nitroApp.hooks.hook('close', () => {
    clearTimeout(bootTimer)
    clearInterval(intervalTimer)
    clearInterval(usageTimer)
  })
})
