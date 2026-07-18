import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { adminSectionConfigs } from '../app/utils/admin-section-config'
import { displayAdminResourceCell } from '../app/utils/admin-resource-presentation'

const captureEntry = readFileSync(resolve('app/components/admin/AdminCoordinateCaptureEntry.vue'), 'utf8')
const reviewCopy = readFileSync(resolve('app/utils/field-observation-review.ts'), 'utf8')
const picker = readFileSync(resolve('app/components/admin/AdminCoordinatePicker.vue'), 'utf8')
const reviewMap = readFileSync(resolve('app/components/admin/AdminCoordinateReviewMap.vue'), 'utf8')
const offlineQueue = readFileSync(resolve('app/components/admin/AdminCoordinateOfflineQueuePanel.vue'), 'utf8')
const resourceForm = readFileSync(resolve('app/utils/admin-resource-form.ts'), 'utf8')

test('content and source catalogs translate stored values for administrators', () => {
  const contentKind = adminSectionConfigs.content!.columns.find(column => column.key === 'kind')!
  const sourcePlatform = adminSectionConfigs.sources!.columns.find(column => column.key === 'platform')!

  assert.equal(displayAdminResourceCell({ kind: 'club' }, contentKind), '社团')
  assert.equal(displayAdminResourceCell({ kind: 'department' }, contentKind), '部门')
  assert.equal(displayAdminResourceCell({ platform: 'amap-workmap' }, sourcePlatform), '高德工作地图（授权导入）')
  assert.equal(displayAdminResourceCell({ platform: 'official-website' }, sourcePlatform), '学校官网')
})

test('content editor and coordinate workflows avoid engineer-facing copy', () => {
  const combined = [captureEntry, reviewCopy, picker, reviewMap, offlineQueue].join('\n')
  const visibleJargon = /approved 观测|保持 unverified|升级为 verified|服务端还会|m 阈值|客户端观测 ID|写入 WGS84|来自 OSM/

  assert.doesNotMatch(combined, visibleJargon)
  assert.match(captureEntry, /verificationLabel/)
  assert.match(picker, /标准地理坐标/)
  assert.match(reviewCopy, /两次独立核验/)
  assert.match(offlineQueue, /本地记录编号/)
  assert.doesNotMatch(resourceForm, /必须是合法 JSON/)
})
