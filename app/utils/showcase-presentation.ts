export const SHOWCASE_INTRO_DURATION_MS = 2_300

export const showcaseScenes = [
  { id: 'arrival', durationMs: 4_000 },
  { id: 'map', durationMs: 4_000 },
  { id: 'panorama', durationMs: 4_000 },
  { id: 'assistant', durationMs: 4_800 },
  { id: 'checklist', durationMs: 3_400 },
  { id: 'transport', durationMs: 4_000 },
  { id: 'outro', durationMs: 3_200 }
] as const

export type ShowcaseSceneId = typeof showcaseScenes[number]['id']

export const SHOWCASE_CONTENT_DURATION_MS = showcaseScenes.reduce(
  (total, scene) => total + scene.durationMs,
  0
)

export const SHOWCASE_TOTAL_DURATION_MS = SHOWCASE_INTRO_DURATION_MS
  + SHOWCASE_CONTENT_DURATION_MS

export function showcaseSceneIndex(value: unknown): number {
  if (typeof value !== 'string') return 0
  const index = showcaseScenes.findIndex(scene => scene.id === value)
  return index >= 0 ? index : 0
}

export function clampShowcaseProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function showcaseSceneProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1
  return clampShowcaseProgress(elapsedMs / durationMs)
}

export function showcaseTypedText(text: string, progress: number): string {
  const count = Math.round(text.length * clampShowcaseProgress(progress))
  return text.slice(0, count)
}

export function showcaseCheckedCount(progress: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(total, Math.floor(clampShowcaseProgress(progress) * (total + 0.75)))
}
