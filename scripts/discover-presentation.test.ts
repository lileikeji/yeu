import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildDiscoverTaskPreview,
  discoverDirectoryEntries,
  discoverTaskPreviewLimit,
  discoverTaskEntries,
  discoverTrustEntries
} from '../app/utils/discover-presentation'

const pageSource = readFileSync(resolve('app/pages/discover.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/discover-presentation.ts'), 'utf8')

test('discover page is a thin shell over discover-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/discover-presentation['"]/)
  assert.match(pageSource, /discoverTaskEntries/)
  assert.match(pageSource, /buildDiscoverTaskPreview/)
  assert.match(pageSource, /discoverDirectoryEntries/)
  assert.match(pageSource, /discoverTrustEntries/)
  assert.doesNotMatch(pageSource, /const taskEntries = \[/)
  assert.doesNotMatch(pageSource, /const directoryEntries = \[/)
  assert.doesNotMatch(pageSource, /const trustEntries = \[/)
  assert.match(utilSource, /export const discoverTaskEntries/)
  assert.match(utilSource, /export function buildDiscoverTaskPreview/)
  assert.match(utilSource, /export const discoverDirectoryEntries/)
  assert.match(utilSource, /export const discoverTrustEntries/)
})

test('discover catalogs stay student-facing', () => {
  assert.equal(discoverTaskEntries.length, 10)
  assert.equal(discoverTaskEntries[0]?.title, '新生清单')
  assert.equal(discoverTaskEntries[0]?.to, '/checklist')
  assert.ok(discoverTaskEntries.some(item => item.title === '周边商铺' && item.to === '/nearby'))
  assert.ok(discoverTaskEntries.some(item => item.to === '/map?category=express'))
  assert.ok(discoverTaskEntries.some(item => item.description === '查看校园网、校外访问和图书馆登录说明'))
  assert.equal(discoverDirectoryEntries.length, 9)
  assert.equal(discoverDirectoryEntries[0]?.title, '新生群聊')
  assert.ok(discoverDirectoryEntries.some(item => item.title === '校园地图' && item.to === '/map'))
  assert.ok(discoverDirectoryEntries.some(item => item.title === '全站搜索' && item.to === '/search'))
  assert.equal(discoverTrustEntries.length, 5)
  assert.equal(discoverTrustEntries[0]?.to, '/sources')
  assert.ok(discoverTrustEntries.some(item => item.title === '告诉我们哪里不对' && item.to === '/feedback'))
  assert.ok(discoverTrustEntries.some(item => item.title === '关于这份指南' && item.to === '/about'))
  assert.ok(discoverTaskEntries.some(item => item.to === '/procedures/arrival' && /2026 级/.test(item.description)))
  assert.ok(discoverTaskEntries.some(item => item.to === '/checklist' && item.title === '新生清单'))
  assert.doesNotMatch(utilSource, /发布标准|确认情况|资料分级|服务边界|已发布引用/)
})

test('discover task preview keeps the mobile page manageable', () => {
  assert.equal(discoverTaskPreviewLimit, 6)
  const collapsed = buildDiscoverTaskPreview(discoverTaskEntries, false)
  assert.equal(collapsed.items.length, 6)
  assert.equal(collapsed.hiddenCount, 4)
  const expanded = buildDiscoverTaskPreview(discoverTaskEntries, true)
  assert.equal(expanded.items.length, 10)
  assert.equal(expanded.hiddenCount, 0)
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
