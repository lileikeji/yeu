export interface AboutProjectFact {
  label: string
  value: string
  icon: string
  tone: AboutTone
}

export interface AboutBoundary {
  title: string
  icon: string
  text: string
  tone: AboutTone
}

export interface AboutGovernanceLink {
  title: string
  description: string
  to: string
  icon: string
  tone: AboutTone
}

export interface AboutHeroAction {
  label: string
  to: string
  icon: string
}

export type AboutTone = 'amber' | 'green' | 'sky' | 'zinc'

export const aboutHeroActions: AboutHeroAction[] = [
  {
    label: '查看参考页面',
    to: '/sources',
    icon: 'i-lucide-file-check-2'
  },
  {
    label: '发现错误，告诉我们',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning'
  }
]

export const aboutProjectFacts: AboutProjectFact[] = [
  {
    label: '这是什么',
    value: '非官方新生指南',
    icon: 'i-lucide-compass',
    tone: 'sky'
  },
  {
    label: '谁在整理',
    value: '个人或学生团队',
    icon: 'i-lucide-users-round',
    tone: 'green'
  },
  {
    label: '适合谁',
    value: '本科与专升本新生',
    icon: 'i-lucide-graduation-cap',
    tone: 'amber'
  },
  {
    label: '怎么使用',
    value: '无需登录即可浏览',
    icon: 'i-lucide-log-in',
    tone: 'zinc'
  }
]

export const aboutBoundaries: AboutBoundary[] = [
  {
    title: '重要事项看学校通知',
    icon: 'i-lucide-file-warning',
    text: '报到、缴费、学籍、住宿、安全和需要提交的材料，以录取通知书及学校相关部门发布的最新通知为准。',
    tone: 'amber'
  },
  {
    title: '地图不猜位置',
    icon: 'i-lucide-map-pinned',
    text: '只有能从学校资料或现场记录中确认的位置才会标在地图上。暂时不确定的地点会明确说明，不会为了看起来完整而随便标位置。',
    tone: 'sky'
  },
  {
    title: '往年消息只作参考',
    icon: 'i-lucide-calendar-clock',
    text: '往年的报到点、接站、快递外卖、商铺营业和社团招新安排可能已经变化，出发前请再看今年的通知。',
    tone: 'zinc'
  },
  {
    title: '没有付费排名',
    icon: 'i-lucide-badge-percent',
    text: '本站目前没有商家推广或付费排名。以后如果出现合作内容，会清楚标出，不会混在普通校园信息里。',
    tone: 'green'
  }
]

export const aboutGovernanceLinks: AboutGovernanceLink[] = [
  {
    title: '看看信息从哪里来',
    description: '查看学校通知、部门页面和地图资料',
    to: '/sources',
    icon: 'i-lucide-list-checks',
    tone: 'sky'
  },
  {
    title: '告诉我们哪里不对',
    description: '说明出错的页面和正确情况，不登录也能提交',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning',
    tone: 'amber'
  },
  {
    title: '看看隐私说明',
    description: '了解会记录哪些信息，以及如何查询或删除',
    to: '/privacy',
    icon: 'i-lucide-shield-check',
    tone: 'green'
  }
]
