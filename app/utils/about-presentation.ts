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
  { label: '项目性质', value: '非官方学生指南' },
  { label: '当前维护', value: '个人 / 学生团队' },
  { label: '服务对象', value: '本科与专升本新生' },
  { label: '公开访问', value: '游客免登录' }
]

export const aboutBoundaries: AboutBoundary[] = [
  {
    title: '信息不替代官方通知',
    icon: 'i-lucide-file-warning',
    text: '报到、缴费、学籍、住宿、安全及个人材料要求，以录取通知书、学校及主管部门最新正式通知为准。'
  },
  {
    title: '地图只公开已确认的信息',
    icon: 'i-lucide-map-pinned',
    text: '地点名称、楼栋入口和导航坐标分开管理。没有官方资料或现场定位记录支持的坐标，不会用近似点补齐。'
  },
  {
    title: '旧资料不冒充当年安排',
    icon: 'i-lucide-calendar-clock',
    text: '往年报到点、接站、快递外卖、商铺营业与社团招新信息只能作为线索，未经当期复核不作行动依据。'
  },
  {
    title: '首版不提供商业排名',
    icon: 'i-lucide-badge-percent',
    text: '商家认领、优惠、推广位与学生账号尚未开放。未来若上线，付费内容会明确标识，也不能改变已经确认的信息。'
  }
]

export const aboutGovernanceLinks: AboutGovernanceLink[] = [
  {
    title: '查看资料来源',
    description: '了解来源分级、访问日期和地图数据边界',
    to: '/sources',
    icon: 'i-lucide-list-checks'
  },
  {
    title: '反馈错误或补充资料',
    description: '当前唯一的站内联系入口，管理员确认后再更新',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning'
  },
  {
    title: '查看隐私说明',
    description: '了解定位、反馈、缓存和数据删除规则',
    to: '/privacy',
    icon: 'i-lucide-shield-check'
  }
]
