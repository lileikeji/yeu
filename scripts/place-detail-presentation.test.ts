import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildPlaceDetailSources,
  buildPlaceFallbackUseChecklist,
  buildPlaceLocationCopyText,
  buildPlaceMapTarget,
  isPlaceCoordinateVerified,
  placeCategoryLabels,
  resolvePlaceCategoryLabel,
  resolvePlaceFloorRoomLabel,
  resolvePlaceScopeLabel,
  resolvePlaceStudentBody,
  resolvePlaceStudentSummary
} from '../app/utils/place-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/place-detail-presentation.ts'), 'utf8')

test('place detail page is a thin shell over place-detail-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/place-detail-presentation['"]/)
  assert.match(pageSource, /isPlaceCoordinateVerified/)
  assert.match(pageSource, /buildPlaceMapTarget/)
  assert.match(pageSource, /buildPlaceFallbackUseChecklist/)
  assert.match(pageSource, /buildPlaceLocationCopyText/)
  assert.match(pageSource, /resolvePlaceStudentSummary/)
  assert.doesNotMatch(pageSource, /const categoryLabels: Record/)
  assert.doesNotMatch(pageSource, /coordinateVerification === 'verified'/)
  assert.match(utilSource, /export function isPlaceCoordinateVerified/)
  assert.match(utilSource, /export function buildPlaceFallbackUseChecklist/)
})

test('place coordinate verification and map target stay strict', () => {
  assert.equal(isPlaceCoordinateVerified({
    navigationAvailable: true,
    coordinateVerification: 'verified',
    coordinateSystem: 'WGS84',
    longitude: 118.7,
    latitude: 25.1
  }), true)
  assert.equal(isPlaceCoordinateVerified({
    navigationAvailable: true,
    coordinateVerification: 'unverified',
    coordinateSystem: 'WGS84',
    longitude: 118.7,
    latitude: 25.1
  }), false)
  assert.deepEqual(buildPlaceMapTarget('library', '/campus'), {
    path: '/map',
    query: { place: 'library', from: '/campus' }
  })
  assert.deepEqual(buildPlaceMapTarget('library', null), {
    path: '/map',
    query: { place: 'library' }
  })
})

test('place category checklist and copy text follow student-facing rules', () => {
  assert.equal(placeCategoryLabels.dorm, '宿舍')
  assert.equal(resolvePlaceCategoryLabel('building', 'place'), '校园建筑')
  assert.equal(resolvePlaceCategoryLabel('express', 'service'), '快递')
  assert.equal(resolvePlaceCategoryLabel('unknown-category', 'place'), '其他地点')
  assert.equal(resolvePlaceScopeLabel('campus'), '校内')
  assert.equal(resolvePlaceScopeLabel('nearby'), '周边')
  assert.equal(resolvePlaceFloorRoomLabel('3F', '301'), '3F · 301')

  const extracted = ['现场先看指示牌']
  assert.deepEqual(buildPlaceFallbackUseChecklist(extracted, 'dorm'), extracted)
  const dorm = buildPlaceFallbackUseChecklist([], 'dorm')
  assert.equal(dorm.length, 2)
  assert.match(dorm[1]!, /宿管|辅导员/)
  const express = buildPlaceFallbackUseChecklist([], 'express')
  assert.match(express[1]!, /取件码/)

  assert.equal(buildPlaceLocationCopyText({
    name: '旧区1号楼',
    campusArea: '旧区',
    address: '马甲镇',
    floor: '1F',
    room: null
  }), '旧区1号楼 · 旧区 · 马甲镇 · 1F')

  assert.deepEqual(buildPlaceDetailSources([
    { id: 's1', title: '官网', url: 'https://example.test' }
  ]), [{ key: 's1', title: '官网', url: 'https://example.test' }])
})

test('place detail rewrites imported maintenance copy for students', () => {
  const raw = '上海楼 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护，具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。'
  const summary = resolvePlaceStudentSummary(raw, '上海楼', 'building', 'building')
  assert.match(summary, /上海楼是校内楼栋/)
  assert.match(summary, /现场标识或学校通知/)
  assert.doesNotMatch(summary, /后台|草稿|坐标|维护|核验|发布/)
  assert.equal(resolvePlaceStudentBody(raw, '上海楼', 'building', 'building'), summary)
  const importedBody = `${raw}\n\n高德 resourceId：2003534061878101218\n坐标来源：User-authorized AMap Work Map sparseList response.\n发布提醒：后台可维护和定位；公开发布仍需要独立核验。`
  assert.equal(resolvePlaceStudentBody(importedBody, '上海楼', 'building', 'building'), summary)

  const published = resolvePlaceStudentSummary('图书馆提供借阅和自习服务。', '图书馆', 'library', 'library')
  assert.equal(published, '图书馆提供借阅和自习服务。')
  assert.equal(resolvePlaceStudentBody('第一层为借阅区。', '图书馆', 'library', 'library'), '第一层为借阅区。')
})
