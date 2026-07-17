import {
  CHECKLIST_STORAGE_KEY,
  buildChecklistOverview,
  buildHomeChecklistSummary,
  createEmptyChecklistProgress,
  parseChecklistProgress,
  serializeChecklistProgress,
  toggleCompletedId,
  type ChecklistAudience,
  type ChecklistProgressSnapshot
} from '~~/app/utils/checklist-presentation'

function readStoredProgress(): ChecklistProgressSnapshot {
  if (!import.meta.client) return createEmptyChecklistProgress()

  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY)
    if (!raw) return createEmptyChecklistProgress()
    return parseChecklistProgress(JSON.parse(raw))
  } catch {
    return createEmptyChecklistProgress()
  }
}

function writeStoredProgress(snapshot: ChecklistProgressSnapshot): void {
  if (!import.meta.client) return

  try {
    localStorage.setItem(
      CHECKLIST_STORAGE_KEY,
      serializeChecklistProgress({
        ...snapshot,
        updatedAt: snapshot.updatedAt ?? new Date().toISOString()
      })
    )
  } catch {
    // Private mode / quota: keep in-memory progress only.
  }
}

/**
 * Guest-first freshman checklist. Progress stays on this device only.
 */
export function useFreshmanChecklist() {
  const progress = ref<ChecklistProgressSnapshot>(createEmptyChecklistProgress())
  const hydrated = ref(false)

  function loadFromStorage() {
    progress.value = readStoredProgress()
    hydrated.value = true
  }

  function commit(next: ChecklistProgressSnapshot) {
    const snapshot: ChecklistProgressSnapshot = {
      completedIds: [...new Set(next.completedIds)],
      audience: next.audience,
      updatedAt: new Date().toISOString()
    }
    progress.value = snapshot
    writeStoredProgress(snapshot)
  }

  function setAudience(audience: ChecklistAudience) {
    commit({
      ...progress.value,
      audience
    })
  }

  function setCompleted(itemId: string, completed: boolean) {
    commit({
      ...progress.value,
      completedIds: toggleCompletedId(progress.value.completedIds, itemId, completed)
    })
  }

  function toggleItem(itemId: string) {
    const done = progress.value.completedIds.includes(itemId)
    setCompleted(itemId, !done)
  }

  function resetProgress() {
    commit({
      completedIds: [],
      audience: progress.value.audience,
      updatedAt: null
    })
  }

  const overview = computed(() =>
    buildChecklistOverview(progress.value.completedIds, progress.value.audience)
  )

  const homeSummary = computed(() =>
    buildHomeChecklistSummary(progress.value.completedIds, progress.value.audience)
  )

  function isCompleted(itemId: string): boolean {
    return progress.value.completedIds.includes(itemId)
  }

  onMounted(loadFromStorage)

  return {
    progress: readonly(progress),
    hydrated: readonly(hydrated),
    overview,
    homeSummary,
    setAudience,
    setCompleted,
    toggleItem,
    resetProgress,
    isCompleted,
    reload: loadFromStorage
  }
}