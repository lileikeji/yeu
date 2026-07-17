import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildHomeEssentialActions,
  buildHomeFeaturedProcedures,
  buildHomeMapSearchTarget,
  computeHomeCardTilt,
  findGuideSummary,
  getHomeFallbackMessage,
  homeMoreEntries,
  homeProcedureMethodLabels,
  homeTimelineStages,
  toHomeProcedureItem
} from '../app/utils/home-presentation'
import type { ApiProcedure } from '../shared/types/server'

const pageSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/home-presentation.ts'), 'utf8')

function sampleProcedure(overrides: Partial<ApiProcedure> = {}): ApiProcedure {
  return {
    id: 'p1',
    slug: 'campus-network',
    title: '校园网',
    summary: '办理说明',
    body: '',
    category: 'network',
    audience: ['undergraduate', 'transfer'],
    method: 'mixed',
    informationState: 'confirmed',
    statusText: '可办理',
    processingTime: null,
    deadlineText: null,
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    department: null,
    relatedGuide: null,
    places: [],
    steps: [],
    materials: [],
    sources: [],
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

test('home page is a thin shell over home-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/home-presentation['"]/)
  assert.match(pageSource, /buildHomeEssentialActions/)
  assert.match(pageSource, /buildHomeFeaturedProcedures/)
  assert.match(pageSource, /homeTimelineStages/)
  assert.match(pageSource, /homeMoreEntries/)
  assert.match(pageSource, /computeHomeCardTilt/)
  assert.match(pageSource, /buildHomeMapSearchTarget/)
  assert.match(pageSource, /useFreshmanChecklist/)
  assert.match(pageSource, /\/checklist/)
  assert.doesNotMatch(pageSource, /const essentialActions = computed<HomeAction/)
  assert.doesNotMatch(pageSource, /const timelineStages: HomeTimelineStage/)
  assert.doesNotMatch(pageSource, /function procedureHomeItem/)
  assert.match(utilSource, /export function buildHomeEssentialActions/)
  assert.match(utilSource, /export function buildHomeFeaturedProcedures/)
})

test('home essential actions and timeline keep freshman-first copy', () => {
  const actions = buildHomeEssentialActions([
    { slug: 'campus-card-network', summary: 'API 校园卡摘要' },
    { slug: 'express-delivery', summary: 'API 快递摘要' }
  ])
  assert.deepEqual(actions.map(item => item.title), [
    '核对报到安排',
    '找宿舍和教学楼',
    '校园卡与网络',
    '快递与外卖'
  ])
  assert.equal(actions[2]?.description, 'API 校园卡摘要')
  assert.equal(actions[3]?.description, 'API 快递摘要')
  assert.equal(findGuideSummary([], 'missing', 'fallback'), 'fallback')
  assert.equal(homeTimelineStages.length, 3)
  assert.equal(homeTimelineStages[0]?.to, '/procedures/arrival')
  assert.equal(homeMoreEntries.length, 5)
  assert.equal(homeMoreEntries[0]?.to, '/checklist')
  assert.equal(homeMoreEntries[1]?.to, '/guides/safety-health')
})

test('home featured procedures exclude arrival and map method labels', () => {
  const featured = buildHomeFeaturedProcedures([
    sampleProcedure({ id: 'a', slug: 'arrival', title: '报到' }),
    sampleProcedure({ id: 'b', slug: 'campus-card', title: '校园卡', method: 'online' }),
    sampleProcedure({ id: 'c', slug: 'dorm-repair', title: '宿舍报修', method: 'offline' }),
    sampleProcedure({ id: 'd', slug: 'library', title: '图书馆', method: 'mixed' }),
    sampleProcedure({ id: 'e', slug: 'extra', title: '额外' })
  ], 4)
  assert.deepEqual(featured.map(item => item.to), [
    '/procedures/campus-card',
    '/procedures/dorm-repair',
    '/procedures/library',
    '/procedures/extra'
  ])
  assert.equal(featured[0]?.methodLabel, homeProcedureMethodLabels.online)
  assert.equal(toHomeProcedureItem(sampleProcedure({ method: 'mixed' })).methodLabel, '线上确认 + 到校办理')
  assert.equal(getHomeFallbackMessage(true, false), '部分内容暂时没有加载出来，可以先使用校园地图和基础指南。')
  assert.equal(getHomeFallbackMessage(false, false), null)
})

test('home card tilt and map search target stay pure and bounded', () => {
  assert.deepEqual(computeHomeCardTilt(50, 0, 100, 100, 6), { rotateX: 6, rotateY: 0 })
  assert.deepEqual(computeHomeCardTilt(100, 50, 100, 100, 6), { rotateX: 0, rotateY: 6 })
  assert.deepEqual(computeHomeCardTilt(0, 0, 0, 0), { rotateX: 0, rotateY: 0 })
  assert.deepEqual(buildHomeMapSearchTarget('  教学楼  '), { path: '/map', query: { q: '教学楼' } })
  assert.deepEqual(buildHomeMapSearchTarget('   '), { path: '/map' })
})
