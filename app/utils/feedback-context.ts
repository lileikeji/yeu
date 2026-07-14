import type { FeedbackTargetType } from '~~/shared/constants/server'
import { safeLocalPath } from './safe-navigation'

export type DetailFeedbackTargetType = Exclude<FeedbackTargetType, 'general'>

interface DetailFeedbackContext {
  targetType: DetailFeedbackTargetType
  targetId: string
  targetName: string
  reasonType: string
  from: string
}

interface GeneralFeedbackContext {
  targetName: string
  reasonType: string
  from: string
}

function requireLocalPath(value: string): string {
  const localPath = safeLocalPath(value)
  if (!localPath) throw new TypeError('Feedback context requires an application-local path')
  return localPath
}

export function buildDetailFeedbackLink(input: DetailFeedbackContext) {
  return {
    path: '/feedback',
    query: {
      targetType: input.targetType,
      targetId: input.targetId,
      targetName: input.targetName,
      type: input.reasonType,
      from: requireLocalPath(input.from)
    }
  }
}

export function buildGeneralFeedbackLink(input: GeneralFeedbackContext) {
  return {
    path: '/feedback',
    query: {
      targetType: 'general' as const,
      targetId: '',
      targetName: input.targetName,
      type: input.reasonType,
      from: requireLocalPath(input.from)
    }
  }
}
