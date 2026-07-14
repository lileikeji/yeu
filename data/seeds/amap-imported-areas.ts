import type { MapArea } from '../../map/core/types'

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
    points: [[118.605142, 25.106331], [118.606555, 25.106138], [118.606393, 25.105171], [118.604958, 25.105412], [118.605142, 25.106331]]
  },
  {
    id: '2003534061878102240', name: '这里有路', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 293.31, perimeterMeters: 150.40,
    points: [[118.616220, 25.112775], [118.616247, 25.112769], [118.616247, 25.112714], [118.616436, 25.112634], [118.616351, 25.112247], [118.616320, 25.112261], [118.616385, 25.112612], [118.616209, 25.112672], [118.616220, 25.112775]]
  },
  {
    id: '2003534061878102239', name: '新区教师公寓', strokeColor: '#FD9A00', fillColor: '#FFBF00', areaSquareMeters: 15292.02, perimeterMeters: 669.22,
    points: [[118.605504, 25.108893], [118.605986, 25.108553], [118.604274, 25.106576], [118.603943, 25.106930], [118.605504, 25.108893]]
  },
  {
    id: '2003534061878101216', name: '操场', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 16948.17, perimeterMeters: 566.11,
    points: [[118.619136, 25.112917], [118.620092, 25.112839], [118.619643, 25.111156], [118.618816, 25.111287], [118.619136, 25.112917]]
  },
  {
    id: '2003534061878101220', name: '操场', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 13677.52, perimeterMeters: 491.88,
    points: [[118.613707, 25.112207], [118.614757, 25.111116], [118.614020, 25.110667], [118.613034, 25.111771], [118.613707, 25.112207]]
  },
  {
    id: '2003534061878101221', name: '新区学生街', strokeColor: '#F96328', fillColor: '#FF983F', areaSquareMeters: 76417.59, perimeterMeters: 1108.44,
    points: [[118.599688, 25.107000], [118.602785, 25.107128], [118.602850, 25.104935], [118.599796, 25.104754], [118.599688, 25.107000]]
  },
  {
    id: '2003534061878101217', name: '八人制足球场', strokeColor: '#18AD78', fillColor: '#12E3AA', areaSquareMeters: 8805.03, perimeterMeters: 386.52,
    points: [[118.616929, 25.112215], [118.617746, 25.112123], [118.617482, 25.111110], [118.616777, 25.111209], [118.616929, 25.112215]]
  },
  {
    id: '2003534061878101222', name: '旧区学生街', strokeColor: '#F96328', fillColor: '#FF983F', areaSquareMeters: 22010.54, perimeterMeters: 588.70,
    points: [[118.616128, 25.110007], [118.615716, 25.110079], [118.615370, 25.110066], [118.615099, 25.110051], [118.614834, 25.109933], [118.614609, 25.109775], [118.614564, 25.109691], [118.614576, 25.109545], [118.614742, 25.108560], [118.614781, 25.108463], [118.614886, 25.108394], [118.615080, 25.108402], [118.615429, 25.108634], [118.616413, 25.109793], [118.616128, 25.110007]]
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
