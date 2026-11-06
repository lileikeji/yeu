/**
 * 用大模型给热点内容打两次分，按信源分级取门槛。
 *
 * 只在 SIGNAL_LLM_SCORING=1 且网关配置齐全时生效；默认关闭，行为与规则打分完全一致。
 * 三个原则（来自评审 dd-school-map 的资讯模块）：
 * - 同一篇打两次取平均，降低单次抖动；任一次失败算「未评分」，不算「不合格」；
 * - 门槛按信源分级：A 类官方通知 55、B 类 62、C 类 70；
 * - 月度调用有硬上限，超了停止调用，宁可少评也不让账单失控。
 *
 * 分数写进本地缓存（data/runtime/signal-llm-scores.json），构建快照时同步读取，
 * 不把异步调用塞进纯函数里。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface LlmScoreConfig {
  baseUrl: string
  apiKey: string
  model: string
  monthlyCallLimit: number
  timeoutMs: number
}

export interface LlmScoreEntry {
  a: number
  b: number
  model: string
  at: number
}

export interface LlmScoreCache {
  scores: Record<string, LlmScoreEntry>
  /** 形如 2026-11 的月度计数。 */
  usage: Record<string, number>
}

export const LLM_TIER_THRESHOLDS: Record<string, number> = { A: 55, B: 62, C: 70 }

export const LLM_SCORE_PROMPT = `你是仰恩大学校园资讯站的编辑。给下面这条内容打 0-100 分，判断它值不值得展示给全校学生。
维度：可参与性 35 分（能不能去、能不能用，有明确时间地点和报名方式的高）；
时效性 25 分（越临近越高，过期低）；受众广度 20 分（面向全校的高，只面向某学院某课题组的低）；
信息完整 20 分（题目、时间、地点、主办方齐全的高）。
不属于校园生活范畴的内容（招标采购、纯行政公文、对外宣传稿）给 30 分以下。
只输出 JSON：{"score": 数字, "reason": "一句话理由"}`

export function llmConfigFromRuntime(runtime: Record<string, unknown>): LlmScoreConfig | null {
  const baseUrl = String(runtime.aiGatewayBaseUrl || '')
  const apiKey = String(runtime.aiGatewayApiKey || '')
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    apiKey,
    model: String(runtime.signalLlmModel || runtime.aiGatewayModel || 'gpt-5.4'),
    monthlyCallLimit: Math.max(0, Number(runtime.signalLlmMonthlyCallLimit) || 3000),
    timeoutMs: Math.max(5_000, Number(runtime.signalLlmTimeoutMs) || 20_000)
  }
}

export function signalLlmEnabled(): boolean {
  return process.env.SIGNAL_LLM_SCORING === '1'
}

export function monthKey(now = Date.now()): string {
  const date = new Date(now)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function cachePath(): string {
  return process.env.SIGNAL_LLM_CACHE_PATH
    || resolve(process.cwd(), 'data/runtime/signal-llm-scores.json')
}

export function readCache(path = cachePath()): LlmScoreCache {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LlmScoreCache>
    return { scores: parsed.scores ?? {}, usage: parsed.usage ?? {} }
  } catch {
    return { scores: {}, usage: {} }
  }
}

export function writeCache(cache: LlmScoreCache, path = cachePath()): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
}

export function itemKey(kind: string, id: string): string {
  return `${kind}:${id}`
}

export function scoreOf(cache: LlmScoreCache, kind: string, id: string): number | null {
  const entry = cache.scores[itemKey(kind, id)]
  if (!entry) return null
  return (entry.a + entry.b) / 2
}

export function thresholdForTier(tier: string): number {
  return LLM_TIER_THRESHOLDS[tier] ?? LLM_TIER_THRESHOLDS.C!
}

/** 未评分（null）保持原样，不当作不合格——门槛定错了还能补评。 */
export function decideWithLlm(score: number | null, tier: string): 'selected' | 'hidden' | 'unknown' {
  if (score === null) return 'unknown'
  return score >= thresholdForTier(tier) ? 'selected' : 'hidden'
}

export function remainingCalls(cache: LlmScoreCache, config: LlmScoreConfig, now = Date.now()): number {
  const used = cache.usage[monthKey(now)] ?? 0
  return Math.max(0, config.monthlyCallLimit - used)
}

export function recordCall(cache: LlmScoreCache, now = Date.now()): void {
  const key = monthKey(now)
  cache.usage[key] = (cache.usage[key] ?? 0) + 1
}

function parseScore(text: string): number | null {
  const match = /"score"\s*:\s*(\d{1,3})/.exec(text)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

export function promptText(title: string, body: string): string {
  return `标题：${title || ''}\n\n正文：${(body || '').slice(0, 2000)}`
}

/** 调一次网关。失败返回 null，交给上层当作「未评分」。 */
export async function scoreOnce(
  config: LlmScoreConfig,
  title: string,
  body: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<number | null> {
  const doFetch = options.fetchImpl ?? fetch
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: LLM_SCORE_PROMPT },
          { role: 'user', content: promptText(title, body) }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content ?? ''
    return parseScore(content)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 两次独立评分取平均；任一次失败整体算未评分。 */
export async function scoreTwice(
  config: LlmScoreConfig,
  title: string,
  body: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<{ a: number, b: number } | null> {
  const a = await scoreOnce(config, title, body, options)
  const b = await scoreOnce(config, title, body, options)
  if (a === null || b === null) return null
  return { a, b }
}

export function contentHash(title: string, body: string): string {
  return createHash('sha1').update(`${title}\n${body}`).digest('hex').slice(0, 16)
}
