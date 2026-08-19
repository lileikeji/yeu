import './load-env'
import { closeDatabase, getDatabase } from '../server/database/client'
import {
  assistantRetrievalQuery,
  retrieveCampusEvidence,
  retrieveMultiQueryEvidence,
  type AssistantEvidence
} from '../server/modules/assistant/service'
import { rerankEvidence, rerankConfigReady, type RerankConfig } from '../server/modules/assistant/rerank'
import { retrieveGraphEvidence } from '../server/modules/assistant/graph-search'
import { mergeVectorEvidence, retrieveVectorEvidence } from '../server/modules/assistant/vector-search'
import { embeddingConfigReady } from '../server/modules/assistant/embedding'
import { expandCampusSearchTerms } from '../shared/utils/campus-search-aliases'

/**
 * Offline retrieval evaluation harness (P8-5).
 *
 * Measures how well the local evidence retrieval (RRF + intent rerank, plus
 * the optional cross-encoder rerank channel and the P9 multi-query rewrite
 * channel) surfaces the expected evidence for a hand-curated set of campus
 * questions. Metrics: Recall@5, Recall@10 and MRR. Run `pnpm eval:retrieval`
 * (baseline), `pnpm eval:retrieval --rerank` (also exercises the rerank
 * channel when AI_RERANK_* env is configured) and `pnpm eval:retrieval
 * --rewrite` to exercise the multi-query rewrite channel: it uses the real
 * gateway when AI_GATEWAY_* env is configured, otherwise a deterministic stub
 * transport so the fusion plumbing can be verified without a model. Everything
 * reads the local SQLite database; nothing is written.
 */

interface EvalCase {
  name: string
  q: string
  /** Every one of these substrings must appear in the winning item's title+snippet. */
  require: string[]
}

const EVAL_CASES: EvalCase[] = [
  { name: '军训时间', q: '今年军训什么时候开始？', require: ['军训', '12月'] },
  { name: '舒适型宿舍费用', q: '舒适型宿舍多少钱？', require: ['舒适型', '2780'] },
  { name: '普通型宿舍费用', q: '普通型宿舍多少钱？', require: ['普通型', '1300'] },
  { name: '综测构成', q: '综合测评怎么算，由哪些部分组成？', require: ['综合测评', '德育'] },
  { name: '生源地贷款', q: '生源地信用助学贷款怎么申请？', require: ['助学贷款', '生源地'] },
  { name: '转专业申请时间', q: '2026级新生什么时候申请转专业？', require: ['转专业', '12月'] },
  { name: '报到时间', q: '2026级什么时候报到？', require: ['报到', '9月'] },
  { name: '快递地址', q: '新生快递地址怎么填？', require: ['快递', '马甲镇'] },
  { name: '校园卡', q: '校园卡是电话卡吗？', require: ['校园卡'] },
  { name: '电动车', q: '校内可以骑电动车吗？', require: ['电动车'] },
  { name: '叮叮车', q: '仰恩大学叮叮车是什么车？', require: ['叮叮车'] },
  { name: '志愿加分', q: '综测志愿服务加多少分？', require: ['志愿', '0.15'] },
  { name: '门禁时间', q: '宿舍几点关门？', require: ['宿舍', '23:00'] },
  { name: '学费', q: '2026级一年学费是多少？', require: ['学费', '23000'] },
  { name: '创始人', q: '吴庆星是谁？', require: ['吴庆星'] },
  { name: '董事长', q: '林惠是谁？', require: ['林惠'] },
  { name: '新旧区', q: '新区旧区怎么分？有哪些宿舍楼？', require: ['新区', '旧区'] },
  { name: '第二学历', q: '学校可以申请第二学历吗？', require: ['第二学历'] },
  { name: '羽毛球场', q: '学校有羽毛球场吗？', require: ['羽毛球'] },
  { name: '夜不归宿', q: '夜不归宿怎么认定？', require: ['夜不归宿'] },
  { name: '抢舒适型', q: '什么时候抢舒适型宿舍？', require: ['舒适型', '8月24日'] },
  { name: '贫困补助', q: '国家助学金怎么申请？', require: ['助学金'] }
]

function hit(item: { title: string; snippet?: string; text?: string }, require: string[]): boolean {
  const haystack = `${item.title} ${item.snippet ?? ''} ${item.text ?? ''}`
  return require.every(term => haystack.includes(term))
}

const databaseArg = process.argv.find(arg => arg.startsWith('--database='))
const databasePath = databaseArg ? databaseArg.split('=')[1] : (process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite')
const useRerank = process.argv.includes('--rerank')
const useRewrite = process.argv.includes('--rewrite')
// Exercise the semantic + graph legs too (when configured) so the harness
// measures the SAME full pipeline production runs, not just keyword+rewrite.
const useVector = process.argv.includes('--vector')
const useGraph = process.argv.includes('--graph')
const topK = 10

const embeddingConfig = {
  baseUrl: process.env.AI_EMBEDDING_BASE_URL || process.env.NUXT_AI_EMBEDDING_BASE_URL || '',
  apiKey: process.env.AI_EMBEDDING_API_KEY || process.env.NUXT_AI_EMBEDDING_API_KEY || '',
  model: process.env.AI_EMBEDDING_MODEL || process.env.NUXT_AI_EMBEDDING_MODEL || 'BAAI/bge-m3',
  timeoutMs: Number(process.env.AI_EMBEDDING_TIMEOUT_MS || process.env.NUXT_AI_EMBEDDING_TIMEOUT_MS) || 15_000
}
const embeddingReady = useVector && embeddingConfigReady(embeddingConfig)

/** OpenAI-compatible chat transport used when AI_GATEWAY_* env is configured. */
async function llmRewriteChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: 'system' | 'user', content: string }>
): Promise<unknown> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages
    }),
    signal: AbortSignal.timeout(12_000)
  })
  if (!res.ok) throw new Error(`gateway ${res.status}`)
  return res.json()
}

