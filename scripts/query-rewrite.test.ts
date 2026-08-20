import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRewriteMessages,
  parseRewriteVariants,
  rewriteConfigReady,
  rewriteVariantCount,
  QUERY_REWRITE_MAX_VARIANTS,
  QUERY_REWRITE_VARIANT_MAX_CHARS
} from '../server/modules/assistant/query-rewrite'

test('rewriteConfigReady requires the master switch', () => {
  assert.equal(rewriteConfigReady(undefined), false)
  assert.equal(rewriteConfigReady(null), false)
  assert.equal(rewriteConfigReady({ enabled: false }), false)
  assert.equal(rewriteConfigReady({ enabled: true }), true)
})

test('rewriteVariantCount clamps into the supported range', () => {
  assert.equal(rewriteVariantCount(undefined), 2)
  assert.equal(rewriteVariantCount(0), 2)
  assert.equal(rewriteVariantCount(1), 1)
  assert.equal(rewriteVariantCount(5), QUERY_REWRITE_MAX_VARIANTS)
  assert.equal(rewriteVariantCount(2.6), 3)
})

test('buildRewriteMessages asks for exactly N JSON variants', () => {
  const messages = buildRewriteMessages('宿舍床垫买多大？', 2)
  assert.equal(messages.length, 2)
  assert.equal(messages[0]!.role, 'system')
  assert.equal(messages[1]!.role, 'user')
  assert.ok(messages[1]!.content.includes('宿舍床垫买多大？'))
  assert.ok(messages[0]!.content.includes('2 个'))
  assert.ok(messages[0]!.content.includes('{"queries":'))
  const one = buildRewriteMessages('学费多少', 1)
  assert.ok(one[0]!.content.includes('1 个'))
})

test('parseRewriteVariants handles a JSON object response', () => {
  const raw = '{"queries":["宿舍床垫尺寸是多少", "学校宿舍用什么规格的床垫"]}'
  const variants = parseRewriteVariants(raw, '宿舍床垫买多大？')
  assert.deepEqual(variants, ['宿舍床垫尺寸是多少', '学校宿舍用什么规格的床垫'])
})

test('parseRewriteVariants strips json code fences', () => {
  const raw = '```json\n{"queries":["今年什么时候军训"]}\n```'
  const variants = parseRewriteVariants(raw, '军训几月开始？')
  assert.deepEqual(variants, ['今年什么时候军训'])
})

test('parseRewriteVariants accepts a bare JSON array', () => {
  const variants = parseRewriteVariants('["转专业条件", "转专业流程"]', '怎么转专业？')
  assert.deepEqual(variants, ['转专业条件', '转专业流程'])
})

test('parseRewriteVariants falls back to line extraction for non-JSON', () => {
  const raw = '1. 宿舍几点关门\n2. 宿舍楼几点锁门'
  const variants = parseRewriteVariants(raw, '宿舍门禁时间？')
  assert.deepEqual(variants, ['宿舍几点关门', '宿舍楼几点锁门'])
})

test('parseRewriteVariants drops duplicates and the original', () => {
  const raw = '{"queries":["军训什么时候开始", "军训什么时候开始", "军训什么时候开始？", "2026年军训时间"]}'
  const variants = parseRewriteVariants(raw, '军训什么时候开始？')
  // 「军训什么时候开始」 normalizes to the original (punctuation-stripped) and is dropped.
  assert.deepEqual(variants, ['2026年军训时间'])
})

test('parseRewriteVariants truncates long variants and caps the count', () => {
  const long = '一'.repeat(QUERY_REWRITE_VARIANT_MAX_CHARS + 20)
  const raw = `{"queries":["${long}", "变体二", "变体三", "变体四"]}`
  const variants = parseRewriteVariants(raw, '原始问题', 3)
  assert.equal(variants[0]!.length, QUERY_REWRITE_VARIANT_MAX_CHARS)
  assert.equal(variants.length, 3)
})

test('parseRewriteVariants returns [] for empty or unusable input', () => {
  assert.deepEqual(parseRewriteVariants('', 'q'), [])
  assert.deepEqual(parseRewriteVariants('{}', 'q'), [])
  assert.deepEqual(parseRewriteVariants('{"queries":[]}', 'q'), [])
  assert.deepEqual(parseRewriteVariants('{"queries":["原始问题"]}', '原始问题'), [])
  assert.deepEqual(parseRewriteVariants(42, 'q'), [])
})
