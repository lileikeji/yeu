import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_RAW_PATH = 'data/imports/amap-workmap-2026-07-13.raw.json'
const DEFAULT_OUTPUT_PATH = 'data/imports/amap-workmap-2026-07-13.coordinates.owner-map.json'
const WIA_MAP_URL = 'https://wia.amap.com/#/map?orgId=10013534060195922961&workMapId=1353406220128099'
const CAMPUS_BOUNDS = { minLng: 118.58, maxLng: 118.63, minLat: 25.09, maxLat: 25.14 }

interface RawMarker {
  _sourceRow: number
  名称: string
  [key: string]: unknown
}

interface SparsePoint {
  resourceId: string
  name: string
  lon: number
  lat: number
}

export interface OwnerMapArea {
  resourceId: string
  name: string
  center: { lng: number, lat: number, crs: 'GCJ-02' }
  bounds: { minLng: number, minLat: number, maxLng: number, maxLat: number, crs: 'GCJ-02' }
  areaSquareMeters: number | null
  perimeterMeters: number | null
  fillColor: string
  strokeColor: string
  geometrySource: 'wia-bounding-box'
}

export interface OwnerMapCoordinate {
  sourceRow: number
  name: string
  locationCode: string
  resourceId: string
  lng: number
  lat: number
  crs: 'GCJ-02'
  coordinateSource: string
  coordinateSourceUrl: string
  verificationStatus: 'owner-map-only'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertExtract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function locationCodeHeader(marker: RawMarker): string {
  const header = Object.keys(marker).find(key => key.startsWith('位置编码'))
  assertExtract(header, 'Reviewed AMap marker data has no WIA location-code column')
  return header
}

function parseMarkers(rawValue: unknown): Array<RawMarker & { locationCode: string }> {
  assertExtract(isRecord(rawValue) && Array.isArray(rawValue.sheets), 'Reviewed AMap raw data has no sheets')
  const firstSheet = rawValue.sheets[0]
  assertExtract(isRecord(firstSheet) && Array.isArray(firstSheet.rows), 'Reviewed AMap marker sheet is missing')
  const rows = firstSheet.rows as unknown[]
  assertExtract(rows.length > 0, 'Reviewed AMap marker sheet is empty')

  return rows.map((value, index) => {
    assertExtract(isRecord(value), `Marker row ${index + 1} must be an object`)
    const marker = value as unknown as RawMarker
    assertExtract(Number.isInteger(marker._sourceRow), `Marker row ${index + 1} has no source row`)
    assertExtract(typeof marker.名称 === 'string' && marker.名称.trim(), `Marker row ${index + 1} has no name`)
    const header = locationCodeHeader(marker)
    const code = marker[header]
    assertExtract(typeof code === 'string' && /^WIA-\d+\.\d+,\d+\.\d+$/.test(code), `${marker.名称} has an invalid WIA location code`)
    return { ...marker, locationCode: code }
  })
}

function parseSparsePoints(responseValue: unknown): SparsePoint[] {
  assertExtract(isRecord(responseValue), 'sparseList response must be an object')
  assertExtract(responseValue.success === true && responseValue.code === 1, 'sparseList response is not successful')
  assertExtract(isRecord(responseValue.data) && Array.isArray(responseValue.data.resourceList), 'sparseList response has no resourceList')

  return responseValue.data.resourceList
    .filter(value => isRecord(value) && value.resourceType === 1)
    .map((value, index) => {
      assertExtract(isRecord(value), `Point resource ${index + 1} must be an object`)
      assertExtract(typeof value.resourceId === 'string' && /^\d+$/.test(value.resourceId), `Point resource ${index + 1} has an invalid resourceId`)
      assertExtract(typeof value.name === 'string' && value.name.trim(), `Point resource ${index + 1} has no name`)
      assertExtract(typeof value.lon === 'number' && Number.isFinite(value.lon), `${value.name} has no longitude`)
      assertExtract(typeof value.lat === 'number' && Number.isFinite(value.lat), `${value.name} has no latitude`)
      assertExtract(
        value.lon >= CAMPUS_BOUNDS.minLng && value.lon <= CAMPUS_BOUNDS.maxLng
        && value.lat >= CAMPUS_BOUNDS.minLat && value.lat <= CAMPUS_BOUNDS.maxLat,
        `${value.name} is outside the campus review bounds`
      )
      return { resourceId: value.resourceId, name: value.name, lon: value.lon, lat: value.lat }
    })
}

export function extractOwnerMapAreas(responseValue: unknown): OwnerMapArea[] {
  assertExtract(isRecord(responseValue), 'sparseList response must be an object')
  assertExtract(responseValue.success === true && responseValue.code === 1, 'sparseList response is not successful')
  assertExtract(isRecord(responseValue.data) && Array.isArray(responseValue.data.resourceList), 'sparseList response has no resourceList')

  return responseValue.data.resourceList
    .filter(value => isRecord(value) && value.resourceType === 7)
    .map((value, index) => {
      assertExtract(isRecord(value), `Area resource ${index + 1} must be an object`)
      assertExtract(typeof value.resourceId === 'string' && /^\d+$/.test(value.resourceId), `Area resource ${index + 1} has an invalid resourceId`)
      assertExtract(typeof value.name === 'string' && value.name.trim(), `Area resource ${index + 1} has no name`)
      assertExtract(typeof value.lon === 'number' && Number.isFinite(value.lon), `${value.name} has no center longitude`)
      assertExtract(typeof value.lat === 'number' && Number.isFinite(value.lat), `${value.name} has no center latitude`)
      const boxes = value.boundingBoxDTOList
      assertExtract(Array.isArray(boxes) && boxes.length === 1 && isRecord(boxes[0]), `${value.name} must have one reviewed bounding box`)
      const box = boxes[0]
      const minLng = box.minLon
      const minLat = box.minLat
      const maxLng = box.maxLon
      const maxLat = box.maxLat
      assertExtract([minLng, minLat, maxLng, maxLat].every(item => typeof item === 'number' && Number.isFinite(item)), `${value.name} has an invalid bounding box`)
      assertExtract(minLng < maxLng && minLat < maxLat, `${value.name} has an empty bounding box`)
      assertExtract(minLng >= CAMPUS_BOUNDS.minLng && maxLng <= CAMPUS_BOUNDS.maxLng && minLat >= CAMPUS_BOUNDS.minLat && maxLat <= CAMPUS_BOUNDS.maxLat, `${value.name} bounding box is outside the campus review bounds`)
      const colors = typeof value.color === 'string' ? value.color.split(',') : []
      const fillColor = /^#[0-9A-F]{6}$/i.test(colors[0] ?? '') ? colors[0]! : '#12E3AA'
      const strokeColor = /^#[0-9A-F]{6}$/i.test(colors[1] ?? '') ? colors[1]! : fillColor
      return {
        resourceId: value.resourceId,
        name: value.name,
        center: { lng: value.lon, lat: value.lat, crs: 'GCJ-02' },
        bounds: { minLng, minLat, maxLng, maxLat, crs: 'GCJ-02' },
        areaSquareMeters: typeof value.area === 'number' && Number.isFinite(value.area) ? value.area : null,
        perimeterMeters: typeof value.perimeter === 'number' && Number.isFinite(value.perimeter) ? value.perimeter : null,
        fillColor,
        strokeColor,
        geometrySource: 'wia-bounding-box' as const
      }
    })
}

export function extractOwnerMapCoordinates(responseValue: unknown, rawValue: unknown): OwnerMapCoordinate[] {
  const markers = parseMarkers(rawValue)
  const points = parseSparsePoints(responseValue)
  assertExtract(points.length === markers.length, `Expected ${markers.length} point resources but received ${points.length}`)

  const pointByName = new Map<string, SparsePoint>()
  const ids = new Set<string>()
  const coordinates = new Set<string>()
  for (const point of points) {
    assertExtract(!pointByName.has(point.name), `Duplicate point name: ${point.name}`)
    assertExtract(!ids.has(point.resourceId), `Duplicate resourceId: ${point.resourceId}`)
    const coordinateKey = `${point.lon},${point.lat}`
    assertExtract(!coordinates.has(coordinateKey), `Duplicate point coordinate: ${coordinateKey}`)
    pointByName.set(point.name, point)
    ids.add(point.resourceId)
    coordinates.add(coordinateKey)
  }

  const markerNames = new Set(markers.map(marker => marker.名称))
  const unexpected = points.map(point => point.name).filter(name => !markerNames.has(name))
  assertExtract(unexpected.length === 0, `sparseList contains unexpected point names: ${unexpected.join(', ')}`)

  return markers.map((marker) => {
    const name = marker.名称
    const point = pointByName.get(name)
    assertExtract(point, `sparseList is missing point: ${name}`)
    return {
      sourceRow: marker._sourceRow,
      name,
      locationCode: marker.locationCode,
      resourceId: point.resourceId,
      lng: point.lon,
      lat: point.lat,
      crs: 'GCJ-02',
      coordinateSource: `User-authorized AMap Work Map sparseList response; resourceId ${point.resourceId}.`,
      coordinateSourceUrl: WIA_MAP_URL,
      verificationStatus: 'owner-map-only'
    }
  })
}

function parseCli(argv: string[]): { input: string, raw: string, output: string } {
  let input = ''
  let raw = DEFAULT_RAW_PATH
  let output = DEFAULT_OUTPUT_PATH
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!['--input', '--raw', '--output'].includes(argument)) throw new Error(`Unknown argument: ${argument}`)
    const value = argv[index + 1]
    assertExtract(value && !value.startsWith('-'), `${argument} requires a path`)
    if (argument === '--input') input = value
    else if (argument === '--raw') raw = value
    else output = value
    index += 1
  }
  assertExtract(input, '--input PATH is required')
  return { input, raw, output }
}

function main(): void {
  const options = parseCli(process.argv.slice(2))
  const coordinates = extractOwnerMapCoordinates(
    JSON.parse(readFileSync(resolve(options.input), 'utf8')),
    JSON.parse(readFileSync(resolve(options.raw), 'utf8'))
  )
  writeFileSync(resolve(options.output), `${JSON.stringify(coordinates, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({ output: resolve(options.output), pointCount: coordinates.length }, null, 2)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
