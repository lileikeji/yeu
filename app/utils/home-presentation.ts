import type { ApiProcedure } from '~~/shared/types/server'
import type { FrontendFeatureKey } from '~~/shared/config/frontend-features'

export interface HomeGuideLike {
  slug: string
  summary: string
}

export interface HomeAction {
  featureKey: FrontendFeatureKey
  title: string
  description: string
  meta: string
  icon: string
  to: string
  tone: string
}

export interface HomeTimelineStage {
  featureKey: FrontendFeatureKey
  label: string
  title: string
  items: string[]
  actionLabel: string
  to: string
}

export interface HomeMoreEntry {
  featureKey: FrontendFeatureKey
  title: string
  description: string
  to: string
  icon: string
  tone: string
  external?: boolean
}

export interface HomeTrustLink {
  label: string
  to: string
  icon: string
  external: boolean
}

export const homeTrustNotice = {
  badge: '学生整理 · 非学校官网',
  title: '重要事项，再到学校原文确认一次',
  description: '本站把分散的新生信息整理到一起，方便你先找到方向。报到、缴费、住宿和资助等要求，最终以录取通知书和学校最新通知为准。',
  checkedText: '学校、招生和学生资助入口最近查看：2026年7月23日',
  links: [
    {
      label: '学校官网',
      to: 'https://www.yeu.edu.cn/',
      icon: 'i-lucide-school',
      external: true
    },
    {
      label: '招生官网',
      to: 'https://zhaosheng.yeu.edu.cn/',
      icon: 'i-lucide-graduation-cap',
      external: true
    },
    {
      label: '学生资助',
      to: 'https://xsb.yeu.edu.cn/xszz/list.htm',
      icon: 'i-lucide-hand-heart',
      external: true
    },
    {
      label: '看信息从哪来',
      to: '/sources',
      icon: 'i-lucide-book-open-check',
      external: false
    },
    {
      label: '反馈纠错',
      to: '/feedback',
      icon: 'i-lucide-message-square-warning',
      external: false
    }
  ] satisfies HomeTrustLink[]
} as const

export const homeTimelineStages: HomeTimelineStage[] = [
  {
    featureKey: 'home.timeline.before-arrival',
    label: '到校前',
    title: '先确认报到安排，不要凭群聊猜',
    items: ['确认报到时间和要带的材料', '查专业对应的住宿片区', '收藏校园地图认方向'],
    actionLabel: '查看报到准备',
    to: '/procedures/arrival'
  },
  {
    featureKey: 'home.timeline.arrival-day',
    label: '报到当天',
    title: '先看清报到方位，再按步骤办理',
    items: ['按现场指引完成报到', '到宿舍确认入住', '核对一卡通和网络'],
    actionLabel: '打开校园地图',
    to: '/map'
  },
  {
    featureKey: 'home.timeline.first-week',
    label: '入学第一周',
    title: '补齐学习和生活入口',
    items: ['确认课表和教学楼', '办理一卡通和网络', '保存安全和办事入口'],
    actionLabel: '查看全部指南',
    to: '/guides'
  }
]

export const homeMoreEntries: HomeMoreEntry[] = [
  {
    featureKey: 'home.more.checklist',
    title: '新生清单',
    description: '勾选到校前和第一周事项，进度会留在这台设备上',
    to: '/checklist',
    icon: 'i-lucide-list-checks',
    tone: 'bg-emerald-50 text-emerald-700'
  },
  {
    featureKey: 'home.more.safety',
    title: '安全、医疗与心理支持',
    description: '保存校园 110，知道紧急情况先找谁',
    to: '/guides/safety-health',
    icon: 'i-lucide-shield-plus',
    tone: 'bg-red-50 text-red-700'
  },
  {
    featureKey: 'home.more.student-rules',
    title: '学生手册与资助',
    description: '校内规则、奖助学金和学习要求',
    to: '/student-rules',
    icon: 'i-lucide-book-open-check',
    tone: 'bg-indigo-50 text-indigo-700'
  },
  {
    featureKey: 'home.more.clubs',
    title: '学生社团',
    description: '按兴趣看社团方向和本学期招新消息',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    tone: 'bg-violet-50 text-violet-700'
  },
  {
    featureKey: 'home.more.departments',
    title: '校内部门',
    description: '招生、教务、学生事务的入口',
    to: '/departments',
    icon: 'i-lucide-landmark',
    tone: 'bg-blue-50 text-blue-700'
  },
  {
    featureKey: 'home.more.nearby',
    title: '吃喝玩乐',
    description: '学生街、马甲周边与泉州市区吃喝玩乐攻略',
    to: '/nearby',
    icon: 'i-lucide-compass',
    tone: 'bg-orange-50 text-orange-700'
  },
  {
    featureKey: 'home.more.transport',
    title: '到校与离校交通',
    description: '泉州站、东站、晋江机场和市区往返学校的公交与换乘方案',
    to: '/transport',
    icon: 'i-lucide-bus-front',
    tone: 'bg-sky-50 text-sky-800'
  },
  {
    featureKey: 'home.more.panorama',
    title: '全景云游校园',
    description: '先看大门、教学楼和部分宿舍长什么样，再去逛校史馆',
    to: '/panorama',
    icon: 'i-lucide-orbit',
    tone: 'bg-emerald-50 text-emerald-800'
  },
  {
    featureKey: 'home.more.dorms',
    title: '宿舍实拍',
    description: '分别查看普通型和舒适型宿舍、洗漱区与卫生间实拍',
    to: '/dorms',
    icon: 'i-lucide-bed-double',
    tone: 'bg-sky-50 text-sky-800'
  },
  {
    featureKey: 'home.more.welearn',
    title: 'WeLearn 学习工具',
    description: '独立第三方工具，打开软件下载页查看版本说明并获取最新版',
    to: 'https://dz.lileikeji.top/uploads/releases/download.php',
    icon: 'i-lucide-download',
    tone: 'bg-cyan-50 text-cyan-700',
    external: true
  }
]

