export const clubSourceStatusMessages = {
  recentActivity: '近期活动可确认',
  namePending: '名称线索待确认'
} as const

export const clubSectionLabels = {
  confirmedInfo: '当前可确认信息',
  signupChecklist: '入群或报名之前先问清楚',
  currentlyConfirmed: '目前能确认：',
  suitableFor: '适合：',
  suitableAudience: '对这个方向有兴趣、想找同好或参加校内活动的新生。',
  recruitmentPending: '2026级招新待发布',
  recruitmentNotice: '招新时间、地点、报名入口和公开联系方式尚未取得2026级有效来源。',
  bodyFallback: '校团委2026年活动报道中出现该社团名称，可确认其近期参与校级社团活动；不据此补写社团简介或招新条件。'
} as const

export const clubSignupQuestionChecklist = [
  '本学期主要活动是什么，是否适合零基础新生',
  '例会或训练多久一次，时间是否和课程冲突',
  '是否收费，是否需要自备器材、服装或材料',
  '报名入口、群二维码和负责人是否来自官方渠道'
] as const

export const clubRecentActivityUrlMarker = '/2026/0606/'

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
    meta: source.publisher + ' · 访问于 ' + source.accessedAt,
    note: source.context ?? null,
    unavailable: source.status === 'unavailable' || source.status === 'disputed'
  }))
}
