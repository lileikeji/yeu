import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearCompetitionHintCacheForTests,
  classifyCompetitionByAi,
  competitionHintsForQuery,
  looksLikeCompetitionQuery,
  matchKnownCompetition,
  primeCompetitionHints
} from '../server/modules/assistant/competition-classifier'
import { tryComputeZongce } from '../server/modules/assistant/zongce-calculator'

/**
 * 回归背景：学生报的比赛五花八门，关键词表追不上。修之前实测 18 个真实赛事名里
 * 6 个完全认不出（"全国大学生结构设计竞赛"这类就写在一览表里），认出的也普遍少算
 * ——"全国大学生数学建模竞赛一等奖"只给 1 分（校级），因为"全国"没被当成国家级信号、
 * A/B 类也没去查一览表。
 */

function intellectualReward(query: string, hints: Parameters<typeof tryComputeZongce>[1]) {
  const r = tryComputeZongce(query, hints)
  return r?.lines.find(line => line.label === '智育奖励')?.points
}

function moralReward(query: string, hints: Parameters<typeof tryComputeZongce>[1]) {
  const r = tryComputeZongce(query, hints)
  return r?.lines.find(line => line.label === '德育')?.points
}

test('known competition table matches by alias and prefers the longest one', () => {
  assert.equal(matchKnownCompetition('省职业院校技能大赛')?.competition.nationalClass, 'A类')
  assert.equal(matchKnownCompetition('省职业院校技能大赛')?.alias, '省职业院校技能大赛')
  assert.equal(matchKnownCompetition('挑战杯')?.competition.name.includes('挑战杯'), true)
  assert.equal(matchKnownCompetition('全国大学生数学建模竞赛')?.competition.category, 'academic')
  assert.equal(matchKnownCompetition('今天午饭吃什么'), null)
})

test('competition questions are detected before spending an AI call', () => {
  assert.equal(looksLikeCompetitionQuery('数学建模竞赛加多少分'), true)
  assert.equal(looksLikeCompetitionQuery('蓝桥杯省二能加几分'), true)
  assert.equal(looksLikeCompetitionQuery('宿舍是几人间'), false)
})

test('national and provincial rounds of the same competition score differently', () => {
  const hints = competitionHintsForQuery('综测 平均成绩85 专业最高90 全国大学生数学建模竞赛一等奖')
  // 国家级 → A类 一等 6 分（修前是校级 1 分）
  assert.equal(intellectualReward('综测 平均成绩85 专业最高90 全国大学生数学建模竞赛一等奖', { competitionHints: hints }), 6)

  const provinceHints = competitionHintsForQuery('综测 平均成绩85 专业最高90 数学建模竞赛省一等奖')
  // 省级 → B类 一等 4 分
  assert.equal(intellectualReward('综测 平均成绩85 专业最高90 数学建模竞赛省一等奖', { competitionHints: provinceHints }), 4)
})

test('competitions listed in the 2021 A/B table are recognised', () => {
  for (const [name, national, provincial] of [
    ['全国大学生结构设计竞赛', 6, 4],
    ['大学生化学实验竞赛', 6, 4],
    ['互联网+ 大学生创新创业大赛', 6, 4],
    ['ACM-ICPC', 6, 4],
    ['全国大学生广告艺术大赛', 6, 4]
  ] as const) {
    const q = (level: string) => `综测 平均成绩85 专业最高90 ${name}${level}`
    const nationalHints = competitionHintsForQuery(q('一等奖'))
    const provinceHints = competitionHintsForQuery(q('省一等奖'))
    assert.equal(intellectualReward(q('一等奖'), { competitionHints: nationalHints }), national, `${name} 国家级一等奖`)
    assert.equal(intellectualReward(q('省一等奖'), { competitionHints: provinceHints }), provincial, `${name} 省级一等奖`)
  }
})

