import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatDateLabel,
  parseContentBlocks,
  readingMinutesLabel,
  resolveGuideCategoryLabel,
  resolveProcedureCategoryLabel,
  resolveProcedureMethodLabel,
  resolveProcedureStateLabel,
  studentFacingProcedureText
} from '../shared/utils/content-presentation'
import {
  MAP_CATEGORY_LABELS,
  buildPlaceFallbackUseChecklist,
  isPlaceCoordinateVerified,
  resolveCoordinateVerificationLabel,
  resolvePlaceCategoryLabel,
  resolvePlaceNavigationStatusLabel,
  resolvePlaceScopeLabel,
  resolvePlaceStudentBody,
  resolvePlaceStudentSummary
} from '../shared/utils/place-presentation'

test('place labels never leak raw enum values', () => {
  assert.equal(resolvePlaceCategoryLabel('dorm', 'dormitory'), '宿舍')
  assert.equal(resolvePlaceCategoryLabel(null, 'express'), '快递')
  assert.equal(resolvePlaceCategoryLabel('campus-building', null), '教学 / 学习')
  assert.equal(resolvePlaceCategoryLabel('unknown-type', null), '其他地点')
  assert.equal(resolvePlaceScopeLabel('campus'), '校内')
  assert.equal(resolvePlaceScopeLabel('nearby'), '周边')
  assert.equal(resolveCoordinateVerificationLabel('verified'), '已核验')
  assert.equal(resolveCoordinateVerificationLabel(null), '状态未标注')
  assert.deepEqual(Object.values(MAP_CATEGORY_LABELS), ['教学 / 学习', '宿舍', '餐饮', '校园服务', '快递', '校门', '周边'])
})

test('place coordinate verification and navigation copy stay strict', () => {
  const verified = { navigationAvailable: true, coordinateVerification: 'verified', coordinateSystem: 'WGS84', longitude: 118.6, latitude: 25.1 }
  assert.equal(isPlaceCoordinateVerified(verified), true)
  assert.equal(isPlaceCoordinateVerified({ ...verified, coordinateVerification: 'unverified' }), false)
  assert.equal(isPlaceCoordinateVerified({ ...verified, longitude: null }), false)
  assert.equal(resolvePlaceNavigationStatusLabel(true), '可直接导航')
  assert.equal(resolvePlaceNavigationStatusLabel(false), '入口以现场为准')
})

test('imported maintenance copy is rewritten for students and summary/body dedupe', () => {
  const raw = '上海楼已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护。具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。'
  const summary = resolvePlaceStudentSummary(raw, '上海楼', 'dorm', 'dormitory')
  assert.doesNotMatch(summary, /后台草稿|正式发布|高德地图坐标/)
  assert.match(summary, /上海楼/)
  const body = resolvePlaceStudentBody(raw, '上海楼', 'dorm', 'dormitory')
  assert.equal(body, summary, 'body equal to summary lets the page drop the duplicate block')
})

test('fallback use checklist adapts to the place category', () => {
  const dorm = buildPlaceFallbackUseChecklist([], 'dorm')
  assert.equal(dorm.length, 2)
  assert.match(dorm[1]!, /宿舍楼/)
  const express = buildPlaceFallbackUseChecklist([], 'express')
  assert.match(express[1]!, /取件码/)
  const extracted = buildPlaceFallbackUseChecklist(['自己带的清单'], 'dorm')
  assert.deepEqual(extracted, ['自己带的清单'])
})

test('guide and procedure labels are Chinese, never raw enums', () => {
  assert.equal(resolveGuideCategoryLabel('arrival'), '入学')
  assert.equal(resolveGuideCategoryLabel('community'), '社团')
  assert.equal(resolveGuideCategoryLabel(null), '指南')
  assert.equal(resolveProcedureCategoryLabel('life-service'), '生活服务')
  assert.equal(resolveProcedureCategoryLabel(null), '办事流程')
  assert.equal(resolveProcedureMethodLabel('offline'), '到校办理')
  assert.equal(resolveProcedureStateLabel('awaiting-notice'), '等学校通知')
  assert.match(studentFacingProcedureText('公开来源尚未列明办理时间'), /学校目前还没有/)
})

test('content blocks parse headings, lists, quotes and paragraphs', () => {
  const blocks = parseContentBlocks('【普通本科每学年学费】\n- 经济类：23000 元\n- 艺术类：24000 元\n\n> 以录取通知书为准\n\n普通段落第一行\n普通段落第二行')
  assert.deepEqual(blocks.map(block => block.type), ['heading', 'list', 'quote', 'paragraph'])
  assert.equal(blocks[0]!.type === 'heading' && blocks[0].text, '普通本科每学年学费')
  assert.equal(blocks[1]!.type === 'list' && blocks[1].items.length, 2)
  assert.equal(blocks[3]!.type === 'paragraph' && blocks[3].text, '普通段落第一行 普通段落第二行')
})

test('content blocks support ordered lists', () => {
  const blocks = parseContentBlocks('1. 先预报名\n2. 再现场报到')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0]!.type, 'list')
  assert.equal(blocks[0]!.type === 'list' && blocks[0].ordered, true)
  assert.equal(blocks[0]!.type === 'list' && blocks[0].items.length, 2)
})

test('markdown emphasis markers are stripped from rendered text', () => {
  const blocks = parseContentBlocks('**重要！！** 网站有问题联系学长\n- __加粗__ 也在列表里')
  assert.equal(blocks[0]!.type === 'paragraph' && blocks[0].text, '重要！！ 网站有问题联系学长')
  assert.equal(blocks[1]!.type === 'list' && blocks[1].items[0], '加粗 也在列表里')
})

test('unbalanced emphasis markers from admin content are removed', () => {
  const blocks = parseContentBlocks('*以下是所有常见功能入口**\n**重要！！**网站有问题联系学长13799730013**')
  assert.equal(blocks[0]!.type === 'list' && blocks[0].items[0], '以下是所有常见功能入口')
  assert.equal(blocks[1]!.type === 'paragraph' && blocks[1].text, '重要！！网站有问题联系学长13799730013')
})

test('reading time and date labels stay student readable', () => {
  assert.equal(readingMinutesLabel(''), '约 1 分钟读完')
  assert.match(readingMinutesLabel('字'.repeat(640)), /约 2 分钟读完/)
  assert.equal(formatDateLabel('2026-07-15T00:00:00.000Z'), '2026年7月15日')
  assert.equal(formatDateLabel('2026-07-15T00:00:00.000Z', { compact: true, now: new Date('2026-09-10T00:00:00.000Z') }), '7月15日')
  assert.equal(formatDateLabel('2025-07-15T00:00:00.000Z', { compact: true, now: new Date('2026-09-10T00:00:00.000Z') }), '2025年7月15日')
  assert.equal(formatDateLabel(null), '时间未标注')
})