export function findGuideSummary(
  guides: HomeGuideLike[],
  slug: string,
  fallback: string
): string {
  return guides.find(guide => guide.slug === slug)?.summary ?? fallback
}

export function buildHomeEssentialActions(guides: HomeGuideLike[]): HomeAction[] {
  const summary = (slug: string, fallback: string) => findGuideSummary(guides, slug, fallback)
  return [
    {
      featureKey: 'home.essential.arrival',
      title: '报到安排',
      description: summary('arrival', '查询报到时间、地点与流程'),
      meta: '入学前先看',
      icon: 'i-lucide-calendar-check-2',
      to: '/procedures/arrival',
      tone: 'bg-green-50 text-green-700'
    },
    {
      featureKey: 'home.essential.map',
      title: '校园地图',
      description: '查找宿舍、教学楼和校园服务点',
      meta: '到校后常用',
      icon: 'i-lucide-map-pinned',
      to: '/map',
      tone: 'bg-blue-50 text-blue-700'
    },
    {
      featureKey: 'home.essential.network',
      title: '校园一卡通与网络',
      description: '查看校园网、校园卡和连接问题',
      meta: '入校后办理',
      icon: 'i-lucide-wifi',
      to: '/procedures/campus-network',
      tone: 'bg-violet-50 text-violet-700'
    },
    {
      featureKey: 'home.essential.delivery',
      title: '快递与外卖',
      description: summary('express-delivery', '查看取件站点、外卖送达和取餐说明'),
      meta: '校园生活',
      icon: 'i-lucide-package-open',
      to: '/guides/express-delivery',
      tone: 'bg-orange-50 text-orange-700'
    }
  ]
}

export interface HomeImportantDate {
  date: string
  title: string
  description: string
}

const homeImportantDateFallback: HomeImportantDate[] = [
  { date: '9月5–6日', title: '注册报到', description: '具体到校时段、报到地点和材料以录取通知书及学校后续通知为准。' },
  { date: '9月7–9日', title: '入学教育', description: '学院集合地点、时间和安排以辅导员或学院通知为准。' },
  { date: '9月10日', title: '开始上课', description: '课表、教材和教学安排以教务系统及学院通知为准。' }
]

/** Turn a step timeText like "2026年9月5日至6日" into "9月5–6日". */
function homeDateFromTimeText(timeText: string): string {
  return timeText
    .replace(/2026年/, '')
    .replace(/月(\d+)日?(?:至|–|—)(\d+)日/, '月$1–$2日')
    .replace(/至/g, '–')
    .replace(/\s+/g, '')
}

/**
 * Derive the homepage "important time" block from the live arrival procedure so
 * date changes in the database propagate to the home page. Each of the three key
 * dates is matched against the procedure steps by a title keyword; a step without
 * a usable timeText falls back to the curated default.
 */
export function buildHomeImportantDates(
  procedures: ApiProcedure[] | null | undefined
): HomeImportantDate[] {
  const arrival = (procedures ?? []).find(procedure => procedure.slug === 'arrival')
  const steps = arrival?.steps ?? []

  const keywordByTitle: Array<{ title: string, keyword: RegExp }> = [
    { title: '注册报到', keyword: /报到/ },
    { title: '入学教育', keyword: /入学教育/ },
    { title: '开始上课', keyword: /上课/ }
  ]

  return homeImportantDateFallback.map((fallback) => {
    const keyword = keywordByTitle.find(entry => entry.title === fallback.title)?.keyword
    const match = keyword
      ? steps.find(step => step.timeText && keyword.test(step.title))
      : undefined
    return {
      date: match?.timeText ? homeDateFromTimeText(match.timeText) : fallback.date,
      title: fallback.title,
      description: fallback.description
    }
  })
}

export function buildHomeSearchTarget(query: string): { path: string, query?: { q: string } } {
  const trimmed = query.trim()
  return {
    path: '/search',
    ...(trimmed ? { query: { q: trimmed } } : {})
  }
}