test('a competition whose name carries the level uses that level', () => {
  // 「省职业院校技能大赛」是省赛（B类 4 分）。表里的正式名是「全国职业院校技能大赛」
  // （A类），只按正式名判级别会把省赛算成 6 分。
  const hints = competitionHintsForQuery('综测 平均成绩85 专业最高90 省职业院校技能大赛一等奖')
  assert.equal(intellectualReward('综测 平均成绩85 专业最高90 省职业院校技能大赛一等奖', { competitionHints: hints }), 4)
})

test('a name containing 系列 does not degrade the tier to 院级', () => {
  // 「挑战杯系列竞赛」里的「系」曾被当成院级信号，导致档位解析失败退到最低档
  // （A类一等 6 分 → 校级 1 分）。
  const query = '综测 平均成绩85 专业最高90 挑战杯一等奖'
  const hints = competitionHintsForQuery(query)
  assert.equal(intellectualReward(query, { competitionHints: hints }), 6)
})

test('an unknown competition is classified by the model and the result is cached', async () => {
  clearCompetitionHintCacheForTests()
  let calls = 0
  const ask = async () => {
    calls += 1
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            name: '省级红色文化创意大赛',
            category: 'culture',
            confidence: 0.8,
            reason: '省教育厅主办的文艺创意类赛事，属德育奖励'
          })
        }
      }]
    }
  }

  const query = '综测 平均成绩85 专业最高90 省级红色文化创意大赛一等奖'
  await primeCompetitionHints(query, ask)
  assert.equal(calls, 1)

  const hints = competitionHintsForQuery(query)
  assert.equal(hints[0]?.category, 'culture')
  assert.equal(hints[0]?.source, 'ai')
  // 文化艺术类属德育奖励：省部级一等奖 = 4 分
  const moral = tryComputeZongce(query, { competitionHints: hints })?.lines.find(line => line.label === '德育')?.points
  assert.equal(moral, 12 + 4)

  // 同一个提问再问一次不再调用模型
  await primeCompetitionHints(query, ask)
  assert.equal(calls, 1)
})

test('a competition already in the table never costs an AI call', async () => {
  clearCompetitionHintCacheForTests()
  let calls = 0
  await primeCompetitionHints('综测 平均成绩85 专业最高90 数学建模省一等奖', async () => {
    calls += 1
    return null
  })
  assert.equal(calls, 0)
})

test('a failing classifier leaves the calculator on its conservative path', async () => {
  clearCompetitionHintCacheForTests()
  const query = '综测 平均成绩85 专业最高90 某个没听过的杯赛一等奖'
  await primeCompetitionHints(query, async () => {
    throw new Error('AI_TIMEOUT')
  })
  // 拿不到判定时既不能崩，也不能凭空猜档位：不计分并提示补充竞赛类型
  const hints = competitionHintsForQuery(query)
  assert.deepEqual(hints, [])
  const result = tryComputeZongce(query, { competitionHints: hints })
  assert.equal(result?.lines.find(line => line.label === '智育奖励')?.points, 0)
  assert.match(result?.answer ?? '', /未匹配到具体竞赛|请补充竞赛类型/)
})

test('the AI classifier rejects unusable payloads instead of guessing', async () => {
  const bad = await classifyCompetitionByAi('某个比赛', async () => ({ choices: [{ message: { content: 'not json' } }] }))
  assert.equal(bad, null)
  const noCategory = await classifyCompetitionByAi('某个比赛', async () => ({
    choices: [{ message: { content: JSON.stringify({ name: '某赛', category: 'unknown' }) } }]
  }))
  assert.equal(noCategory, null)
})

