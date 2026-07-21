export const clubSourceStatusMessages = {
  recentActivity: '近期有活动',
  namePending: '等待本学期招新消息'
} as const

export const clubSectionLabels = {
  overview: '先了解这个社团',
  signupChecklist: '报名之前问清楚',
  activityDirection: '主要活动',
  suitableFor: '适合谁',
  findingIt: '开学后怎么找',
  recruitmentPending: '招新安排待公布',
  recruitmentDetails: '最新招新安排',
  recruitmentNotice: '2026 级招新时间、地点和群聊入口还没公布。开学后请留意校团委、社团负责人或现场摊位的最新消息。',
  sourceDetails: '看看这些信息从哪里来',
  feedback: '告诉我们新的招新消息',
  contactMethod: '联系方式',
  copyContact: '复制联系方式',
  contactPending: '联系方式待公布',
  contactPendingNotice: '目前还没有公开的电话、邮箱或群入口。开学后请以校团委、社团负责人或现场摊位公布的信息为准。',
  contactPendingAction: '知道新的联系方式？告诉我们'
} as const

export interface ClubOverviewItem {
  title: string
  text: string
  icon: string
}

export function buildClubOverviewItems(direction: string): ClubOverviewItem[] {
  const activityText = direction.trim() || '具体活动内容请留意本学期社团介绍。'
  return [
    {
      title: clubSectionLabels.activityDirection,
      text: activityText,
      icon: 'i-lucide-sparkles'
    },
    {
      title: clubSectionLabels.suitableFor,
      text: '对这个方向感兴趣、想认识同好或参加校园活动的同学。零基础能否加入，请在招新时直接询问。',
      icon: 'i-lucide-user-round-check'
    },
    {
      title: clubSectionLabels.findingIt,
      text: '留意开学社团招新现场、校团委通知和社团负责人发布的消息，不要只凭转发二维码入群。',
      icon: 'i-lucide-map-pin-check'
    }
  ]
}

export const clubSignupQuestionChecklist = [
  '本学期主要活动是什么，是否适合零基础新生',
  '例会或训练多久一次，时间是否和课程冲突',
  '是否收费，是否需要自备器材、服装或材料',
  '报名入口、群二维码和负责人是否由校团委、社团负责人或现场摊位公布'
] as const

export const clubRecentActivityUrlMarker = '/2026/'

export interface ClubDetailSourceLike {
  title: string
  url: string
  publisher: string
  accessedAt: string
  context?: string | null
  status?: string | null
}

export interface ClubDetailSourceView {
  key: string
  title: string
  url: string
  meta: string
  note: string | null
  unavailable: boolean
}

export function resolveClubSourceStatusText(
  sources: ReadonlyArray<{ url: string }> | null | undefined
): string {
  const hasRecentActivity = (sources ?? []).some(source => source.url.includes(clubRecentActivityUrlMarker))
  return hasRecentActivity
    ? clubSourceStatusMessages.recentActivity
    : clubSourceStatusMessages.namePending
}

export function buildClubDetailSources(
  sources: ReadonlyArray<ClubDetailSourceLike> | null | undefined
): ClubDetailSourceView[] {
  return (sources ?? []).map(source => ({
    key: source.url,
    title: source.title,
    url: source.url,
    meta: source.publisher + ' · 查阅于 ' + source.accessedAt,
    note: source.context ?? null,
    unavailable: source.status === 'unavailable' || source.status === 'disputed'
  }))
}

export type ClubContactSectionState =
  | { kind: 'ready' }
  | { kind: 'pending'; title: string; notice: string; actionLabel: string }

export function resolveClubContactSectionState(hasContact: boolean): ClubContactSectionState {
  if (hasContact) return { kind: 'ready' }
  return {
    kind: 'pending',
    title: clubSectionLabels.contactPending,
    notice: clubSectionLabels.contactPendingNotice,
    actionLabel: clubSectionLabels.contactPendingAction
  }
}
