/** 步行路线的文案格式化：网页端与小程序共用。 */

export function formatDistanceLabel(meters: number | null | undefined): string {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} 米`
  const kilometers = meters / 1000
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} 公里`
}

export function formatDurationLabel(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return ''
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

/** 路线摘要，例如「约 480 米 · 步行 7 分钟」。 */
export function formatRouteSummary(distanceMeters: number | null | undefined, durationSeconds: number | null | undefined): string {
  const distance = formatDistanceLabel(distanceMeters)
  const duration = formatDurationLabel(durationSeconds)
  if (distance && duration) return `约 ${distance} · 步行 ${duration}`
  if (distance) return `约 ${distance}`
  if (duration) return `步行 ${duration}`
  return ''
}
