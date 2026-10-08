import { knownCompetitions, type CompetitionCategory, type KnownCompetition } from '../../../data/known-competitions'
import { coalesceInFlight } from './inflight'

/**
 * 比赛归类判定：把学生嘴里的赛事名判成「哪一类竞赛、加多少分」。
 *
 * 分两层，先便宜后昂贵：
 *  1. `knownCompetitions` 表（data/known-competitions.ts）——一览表里明确写过的
 *     赛事，零延迟、零外部依赖。
 *  2. AI 判定——表外赛事。学生报的比赛五花八门（"省级红色文化创意大赛"、
 *     "校园歌手大赛"），关键词表永远追不上；这里让模型按 2025 版办法的类别定义
 *     判断。只对表外赛事发起，且按赛事名缓存，同一个赛事之后再问都是 0 延迟。
 *
 * 判定只作为「估算」呈现：结论里必须带主办方与依据，并提示以学院当年审核为准。
 */

export type CompetitionClass = 'A类' | 'B类' | 'C类'

export interface CompetitionHint {
  /** 命中的赛事名（表内为正式名，表外为模型给出的名称） */
  name: string
  category: CompetitionCategory
  /** 国家级算哪一类（学科技能竞赛用） */
  nationalClass?: CompetitionClass
  /** 省级算哪一类（学科技能竞赛用） */
  provincialClass?: 'B类' | 'C类'
  /**
   * 用户在提问里实际写的赛事片段（表内为命中的别名）。级别可能藏在写法里——
   * 「省职业院校技能大赛」是省赛（B类），而同一张表的正式名是「全国职业院校技能
   * 大赛」（A类）。只按正式名判级别会把省赛算成 6 分。
   */
  matched?: string
  source: 'table' | 'ai'
  confidence?: number
  host?: string
  note?: string
}

/** 判定结果按赛事名缓存：类别是稳定事实，不需要重复问模型。 */
const hintCache = new Map<string, CompetitionHint>()

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[《》“”"'「」【】()（）\s、，,。.．:：;；!！?？\-—_+＋]/gu, '')
}

/** 在文本里找表内赛事（取最长别名，避免"数学建模竞赛"被子串"数学建模"抢先）。 */
export function matchKnownCompetition(text: string): { competition: KnownCompetition, alias: string } | null {
  const normalized = normalizeName(text)
  let best: { competition: KnownCompetition, alias: string, length: number } | null = null
  for (const competition of knownCompetitions) {
    for (const alias of competition.aliases) {
      const needle = normalizeName(alias)
      if (needle.length < 2 || !normalized.includes(needle)) continue
      if (!best || needle.length > best.length) best = { competition, alias, length: needle.length }
    }
  }
  return best ? { competition: best.competition, alias: best.alias } : null
}

function hintFromKnown(competition: KnownCompetition, matched: string): CompetitionHint {
  return {
    name: competition.name,
    category: competition.category,
    nationalClass: competition.nationalClass,
    provincialClass: competition.provincialClass,
    matched,
    source: 'table',
    ...(competition.host ? { host: competition.host } : {})
  }
}

/**
 * 提问级缓存键。表外赛事的判定按「原提问」缓存——模型返回的赛事名不一定原样出现在
 * 提问里（问的是「省级红色文化创意大赛」，模型可能答「福建省大学生红色文化创意
 * 大赛」），只靠「名字是提问子串」去扫缓存会把判定丢掉，AI 这一层就白跑了。
 */
function queryCacheKey(query: string): string {
  return `query:${normalizeName(query)}`
}

/**
 * 同步取出该问题的赛事判定（只读缓存/表，不发起任何外部调用）。
 * 计算器用它来定位赛事类别与级别。
 */
