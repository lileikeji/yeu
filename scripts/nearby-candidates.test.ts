import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import candidateData from '../data/imports/amap-nearby-poi-candidates-2026-07-15.json'

test('nearby platform candidates remain a distinct non-publishable catalog', () => {
  assert.equal(candidateData.status, 'unverified-platform-candidates')
  assert.equal(candidateData.policy.publishAutomatically, false)
  assert.equal(candidateData.policy.coordinateSystem, 'GCJ-02')
  assert.equal(candidateData.candidates.length, 30)
  assert.equal(new Set(candidateData.candidates.map(candidate => candidate.amapPoiId)).size, 30)
  assert.ok(candidateData.candidates.every(candidate => Number.isFinite(candidate.location.lng)))
  assert.ok(candidateData.candidates.every(candidate => Number.isFinite(candidate.location.lat)))
})

test('nearby page links every candidate to AMap and labels the review boundary', () => {
  const source = readFileSync('app/pages/nearby.vue', 'utf8')
  assert.match(source, /https:\/\/uri\.amap\.com\/marker/)
  assert.match(source, /candidateCatalog\.providerDocumentation/)
  assert.match(source, /不可自动发布/)
  assert.match(source, /高德候选 · 待核验/)
  assert.match(source, /nearbyResearchSources/)
  assert.match(source, /相关公开资料 · 仅作核验线索/)
})
