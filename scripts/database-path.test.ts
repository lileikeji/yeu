import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { resolveDatabasePath } from '../server/database/client'

test('database path stays project-relative when Nuxt preview runs from .output', () => {
  const project = resolve('C:/example/yeu')
  assert.equal(
    resolveDatabasePath('./data/yeu.sqlite', resolve(project, '.output')),
    resolve(project, 'data/yeu.sqlite')
  )
  assert.equal(
    resolveDatabasePath('./data/yeu.sqlite', project),
    resolve(project, 'data/yeu.sqlite')
  )
})

test('database path preserves absolute and in-memory targets', () => {
  const absolute = resolve('C:/data/custom.sqlite')
  assert.equal(resolveDatabasePath(absolute, resolve('C:/example/yeu/.output')), absolute)
  assert.equal(resolveDatabasePath(':memory:', resolve('C:/example/yeu/.output')), ':memory:')
})
