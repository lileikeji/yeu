import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import candidateData from '../data/imports/amap-nearby-poi-candidates-2026-07-15.json'
import {
  buildNearbyCategoryOptions,
  filterNearbyCandidates,
  filterNearbyPlaces,
  nearbyCandidateCenterLabel,
  nearbyCandidateHint,
  nearbyCandidateMapUrl,
  nearbyCategoryHints,
  nearbyCategoryLabels,
  selectNearbyResearchSources,
  nearbySourceContextForStudents,
  nearbySourceIsClickable,
  nearbyUsageTips,
  nearbyVerificationChecklist,
  type NearbyCandidate
} from '../app/utils/nearby-presentation'

const pageSource = readFileSync(resolve('app/pages/nearby.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/nearby-presentation.ts'), 'utf8')

test('nearby platform candidates remain a distinct non-publishable catalog', () => {
  assert.equal(candidateData.status, 'unverified-platform-candidates')
  assert.equal(candidateData.policy.publishAutomatically, false)
  assert.equal(candidateData.policy.coordinateSystem, 'GCJ-02')
  assert.equal(candidateData.candidates.length, 30)
  assert.equal(new Set(candidateData.candidates.map(candidate => candidate.amapPoiId)).size, 30)
  assert.ok(candidateData.candidates.every(candidate => Number.isFinite(candidate.location.lng)))
  assert.ok(candidateData.candidates.every(candidate => Number.isFinite(candidate.location.lat)))
})

