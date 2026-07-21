import assert from 'node:assert/strict'
import test from 'node:test'
import { presentStudentSourceContext } from '../app/utils/source-context-presentation'

const internalSourceContexts = [
  '社交平台待核验线索；宿舍设施描述须以学校通知或现场核验为准。原外链当前不可稳定访问，前台仅保留为归档线索。',
  '社交平台视频线索；楼栋、房型与拍摄时间仍待确认。原外链当前不可稳定访问，前台仅保留为归档线索。',
  '社交平台待核验线索；拉练可概述为约35–40公里，2025年学校官方报道口径为35公里。原外链当前不可稳定访问，前台仅保留为归档线索。',
  '与高德 POI 交叉命中的商铺候选；营业状态和菜品仍待实地确认。原外链当前不可稳定访问，前台仅保留为归档线索。',
  '2025 年社交平台旧线索；站点数量、品牌和营业状态均待复核。原外链当前不可稳定访问，前台仅保留为归档线索。',
  '2025 年不完整线索；不能替代校团委当年注册名册。原外链当前不可稳定访问，前台仅保留为归档线索。',
  '校内用户确认该交通工具通称“叮叮车”；票价、时段、上下车点仍待核验，争议配图禁止发布。原外链当前不可稳定访问，前台仅保留为归档线索。'
] as const

test('known research notes become concise student-facing explanations', () => {
  const presented = internalSourceContexts.map(context => presentStudentSourceContext(context))

  assert.match(presented[0] ?? '', /往年的学生分享/)
  assert.match(presented[0] ?? '', /到校后看到的情况/)
  assert.match(presented[1] ?? '', /往年的宿舍视频/)
  assert.match(presented[2] ?? '', /介绍吃饭、出行和校园生活/)
  assert.match(presented[2] ?? '', /学校通知为准/)
  assert.match(presented[3] ?? '', /同时出现在学生分享和高德地图中/)
  assert.match(presented[4] ?? '', /快递点数量、品牌和营业情况/)
  assert.match(presented[5] ?? '', /校团委本学期公布的社团名单/)
  assert.match(presented[6] ?? '', /学校最新安排及现场标识/)
  assert.ok(presented.every(context => context?.endsWith('原分享目前打不开。')))
  assert.doesNotMatch(
    presented.join('\n'),
    /待核验|核验|复核|线索|归档|前台|候选|报道口径|参考记录保留/
  )
})

test('nearby pages can show the unavailable note separately without duplicate copy', () => {
  const presented = internalSourceContexts.map(context =>
    presentStudentSourceContext(context, { includeUnavailableNote: false })
  )

  assert.ok(presented.every(context => context && !context.includes('打不开')))
  assert.doesNotMatch(presented.join('\n'), /原外链|归档线索|前台/)
})

test('generic source notes still remove maintainer language', () => {
  assert.equal(
    presentStudentSourceContext('现场核验后再公开，争议配图禁止发布。'),
    '现场确认后再公开，有争议信息不作为公开参考。'
  )
  assert.equal(presentStudentSourceContext(undefined), undefined)
})
