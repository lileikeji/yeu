import assert from 'node:assert/strict'
import test from 'node:test'
import { createContentSchema } from '../shared/schemas/server'

test('content metadata rejects prototype keys and oversized payloads', () => {
  const base = {
    kind: 'guide' as const,
    slug: 'test-guide',
    title: 'Test',
    summary: 'Summary text long enough',
    body: '',
    category: null,
    audience: null,
    isFeatured: false,
    lastVerifiedAt: null,
    sourceIds: [] as string[]
  }

  const constructorKey = createContentSchema.safeParse({
    ...base,
    metadata: { constructor: { name: 'x' } }
  })
  assert.equal(constructorKey.success, false)

  const tooMany: Record<string, string> = {}
  for (let i = 0; i < 80; i++) tooMany['k' + i] = 'v'
  const many = createContentSchema.safeParse({ ...base, metadata: tooMany })
  assert.equal(many.success, false)

  const deep: Record<string, unknown> = {}
  let cur: Record<string, unknown> = deep
  for (let i = 0; i < 10; i++) {
    cur.next = {}
    cur = cur.next as Record<string, unknown>
  }
  const deepRes = createContentSchema.safeParse({ ...base, metadata: deep })
  assert.equal(deepRes.success, false)

  // JSON text ensures __proto__/constructor are real own keys (object-literal __proto__ is special).
  const nestedForbidden = createContentSchema.safeParse({
    ...base,
    metadata: JSON.parse('{"sections":[{"title":"A","__proto__":{"polluted":true}}]}')
  })
  assert.equal(nestedForbidden.success, false, 'nested prototype keys must be rejected')

  const nestedConstructor = createContentSchema.safeParse({
    ...base,
    metadata: JSON.parse('{"deep":{"nested":{"constructor":{"name":"x"}}}}')
  })
  assert.equal(nestedConstructor.success, false, 'nested constructor key must be rejected')

  const ok = createContentSchema.safeParse({
    ...base,
    metadata: { shortTitle: 'Hi', sections: [{ title: 'A', items: ['1'] }] }
  })
  assert.equal(ok.success, true, ok.success ? '' : JSON.stringify(ok.error.issues))
})
