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
  assert.equal(offlineBoundaries[0]?.title, '重要信息不要只看旧页面')
  assert.match(offlineBoundaries[0]?.text ?? '', /联网后请再看最新消息/)
  assert.ok(offlineBoundaries.some(item => item.title === '地图和导航需要网络'))
  assert.ok(offlineBoundaries.some(item => item.title === '以前打开过的页面不一定能打开'))
  assert.equal(offlineStaticEntries.length, 3)
  assert.equal(offlineStaticEntries[0]?.to, '/discover')
  assert.equal(offlineStaticEntries[1]?.to, '/about')
  assert.equal(offlineStaticEntries[2]?.to, '/privacy')
  assert.equal(offlineStaticEntries[0]?.title, '更多功能')
  assert.equal(offlineStaticEntries[1]?.title, '关于这份指南')
  assert.equal(offlineStaticEntries[2]?.title, '隐私说明')
})

test('offline status matrix and export surface stay stable', () => {
  assert.match(utilSource, /export interface OfflineStatus/)
  assert.match(utilSource, /export interface OfflineBoundary/)
  assert.match(utilSource, /export interface OfflineStaticEntry/)
  const checking = resolveOfflineStatus(null)
  assert.equal(checking.title, '正在看看网络是否恢复')
  assert.equal(checking.icon, 'i-lucide-loader-circle')
  assert.match(checking.tone, /bg-zinc-100/)
  const online = resolveOfflineStatus(true)
  assert.equal(online.title, '网络已经恢复')
  assert.equal(online.icon, 'i-lucide-wifi')
  assert.match(online.description, /回到刚才的页面/)
  const offline = resolveOfflineStatus(false)
  assert.equal(offline.title, '现在仍然没有网络')
  assert.equal(offline.icon, 'i-lucide-wifi-off')
  assert.match(offline.description, /最新校园消息还不能加载/)
  assert.doesNotMatch(utilSource, /动态内容|已发布内容|旧数据显示|离线数据库/)
  assert.equal(offlineBoundaries.every(item => item.title && item.text), true)
  assert.equal(offlineStaticEntries.every(item => item.title && item.to && item.icon), true)
  assert.equal(offlineStaticEntries.every(item => item.to.startsWith('/')), true)
})
