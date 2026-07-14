import assert from 'node:assert/strict'
import test from 'node:test'
import { extractOwnerMapCoordinates } from './extract-amap-sparse-list'

function rawFixture() {
  return {
    sheets: [{ rows: [
      { '_sourceRow': 2, '名称': '甲楼', '位置编码(导出的内容若需再次导入，请不要修改此列)': 'WIA-200.1,62.1' },
      { '_sourceRow': 3, '名称': '乙楼', '位置编码(导出的内容若需再次导入，请不要修改此列)': 'WIA-200.2,62.2' }
    ] }]
  }
}

function responseFixture() {
  return {
    success: true,
    code: 1,
    data: { resourceList: [
      { resourceType: 7, resourceId: 'area-1', name: '区域', lon: 118.6, lat: 25.1 },
      { resourceType: 1, resourceId: '2', name: '乙楼', lon: 118.61, lat: 25.11 },
      { resourceType: 1, resourceId: '1', name: '甲楼', lon: 118.60, lat: 25.10 }
    ] }
  }
}

test('extracts point resources and restores workbook order by exact name', () => {
  const result = extractOwnerMapCoordinates(responseFixture(), rawFixture())
  assert.deepEqual(result.map(item => [item.sourceRow, item.name, item.resourceId, item.lng, item.lat]), [
    [2, '甲楼', '1', 118.60, 25.10],
    [3, '乙楼', '2', 118.61, 25.11]
  ])
  assert.ok(result.every(item => item.crs === 'GCJ-02' && item.verificationStatus === 'owner-map-only'))
})

test('rejects duplicate coordinates and mismatched names', () => {
  const duplicate = responseFixture()
  duplicate.data.resourceList[2]!.lon = 118.61
  duplicate.data.resourceList[2]!.lat = 25.11
  assert.throws(() => extractOwnerMapCoordinates(duplicate, rawFixture()), /Duplicate point coordinate/)

  const mismatched = responseFixture()
  mismatched.data.resourceList[2]!.name = '不存在的楼'
  assert.throws(() => extractOwnerMapCoordinates(mismatched, rawFixture()), /unexpected point names/)
})
