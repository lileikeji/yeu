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
  resolvePlaceScopeLabel
} from '../app/utils/place-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/place-detail-presentation.ts'), 'utf8')

test('place detail page is a thin shell over place-detail-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/place-detail-presentation['"]/)
  assert.match(pageSource, /isPlaceCoordinateVerified/)
  assert.match(pageSource, /buildPlaceMapTarget/)
  assert.match(pageSource, /buildPlaceFallbackUseChecklist/)
  assert.match(pageSource, /buildPlaceLocationCopyText/)
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
  assert.equal(resolvePlaceCategoryLabel('express', 'service'), '快递')
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
