import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  errorRecoveryActions,
  resolveErrorPageContent
} from '../app/utils/error-page-presentation'

const pageSource = readFileSync(resolve('app/error.vue'), 'utf8')

test('public error page uses Chinese recovery copy without raw exception output', () => {
  assert.match(pageSource, /resolveErrorPageContent/)
  assert.match(pageSource, /返回首页/)
  assert.match(pageSource, /继续查找/)
  assert.match(pageSource, /clearError\(\{ redirect: to \}\)/)
  assert.doesNotMatch(pageSource, /Go back home|error\.message|error\.statusMessage|error\.stack/)
})

test('error presentation covers common public failure states', () => {
  const missing = resolveErrorPageContent(404)
  assert.equal(missing.title, '这个页面不存在')
  assert.equal(missing.code, null)
  assert.equal(missing.canRetry, false)

  assert.match(resolveErrorPageContent(403).title, /不能访问/)
  assert.match(resolveErrorPageContent(429).title, /操作有点快/)
  assert.equal(resolveErrorPageContent(429).canRetry, true)
  assert.match(resolveErrorPageContent(500).title, /页面现在有点忙/)
  assert.match(resolveErrorPageContent(503).description, /稍后重新打开/)
})

test('error page recovery actions lead to useful public routes', () => {
  assert.deepEqual(
    errorRecoveryActions.map(action => action.to),
    ['/search', '/map', '/procedures']
  )
  assert.ok(errorRecoveryActions.every(action => action.icon.startsWith('i-lucide-')))
})
