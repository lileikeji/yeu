import assert from 'node:assert/strict'
import test from 'node:test'
import type { MapArea } from '../map/core/types'
import type { PublicMapPlace } from '../app/utils/public-catalog'
import {
  buildMapRouteQuery,
  mapQueryValue,
  mapRouteFiltersChanged,
  mapRouteScope,
  resolveMapRouteState
} from '../app/utils/map-route-state'

const categories = new Set(['all', 'food', 'service'])

const place: PublicMapPlace = {
  id: 'catalog-library',
  slug: 'library',
  name: '图书馆',
  scope: 'campus',
  category: 'service',
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
  coordinateVerification: 'verified',
  coordinateSystem: null,
  navigationUrl: null,
  isApiPublished: true,
  searchText: '图书 阅读'
}

const area: MapArea = {
  id: 'student-street',
  name: '学生街',
  strokeColor: '#176f46',
  fillColor: '#176f46',
  areaSquareMeters: 1000,
  perimeterMeters: 150,
  paths: [],
  geometrySource: 'wia-shape-batch'
}

test('map query values accept a string or the first string array entry', () => {
  assert.equal(mapQueryValue('图书馆'), '图书馆')
  assert.equal(mapQueryValue(['食堂', '宿舍']), '食堂')
  assert.equal(mapQueryValue([null, '食堂']), '')
  assert.equal(mapQueryValue(null), '')
})

test('route state validates scope/category and lets a selected place override area', () => {
  const state = resolveMapRouteState({
    q: [' 图书馆 ', null],
    category: 'unknown',
    scope: 'nearby',
    place: 'library',
    area: 'student-street'
  }, categories, [place], [area])

  assert.equal(state.searchQuery, ' 图书馆 ')
  assert.equal(state.activeCategory, 'all')
  assert.equal(state.scope, 'nearby')
  assert.equal(state.selectedPoiId, place.id)
  assert.equal(state.selectedArea, null)
  assert.equal(mapRouteScope({ scope: 'invalid' }), null)
})

test('route state restores an area when no valid place is selected', () => {
  const state = resolveMapRouteState({
    category: 'food',
    place: 'missing',
    area: 'student-street'
  }, categories, [place], [area])

  assert.equal(state.activeCategory, 'food')
  assert.equal(state.selectedPoiId, null)
  assert.equal(state.selectedArea?.id, 'student-street')
})

test('route writes preserve unrelated query values and remove default map state', () => {
  const query = buildMapRouteQuery({
    scope: 'campus',
    from: '/search?q=library',
    q: 'old',
    category: 'food',
    area: 'student-street'
  }, {
    searchQuery: ' 图书馆 ',
    activeCategory: 'all',
    selectedPoiId: place.id,
    selectedAreaId: null
  }, [place])

  assert.deepEqual(query, {
    scope: 'campus',
    from: '/search?q=library',
    q: '图书馆',
    place: 'library'
  })
})

test('filter changes only track q, category and scope', () => {
  assert.equal(mapRouteFiltersChanged({ q: '图书馆' }, { q: '食堂' }), true)
  assert.equal(mapRouteFiltersChanged({ category: 'food' }, { category: 'service' }), true)
  assert.equal(mapRouteFiltersChanged({ scope: 'nearby' }, { scope: 'campus' }), true)
  assert.equal(mapRouteFiltersChanged({ place: 'library' }, { place: 'canteen' }), false)
})
