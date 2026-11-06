#!/usr/bin/env tsx
/**
 * 给待评选的热点内容打模型分，写进缓存并打印校准报告。
 *
 *   npx tsx scripts/score-signal-llm.ts --limit 40            # 打分（受月度上限约束）
 *   npx tsx scripts/score-signal-llm.ts --report              # 只看现有缓存的通过率
 *   npx tsx scripts/score-signal-llm.ts --limit 5 --dry-run    # 不写缓存
 *
 * 门槛默认 A 55 / B 62 / C 70，报告会按门槛给出通过率，定值前先看这张表。
 */
import { getDatabase } from '../server/database/client'
import { llmConfigFromRuntime, LLM_TIER_THRESHOLDS, readCache, recordCall, remainingCalls, scoreTwice, thresholdForTier, writeCache, scoreOf } from '../server/modules/signal/llm-score'
import { collectSignalCandidates } from '../server/modules/signal/service'
import { signalTierFor } from '../server/modules/signal/tiers'

const args = process.argv.slice(2)
const flag = (name: string, fallback?: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? fallback : fallback
}
const has = (name: string) => args.includes(name)

const limit = Number(flag('--limit', '20'))
const dryRun = has('--dry-run')
const reportOnly = has('--report')

const runtime = (globalThis as { useRuntimeConfig?: () => Record<string, unknown> }).useRuntimeConfig?.() ?? {
  aiGatewayBaseUrl: process.env.AI_GATEWAY_BASE_URL ?? '',
  aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY ?? '',
  aiGatewayModel: process.env.AI_GATEWAY_MODEL ?? '',
  signalLlmModel: process.env.SIGNAL_LLM_MODEL ?? '',
  signalLlmMonthlyCallLimit: process.env.SIGNAL_LLM_MONTHLY_CALL_LIMIT ?? ''
}

const cache = readCache()

function report(): void {
  const rows = Object.entries(cache.scores)
  if (rows.length === 0) {
    console.log('缓存里还没有评分')
    return
  }
  const buckets = new Map<string, { total: number, pass: number, sum: number }>()
  for (const [, entry] of rows) {
    const avg = (entry.a + entry.b) / 2
    for (const [tier, threshold] of Object.entries(LLM_TIER_THRESHOLDS)) {
      const bucket = buckets.get(tier) ?? { total: 0, pass: 0, sum: 0 }
      bucket.total += 1
      bucket.sum += avg
      if (avg >= threshold) bucket.pass += 1
      buckets.set(tier, bucket)
    }
  }
  console.log(`样本 ${rows.length} 条`)
  for (const [tier, bucket] of buckets) {
    const rate = ((bucket.pass / bucket.total) * 100).toFixed(1)
    console.log(`  ${tier} 类门槛 ${thresholdForTier(tier)}：通过 ${bucket.pass}/${bucket.total}（${rate}%），均分 ${(bucket.sum / bucket.total).toFixed(1)}`)
  }
}

if (reportOnly) {
  report()
  process.exit(0)
}

const config = llmConfigFromRuntime(runtime as Record<string, unknown>)
if (!config) {
  console.error('未配置网关（runtimeConfig.aiGatewayBaseUrl / aiGatewayApiKey），无法评分')
  process.exit(1)
}

const client = getDatabase()
const candidates = collectSignalCandidates(client, {})
  .filter(candidate => !cache.scores[`${candidate.itemKind}:${candidate.itemId}`])
  .slice(0, Math.max(1, limit))

console.log(`候选 ${candidates.length} 条，本月剩余额度 ${remainingCalls(cache, config)} 次`)

let scored = 0
for (const candidate of candidates) {
  if (remainingCalls(cache, config) < 2) {
    console.log('月度调用额度不足，停止')
    break
  }
  const tier = signalTierFor({ isOfficial: candidate.isOfficial, sourceLevel: candidate.sourceLevel })
  const result = await scoreTwice(config, candidate.title, String(candidate.body ?? candidate.summary ?? ''))
  recordCall(cache)
  recordCall(cache)
  if (!result) {
    console.log(`  未评分：${candidate.title.slice(0, 30)}`)
    continue
  }
  cache.scores[`${candidate.itemKind}:${candidate.itemId}`] = { ...result, model: config.model, at: Date.now() }
  scored += 1
  const avg = (result.a + result.b) / 2
  const mark = avg >= thresholdForTier(tier) ? '通过' : '低于门槛'
  console.log(`  ${tier} ${avg.toFixed(1)} ${mark}｜${candidate.title.slice(0, 30)}`)
}

if (!dryRun) writeCache(cache)
console.log(`完成 ${scored} 条${dryRun ? '（dry-run，未写缓存）' : ''}`)
report()

// 保留一个入口，方便脚本里按 itemId 取分。
void scoreOf