export function competitionHintsForQuery(query: string): CompetitionHint[] {
  const hints: CompetitionHint[] = []
  const known = matchKnownCompetition(query)
  if (known) hints.push(hintFromKnown(known.competition, known.alias))
  // ① 原提问精确命中（表外赛事由 AI 判定后按原话缓存）
  const cached = hintCache.get(queryCacheKey(query))
  if (cached && !hints.some(item => item.name === cached.name)) hints.push(cached)
  // ② 缓存里的其它判定：赛事名出现在提问里也能用（换个说法问同一赛事）
  for (const hint of hintCache.values()) {
    if (hints.some(item => item.name === hint.name)) continue
    if (query.includes(hint.name)) hints.push(hint)
  }
  return hints
}

/** 问题里有没有"这是个比赛"的信号——没有就不值得为它问模型。 */
export function looksLikeCompetitionQuery(query: string): boolean {
  return /竞赛|比赛|大赛|赛事|杯|职业技能|创新创业|建模|设计赛|挑战赛|锦标赛|联赛/.test(query)
}

const CLASSIFIER_RULES = [
  '依据仰恩大学 2025 版《学生综合测评实施办法》：',
  '学科技能竞赛（智育奖励，累计上限10分），按 A/B/C 类：',
  '  A类 = 教育部国家级竞赛、全国职业院校技能大赛、省厅认定重大赛事',
  '  B类 = A类赛事的省级选拔、全国性行业协会/学会赛事、福建省级赛事',
  '  C类 = A/B 以外的学科技能竞赛；市级、校级另有档位',
  '文化艺术/思想建设/综合素质竞赛（德育奖励，累计上限13分）按主办层级：',
  '  国家级 / 省部级 / 市·校级 / 校职能部门级 / 院级；征文、演讲、摄影、舞蹈、',
  '  动漫、辩论、书法、歌唱等文艺类都属这一档。',
  '体育比赛属体育奖励（上限2分）；大学生创新创业训练计划等科研课题属智育的科研课题档。',
  '判断要点：看主办单位层级（教育部/团中央/省厅/省团委/学校/学院/行业协会）决定档位；',
  '主办方是教育部等国家部委的学科技能赛事才是 A类，行业协会/学会主办的是 B类。',
  '信息不足时给出最贴近的判断并在 reason 里说明缺什么，不要编造主办方。'
].join('\n')

interface AiClassification {
  category?: string
  name?: string
  nationalClass?: string
  provincialClass?: string
  confidence?: number
  reason?: string
}

const CATEGORIES: readonly CompetitionCategory[] = ['academic', 'culture', 'sports', 'research']
const CLASSES: readonly CompetitionClass[] = ['A类', 'B类', 'C类']

function coerceClass(value: string | undefined): CompetitionClass | undefined {
  if (!value) return undefined
  const compact = value.replace(/\s/gu, '')
  return CLASSES.find(item => compact.includes(item.replace('类', '')))
}

/**
 * 问模型这个比赛算哪一类。失败/未配置网关一律返回 null，调用方保持原有保守行为。
 */
