export const FRONTEND_FEATURE_DEFINITIONS = [
  {
    key: 'home.trust-notice',
    group: '首页重点',
    title: '信息来源提示',
    description: '首页顶部的非官方说明、学校官网和反馈纠错入口。',
    icon: 'i-lucide-badge-info'
  },
  {
    key: 'home.arrival-summary',
    group: '首页重点',
    title: '报到时间卡片',
    description: '首页顶部右侧的报到日期、入学教育和上课时间入口。',
    icon: 'i-lucide-calendar-days'
  },
  {
    key: 'home.essential.arrival',
    group: '新生常用入口',
    title: '核对报到安排',
    description: '进入报到准备和报到流程。',
    icon: 'i-lucide-calendar-check-2'
  },
  {
    key: 'home.essential.map',
    group: '新生常用入口',
    title: '找宿舍和教学楼',
    description: '进入校园地图并搜索楼栋。',
    icon: 'i-lucide-map-pinned'
  },
  {
    key: 'home.essential.network',
    group: '新生常用入口',
    title: '校园卡与网络',
    description: '进入校园卡、校园网和连接问题指南。',
    icon: 'i-lucide-wifi'
  },
  {
    key: 'home.essential.delivery',
    group: '新生常用入口',
    title: '快递与外卖',
    description: '进入取件、外卖送达和校区生活指南。',
    icon: 'i-lucide-package-open'
  },
  {
    key: 'home.checklist',
    group: '新生任务',
    title: '新生清单横幅',
    description: '首页的新生清单进度和继续勾选入口。',
    icon: 'i-lucide-list-checks'
  },
  {
    key: 'home.timeline.before-arrival',
    group: '新生任务',
    title: '到校前',
    description: '首页时间线中的到校前准备卡片。',
    icon: 'i-lucide-luggage'
  },
  {
    key: 'home.timeline.arrival-day',
    group: '新生任务',
    title: '报到当天',
    description: '首页时间线中的报到当天卡片。',
    icon: 'i-lucide-map-pin-check'
  },
  {
    key: 'home.timeline.first-week',
    group: '新生任务',
    title: '入学第一周',
    description: '首页时间线中的入学第一周卡片。',
    icon: 'i-lucide-calendar-range'
  },
  {
    key: 'home.featured-procedures',
    group: '办事与服务',
    title: '常用办事',
    description: '首页自动展示的常用办事流程区域。单条流程仍在办事流程中上下架。',
    icon: 'i-lucide-list-checks'
  },
  {
    key: 'home.more.checklist',
    group: '其他常用入口',
    title: '新生清单',
    description: '其他常用入口中的新生清单卡片。',
    icon: 'i-lucide-list-checks'
  },
  {
    key: 'home.more.safety',
    group: '其他常用入口',
    title: '安全、医疗与心理支持',
    description: '进入安全、医疗和心理支持指南。',
    icon: 'i-lucide-shield-plus'
  },
  {
    key: 'home.more.clubs',
    group: '其他常用入口',
    title: '学生社团',
    description: '进入学生社团列表。',
    icon: 'i-lucide-users-round'
  },
  {
    key: 'home.more.departments',
    group: '其他常用入口',
    title: '校内部门',
    description: '进入招生、教务和学生事务等部门列表。',
    icon: 'i-lucide-landmark'
  },
  {
    key: 'home.more.nearby',
    group: '其他常用入口',
    title: '周边生活',
    description: '进入学生街、餐饮、便利店和快递信息。',
    icon: 'i-lucide-store'
  },
  {
    key: 'home.more.transport',
    group: '其他常用入口',
    title: '到校与离校交通',
    description: '查询泉州站、泉州东站、晋江机场和市区往返学校的公交方案。',
    icon: 'i-lucide-bus-front'
  },
  {
    key: 'home.more.panorama',
    group: '其他常用入口',
    title: '全景云游校园',
    description: '查看大门、教学楼、部分宿舍等校内实景，也能进入学校发布的校史馆全景。',
    icon: 'i-lucide-orbit'
  },
  {
    key: 'home.more.dorms',
    group: '其他常用入口',
    title: '宿舍实拍',
    description: '查看普通型和舒适型宿舍的竖屏实拍视频。',
    icon: 'i-lucide-bed-double'
  },
  {
    key: 'home.more.welearn',
    group: '其他常用入口',
    title: 'WeLearn 学习工具',
    description: '打开第三方 WeLearn 工具下载入口。',
    icon: 'i-lucide-download'
  },
  {
    key: 'home.emergency-contact',
    group: '办事与服务',
    title: '应急联系',
    description: '首页底部的校园 110、110、119 和 120 快捷联系卡片。',
    icon: 'i-lucide-phone-call'
  }
] as const

export type FrontendFeatureDefinition = typeof FRONTEND_FEATURE_DEFINITIONS[number]
export type FrontendFeatureKey = FrontendFeatureDefinition['key']

export const FRONTEND_FEATURE_KEYS = FRONTEND_FEATURE_DEFINITIONS.map(
  feature => feature.key
) as [FrontendFeatureKey, ...FrontendFeatureKey[]]