test('nearby page keeps template wiring and review boundary copy', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/nearby-presentation['"]/)
  assert.match(pageSource, /candidateCatalog\.providerDocumentation/)
  assert.match(pageSource, /确认后再推荐/)
  assert.match(pageSource, /高德地图线索 · 到店前再确认/)
  assert.match(pageSource, /selectNearbyResearchSources/)
  assert.match(pageSource, /from ['"]~~\/data\/seeds\/public-content['"]/)
  assert.match(pageSource, /const nearbyResearchSources = selectNearbyResearchSources\(researchSources\)/)
  assert.doesNotMatch(pageSource, /const nearbyResearchSources = \[/)
  assert.doesNotMatch(pageSource, /researchSources\.expressMap/)
  assert.match(pageSource, /sourceContextForStudents/)
  assert.match(pageSource, /相关公开资料 · 仅作确认参考/)
  assert.match(pageSource, /usageTips/)
  assert.match(pageSource, /verificationChecklist/)
  assert.match(pageSource, /candidateHint\(candidate\)/)
  assert.match(pageSource, /title: '校园周边'/)
  assert.doesNotMatch(pageSource, /高德分类：/)
  assert.doesNotMatch(pageSource, /高德候选 · 待核验/)
  assert.doesNotMatch(pageSource, /待实地核验候选/)
})

test('nearby presentation util owns pure labels, filters, and student-facing source rewrites', () => {
  assert.match(utilSource, /export function selectNearbyResearchSources/)
  assert.doesNotMatch(utilSource, /from ['"]~~\/data\/seeds\/public-content['"]/)
  assert.doesNotMatch(utilSource, /export const nearbyResearchSources/)
  assert.match(utilSource, /export const nearbyCategoryLabels/)
  assert.match(utilSource, /export const nearbyCategoryHints/)
  assert.match(utilSource, /export const nearbyVerificationChecklist/)
  assert.match(utilSource, /export const nearbyUsageTips/)
  assert.match(utilSource, /export function nearbySourceContextForStudents/)
  assert.match(utilSource, /export function filterNearbyPlaces/)
  assert.match(utilSource, /export function filterNearbyCandidates/)
  assert.match(utilSource, /export function buildNearbyCategoryOptions/)
  assert.match(utilSource, /https:\/\/uri\.amap\.com\/marker/)
  assert.doesNotMatch(utilSource, /\?\?\?\?/)
  assert.match(utilSource, /餐饮/)
  assert.match(utilSource, /新区学生街/)
})

test('nearby presentation helpers rewrite source context and build map links', () => {
  assert.equal(nearbySourceIsClickable({ status: 'available' }), true)
  assert.equal(nearbySourceIsClickable({ status: 'unavailable' }), false)
  assert.equal(nearbySourceIsClickable({ status: 'disputed' }), false)

  assert.match(
    nearbySourceContextForStudents('与高德 POI 交叉命中的商铺候选；营业状态和菜品仍待确认。原外链当前不可稳定访问，前台仅保留为归档线索。'),
    /在高德地图和学生分享中都出现过的商铺/
  )
  assert.match(
    nearbySourceContextForStudents('2025 年社交平台旧线索；站点数量、品牌和营业状态均待复核。原外链当前不可稳定访问，前台仅保留为归档线索。'),
    /2025 年社交平台参考/
  )
  assert.match(nearbySourceContextForStudents('社交平台待核验线索'), /社交平台参考信息/)
  assert.match(nearbySourceContextForStudents(undefined), /来源可作为参考/)

  const sample = candidateData.candidates[0] as NearbyCandidate
  const mapUrl = nearbyCandidateMapUrl(sample)
  assert.match(mapUrl, /^https:\/\/uri\.amap\.com\/marker/)
  assert.match(mapUrl, new RegExp(String(sample.location.lng)))
  assert.equal(nearbyCandidateCenterLabel({ ...sample, centerId: 'new-student-street' }), '新区学生街')
  assert.equal(nearbyCandidateCenterLabel({ ...sample, centerId: 'old-student-street' }), '旧区学生街')
  assert.equal(nearbyCandidateHint(sample), nearbyCategoryHints[sample.category])
  assert.ok(nearbyCandidateHint(sample).length > 8)
  assert.equal(nearbyUsageTips.length, 4)
  assert.equal(nearbyVerificationChecklist.length, 5)
  assert.equal(nearbyCategoryLabels.food, '餐饮')
})

test('nearby filters and category options stay pure', () => {
  const places = [
    {
      name: '测试餐饮店',
      summary: '学生街附近餐饮',
      address: '新区学生街',
      campusArea: '新区',
      category: 'food',
      type: 'nearby'
    },
    {
      name: '测试便利店',
      summary: '日用品',
      address: '旧区',
      campusArea: '旧区',
      category: 'shopping',
      type: 'nearby'
    }
  ]

  assert.equal(filterNearbyPlaces(places, { query: '餐饮', activeCategory: 'all' }).length, 1)
  assert.equal(filterNearbyPlaces(places, { query: '', activeCategory: 'shopping' }).length, 1)
  assert.equal(filterNearbyPlaces(places, { query: '不存在', activeCategory: 'all' }).length, 0)

  const candidates = candidateData.candidates as NearbyCandidate[]
  const foodOnly = filterNearbyCandidates(candidates, { query: '', activeCategory: 'food' })
  assert.ok(foodOnly.length > 0)
  assert.ok(foodOnly.every(item => item.category === 'food'))

  const options = buildNearbyCategoryOptions(places, candidates)
  assert.ok(options.some(option => option.value === 'food' && option.label === '餐饮'))
  assert.ok(options.some(option => option.value === 'express'))
})

test('nearby research sources stay fixed student-facing references', () => {
  const fixture = {
    expressMap: { title: '仰恩大学新区快递驿站地图', url: 'https://example.com/express' },
    freshmanSurvival: { title: '仰恩新生生存指南｜吃喝住行全攻略', url: 'https://example.com/freshman' },
    food: { title: '仰恩大学吃什么', url: 'https://example.com/food' },
    other: { title: 'ignored', url: 'https://example.com/other' }
  }
  const selected = selectNearbyResearchSources(fixture)
  assert.equal(selected.length, 3)
  assert.equal(selected[0]?.title, '仰恩大学新区快递驿站地图')
  assert.equal(selected[1]?.title, '仰恩新生生存指南｜吃喝住行全攻略')
  assert.equal(selected[2]?.title, '仰恩大学吃什么')
  assert.ok(selected.every(source => typeof source.url === 'string' && source.url.length > 0))
})
