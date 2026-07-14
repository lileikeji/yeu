import type { MapArea } from '../../map/core/types'

/**
 * Reviewed WIA sparseList resourceType=7 records.
 *
 * sparseList exposes only bounding boxes, not the source polygon vertices. These
 * rectangles are therefore deliberately labelled as bounding boxes. Coordinates
 * were converted from the source GCJ-02 corners to WGS84 using the same reviewed
 * iterative conversion used for the imported point seed.
 */
const rawAreas = [
  ['2003534061878102238', '操场', 118.60049917, 25.10814735, 118.60209596, 25.10930699, '#18AD78', '#12E3AA', 15423.04, 500.03],
  ['2003534061878102240', '这里有路', 118.61174620, 25.11521864, 118.61197303, 25.11574645, '#18AD78', '#12E3AA', 293.31, 150.40],
  ['2003534061878102239', '新区教师公寓', 118.59948409, 25.10955231, 118.60152684, 25.11186884, '#FD9A00', '#FFBF00', 15292.02, 669.22],
  ['2003534061878101216', '操场', 118.61435164, 25.11412607, 118.61562661, 25.11588599, '#18AD78', '#12E3AA', 16948.17, 566.11],
  ['2003534061878101220', '操场', 118.60857289, 25.11364046, 118.61029498, 25.11517945, '#18AD78', '#12E3AA', 13677.52, 491.88],
  ['2003534061878101221', '新区学生街', 118.59522874, 25.10773042, 118.59839101, 25.11010432, '#F96328', '#FF983F', 76417.59, 1108.44],
  ['2003534061878101217', '八人制足球场', 118.61231395, 25.11408140, 118.61328228, 25.11518569, '#18AD78', '#12E3AA', 8805.03, 386.52],
  ['2003534061878101222', '旧区学生街', 118.61010234, 25.11136692, 118.61195023, 25.11305072, '#F96328', '#FF983F', 22010.54, 588.70]
] as const satisfies ReadonlyArray<readonly [string, string, number, number, number, number, string, string, number, number]>

export const amapImportedAreas: MapArea[] = rawAreas.map(([id, name, west, south, east, north, strokeColor, fillColor, areaSquareMeters, perimeterMeters]) => ({
  id: `wia-area-${id}`,
  name: String(name),
  bounds: {
    southWest: { lng: Number(west), lat: Number(south), crs: 'WGS84' },
    northEast: { lng: Number(east), lat: Number(north), crs: 'WGS84' }
  },
  strokeColor: String(strokeColor),
  fillColor: String(fillColor),
  areaSquareMeters: Number(areaSquareMeters),
  perimeterMeters: Number(perimeterMeters),
  geometrySource: 'wia-bounding-box'
}))
