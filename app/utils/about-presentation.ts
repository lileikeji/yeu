export interface AboutProjectFact {
  label: string
  value: string
}

export interface AboutBoundary {
  title: string
  icon: string
  text: string
}

export interface AboutGovernanceLink {
  title: string
  description: string
  to: string
  icon: string
}

export const aboutProjectFacts: AboutProjectFact[] = [
  { label: '这是什么', value: '非官方新生指南' },
  { label: '谁在维护', value: '个人 / 学生团队' },
  { label: '适合谁', value: '本科与专升本新生' },
  { label: '怎么使用', value: '无需登录即可浏览' }
]

export const aboutBoundaries: AboutBoundary[] = [
  {
    title: '重要事项看学校通知',
    icon: 'i-lucide-file-warning',
    text: '报到、缴费、学籍、住宿、安全及个人材料要求，以录取通知书、学校及主管部门最新正式通知为准。'
  },
  {
    title: '地图不猜位置',
    icon: 'i-lucide-map-pinned',
    text: '只有能从学校资料或现场记录中确认的位置才会标在地图上。暂时不确定的地点会明确说明，不会为了看起来完整而随便标位置。'
  },
  {
    title: '往年消息只作参考',
    icon: 'i-lucide-calendar-clock',
    text: '往年的报到点、接站、快递外卖、商铺营业和社团招新安排可能已经变化，出发前请再看今年的通知。'
  },
  {
    title: '没有付费排名',
    icon: 'i-lucide-badge-percent',
    text: '本站目前没有商家推广或付费排名。以后如果出现合作内容，会清楚标出，不会混在普通校园信息里。'
  }
]

export const aboutGovernanceLinks: AboutGovernanceLink[] = [
  {
    title: '看看信息从哪里来',
    description: '查看学校通知、部门页面和地图资料',
    to: '/sources',
    icon: 'i-lucide-list-checks'
  },
  {
    title: '告诉我们哪里不对',
    description: '说明出错的页面和正确情况，不登录也能提交',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning'
  },
  {
    title: '看看隐私说明',
    description: '了解会记录哪些信息，以及如何查询或删除',
    to: '/privacy',
    icon: 'i-lucide-shield-check'
  }
]