/**
 * Deterministic stub transport for plumbing verification without a model:
 * variants are derived from the raw query via the existing preprocessing
 * helpers (retrieval query + alias expansion). This exercises the multi-query
 * fusion path; it does NOT measure LLM rewrite quality — use --rewrite with
 * AI_GATEWAY_* env (or the production server) for that.
 */
function stubRewriteChat(rawQuery: string): Promise<unknown> {
  const variants: string[] = []
  const retrievalQuery = assistantRetrievalQuery(rawQuery)
  if (retrievalQuery && retrievalQuery !== rawQuery) variants.push(retrievalQuery)
  const expanded = expandCampusSearchTerms(rawQuery)
  if (expanded.length > 0) {
    const joined = expanded.join(' ')
    if (joined !== rawQuery && !variants.includes(joined)) variants.push(joined)
  }
  return Promise.resolve({
    choices: [{ message: { content: JSON.stringify({ queries: variants }) } }]
  })
}

const rewriteGatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL || process.env.NUXT_AI_GATEWAY_BASE_URL || ''
const rewriteGatewayApiKey = process.env.AI_GATEWAY_API_KEY || process.env.NUXT_AI_GATEWAY_API_KEY || ''
const rewriteGatewayModel = process.env.AI_GATEWAY_MODEL || process.env.NUXT_AI_GATEWAY_MODEL || 'gpt-5.4'
const rewriteMode = !useRewrite
  ? 'off' as const
  : (rewriteGatewayBaseUrl && rewriteGatewayApiKey ? 'llm' as const : 'stub' as const)

try {
  const client = getDatabase(databasePath)
  const rerankConfig: RerankConfig = {
    baseUrl: process.env.AI_RERANK_BASE_URL || process.env.NUXT_AI_RERANK_BASE_URL || '',
    apiKey: process.env.AI_RERANK_API_KEY || process.env.NUXT_AI_RERANK_API_KEY || '',
    model: process.env.AI_RERANK_MODEL || process.env.NUXT_AI_RERANK_MODEL || 'BAAI/bge-reranker-v2-m3',
    timeoutMs: 15_000
  }
  const rerankWanted = useRerank && rerankConfigReady(rerankConfig)

  const results: Array<{ name: string; q: string; rank: number | null; top5: string[] }> = []
  let recall5 = 0
  let recall10 = 0
  let mrrSum = 0
  let rerankedCount = 0
  let rewriteAppliedCount = 0

  for (const c of EVAL_CASES) {
    const retrievalQuery = assistantRetrievalQuery(c.q)
    let evidence: AssistantEvidence[]
    if (rewriteMode !== 'off') {
      const multi = await retrieveMultiQueryEvidence(client, c.q, topK, {
        embedding: embeddingReady ? embeddingConfig : undefined,
        maxVariants: 2,
        chat: rewriteMode === 'llm'
          ? messages => llmRewriteChat(rewriteGatewayBaseUrl, rewriteGatewayApiKey, rewriteGatewayModel, messages)
          : () => stubRewriteChat(c.q)
      })
      evidence = multi.evidence
      if (multi.applied) rewriteAppliedCount += 1
    } else {
      evidence = retrieveCampusEvidence(client, retrievalQuery, topK)
      if (embeddingReady) {
        const vectorEvidence = await retrieveVectorEvidence(client, retrievalQuery, embeddingConfig, 40)
        if (vectorEvidence.length > 0) evidence = mergeVectorEvidence(evidence, vectorEvidence) as AssistantEvidence[]
      }
    }
    if (useGraph) {
      const graphEvidence = retrieveGraphEvidence(client, retrievalQuery, 8)
      if (graphEvidence.length > 0) evidence = mergeVectorEvidence(evidence, graphEvidence) as AssistantEvidence[]
    }
    if (rerankWanted) {
      const reranked = await rerankEvidence(retrievalQuery, evidence, rerankConfig, { topK })
      if (reranked.outcome.applied) {
        evidence = reranked.evidence
        rerankedCount += 1
      }
    }
    const rank = evidence.findIndex(item => hit(item, c.require))
    const rank1 = rank >= 0 ? rank + 1 : null
    if (rank1 !== null && rank1 <= 5) recall5 += 1
    if (rank1 !== null && rank1 <= 10) recall10 += 1
    if (rank1 !== null) mrrSum += 1 / rank1
    results.push({
      name: c.name,
      q: c.q,
      rank: rank1,
      top5: evidence.slice(0, 5).map(item => item.title)
    })
  }

  const n = EVAL_CASES.length
  const report = {
    database: client.path,
    rerank: rerankWanted ? `${rerankConfig.model}` : 'off',
    rerankedQueries: rerankedCount,
    rewrite: rewriteMode,
    rewriteAppliedQueries: rewriteAppliedCount,
    cases: n,
    recallAt5: Number((recall5 / n).toFixed(3)),
    recallAt10: Number((recall10 / n).toFixed(3)),
    mrr: Number((mrrSum / n).toFixed(3)),
    missed: results.filter(r => r.rank === null).map(r => r.name)
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  for (const r of results) {
    process.stdout.write(`# ${r.name} [rank ${r.rank ?? 'MISS'}]: ${r.q}\n`)
    for (const t of r.top5) process.stdout.write(`   - ${t}\n`)
  }
} finally {
  closeDatabase(databasePath)
}
