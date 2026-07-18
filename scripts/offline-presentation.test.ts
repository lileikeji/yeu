import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  offlineBoundaries,
  offlineStaticEntries,
  resolveOfflineStatus
} from '../app/utils/offline-presentation'

const pageSource = readFileSync(resolve('app/pages/offline.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/offline-presentation.ts'), 'utf8')

test('offline page is a thin shell over offline-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/offline-presentation['"]/)
  assert.match(pageSource, /offlineBoundaries/)
  assert.match(pageSource, /offlineStaticEntries/)
  assert.match(pageSource, /resolveOfflineStatus/)
  assert.doesNotMatch(pageSource, /const offlineBoundaries = \[/)
  assert.doesNotMatch(pageSource, /const staticEntries = \[/)
  assert.doesNotMatch(pageSource, /if \(isOnline\.value === null\)/)
  assert.match(utilSource, /export const offlineBoundaries/)
  assert.match(utilSource, /export const offlineStaticEntries/)
  assert.match(utilSource, /export function resolveOfflineStatus/)
})

test('offline catalogs stay student-facing', () => {
  assert.equal(offlineBoundaries.length, 3)
  assert.equal(offlineBoundaries[0]?.title, '公开内容不会完整保存在设备上')
  assert.match(offlineBoundaries[0]?.text ?? '', /联网后看到的最新发布内容/)
  assert.ok(offlineBoundaries.some(item => item.title === '地图和导航需要网络'))
  assert.ok(offlineBoundaries.some(item => item.title === '以前打开过的页面也可能过期'))
  assert.equal(offlineStaticEntries.length, 3)
  assert.equal(offlineStaticEntries[0]?.to, '/discover')
  assert.equal(offlineStaticEntries[1]?.to, '/about')
  assert.equal(offlineStaticEntries[2]?.to, '/privacy')
  assert.equal(offlineStaticEntries[0]?.title, '功能目录')
  assert.equal(offlineStaticEntries[1]?.title, '关于项目')
  assert.equal(offlineStaticEntries[2]?.title, '隐私说明')
})

test('offline status matrix and export surface stay stable', () => {
  assert.match(utilSource, /export interface OfflineStatus/)
  assert.match(utilSource, /export interface OfflineBoundary/)
  assert.match(utilSource, /export interface OfflineStaticEntry/)
  const checking = resolveOfflineStatus(null)
  assert.equal(checking.title, '正在检查网络')
  assert.equal(checking.icon, 'i-lucide-loader-circle')
  assert.match(checking.tone, /bg-zinc-100/)
  const online = resolveOfflineStatus(true)
  assert.equal(online.title, '网络已恢复')
  assert.equal(online.icon, 'i-lucide-wifi')
  assert.match(online.description, /重新加载原页面/)
  const offline = resolveOfflineStatus(false)
  assert.equal(offline.title, '当前处于离线状态')
  assert.equal(offline.icon, 'i-lucide-wifi-off')
  assert.match(offline.description, /不会把旧数据显示为最新结果/)
  assert.equal(offlineBoundaries.every(item => item.title && item.text), true)
  assert.equal(offlineStaticEntries.every(item => item.title && item.to && item.icon), true)
  assert.equal(offlineStaticEntries.every(item => item.to.startsWith('/')), true)
})
