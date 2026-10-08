// 网页与小程序共用的新生清单目录与纯函数；进度只存在本机。
import {
  CHECKLIST_STORAGE_KEY,
  buildChecklistOverview,
  buildHomeChecklistSummary,
  checklistAudienceOptions,
  checklistItems,
  checklistStages,
  createEmptyChecklistProgress,
  filterChecklistItems,
  findChecklistStage,
  isChecklistAudience,
  itemMatchesAudience,
  parseChecklistProgress,
  percentComplete,
  serializeChecklistProgress,
  toggleCompletedId,
} from '~~/shared/utils/checklist-catalog'
import type {
  ChecklistAudience,
  ChecklistItem,
  ChecklistOverview,
  ChecklistProgressSnapshot,
  ChecklistStage,
  ChecklistStageId,
  ChecklistStageProgress,
} from '~~/shared/utils/checklist-catalog'

export {
  CHECKLIST_STORAGE_KEY,
  buildChecklistOverview,
  buildHomeChecklistSummary,
  checklistAudienceOptions,
  checklistItems,
  checklistStages,
  createEmptyChecklistProgress,
  filterChecklistItems,
  findChecklistStage,
  isChecklistAudience,
  itemMatchesAudience,
  parseChecklistProgress,
  percentComplete,
  serializeChecklistProgress,
  toggleCompletedId,
}
export type {
  ChecklistAudience,
  ChecklistItem,
  ChecklistOverview,
  ChecklistProgressSnapshot,
  ChecklistStage,
  ChecklistStageId,
  ChecklistStageProgress,
}
