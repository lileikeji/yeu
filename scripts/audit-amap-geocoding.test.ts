import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCandidate } from './audit-amap-geocoding'

test('classifies named, generic and missing geocoding candidates', () => {
  assert.equal(classifyCandidate('泽钏教学楼', {
    location: '118.610252,25.109165',
    formatted_address: '福建省泉州市洛江区马甲镇仰恩大学泽钏教学楼',
    level: '兴趣点'
  }).status, 'named-poi')
  assert.equal(classifyCandidate('南门', {
    location: '118.609502,25.110847',
    formatted_address: '福建省泉州市洛江区马甲镇仰恩大学',
    level: '兴趣点'
  }).status, 'generic-match')
  assert.equal(classifyCandidate('韵达快递').status, 'no-match')
})

test('rejects a geocode candidate outside the reviewed campus bounds', () => {
  assert.equal(classifyCandidate('图书馆', {
    location: '118.623258,25.117048',
    formatted_address: '福建省泉州市洛江区马甲镇',
    level: '乡镇'
  }).status, 'outside-review-bounds')
})

test('keeps an explicitly named AMap POI even when GCJ-02 and WGS84 bounds differ', () => {
  assert.equal(classifyCandidate('黄海楼', {
    location: '118.619462,25.114935',
    formatted_address: '福建省泉州市洛江区马甲镇仰恩大学黄海楼',
    level: '兴趣点'
  }).status, 'named-poi')
})