export async function classifyCompetitionByAi(
  query: string,
  ask: (messages: Array<{ role: 'system' | 'user', content: string }>) => Promise<unknown>
): Promise<CompetitionHint | null> {
  try {
    const payload = await ask([
      { role: 'system', content: `${CLASSIFIER_RULES}\n只输出一个 JSON 对象，不要输出其他文字。` },
      {
        role: 'user',
        content: [
          '请判断这条提问里提到的比赛属于哪一类，并给出级别。',
          '输出格式：{"name":"比赛名","category":"academic|culture|sports|research",',
          '"nationalClass":"A类|B类|C类","provincialClass":"B类|C类","confidence":0.0-1.0,"reason":"一句话依据"}',
          'category 取 academic=学科技能竞赛（智育）、culture=文化艺术/思想建设/综合素质竞赛（德育）、',
          'sports=体育比赛、research=科研课题（大创等结项）。',
          `提问：${query}`
        ].join('\n')
      }
    ])
    const text = extractText(payload)
    if (!text) return null
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) as AiClassification
    const category = CATEGORIES.find(item => item === parsed.category)
    if (!category) return null
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 60) : ''
    if (!name) return null
    const confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : undefined
    // 学科技能竞赛：模型没给出类别时按办法定义落 C类（A/B 以外的学科技能竞赛），
    // 而不是"无法定档"——否则判定拿到了也用不上，又退回最低档。省级同理落 B类
    // （办法里 B类 含「福建省级赛事」）。
    const aiNationalClass = coerceClass(parsed.nationalClass) ?? 'C类'
    const aiProvincialClass = coerceClass(parsed.provincialClass) ?? 'B类'
    return {
      name,
      matched: name,
      category,
      ...(category === 'academic' ? { nationalClass: aiNationalClass } : {}),
      ...(category === 'academic' ? { provincialClass: aiProvincialClass as 'B类' | 'C类' } : {}),
      source: 'ai',
      ...(confidence !== undefined ? { confidence } : {}),
      ...(typeof parsed.reason === 'string' && parsed.reason.trim() ? { note: parsed.reason.trim().slice(0, 120) } : {})
    }
  } catch (error) {
    // 静默返回 null 会让「这个比赛没算上分」变成无法排查的谜题：线上出现过并发
    // 请求挤掉网关名额（AI_BUSY）导致判定拿不到，而答案只是照常显示"未识别到项目"。
    // 归类本身仍不抛错（算分要能继续），但必须留下一行原因。
    console.log(`[competition-classifier] failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}

/**
 * world 预热：为这条提问解析赛事判定并写入缓存。
 *
 * 表内赛事直接写入；表外赛事才问模型（每次提问最多一次，结果按赛事名缓存）。
 * 任何失败都静默忽略——计算器在拿不到判定时会退回原有的保守行为。
 */
export async function primeCompetitionHints(
  query: string,
  ask: (messages: Array<{ role: 'system' | 'user', content: string }>) => Promise<unknown>
): Promise<void> {
  if (!looksLikeCompetitionQuery(query)) return
  const known = matchKnownCompetition(query)
  if (known) {
    const hint = hintFromKnown(known.competition, known.alias)
    if (!hintCache.has(known.competition.name)) hintCache.set(known.competition.name, hint)
    return
  }
  // 表外：同一个提问不重复问（缓存键用原话，避免每次都要模型再报一次赛事名）
  const cacheKey = queryCacheKey(query)
  if (hintCache.has(cacheKey)) return
  // 并发去重：开学季同一句话被多人同时问到，或在途时被重试，都不该各发一次网关调用
  // ——网关有并发上限（AI_BUSY）与每分钟配额（429），多发的那次只会被丢掉，
  // 而丢掉的表现是"这个比赛没算上分"。后来者直接复用第一个在途请求的结果。
  const hint = await coalesceInFlight(`competition:${cacheKey}`, () => classifyCompetitionByAi(query, ask))
  if (!hint) return
  hintCache.set(cacheKey, hint)
  // 每个**新赛事**只打一行：线上排查「为什么这个比赛没算上分」时能直接看到判定结果。
  // 必须按「是否新赛事」判断而不是无条件打：并发合并后，同一赛事的 N 个调用者都会
  // 拿到同一份结果（这是对的），若无条件打就会刷出 N 行一样的日志，反而没法用它数
  // 「到底判定了几个赛事」。
  const isNewCompetition = !hintCache.has(hint.name)
  if (isNewCompetition) hintCache.set(hint.name, hint)
  if (!isNewCompetition) return
  console.log(`[competition-classifier] ${JSON.stringify({
    name: hint.name,
    category: hint.category,
    nationalClass: hint.nationalClass ?? null,
    provincialClass: hint.provincialClass ?? null,
    confidence: hint.confidence ?? null
  })}`)
}

/** 仅供测试：清空缓存。 */
export function clearCompetitionHintCacheForTests(): void {
  hintCache.clear()
}
