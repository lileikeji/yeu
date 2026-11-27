/**
 * 投票页的可选设备遥测：浏览器综合指纹 + 自动化探测。
 *
 * 设计约束（按“不影响普通观众、不拖慢提交”来定）：
 * 1. 只在浏览器空闲时采集，投票提交路径永远读缓存，不做 await；
 * 2. 采集结果写入 sessionStorage，同一标签页内稳定，避免同一人前后两次投票算出不同指纹；
 * 3. 任一步失败都静默降级为「无指纹」，服务端只是少一条巡检线索，实时评分与票效完全不变；
 * 4. browser-tool / BotD 走动态 import，不进投票页首屏包体；
 * 5. BotD 显式关闭 monitoring，避免向第三方上报安装统计。
 */

const FINGERPRINT_STORAGE_KEY = 'yeu_popularity_fp'
const AUTOMATION_STORAGE_KEY = 'yeu_popularity_auto'

let fingerprint = ''
let automationHit = false
let primed = false
let priming: Promise<void> | null = null

function readStorage(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // 隐私模式下 sessionStorage 可能抛错，忽略即可。
  }
}

async function readBrowserFingerprint(): Promise<string> {
  try {
    const module = await import('browser-tool')
    const browser = module.default ?? module
    const result = await browser.getFingerprint()
    return result && typeof result.value === 'string' ? result.value.slice(0, 64) : ''
  } catch {
    return ''
  }
}

async function detectAutomation(): Promise<boolean> {
  try {
    const module = await import('@fingerprintjs/botd')
    // monitoring: false 关掉内置的安装量上报，避免投票页向第三方发请求。
    const botd = await module.load({ monitoring: false })
    const result = await botd.detect()
    return Boolean(result?.bot)
  } catch {
    return false
  }
}

async function collect(): Promise<void> {
  const [value, isBot] = await Promise.all([readBrowserFingerprint(), detectAutomation()])
  if (value) {
    fingerprint = value
    writeStorage(FINGERPRINT_STORAGE_KEY, value)
  }
  if (isBot) {
    automationHit = true
    writeStorage(AUTOMATION_STORAGE_KEY, '1')
  }
}

/**
 * 在页面挂载后调用一次；空闲时后台采集，不阻塞渲染与投票。
 */
export function primePopularityFingerprint(): void {
  if (!import.meta.client || primed) return
  primed = true

  const storedFp = readStorage(FINGERPRINT_STORAGE_KEY)
  if (storedFp) {
    fingerprint = storedFp
    automationHit = readStorage(AUTOMATION_STORAGE_KEY) === '1'
    return
  }

  const run = () => {
    priming = collect().finally(() => {
      priming = null
    })
  }

  const idle = (globalThis as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void
  }).requestIdleCallback
  if (typeof idle === 'function') idle(run, { timeout: 2000 })
  else setTimeout(run, 300)
}

/**
 * 同步读取遥测结果，供投票请求体拼装；采集未完成时返回空对象。
 */
export function readPopularityFingerprint(): { fp?: string, wd?: boolean } {
  const env: { fp?: string, wd?: boolean } = {}
  if (fingerprint) env.fp = fingerprint
  if (automationHit) env.wd = true
  return env
}

/** 供需要等待采集完成的调用方使用；投票页不依赖它。 */
export function awaitPopularityFingerprint(): Promise<void> {
  return priming ?? Promise.resolve()
}
