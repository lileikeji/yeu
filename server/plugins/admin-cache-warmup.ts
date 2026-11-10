import { getSecuritySnapshot } from '../modules/admin-security/service'
import { useAppDatabase } from '../utils/database'

/**
 * 管理概览两个重接口的定时预热。
 *
 * getSecuritySnapshot（~60 条同步 SQL）与 getMiniappAnalytics（最多物化 10 万行
 * 埋点）都阻塞事件循环，冷缓存的首次请求能拖住整个 admin 首屏。60s 进程缓存只
 * 救得了重复进入——这里在应用进程内按固定间隔主动刷新缓存，管理员任意时刻进来
 * 命中的都是热缓存，「首次」发生在没人等待的时候。
 *
 * 缓存 TTL 5 分钟（统计延迟 5 分钟对概览可接受），预热间隔 60s，两者错开保证
 * 常驻热缓存。跑在应用进程内与 amap-rating-refresh 同一理由：永远和当前部署的
 * 代码、同一个 SQLite 连接一致。
 *
 * 默认关闭，用 NUXT_ADMIN_CACHE_WARMUP=1 显式打开：预热跑在 Node 单线程事件
 * 循环里，~60 条同步 SQL 会占住请求线程一拍；在 4 核 3.6G 的生产机上，这一拍
 * 正好落在公开接口上就是一次抖动。管理后台是低频入口，冷缓存只让第一个管理员
 * 等一次，比让所有访客周期性陪跑更划算。需要热缓存时（比如演示前）再开。
 */
const STARTUP_DELAY_MS = 20 * 1000
const WARMUP_INTERVAL_MS = 60 * 1000

function warmupEnabled(): boolean {
  const value = (process.env.NUXT_ADMIN_CACHE_WARMUP ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

export default defineNitroPlugin(() => {
  if (!warmupEnabled()) return

  let running = false
  const warm = () => {
    if (running) return
    running = true
    void (async () => {
      try {
        const client = useAppDatabase()
        getSecuritySnapshot(client)
      } catch {
        // 预热失败静默：下次间隔重试，不影响在线请求
      } finally {
        running = false
      }
    })()
  }

  const startupTimer = setTimeout(warm, STARTUP_DELAY_MS)
  const intervalTimer = setInterval(warm, WARMUP_INTERVAL_MS)
  // Nitro 关闭时清理，避免测试环境悬挂句柄
  process.on('exit', () => {
    clearTimeout(startupTimer)
    clearInterval(intervalTimer)
  })
})
