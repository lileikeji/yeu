import assert from 'node:assert/strict'
import test from 'node:test'
import {
  charNgrams,
  diceSimilarity,
  evidenceSemanticScore,
  normalizeForNgrams,
  reciprocalRankFusion,
  semanticTextSimilarity
} from '../server/modules/assistant/retrieval-semantic'

test('normalizeForNgrams strips punctuation, whitespace and lowercases', () => {
  assert.equal(normalizeForNgrams('宿舍 怎么样？'), '宿舍怎么样')
  assert.equal(normalizeForNgrams('床垫买多大！？'), '床垫买多大')
  assert.equal(normalizeForNgrams('Windows/Mac 电脑'), 'windowsmac电脑')
})

test('charNgrams extracts overlapping CJK n-grams', () => {
  const bigrams = charNgrams('宿舍条件', 2)
  assert.deepEqual([...bigrams].sort(), ['宿舍', '舍条', '条件'].sort())
  const tooShort = charNgrams('宿舍', 3)
  assert.equal(tooShort.size, 0)
})

test('diceSimilarity is symmetric and bounded', () => {
  const a = new Set(['宿', '舍', '条', '件'])
  const b = new Set(['条', '件', '好', '坏'])
  const left = diceSimilarity(a, b)
  const right = diceSimilarity(b, a)
  assert.equal(left, right)
  assert.ok(left >= 0 && left <= 1)
  assert.equal(diceSimilarity(new Set(), a), 0)
  assert.equal(diceSimilarity(a, new Set(['宿', '舍', '条', '件'])), 1)
})

test('semanticTextSimilarity recovers paraphrased overlap keyword search misses', () => {
  // 「宿舍」 vs 「住宿」 share the character 宿 in reversed order — the unigram
  // component must still register a signal where bigram keyword search fails.
  const paraphrased = semanticTextSimilarity('宿舍怎么样', '学校住宿条件介绍')
  const unrelated = semanticTextSimilarity('宿舍怎么样', '图书馆借阅规则')
  assert.ok(paraphrased > unrelated, 'paraphrased should exceed unrelated')
  assert.ok(paraphrased > 0)
  assert.ok(unrelated >= 0)
})

test('semanticTextSimilarity peaks on exact match and decays on unrelated text', () => {
  const exact = semanticTextSimilarity('宿舍床垫买多大', '宿舍床垫买多大')
  assert.ok(exact >= 0.9)
  const unrelated = semanticTextSimilarity('宿舍床垫买多大', '奖学金申请条件')
  assert.ok(unrelated < 0.2)
})

test('evidenceSemanticScore weights title over snippet over body', () => {
  const titled = evidenceSemanticScore('宿舍怎么样', {
    title: '宿舍住宿条件',
    snippet: '无关的正文内容',
    text: '完全没有关系的详细描述'
  })
  const untitled = evidenceSemanticScore('宿舍怎么样', {
    title: '其他公告',
    snippet: '宿舍住宿条件',
    text: ''
  })
  assert.ok(titled > untitled, 'title-weighted should exceed snippet-only')
})

test('reciprocalRankFusion merges independent rankings', () => {
  const fused = reciprocalRankFusion([
    ['a', 'c', 'b'],
    ['b', 'c', 'a']
  ])
  const a = fused.get('a')!
  const b = fused.get('b')!
  const c = fused.get('c')!
  assert.ok(a > 0 && b > 0 && c > 0)
  assert.ok(Math.abs(a - b) < 1e-9)
  assert.ok(a > c && b > c)
})
