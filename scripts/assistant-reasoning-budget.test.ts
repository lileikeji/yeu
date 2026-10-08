import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * 回归背景（2026-09-20 线上实测，deepseek-v4-flash + response_format: json_object）：
 *
 * 网关是推理模型，思考 token 和正文共享 max_tokens。**小预算的结构化调用**会被思考吃光额度，
 * 正文一个字符都拿不到，而且失败得很安静——调用方 catch 到空 content 就退回正则/模板兜底，
 * 表面「跑过了」，其实整条通道恒为 null：
 *   - 意图分类 max_tokens=120：4 问 2 败，finish_reason=length、rt=128、content=null
 *   - 查询改写 max_tokens=300：3 问 1 败，截断成 `{"queries":["奖学金如何评定","奖学金评审标准`
 *   - 比赛归类 max_tokens=200：同型调用，同一失效模式（学生报的表外赛事认不出）
 * 关掉思考后：意图分类 4/4（325~618ms）、查询改写 3/3（501~667ms），延迟还降了一半。
 *
 * 反过来，**生成正文**的调用不能关：答案合成提示词下，关掉思考会把
 * 「应归入文化艺术类竞赛、按省部级档次计分」退化成「无法确认」。
 *
 * 所以这个文件锁死两件事：小 JSON 调用必须关思考，生成调用必须保持默认（开思考）。
 * 任何一条写错，线上都会退化成「答非所问」或「答案变差」，且不会有测试失败提示。
 */

const SERVICE = 'server/modules/assistant/service.ts'

function readService(): string {
  // 行尾归一：仓库 core.autocrlf=true，Windows 工作区里有的文件是 CRLF、有的（新写的）
  // 是 LF。断言不该因此失效。
  return readFileSync(SERVICE, 'utf8').replace(/\r\n/g, '\n')
}

/** 取 needle 之后 size 个字符的窗口，用来把断言限定在某一次调用的 options 块里。 */
function windowAfter(source: string, needle: string, size: number): string {
  const at = source.indexOf(needle)
  assert.notEqual(at, -1, `service.ts 里找不到锚点：${needle}`)
  return source.slice(at, at + size)
}

test('postGatewayChat 只在显式要求时才发送 reasoning_effort', () => {
  const source = readService()
  const at = source.indexOf('async function postGatewayChat(')
  assert.notEqual(at, -1)
  // 窗口要够宽：函数里前后加过名额等待、429 重试等逻辑，窗口太窄会随无关改动假失败。
  const body = source.slice(at, at + 9000)
  assert.match(
    body,
    /\.\.\.options\.reasoningEffort === 'none' \? \{ reasoning_effort: 'none' \} : \{\},/,
    'reasoning_effort 必须由 options 开关驱动，不能无条件发送'
  )
  assert.match(
    body,
    /waitForSlotMs/,
    '名额等待必须留在 postGatewayChat 里（增强调用靠它避免并发时被 AI_BUSY 丢掉）'
  )
})

test('小预算结构化调用都关掉了思考（否则通道静默失效）', () => {
  const source = readService()
  const smallJsonCalls: Array<[string, string]> = [
    ['意图分类', 'maxTokens: 120,'],
    ['比赛归类', 'maxTokens: 200,'],
    ['记忆抽取', 'maxTokens: 220,'],
    ['查询改写', 'maxTokens: 300,']
  ]
  for (const [label, anchor] of smallJsonCalls) {
    const options = windowAfter(source, anchor, 600)
    assert.match(
      options,
      /reasoningEffort: 'none'/,
      `${label}（${anchor}）必须传 reasoningEffort: 'none'，否则思考会吃光预算、content 为 null`
    )
  }
})

test('生成正文的调用保持开思考（关掉会显著降低答案质量）', () => {
  const source = readService()
  // 答案合成：流式调用，走 MAX_GATEWAY_OUTPUT_TOKENS 默认值
  const synthesis = windowAfter(source, '], {\n    stream: true,', 200)
  assert.doesNotMatch(
    synthesis,
    /reasoningEffort/,
    '答案合成必须保留推理能力：关掉会把可判定的赛事归类退化成「无法确认」'
  )
  // 美食合成：FOOD_AI_MAX_TOKENS
  const food = windowAfter(source, 'maxTokens: FOOD_AI_MAX_TOKENS,', 400)
  assert.doesNotMatch(food, /reasoningEffort/, '美食合成必须保留推理能力')
})

test('关思考的调用点数量与预期一致（新增小 JSON 调用时这条会提醒）', () => {
  const source = readService()
  const count = (source.match(/reasoningEffort: 'none'/g) ?? []).length
  assert.equal(
    count,
    4,
    '预期 4 个小 JSON 调用点（意图分类 / 比赛归类 / 记忆抽取 / 查询改写）；新增或删除调用点请同步这个数字与上面的清单'
  )
})

test('增强类调用允许一次 429 重试，生成正文的调用不重试', () => {
  // 线上实测：连着问两个表外赛事，第二个的归类会撞上网关 429，判定被静默丢掉，
  // 答案退回"未识别到项目"（用户看到的是少算了分）。重试一次即可救回。
  // 前台生成正文不能重试——用户已经在等，重试只会让等待更长。
  const source = readService()
  const smallJsonCalls: Array<[string, string]> = [
    ['意图分类', 'maxTokens: 120,'],
    ['比赛归类', 'maxTokens: 200,'],
    ['记忆抽取', 'maxTokens: 220,'],
    ['查询改写', 'maxTokens: 300,']
  ]
  for (const [label, anchor] of smallJsonCalls) {
    const options = windowAfter(source, anchor, 800)
    assert.match(options, /maxAttempts: 2/, `${label}（${anchor}）应允许一次 429 重试`)
    assert.match(
      options,
      /waitForSlotMs: ASSISTANT_ENHANCEMENT_SLOT_WAIT_MS/,
      `${label}（${anchor}）应在网关名额满时等待而不是立刻抛 AI_BUSY（否则并发下静默降级）`
    )
  }
  // 答案合成与美食合成保持单次尝试
  assert.doesNotMatch(windowAfter(source, '], {\n    stream: true,', 200), /maxAttempts/)
  assert.doesNotMatch(windowAfter(source, 'maxTokens: FOOD_AI_MAX_TOKENS,', 400), /maxAttempts/)
})

test('429 重试只对「短暂限流」生效，配额型（retry-after 大）直接放弃', () => {
  const source = readService()
  const at = source.indexOf('async function postGatewayChat(')
  assert.notEqual(at, -1)
  const body = source.slice(at, at + 6000)
  assert.match(body, /if \(response\.status !== 429 \|\| attempt >= maxAttempts \|\| requestSignal\.aborted\) break/)
  assert.match(body, /await response\.text\(\)\.catch\(\(\) => ''\)/)
  // 网关 429 带 retry-after=24（每分钟请求数配额）：等它会把用户挂住半分钟。
  assert.match(body, /if \(Number\.isFinite\(retryAfterSeconds\) && retryAfterSeconds > 1\) break/)
})
