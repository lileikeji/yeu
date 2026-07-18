export const directoryListBatchSize = 9

export function previewDirectoryItems<T>(
  items: ReadonlyArray<T>,
  options: { filtered: boolean, visibleCount: number },
  initialCount = directoryListBatchSize
): T[] {
  if (options.filtered) return [...items]
  return items.slice(0, Math.max(initialCount, options.visibleCount))
}

export function nextDirectoryVisibleCount(
  current: number,
  total: number,
  batchSize = directoryListBatchSize
): number {
  const normalized = Math.max(batchSize, current)
  return normalized >= total ? batchSize : Math.min(total, normalized + batchSize)
}

export function directoryListToggleLabel(
  visible: number,
  total: number,
  batchSize = directoryListBatchSize
): string {
  if (visible >= total) return '收起列表'
  return `再看 ${Math.min(batchSize, total - visible)} 个`
}
