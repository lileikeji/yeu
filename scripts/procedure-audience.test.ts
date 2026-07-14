import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterProcedureItemsForAudience,
  normalizeProcedureAudience
} from '../app/utils/procedure-audience'

const items = [
  { id: 'all', audience: ['undergraduate', 'transfer'] as const },
  { id: 'undergraduate', audience: ['undergraduate'] as const },
  { id: 'transfer', audience: ['transfer'] as const }
].map(item => ({ ...item, audience: [...item.audience] }))

test('normalizes procedure audience query values', () => {
  assert.equal(normalizeProcedureAudience('undergraduate'), 'undergraduate')
  assert.equal(normalizeProcedureAudience(['transfer']), 'transfer')
  assert.equal(normalizeProcedureAudience('unknown'), 'all')
  assert.equal(normalizeProcedureAudience(undefined), 'all')
})

test('filters steps and materials for the selected freshman audience', () => {
  assert.deepEqual(filterProcedureItemsForAudience(items, 'all').map(item => item.id), [
    'all',
    'undergraduate',
    'transfer'
  ])
  assert.deepEqual(filterProcedureItemsForAudience(items, 'undergraduate').map(item => item.id), [
    'all',
    'undergraduate'
  ])
  assert.deepEqual(filterProcedureItemsForAudience(items, 'transfer').map(item => item.id), [
    'all',
    'transfer'
  ])
})
