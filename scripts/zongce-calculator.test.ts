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

test('computes volunteer hours and blood donation quantity', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 志愿时长20小时 献血2次 综测大概多少')
  assert.ok(r)
  assert.equal(r.total, 75.67)
  assert.match(r.answer, /志愿服务时长：20小时 × 0\.15 = 3 分/)
  assert.match(r.answer, /无偿献血：2次 × 0\.5 = 1 分/)
})

test('computes sports rank buckets', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 体育比赛拿了校级第一和校级第四 综测多少')
  assert.ok(r)
  assert.equal(r.total, 73.17)
  assert.match(r.answer, /校级 第1-3名 1分 \+ 校级 第4-8名 0\.5分/)
})

test('computes lecture and show quantity', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 讲座10次 演出1场 综测多少')
  assert.ok(r)
  assert.equal(r.total, 73.17)
  assert.match(r.answer, /讲座）：10次 × 0\.1 = 1 分/)
  assert.match(r.answer, /文艺演出积极分子\/先进个人：1次 × 0\.5 = 0\.5 分/)
})

test('flags competition ambiguity instead of silent omission', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 拿了校级一等奖和三好学生 综测多少')
  assert.ok(r)
  assert.match(r.answer, /未匹配到具体竞赛/)
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

test('computes attendance deductions', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 旷课4学时 综测多少')
  assert.ok(r)
  assert.equal(r.total, 69.67)
  assert.match(r.answer, /旷课 4 学时 -2 分/)
})

test('computes discipline and late deductions with rounded detail', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 留校察看 迟到3次 综测多少')
  assert.ok(r)
  assert.equal(r.total, 65.37)
  assert.match(r.answer, /迟到 3 次 -0\.3 分/)
})

test('accepts explicit moral base and peer review scores', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 德育基础分5 班内互评5 综测多少')
  assert.ok(r)
  assert.equal(r.total, 69.67)
  assert.match(r.answer, /基础分\+互评 10/)
})

test('combines moral base input with deduction', () => {
  const r = tryComputeZongce('我平均成绩85 专业最高平均成绩90 德育基础分5 互评4 旷课2学时 综测多少')
  assert.ok(r)
  assert.equal(r.total, 67.67)
  assert.match(r.answer, /基础分\+互评 9/)
})

