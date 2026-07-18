import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  discoverDirectoryEntries,
  discoverTaskEntries,
  discoverTrustEntries
} from '../app/utils/discover-presentation'

const pageSource = readFileSync(resolve('app/pages/discover.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/discover-presentation.ts'), 'utf8')

test('discover page is a thin shell over discover-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/discover-presentation['"]/)
  assert.match(pageSource, /discoverTaskEntries/)
  assert.match(pageSource, /discoverDirectoryEntries/)
  assert.match(pageSource, /discoverTrustEntries/)
  assert.doesNotMatch(pageSource, /const taskEntries = \[/)
  assert.doesNotMatch(pageSource, /const directoryEntries = \[/)
  assert.doesNotMatch(pageSource, /const trustEntries = \[/)
  assert.match(utilSource, /export const discoverTaskEntries/)
  assert.match(utilSource, /export const discoverDirectoryEntries/)
  assert.match(utilSource, /export const discoverTrustEntries/)
})

test('discover catalogs stay student-facing', () => {
  assert.equal(discoverTaskEntries.length, 10)
  assert.equal(discoverTaskEntries[0]?.title, '新生清单')
  assert.equal(discoverTaskEntries[0]?.to, '/checklist')
  assert.ok(discoverTaskEntries.some(item => item.title === '周边商铺' && item.to === '/nearby'))
  assert.ok(discoverTaskEntries.some(item => item.to === '/map?category=express'))
  assert.equal(discoverDirectoryEntries.length, 9)
  assert.equal(discoverDirectoryEntries[0]?.title, '新生群聊')
  assert.ok(discoverDirectoryEntries.some(item => item.title === '校园地图' && item.to === '/map'))
  assert.ok(discoverDirectoryEntries.some(item => item.title === '全站搜索' && item.to === '/search'))
  assert.equal(discoverTrustEntries.length, 5)
  assert.equal(discoverTrustEntries[0]?.to, '/sources')
  assert.ok(discoverTrustEntries.some(item => item.title === '反馈纠错' && item.to === '/feedback'))
  assert.ok(discoverTrustEntries.some(item => item.title === '关于项目' && item.to === '/about'))
  assert.ok(discoverTaskEntries.some(item => item.to === '/procedures/arrival' && /2026级/.test(item.description)))
  assert.ok(discoverTaskEntries.some(item => item.to === '/checklist' && item.title === '新生清单'))
})

test('discover presentation export surface stays stable', () => {
  assert.match(utilSource, /export interface DiscoverLinkEntry/)
  assert.match(utilSource, /export interface DiscoverTaskEntry/)
  assert.equal(discoverTaskEntries.every(item => item.title && item.description && item.to && item.icon && item.tone), true)
  assert.equal(discoverDirectoryEntries.every(item => item.title && item.description && item.to && item.icon), true)
  assert.equal(discoverTrustEntries.every(item => item.title && item.description && item.to && item.icon), true)
  const routes = [
    ...discoverTaskEntries.map(item => item.to),
    ...discoverDirectoryEntries.map(item => item.to),
    ...discoverTrustEntries.map(item => item.to)
  ]
  assert.equal(routes.every(to => to.startsWith('/')), true)
})
