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

export function buildYEU(width: number, height: number, lowPowerMode: boolean): Array<{ x: number, y: number }> {
  const points: Array<{ x: number, y: number }> = []
  const isMobile = width < 768
  const density = lowPowerMode ? (isMobile ? 11 : 10) : isMobile ? 12 : 14
  const letterH = isMobile ? Math.min(150, width * 0.35) : Math.min(180, width * 0.18)
  const letterW = letterH * 0.58
  const gap = letterH * 0.24
  const totalW = letterW * 3 + gap * 2
  const left = width / 2 - totalW / 2
  const top = height / 2 - letterH * 0.88

  // Y
  addSegment(points, left, top, left + letterW / 2, top + letterH * 0.48, density)
  addSegment(points, left + letterW, top, left + letterW / 2, top + letterH * 0.48, density)
  addSegment(points, left + letterW / 2, top + letterH * 0.48, left + letterW / 2, top + letterH, density)

  // E
  const eL = left + letterW + gap
  addSegment(points, eL, top, eL, top + letterH, density)
  addSegment(points, eL, top, eL + letterW, top, density)
  addSegment(points, eL, top + letterH / 2, eL + letterW * 0.82, top + letterH / 2, density)
  addSegment(points, eL, top + letterH, eL + letterW, top + letterH, density)

  // U
  const uL = eL + letterW + gap
  addSegment(points, uL, top, uL, top + letterH * 0.72, density)
  addSegment(points, uL + letterW, top, uL + letterW, top + letterH * 0.72, density)
  for (let i = 0; i <= density * 2; i++) {
    const angle = Math.PI - (Math.PI * i) / (density * 2)
    points.push({
      x: uL + letterW / 2 + (Math.cos(angle) * letterW) / 2,
      y: top + letterH * 0.7 + Math.sin(angle) * letterH * 0.3
    })
  }

  return points
}
