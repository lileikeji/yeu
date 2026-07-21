import assert from 'node:assert/strict'
import test from 'node:test'
import { safeMetadata, safeMetadataRecord } from '../server/utils/serializers'

test('safeMetadata strips prototype pollution keys on read', () => {
  // Build via JSON text so __proto__ is a real own key (object-literal __proto__ is special).
  const raw = '{"shortTitle":"ok","__proto__":{"polluted":true},"constructor":{"name":"x"},"prototype":{"y":1},"nested":{"title":"section","__proto__":{"z":1}}}'

  const meta = safeMetadata(raw)
  assert.equal(meta.shortTitle, 'ok')
  assert.equal(Object.prototype.hasOwnProperty.call(meta, '__proto__'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(meta, 'constructor'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(meta, 'prototype'), false)
  assert.ok(meta.nested && typeof meta.nested === 'object')
  const nested = meta.nested as Record<string, unknown>
  assert.equal(nested.title, 'section')
  assert.equal(Object.prototype.hasOwnProperty.call(nested, '__proto__'), false)
  assert.equal(({} as { polluted?: boolean }).polluted, undefined)
})

test('safeMetadata rejects non-objects and invalid JSON', () => {
  assert.deepEqual(safeMetadata('[]'), {})
  assert.deepEqual(safeMetadata('"x"'), {})
  assert.deepEqual(safeMetadata('not-json'), {})
  assert.deepEqual(safeMetadata('null'), {})
})

test('safeMetadataRecord sanitizes plain objects', () => {
  const input: Record<string, unknown> = { a: 1, deep: { b: 2 } }
  Object.defineProperty(input, 'constructor', {
    value: { name: 'nope' },
    enumerable: true,
    configurable: true,
    writable: true
  })
  Object.defineProperty(input.deep as object, 'prototype', {
    value: 3,
    enumerable: true,
    configurable: true,
    writable: true
  })
  const record = safeMetadataRecord(input)
  assert.equal(record.a, 1)
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'constructor'), false)
  const deep = record.deep as Record<string, unknown>
  assert.equal(deep.b, 2)
  assert.equal(Object.prototype.hasOwnProperty.call(deep, 'prototype'), false)
})

test('safeMetadata bounds extreme nesting', () => {
  let nested: Record<string, unknown> = { leaf: true }
  for (let i = 0; i < 12; i++) {
    nested = { next: nested }
  }
  const meta = safeMetadata(JSON.stringify(nested))
  let cur: unknown = meta
  let depth = 0
  while (cur && typeof cur === 'object' && !Array.isArray(cur) && 'next' in (cur as object)) {
    cur = (cur as { next: unknown }).next
    depth += 1
    if (depth > 20) break
  }
  // After max depth, deeper values become null rather than continuing forever
  assert.ok(depth <= 7)
})
