import assert from 'node:assert/strict'
import test from 'node:test'
import type { MapArea } from '../map/core/types'
import type { PublicMapPlace } from '../app/utils/public-catalog'
import {
  areaMatchesQuery,
  equivalentMapSearchTerms,
  normalizeMapSearchText,
  placeMatchesQuery
} from '../app/utils/map-search'

function mapPlace(overrides: Partial<PublicMapPlace> = {}): PublicMapPlace {
  return {
    id: 'preview-library',
    slug: null,
    name: '图书馆',
    scope: 'campus',
    category: 'campus-building',
    summary: '',
    body: '',
    address: null,
    campusArea: null,
    openingHours: null,
    phone: null,
    usageChecklist: [],
    point: null,
    pointIsVerified: false,
    usesPreviewPoint: false,
    referenceLabel: null,
    officialPlanNumber: null,
    coordinateVerification: 'preview',
    coordinateSystem: null,
    navigationUrl: null,
    isApiPublished: false,
    searchText: '图书 阅读 空间',
    ...overrides
  }
}

const campusArea: MapArea = {
  id: 'student-street',
  name: '学生街',
  description: '校园生活服务区域',
  strokeColor: '#176f46',
  fillColor: '#176f46',
  areaSquareMeters: 1200,
  perimeterMeters: 180,
  paths: [],
  geometrySource: 'wia-shape-batch'
}

test('map search normalization removes punctuation and normalizes Latin case', () => {
  assert.equal(normalizeMapSearchText('  Wi-Fi（校园网）/ 信息化 '), 'wifi校园网信息化')
  assert.deepEqual(equivalentMapSearchTerms('   ，。 '), [])
})

test('map search treats 教学楼 and 楼 suffixes as equivalent', () => {
  assert.deepEqual(equivalentMapSearchTerms('第一教学楼'), ['第一教学楼', '第一楼'])
  assert.deepEqual(equivalentMapSearchTerms('第一楼'), ['第一楼', '第一教学楼'])
})

test('place search covers names, category terms and reviewed common-use keywords', () => {
  const library = mapPlace()
  assert.equal(placeMatchesQuery(library, '图书馆'), true)
  assert.equal(placeMatchesQuery(library, '教学'), true)
  assert.equal(placeMatchesQuery(library, '自习'), true)
  assert.equal(placeMatchesQuery(library, '快递'), false)

  const networkCenter = mapPlace({
    id: 'preview-network-information-center',
    name: '网络信息中心',
    category: 'service',
    searchText: '网络服务'
  })
  assert.equal(placeMatchesQuery(networkCenter, 'Wi-Fi'), true)
})

test('area search covers text, geometry semantics and measurements', () => {
  assert.equal(areaMatchesQuery(campusArea, ''), true)
  assert.equal(areaMatchesQuery(campusArea, '生活服务'), true)
  assert.equal(areaMatchesQuery(campusArea, '不规则边界'), true)
  assert.equal(areaMatchesQuery(campusArea, '1200 平方米'), true)
  assert.equal(areaMatchesQuery(campusArea, '教学楼'), false)
})
