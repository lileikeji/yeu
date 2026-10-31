import type { MapArea } from '../../map/core/types'
import { decodePlacePoint } from '../../shared/utils/geo-obfuscation'

/** 区域多边形顶点与商家种子同样以混淆串入库内源码，防 bundle 明文坐标。 */
const SEED_GEO_KEY = '7a7df79c9590e1638fcc241567d60467798fa8e14f9894f2'

function areaPoint(encoded: string): [number, number] {
  const decoded = decodePlacePoint(encoded, SEED_GEO_KEY)
  if (!decoded) throw new Error('area geo payload failed to decode')
  return [decoded.longitude, decoded.latitude]
}

/**
 * User-authorized WIA getMapResourceByIds resourceType=7 records.
 *
 * `polygonInfo` supplies closed GCJ-02 WKT rings. These original coordinates
 * are preserved exactly and labelled with their CRS; the AMap provider renders
 * them directly without a lossy or network-dependent round trip.
 */
const rawAreas = [
  {
    id: '2003534061878102238', name: '操场', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 15423.04, perimeterMeters: 500.03,
    points: [areaPoint('v1:3a20512630123a8bcff53f2de5f1896a78'), areaPoint('v1:3a20514d5980ef08cff53f3ebbf0d88378'), areaPoint('v1:3a205153b105001dcff53ef91b4378b378'), areaPoint('v1:3a20512b3452bc64cff53ee920329f4778'), areaPoint('v1:3a20512630123a8bcff53f2de5f1896a78')]
  },
  {
    id: '2003534061878102240', name: '这里有路', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 293.31, perimeterMeters: 150.40,
    points: [areaPoint('v1:3a2050ecb392286bcff538cbb55eca1778'), areaPoint('v1:3a2050ec02d131e6cff538cb0a0904cb78'), areaPoint('v1:3a2050ec02d131e6cff538cfb4c9c94278'), areaPoint('v1:3a2050ef3a6be58dcff538c0f3246e8b78'), areaPoint('v1:3a2050eedee617b4cff538a95ffc169e78'), areaPoint('v1:3a2050ed5ce016d9cff538a844dd99a478'), areaPoint('v1:3a2050ee4f82cececff538c1440f277b78'), areaPoint('v1:3a2050f3624f416dcff538cd75ad28a078'), areaPoint('v1:3a2050ecb392286bcff538cbb55eca1778')]
  },
  {
    id: '2003534061878102239', name: '新区教师公寓', strokeColor: '#FD9A00', fillColor: '#FFBF00', areaSquareMeters: 15292.02, perimeterMeters: 669.22,
    points: [areaPoint('v1:3a20515c0649875bcff53ff50eb7c70e78'), areaPoint('v1:3a205154ec10143dcff53fdf46f6e59f78'), areaPoint('v1:3a205130f94a15cdcff53f5df7448dbc78'), areaPoint('v1:3a20513b951a8818cff53f4aa462f27178'), areaPoint('v1:3a20515c0649875bcff53ff50eb7c70e78')]
  },
  {
    id: '2003534061878101216', name: '操场', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 16948.17, perimeterMeters: 566.11,
    points: [areaPoint('v1:3a205003790910cdcff538fd47302df278'), areaPoint('v1:3a20503303cbc1dbcff538f66390b2f978'), areaPoint('v1:3a205034ae8dede3cff53861dfeec57578'), areaPoint('v1:3a2050063bfc6e16cff5386829df7c2878'), areaPoint('v1:3a205003790910cdcff538fd47302df278')]
  },
  {
    id: '2003534061878101220', name: '操场', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 13677.52, perimeterMeters: 491.88,
    points: [areaPoint('v1:3a2050da6c297581cff538acfec565ba78'), areaPoint('v1:3a2050c4b82e9e4fcff538677ef40b9278'), areaPoint('v1:3a2050d08f1a24a2cff53841cbffbb7178'), areaPoint('v1:3a2050a76765b4e1cff5388861e3a04078'), areaPoint('v1:3a2050da6c297581cff538acfec565ba78')]
  },
  {
    id: '2003534061878101221', name: '新区学生街', strokeColor: '#F96328', fillColor: '#FF983F', areaSquareMeters: 76417.59, perimeterMeters: 1108.44,
    points: [areaPoint('v1:3a2051fddc56120ccff53f713dcaa86f78'), areaPoint('v1:3a2051089219805ecff53f79da4e780478'), areaPoint('v1:3a2051098dba7852cff53ec862ff30ca78'), areaPoint('v1:3a2051ff9b53f001cff53ec44faa246b78'), areaPoint('v1:3a2051fddc56120ccff53f713dcaa86f78')]
  },
  {
    id: '2003534061878101217', name: '八人制足球场', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 8805.03, perimeterMeters: 386.52,
    points: [areaPoint('v1:3a2050e756555c6dcff538af789d1a8578'), areaPoint('v1:3a205015b3142e64cff538a1701c254678'), areaPoint('v1:3a20501846a816fbcff53864d3ae465678'), areaPoint('v1:3a2050e5d3ac1a50cff5386d56bc013078'), areaPoint('v1:3a2050e756555c6dcff538af789d1a8578')]
  },
  {
    id: '2003534061878101222', name: '旧区学生街', strokeColor: '#F96328', fillColor: '#FF983F', areaSquareMeters: 22010.54, perimeterMeters: 588.70,
    points: [areaPoint('v1:3a2050f231b268fbcff5383c0ce550a678'), areaPoint('v1:3a2050fb7184068ccff5383b44fefd9378'), areaPoint('v1:3a2050fead4add42cff538382ed862ac78'), areaPoint('v1:3a2050c15da2d23acff538392ab3e00778'), areaPoint('v1:3a2050c5e5247f61cff53831f679c42a78'), areaPoint('v1:3a2050c9556c5591cff5380f5134ef7b78'), areaPoint('v1:3a2050c991aeb241cff53801d24fae0678'), areaPoint('v1:3a2050c9a303db67cff5381e43f674de78'), areaPoint('v1:3a2050cb7b44bff1cff53fdff147a33a78'), areaPoint('v1:3a2050c407f8ad93cff53fd15cfbd71f78'), areaPoint('v1:3a2050c6df5fd048cff53faad25b114078'), areaPoint('v1:3a2050c1ed11fa7dcff53fd55c12d64a78'), areaPoint('v1:3a2050ffa5c1e1c7cff53fda17c33fb678'), areaPoint('v1:3a2050efda121471cff5380e0336500e78'), areaPoint('v1:3a2050f231b268fbcff5383c0ce550a678')]
  }
] as const

export const amapImportedAreas: MapArea[] = rawAreas.map(area => ({
  id: `wia-area-${area.id}`,
  name: area.name,
  paths: [area.points.map(([lng, lat]) => ({ lng, lat, crs: 'GCJ-02' as const }))],
  strokeColor: area.strokeColor,
  fillColor: area.fillColor,
  areaSquareMeters: area.areaSquareMeters,
  perimeterMeters: area.perimeterMeters,
  geometrySource: 'wia-shape-batch'
}))
