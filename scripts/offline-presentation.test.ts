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
  assert.equal(offlineBoundaries[0]?.title, '报到安排要重新确认')
  assert.match(offlineBoundaries[0]?.text ?? '', /学校最新通知/)
  assert.ok(offlineBoundaries.some(item => item.title === '地图和路线暂时用不了'))
  assert.ok(offlineBoundaries.some(item => item.title === '之前看过的内容可能有变化'))
  assert.equal(offlineStaticEntries.length, 3)
  assert.equal(offlineStaticEntries[0]?.to, '/procedures/arrival')
  assert.equal(offlineStaticEntries[1]?.to, '/checklist')
  assert.equal(offlineStaticEntries[2]?.to, '/guides/safety-health')
  assert.equal(offlineStaticEntries[0]?.title, '报到准备')
  assert.equal(offlineStaticEntries[1]?.title, '新生清单')
  assert.equal(offlineStaticEntries[2]?.title, '安全电话与求助')
})

test('offline status matrix and export surface stay stable', () => {
  assert.match(utilSource, /export interface OfflineStatus/)
  assert.match(utilSource, /export interface OfflineBoundary/)
  assert.match(utilSource, /export interface OfflineStaticEntry/)
  const checking = resolveOfflineStatus(null)
  assert.equal(checking.title, '正在查看网络')
  assert.equal(checking.pageTitle, '正在看看网络是否恢复')
  assert.equal(checking.description, '连上网络后，这里会自动恢复。')
  assert.equal(checking.icon, 'i-lucide-loader-circle')
  assert.match(checking.tone, /bg-zinc-100/)
  const online = resolveOfflineStatus(true)
  assert.equal(online.title, '网络已经恢复')
  assert.equal(online.pageKicker, '网络已恢复')
  assert.equal(online.pageTitle, '可以回到刚才的页面了')
  assert.equal(online.icon, 'i-lucide-wifi')
  assert.match(online.description, /回到刚才的页面/)
  const offline = resolveOfflineStatus(false)
  assert.equal(offline.title, '还没有连上网络')
  assert.equal(offline.pageKicker, '网络断开了')
  assert.equal(offline.pageTitle, '先检查网络，连上后再继续')
  assert.equal(offline.icon, 'i-lucide-wifi-off')
  assert.match(offline.description, /Wi-Fi 或移动网络/)
  assert.doesNotMatch(utilSource, /连接状态|动态内容|已发布内容|旧数据显示|离线数据库|地图瓦片|旧缓存/)
  assert.equal(offlineBoundaries.every(item => item.title && item.text && item.icon), true)
  assert.equal(offlineStaticEntries.every(item => item.title && item.to && item.icon), true)
  assert.equal(offlineStaticEntries.every(item => item.to.startsWith('/')), true)
})
