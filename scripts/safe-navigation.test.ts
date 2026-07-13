import assert from 'node:assert/strict'
import test from 'node:test'
import { safeLocalPath } from '../app/utils/safe-navigation'

test('accepts normalized application-local paths', () => {
  assert.equal(safeLocalPath('/procedures/arrival?audience=undergraduate#step-2'), '/procedures/arrival?audience=undergraduate#step-2')
  assert.equal(safeLocalPath(['/map?scope=nearby']), '/map?scope=nearby')
})

test('rejects absolute, protocol-relative, and backslash-normalized external URLs', () => {
  assert.equal(safeLocalPath('https://example.com'), null)
  assert.equal(safeLocalPath('//example.com/path'), null)
  assert.equal(safeLocalPath('/\\example.com/path'), null)
  assert.equal(safeLocalPath('javascript:alert(1)'), null)
})
