import assert from 'node:assert/strict'
import test from 'node:test'
import { loginSchema, paginationQuerySchema } from '../shared/schemas/server'

test('login password is bounded to limit scrypt DoS', () => {
  const ok = loginSchema.safeParse({ username: 'admin', password: 'a'.repeat(12) })
  assert.equal(ok.success, true)

  const tooLong = loginSchema.safeParse({ username: 'admin', password: 'a'.repeat(129) })
  assert.equal(tooLong.success, false)

  const short = loginSchema.safeParse({ username: 'admin', password: 'short' })
  assert.equal(short.success, false)
})

test('pagination rejects unbounded page/pageSize abuse', () => {
  const ok = paginationQuerySchema.safeParse({ page: '2', pageSize: '50' })
  assert.equal(ok.success, true)
  if (ok.success) {
    assert.equal(ok.data.page, 2)
    assert.equal(ok.data.pageSize, 50)
  }

  const bigPage = paginationQuerySchema.safeParse({ page: 10_001 })
  assert.equal(bigPage.success, false)

  const bigSize = paginationQuerySchema.safeParse({ pageSize: 101 })
  assert.equal(bigSize.success, false)

  const legacy200 = paginationQuerySchema.safeParse({ pageSize: 200 })
  assert.equal(legacy200.success, false)
})
