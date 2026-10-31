import { decodePlacePoint } from '../../shared/utils/geo-obfuscation'

/**
 * OSM 校园边界（data/seeds/osm-campus-boundary.json 的编码化镜像）。
 * JSON 原件只作为数据源供脚本读取；前端一律 import 本模块，
 * 避免明文经纬度进入 client bundle。
 */
const BOUNDARY_GEO_KEY = 'c137257a75409e2d5ec2c16efc59d4a80b880ce22b719100'

function boundaryPoint(encoded: string): [number, number] {
  const decoded = decodePlacePoint(encoded, BOUNDARY_GEO_KEY)
  if (!decoded) throw new Error('campus boundary geo payload failed to decode')
  return [decoded.longitude, decoded.latitude]
}

export interface CampusBoundaryFeature {
  type: 'Feature'
  properties: {
    name: string
    osmRelationId: number
    osmRelationVersion: number
    osmWayIds: number[]
    osmWayVersions: number[]
    sourceUrl: string
    sourceApiUrl: string
    license: string
    licenseUrl: string
    sourceUpdatedAt: string
    retrievedAt: string
    verificationScope: string
  }
  geometry: {
    type: 'Polygon'
    coordinates: Array<Array<[number, number]>>
  }
}

const encodedRings: string[][] = [["v1:816a8268cd29f6541e9f667ef7562ad30b"],["v1:816a83a42e2a17cf1e9f678d358a20a00b"],["v1:816a8231ed59f8f41e9f6636e65e3dab0b"]]

export const campusBoundary: CampusBoundaryFeature = {
  type: 'Feature',
  properties: {
  "name": "仰恩大学",
  "osmRelationId": 17685756,
  "osmRelationVersion": 3,
  "osmWayIds": [
    1290187514,
    1290187515,
    1290187516
  ],
  "osmWayVersions": [
    1,
    1,
    1
  ],
  "sourceUrl": "https://www.openstreetmap.org/relation/17685756",
  "sourceApiUrl": "https://api.openstreetmap.org/api/0.6/relation/17685756/full.json",
  "license": "ODbL-1.0",
  "licenseUrl": "https://www.openstreetmap.org/copyright",
  "sourceUpdatedAt": "2024-09-02T13:42:22Z",
  "retrievedAt": "2026-07-13",
  "verificationScope": "campus-boundary-only"
},
  geometry: {
    type: 'Polygon',
    coordinates: encodedRings.map(ring => ring.map(boundaryPoint))
  }
}
