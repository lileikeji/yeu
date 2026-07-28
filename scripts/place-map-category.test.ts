import assert from 'node:assert/strict'
import test from 'node:test'
import { mapCategoryFromPlaceType } from '../shared/utils/place-map-category'

test('map categories are derived strictly from the managed place type', () => {
  assert.equal(mapCategoryFromPlaceType('building', 'campus'), 'campus-building')
  assert.equal(mapCategoryFromPlaceType('teaching-building', 'campus'), 'campus-building')
  assert.equal(mapCategoryFromPlaceType('dormitory', 'campus'), 'dorm')
  assert.equal(mapCategoryFromPlaceType('dining', 'campus'), 'food')
  assert.equal(mapCategoryFromPlaceType('express-service', 'campus'), 'express')
  assert.equal(mapCategoryFromPlaceType('shop', 'nearby'), 'nearby')
})

test('unknown place types fall back by scope without inspecting legacy category data', () => {
  assert.equal(mapCategoryFromPlaceType('unknown-campus-type', 'campus'), 'service')
  assert.equal(mapCategoryFromPlaceType('unknown-nearby-type', 'nearby'), 'nearby')
})
