import type { ApiProcedure } from '~~/shared/types/server'
import type { FrontendFeatureKey } from '~~/shared/config/frontend-features'
import {
  studentFacingProcedureText,
  studentFacingProcedureTitle
} from './procedure-detail-presentation'

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

export interface HomeProcedureItem {
  id: string
  title: string
  summary: string
  statusText: string
  methodLabel: string
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

export const homeProcedureMethodLabels: Record<ApiProcedure['method'], string> = {
  online: '线上办理',
  offline: '到校办理',
  mixed: '网上确认 + 到校办理'
}

export const homeTimelineStages: HomeTimelineStage[] = [
  {
    featureKey: 'home.timeline.before-arrival',
    label: '到校前',
    title: '先确认，不要凭群聊猜',
    items: ['确认报到时间与材料', '查询专业和住宿片区', '收藏校园地图'],
    actionLabel: '查看报到准备',
    to: '/procedures/arrival'
  },
  {
    featureKey: 'home.timeline.arrival-day',
    label: '报到当天',
    title: '先定位，再按步骤办理',
    items: ['按现场指引完成报到', '前往宿舍并确认入住', '核对校园一卡通和网络安排'],
    actionLabel: '打开校园地图',
    to: '/map'
  },
  {
    featureKey: 'home.timeline.first-week',
    label: '入学第一周',
    title: '把学习和生活入口补齐',
    items: ['确认课表与教学楼', '办理校园一卡通与网络', '保存安全与办事入口'],
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
    description: '快速找到招生、教务、学生事务等部门',
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

export function buildHomeEssentialActions(_guides: HomeGuideLike[]): HomeAction[] {
  return [
    {
      featureKey: 'home.essential.arrival',
      title: '报到安排',
      description: '查询报到时间、地点与流程',
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
      description: '查看取件站点、外卖送达和取餐说明',
      meta: '校园生活',
      icon: 'i-lucide-package-open',
      to: '/guides/express-delivery',
      tone: 'bg-orange-50 text-orange-700'
    }
  ]
}

export function toHomeProcedureItem(procedure: ApiProcedure): HomeProcedureItem {
  return {
    id: procedure.id,
    title: studentFacingProcedureTitle(procedure.title),
    summary: studentFacingProcedureText(procedure.summary),
    statusText: studentFacingProcedureText(procedure.statusText),
    methodLabel: homeProcedureMethodLabels[procedure.method],
    to: `/procedures/${encodeURIComponent(procedure.slug)}`
  }
}

const homeProcedurePriority: Readonly<Record<string, number>> = {
  'campus-network': 0,
  'dorm-repair': 1,
  'library-card-wechat': 2,
  'transfer-archive-mailing': 100
}

export function buildHomeFeaturedProcedures(
  procedures: ApiProcedure[] | null | undefined,
  limit = 4
): HomeProcedureItem[] {
  return (procedures ?? [])
    .filter(procedure => procedure.slug !== 'arrival')
    .map((procedure, index) => ({ procedure, index }))
    .sort((left, right) => (
      (homeProcedurePriority[left.procedure.slug] ?? 50)
      - (homeProcedurePriority[right.procedure.slug] ?? 50)
      || left.index - right.index
    ))
    .slice(0, limit)
    .map(({ procedure }) => toHomeProcedureItem(procedure))
}

export function getHomeFallbackMessage(
  hasContentError: boolean,
  hasProcedureError: boolean
): string | null {
  if (hasContentError || hasProcedureError) {
    return '有些新生信息暂时没显示出来，可以先查校园地图和基础指南。'
  }
  return null
}

export function computeHomeCardTilt(
  mouseX: number,
  mouseY: number,
  width: number,
  height: number,
  maxTiltDeg = 6
): { rotateX: number, rotateY: number } {
  if (width <= 0 || height <= 0) {
    return { rotateX: 0, rotateY: 0 }
  }
  const rotateX = -((mouseY - height / 2) / (height / 2)) * maxTiltDeg
  const rotateY = ((mouseX - width / 2) / (width / 2)) * maxTiltDeg
  return {
    rotateX: Object.is(rotateX, -0) ? 0 : rotateX,
    rotateY: Object.is(rotateY, -0) ? 0 : rotateY
  }
}

export function buildHomeSearchTarget(query: string): { path: string, query?: { q: string } } {
  const trimmed = query.trim()
  return {
    path: '/search',
    ...(trimmed ? { query: { q: trimmed } } : {})
  }
}

// Kept for older callers; the homepage now uses the unified site search.
export const buildHomeMapSearchTarget = buildHomeSearchTarget
