const MARKER_PIXEL_RATIO = 2
const MARKER_WIDTH = 38
const MARKER_HEIGHT = 48

export const MAP_MARKER_COLORS = {
  'campus-building': '#2f6f55',
  'dorm': '#315b9b',
  'food': '#c45d2c',
  'service': '#7a4da0',
  'express': '#087f8c',
  'gate': '#4f5964',
  'nearby': '#b23a48',
  'default': '#5f6f52'
} as const

export type MapMarkerCategory = keyof typeof MAP_MARKER_COLORS

export function resolveMarkerCategory(category: string): MapMarkerCategory {
  const normalized = category.trim().toLowerCase()

  if (normalized in MAP_MARKER_COLORS) {
    return normalized as MapMarkerCategory
  }

  if (normalized.startsWith('nearby')) {
    return 'nearby'
  }

  return 'default'
}

export function getMarkerImageId(category: MapMarkerCategory, selected: boolean): string {
  return `yeu-pin-${category}${selected ? '-selected' : ''}`
}

export function createMarkerImage(color: string, selected: boolean): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = MARKER_WIDTH * MARKER_PIXEL_RATIO
  canvas.height = MARKER_HEIGHT * MARKER_PIXEL_RATIO

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D is required to render map markers')
  }

  context.scale(MARKER_PIXEL_RATIO, MARKER_PIXEL_RATIO)
  context.lineJoin = 'round'

  const drawPin = () => {
    context.beginPath()
    context.moveTo(19, 45)
    context.bezierCurveTo(16.5, 39.5, 4, 29.5, 4, 18)
    context.bezierCurveTo(4, 8.8, 10.6, 3, 19, 3)
    context.bezierCurveTo(27.4, 3, 34, 8.8, 34, 18)
    context.bezierCurveTo(34, 29.5, 21.5, 39.5, 19, 45)
    context.closePath()
  }

  context.save()
  context.shadowColor = 'rgba(24, 32, 28, 0.28)'
  context.shadowBlur = 3
  context.shadowOffsetY = 2
  drawPin()
  context.fillStyle = color
  context.fill()
  context.restore()

  drawPin()
  context.strokeStyle = selected ? '#17211d' : '#ffffff'
  context.lineWidth = selected ? 3 : 1.5
  context.stroke()

  if (selected) {
    drawPin()
    context.strokeStyle = '#ffffff'
    context.lineWidth = 1
    context.stroke()
  }

  context.beginPath()
  context.arc(19, 17.5, 7, 0, Math.PI * 2)
  context.fillStyle = '#ffffff'
  context.fill()

  context.beginPath()
  context.arc(19, 17.5, selected ? 3.5 : 3, 0, Math.PI * 2)
  context.fillStyle = selected ? '#17211d' : color
  context.fill()

  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export const MAP_MARKER_PIXEL_RATIO = MARKER_PIXEL_RATIO
