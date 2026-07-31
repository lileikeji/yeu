export type IntroPoint2D = [number, number]
export type IntroPolygon = IntroPoint2D[]

export const WATER_EDGE_BUFFER = 0.02
export const CAMPUS_IMAGE_WIDTH = 1579
export const CAMPUS_IMAGE_HEIGHT = 889

// 水域轮廓刻意向岸内收缩，避免建筑、道路和树岸被误判为水面。
export const waterPolygons: IntroPolygon[] = [
  [[0.43, 0.12], [0.47, 0.09], [0.68, 0.08], [0.85, 0.13], [0.98, 0.19], [0.98, 0.47], [0.87, 0.44], [0.76, 0.39], [0.68, 0.34], [0.63, 0.32], [0.6, 0.34], [0.57, 0.38], [0.55, 0.44], [0.53, 0.5], [0.51, 0.53], [0.49, 0.52], [0.49, 0.48], [0.51, 0.43], [0.54, 0.39], [0.58, 0.35], [0.61, 0.31], [0.62, 0.27], [0.61, 0.24], [0.57, 0.22], [0.52, 0.21], [0.47, 0.18]],
  [[0, 0.34], [0.08, 0.33], [0.14, 0.32], [0.16, 0.34], [0.15, 0.37], [0.1, 0.39], [0, 0.4]],
  [[0, 0.44], [0.08, 0.45], [0.15, 0.48], [0.21, 0.47], [0.28, 0.43], [0.34, 0.4], [0.37, 0.4], [0.38, 0.43], [0.37, 0.49], [0.36, 0.54], [0.39, 0.59], [0.45, 0.63], [0.5, 0.68], [0.53, 0.72], [0.53, 0.77], [0.5, 0.81], [0.44, 0.82], [0.37, 0.8], [0.3, 0.76], [0.24, 0.72], [0.17, 0.69], [0.1, 0.69], [0.04, 0.7], [0, 0.68]],
  [[0.57, 0.69], [0.7, 0.7], [0.88, 0.7], [0.89, 0.74], [0.72, 0.75], [0.58, 0.73]]
]

export function insetWaterPolygon(polygon: IntroPolygon): IntroPolygon {
  const center = polygon.reduce(
    (sum, [x, y]) => ({ x: sum.x + x / polygon.length, y: sum.y + y / polygon.length }),
    { x: 0, y: 0 }
  )
  return polygon.map(([x, y]) => [
    x + (center.x - x) * WATER_EDGE_BUFFER,
    y + (center.y - y) * WATER_EDGE_BUFFER
  ])
}

export const interactiveWaterPolygons = waterPolygons.map(insetWaterPolygon)

export interface CampusMapLayout {
  imageLeft: number
  imageTop: number
  layerHeight: number
  layerWidth: number
  mapScale: number
  renderedHeight: number
  renderedWidth: number
  viewportHeight: number
  viewportWidth: number
}

export function getCampusMapLayout(
  viewportWidth: number,
  viewportHeight: number
): CampusMapLayout {
  const isMobile = viewportWidth < 768
  const inset = isMobile ? 12 : 18
  const mapScale = isMobile ? 1.06 : 1.035
  const layerWidth = viewportWidth + inset * 2
  const layerHeight = viewportHeight + inset * 2
  const imageWidth = CAMPUS_IMAGE_WIDTH
  const imageHeight = CAMPUS_IMAGE_HEIGHT
  const coverScale = Math.max(layerWidth / imageWidth, layerHeight / imageHeight)
  const renderedWidth = imageWidth * coverScale
  const renderedHeight = imageHeight * coverScale
  const objectPositionX = isMobile ? 0.52 : 0.5
  return {
    imageLeft: (layerWidth - renderedWidth) * objectPositionX,
    imageTop: (layerHeight - renderedHeight) * 0.5,
    layerHeight,
    layerWidth,
    mapScale,
    renderedHeight,
    renderedWidth,
    viewportHeight,
    viewportWidth
  }
}

export function imagePointToViewport(
  x: number,
  y: number,
  layout: CampusMapLayout,
  mapX = 0,
  mapY = 0
): IntroPoint2D {
  const localX = layout.imageLeft + x * layout.renderedWidth
  const localY = layout.imageTop + y * layout.renderedHeight
  return [
    layout.viewportWidth / 2 + mapX + (localX - layout.layerWidth / 2) * layout.mapScale,
    layout.viewportHeight / 2 + mapY + (localY - layout.layerHeight / 2) * layout.mapScale
  ]
}

export function pointInPolygon(x: number, y: number, polygon: IntroPolygon): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    const intersects = ((yi > y) !== (yj > y))
      && x < ((xj - xi) * (y - yi)) / (yj - yi || 0.0001) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function isWaterPoint(
  x: number,
  y: number,
  layout: CampusMapLayout,
  mapX = 0,
  mapY = 0,
  polygons: IntroPolygon[] = interactiveWaterPolygons
): boolean {
  const localX = (x - layout.viewportWidth / 2 - mapX) / layout.mapScale + layout.layerWidth / 2
  const localY = (y - layout.viewportHeight / 2 - mapY) / layout.mapScale + layout.layerHeight / 2
  const normalizedX = (localX - layout.imageLeft) / layout.renderedWidth
  const normalizedY = (localY - layout.imageTop) / layout.renderedHeight
  return polygons.some(polygon => pointInPolygon(normalizedX, normalizedY, polygon))
}

export function addSegment(
  points: Array<{ x: number, y: number }>,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  count: number
): void {
  for (let i = 0; i <= count; i++) {
    const t = i / count
    points.push({ x: fromX + (toX - fromX) * t, y: fromY + (toY - fromY) * t })
  }
}

export function buildGuideMark(width: number, height: number, lowPowerMode: boolean): Array<{ x: number, y: number }> {
  const points: Array<{ x: number, y: number }> = []
  const isMobile = width < 768
  const density = lowPowerMode ? (isMobile ? 12 : 14) : isMobile ? 16 : 20
  const radius = isMobile ? Math.min(84, width * 0.22) : Math.min(112, width * 0.12)
  const centerX = width / 2
  const centerY = height / 2 - radius * 0.1

  // A compass/map marker keeps the particle assembly useful without carrying
  // a school seal or institution initials.
  const ringCount = density * 5
  for (let i = 0; i <= ringCount; i++) {
    const angle = (Math.PI * 2 * i) / ringCount
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    })
  }
  addSegment(points, centerX - radius * 0.62, centerY, centerX + radius * 0.62, centerY, density * 2)
  addSegment(points, centerX, centerY - radius * 0.62, centerX, centerY + radius * 0.62, density * 2)
  addSegment(points, centerX, centerY - radius * 0.48, centerX + radius * 0.2, centerY + radius * 0.18, density)
  addSegment(points, centerX + radius * 0.2, centerY + radius * 0.18, centerX, centerY + radius * 0.48, density)
  addSegment(points, centerX, centerY + radius * 0.48, centerX - radius * 0.2, centerY + radius * 0.18, density)
  addSegment(points, centerX - radius * 0.2, centerY + radius * 0.18, centerX, centerY - radius * 0.48, density)

  return points
}
