import assert from 'node:assert/strict'
import test from 'node:test'
import { extractOwnerMapAreas, extractOwnerMapCoordinates } from './extract-amap-sparse-list'

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
      { resourceType: 7, resourceId: '7', name: '区域', lon: 118.6, lat: 25.1, area: 100, perimeter: 40, color: '#12E3AA,#18AD78', boundingBoxDTOList: [{ minLon: 118.599, minLat: 25.099, maxLon: 118.601, maxLat: 25.101 }] },
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

test('extracts WIA area bounding boxes without claiming polygon geometry', () => {
  const result = extractOwnerMapAreas(responseFixture())
  assert.equal(result.length, 1)
  assert.deepEqual(result[0], {
    resourceId: '7',
    name: '区域',
    center: { lng: 118.6, lat: 25.1, crs: 'GCJ-02' },
    bounds: { minLng: 118.599, minLat: 25.099, maxLng: 118.601, maxLat: 25.101, crs: 'GCJ-02' },
    areaSquareMeters: 100,
    perimeterMeters: 40,
    fillColor: '#12E3AA',
    strokeColor: '#18AD78',
    geometrySource: 'wia-bounding-box'
  })
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
