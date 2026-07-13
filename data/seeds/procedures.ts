import { officialSources } from './public-content'

export interface ProcedureSeedSource {
  url: string
  claimScope: string
  isPrimary?: boolean
}

export interface ProcedureSeedStep {
  id: string
  title: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  timeText: string | null
  actionUrl: string | null
  departmentSlug: string | null
  placeSlug: string | null
}

export interface ProcedureSeedMaterial {
  id: string
  name: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  isRequired: boolean | null
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  departmentSlug: string | null
  placeSlug: string | null
}

export interface ProcedureSeed {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  category: string
  audience: Array<'undergraduate' | 'transfer'>
  method: 'online' | 'offline' | 'mixed'
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  statusText: string
  processingTime: string | null
  deadlineText: string | null
  startsAt: string | null
  endsAt: string | null
  validFrom: string | null
  validUntil: string | null
  lastVerifiedAt: string
  departmentSlug: string | null
  guideSlug: string | null
  sources: ProcedureSeedSource[]
  steps: ProcedureSeedStep[]
  materials: ProcedureSeedMaterial[]
}

const allFreshmen = ['undergraduate', 'transfer'] as const

export const procedureSeeds: ProcedureSeed[] = [
  {
    id: '3c27af39-73e5-4f69-a9d1-4e02c03c6d19',
    slug: 'arrival',
    title: '2026级新生报到',
    summary: '学校已确认9月5日至6日注册报到；个人时段、材料、具体报到点和接站安排待学校通知。',
    body: '此条目只承载可按顺序核对的报到任务。防诈骗、咨询边界及往年信息说明保留在关联指南中；公开来源未确认的个人安排不会在这里补猜。',
    category: 'arrival',
    audience: [...allFreshmen],
    method: 'mixed',
    informationState: 'partial',
    statusText: '报到日期已确认，个人时段、材料、点位和接站待通知',
    processingTime: null,
    deadlineText: '2026年9月5日至6日；个人日期和时段以录取通知书及学校后续通知为准。',
    startsAt: '2026-09-05T00:00:00+08:00',
    endsAt: '2026-09-06T23:59:59+08:00',
    validFrom: null,
    validUntil: '2026-09-06T23:59:59+08:00',
    lastVerifiedAt: '2026-07-13T00:00:00+08:00',
    departmentSlug: 'admissions-office',
    guideSlug: 'arrival',
    sources: [
      {
        url: officialSources.academicCalendar2026Fall.url,
        claimScope: '2026级新生9月5日至6日注册报到',
        isPrimary: true
      },
      {
        url: officialSources.admissions.url,
        claimScope: '招生办公室官方信息入口'
      },
      {
        url: officialSources.undergraduateRules2026.url,
        claimScope: '普通本科招生信息、学校地址与招生咨询边界'
      },
      {
        url: officialSources.transferRules2026.url,
        claimScope: '专升本招生信息、学校地址与招生咨询边界'
      }
    ],
    steps: [
      {
        id: '0352ce0d-8bb6-46d7-aa3d-9639d2f1cdf1',
        title: '核对录取类型和官方通知',
        description: '确认自己是普通本科还是专升本，只从对应招生页面、录取通知书及学校官方通知核对个人安排。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '到校前',
        actionUrl: officialSources.admissions.url,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: '2b918106-274e-441e-a54f-524c52eccdf0',
        title: '记录学校公布的报到日期',
        description: '学校2026-2027学年第一学期校历明确，2026级新生于9月5日至6日注册报到。校历未区分普通本科与专升本。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '2026年9月5日至6日',
        actionUrl: officialSources.academicCalendar2026Fall.url,
        departmentSlug: null,
        placeSlug: null
      },
      {
        id: 'df72174a-719b-4780-bfba-d359a7c9ce2e',
        title: '核对个人时段与材料清单',
        description: '2026公开来源尚未列明个人报到时段、原件或复印件、照片及线上预办理清单；收到录取通知书或当年报到通知后再逐项核对。',
        audience: [...allFreshmen],
        informationState: 'awaiting-notice',
        timeText: '待个人通知',
        actionUrl: null,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: '78c98a4f-61b6-4890-8944-76917f66dfd1',
        title: '确认入校与接站安排',
        description: '学校公开校址为福建省泉州市洛江区马甲镇仰恩大学，邮编362014；具体报到点、入校路线和接站安排待通知，在明确点位前不提供报到点导航。',
        audience: [...allFreshmen],
        informationState: 'awaiting-notice',
        timeText: '待学校通知',
        actionUrl: null,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: '43dd567b-6257-4054-8969-a5143e6c0dcc',
        title: '按个人通知完成现场报到',
        description: '当前仅确认注册报到日期；现场办理顺序、具体窗口及宿舍衔接尚未从2026公开来源确认。',
        audience: [...allFreshmen],
        informationState: 'awaiting-notice',
        timeText: '2026年9月5日至6日内的个人时段待通知',
        actionUrl: null,
        departmentSlug: null,
        placeSlug: null
      }
    ],
    materials: []
  }
]
