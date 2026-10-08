import { refreshStaleAmapRatings } from '../modules/place-reviews/rating-refresh'
import { useAppDatabase } from '../utils/database'

/**
 * 定时刷新已过期的地图聚合评分。
 *
 * 为什么放在应用内而不是运维脚本：刷新要用到应用自己的高德客户端与评分写入逻辑，
 * 放脚本里就得再维护一份同步（服务器上那个 vec-build 维护工作区已经因为版本落后
 * 咬过一次）。跑在应用进程里，永远和当前部署的代码一致。
 *
 * 只做「已过期」的行：高德 TTL 7 天，12 小时检查一次意味着每行大约一周刷新一次，
 * 而一次漏跑最多 12 小时内就被补上，不会再出现「评分无声过期、美食推荐整体变成
 * 没找到」那种静默停摆。
 */
const STARTUP_DELAY_MS = 2 * 60 * 1000
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const amapKey = String(config.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || '').trim()
  // 没有高德 key 就没有刷新能力（本地开发、测试环境都不该发起外网请求）。
  if (!amapKey) return

  let running = false
  const run = () => {
    if (running) return
    running = true
    void (async () => {
      try {
        const client = useAppDatabase()
        const result = await refreshStaleAmapRatings(client, amapKey)
        if (result.stale > 0) {
          console.log(`[amap-rating-refresh] ${JSON.stringify(result)}`)
        }
      } catch (error) {
        // 刷新失败绝不影响请求路径；下一轮会重试。
        console.warn(`[amap-rating-refresh] failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        running = false
      }
    })()
  }

  const bootTimer = setTimeout(run, STARTUP_DELAY_MS)
  const intervalTimer = setInterval(run, CHECK_INTERVAL_MS)
  // 不要因为这些定时器让进程无法退出。
  bootTimer.unref?.()
  intervalTimer.unref?.()
  nitroApp.hooks.hook('close', () => {
    clearTimeout(bootTimer)
    clearInterval(intervalTimer)
  })
})