test('school, provincial and national rounds are all recognised', () => {
  // 学生常在赛事名后面带轮次：「数学建模校赛一等奖」「挑战杯省赛二等奖」。
  // 修前 tierTokens 只认「校赛」，「省赛/国赛/市赛/院赛」全都不认，级别解析失败
  // 后一律退到最低档（省赛一等奖被算成校级 1 分，应是省级 B类 4 分）。
  const score = (tail: string) => {
    const q = `综测 平均成绩85 专业最高90 ${tail}`
    return intellectualReward(q, { competitionHints: competitionHintsForQuery(q) })
  }
  assert.equal(score('数学建模校赛一等奖'), 1)      // 校级 一等
  assert.equal(score('数学建模省赛一等奖'), 4)      // 省级 → B类 一等
  assert.equal(score('数学建模国赛一等奖'), 6)      // 国家级 → A类 一等
  assert.equal(score('挑战杯省赛二等奖'), 3)        // B类 二等
  assert.equal(score('挑战杯国赛一等奖'), 6)        // A类 一等
  assert.equal(score('数学建模市赛一等奖'), 2)      // 市级 一等
  assert.equal(score('数学建模省一等奖'), 4)        // 缩略说法仍要认
  assert.equal(score('数学建模国一等奖'), 6)
})

test('an AI judgement survives a name that is not a verbatim substring of the question', async () => {
  // 回归：判定按「原提问」缓存，但读取方只按「赛事名是提问子串」扫缓存。模型的
  // 命名常比提问更完整（问「省级红色文化创意大赛」，答「福建省大学生红色文化创意
  // 大赛」），此时判定会被丢掉——AI 这一层等于白跑，用户又拿到"未识别到项目"。
  clearCompetitionHintCacheForTests()
  const query = '综测 平均成绩85 专业最高90 省级红色文化创意大赛一等奖'
  await primeCompetitionHints(query, async () => ({
    choices: [{ message: { content: JSON.stringify({ name: '福建省大学生红色文化创意大赛', category: 'culture', confidence: 0.7 }) } }]
  }))
  const hints = competitionHintsForQuery(query)
  assert.equal(hints.length, 1)
  assert.equal(hints[0]?.category, 'culture')
  const moral = tryComputeZongce(query, { competitionHints: hints })?.lines.find(line => line.label === '德育')?.points
  assert.equal(moral, 12 + 4)
})

test('an academic competition the model left unclassed falls back to C类, not to the minimum tier', async () => {
  // 办法定义：C类 = A/B 以外的学科技能竞赛。模型没给类别时应落 C类，
  // 否则判定拿到了也算不出分（退回最低档）。
  clearCompetitionHintCacheForTests()
  const query = '综测 平均成绩85 专业最高90 校某杯学科技能大赛一等奖'
  await primeCompetitionHints(query, async () => ({
    choices: [{ message: { content: JSON.stringify({ name: '校某杯学科技能大赛', category: 'academic' }) } }]
  }))
  const hints = competitionHintsForQuery(query)
  assert.equal(hints[0]?.nationalClass, 'C类')
  assert.equal(hints[0]?.provincialClass, 'B类')
})

test('a culture competition that correctly routes to 德育 never reads as "未识别到项目"', async () => {
  // 文化艺术类只计德育，智育奖励为 0 是**判定正确**。若这一行照旧写"未识别到项目"，
  // 学生和线上验收都会把它当成"系统没认出这个比赛"，于是重复提问、重复排查。
  clearCompetitionHintCacheForTests()
  const query = '综测 平均成绩85 专业最高90 省级红色文化创意大赛一等奖'
  await primeCompetitionHints(query, async () => ({
    choices: [{ message: { content: JSON.stringify({ name: '省级红色文化创意大赛', category: 'culture', confidence: 0.7 }) } }]
  }))
  const hints = competitionHintsForQuery(query)
  const result = tryComputeZongce(query, { competitionHints: hints })
  const intellectual = result?.lines.find(line => line.label === '智育奖励')
  assert.equal(intellectual?.points, 0)
  assert.doesNotMatch(intellectual?.detail ?? '', /未识别到项目/)
  assert.match(intellectual?.detail ?? '', /德育/)
  // 德育那一边照旧拿到省部级一等奖的 4 分
  assert.equal(result?.lines.find(line => line.label === '德育')?.points, 12 + 4)
  // 也不该再出现"未匹配到具体竞赛"的补充分类提示
  assert.equal(result?.notes.some(note => note.includes('未匹配到具体竞赛')), false)
})
