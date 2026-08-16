import assert from 'node:assert/strict'
import test from 'node:test'
import { tryComputeZongce } from '../server/modules/assistant/zongce-calculator'

test('computes zongce total from concrete grades and awards', () => {
  const r = tryComputeZongce('我期末总分90 平均分95 这学期拿了一个专利和一个校赛学术类比赛一等奖和一个二等奖 体育满分 综测总分的多少')
  assert.ok(r)
  assert.equal(r.total, 74.34)
  assert.match(r.answer, /90 ÷ 95 × 60 = 56\.84/)
  assert.match(r.answer, /合计 ≈ 74\.34/)
  // 智育奖励 = 校级一等1 + 校级二等0.5 + 专利最低档1 = 2.5
  assert.match(r.answer, /2\.5 分/)
})

test('computes intellectual base by grade ratio', () => {
  const r = tryComputeZongce('我平均成绩85，专业最高平均成绩90，体育及格，综测总分大概多少')
  assert.ok(r)
  assert.equal(r.total, 71.67)
  assert.match(r.answer, /85 ÷ 90 × 60 = 56\.67/)
})

test('computes bare average phrasing', () => {
  const r = tryComputeZongce('我平均分80 专业最高平均分85 综测大概多少')
  assert.ok(r)
  assert.equal(r.total, 71.47)
  assert.match(r.answer, /80 ÷ 85 × 60 = 56\.47/)
})

test('returns null for non-computable queries', () => {
  assert.equal(tryComputeZongce('综测怎么算'), null)
  assert.equal(tryComputeZongce('综测智育基础分怎么算'), null)
  assert.equal(tryComputeZongce('我有国家奖学金 综测多少分'), null)
  assert.equal(tryComputeZongce('你好'), null)
})

test('flags unverifiable assumptions instead of inventing facts', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 拿了一个专利 综测多少')
  assert.ok(r)
  // 专利未注明类型 → 按最低档计入并明确说明
  assert.match(r.answer, /未注明等级\/类型，暂按最低档/)
})
